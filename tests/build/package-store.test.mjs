import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DEVELOPMENT_HOST,
  PRODUCTION_HOST,
  createZipBuffer,
  listZipEntries,
  validateProductionDist,
} from "../../scripts/release/package-store.mjs";

const temporaryDirectories = [];

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
  await writeFile(resolve(dist, "manifest.json"), JSON.stringify({
    manifest_version: 3,
    name: "Auri",
    version: "0.1.0",
    permissions: ["activeTab", "scripting", "nativeMessaging"],
    action: { default_popup: "index.html" },
  }));
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
    expect(names).not.toContain("assets/popup.js.map");
    expect(names.some((name) => /^(node_modules|src|tests)\//u.test(name))).toBe(false);
  });

  it("recusa bundle que contenha o host DEV", async () => {
    const dist = await createFixture(
      `connectNative("${PRODUCTION_HOST}"); const dev = "${DEVELOPMENT_HOST}";`,
    );

    await expect(validateProductionDist(dist)).rejects.toThrow("Native Host DEV");
  });
});
