import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  DEVELOPMENT_HOST,
  PRODUCTION_HOST,
  STORE_PACKAGE_NAME,
  createZipBuffer,
  listZipEntries,
  validateProductionDist,
} from "../../scripts/release/package-store.mjs";

const temporaryDirectories = [];
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

async function createFixture(javascript = `connectNative("${PRODUCTION_HOST}")`) {
  const root = await mkdtemp(resolve(tmpdir(), "auri-store-package-"));
  temporaryDirectories.push(root);
  const dist = resolve(root, "dist");
  await mkdir(resolve(dist, "assets"), { recursive: true });
  await mkdir(resolve(dist, "icons"), { recursive: true });
  await writeFile(resolve(dist, "manifest.json"), await readFile(resolve(projectRoot, "public/manifest.json")));
  for (const locale of ["en", "pt_BR"]) {
    await mkdir(resolve(dist, "_locales", locale), { recursive: true });
    await writeFile(resolve(dist, "_locales", locale, "messages.json"), await readFile(
      resolve(projectRoot, `public/_locales/${locale}/messages.json`),
    ));
  }
  await writeFile(resolve(dist, "index.html"), "<main>Auri</main>");
  await writeFile(resolve(dist, "assets", "popup.js"), javascript);
  await writeFile(resolve(dist, "assets", "popup.css"), "body{}");
  await writeFile(resolve(dist, "assets", "popup.js.map"), "não incluir");
  for (const size of [16, 32, 48, 128]) {
    await writeFile(resolve(dist, "icons", `auri-${size}.png`), Buffer.from([size]));
  }
  return dist;
}

describe("pacote da loja", () => {
  it("inclui somente os arquivos necessários e exclui sourcemaps", async () => {
    const files = await validateProductionDist(await createFixture());
    const zip = createZipBuffer(files);
    const names = listZipEntries(zip);

    expect(names).toContain("manifest.json");
    expect(names).toContain("index.html");
    expect(names).toContain("assets/popup.js");
    expect(names).toContain("icons/auri-128.png");
    expect(names).toContain("_locales/en/messages.json");
    expect(names).toContain("_locales/pt_BR/messages.json");
    expect(STORE_PACKAGE_NAME).toBe("auri-extension-0.1.1-chromium.zip");
    expect(names).not.toContain("assets/popup.js.map");
    expect(names.some((name) => /^(node_modules|src|tests)\//u.test(name))).toBe(false);
  });

  it("recusa bundle que contenha o host DEV", async () => {
    const dist = await createFixture(
      `connectNative("${PRODUCTION_HOST}"); const dev = "${DEVELOPMENT_HOST}";`,
    );

    await expect(validateProductionDist(dist)).rejects.toThrow("Native Host DEV");
  });

  it.each(["en", "pt_BR"])("recusa dist sem a locale %s", async (locale) => {
    const dist = await createFixture();
    await rm(resolve(dist, "_locales", locale, "messages.json"));
    await expect(validateProductionDist(dist)).rejects.toThrow("Locale ausente");
  });

  it.each([
    ["version", "0.1.0", "package.json"],
    ["default_locale", "pt_BR", "idioma padrão"],
    ["name", "Auri", "nome de produção"],
  ])("recusa %s incompatível com a atualização", async (key, value, error) => {
    const dist = await createFixture();
    const path = resolve(dist, "manifest.json");
    const manifest = JSON.parse(await readFile(path, "utf8"));
    manifest[key] = value;
    await writeFile(path, JSON.stringify(manifest));
    await expect(validateProductionDist(dist)).rejects.toThrow(error);
  });
});
