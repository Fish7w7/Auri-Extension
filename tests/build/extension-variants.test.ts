import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  E2E_EXTENSION_ID,
  E2E_PUBLIC_KEY,
  EMBEDDED_EXTENSION_ID,
  EMBEDDED_PUBLIC_KEY,
  DEV_EXTENSION_ID,
  STORE_EXTENSION_ID,
  calculateExtensionId,
  manifestForVariant,
  publicKeySha256,
  resolveBuildSettings,
} from "../../build/extension-variants";
import manifest from "../../public/manifest.json";
import { NATIVE_HOST } from "../../src/config/native-hosts";
import { selectTransport } from "../../src/transport/create-transport";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if ([".git", "node_modules", "dist", "artifacts", "release"].includes(entry.name)) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

describe("identidade Embedded", () => {
  it("calcula um ID fixo próprio a partir da chave pública", () => {
    expect(EMBEDDED_EXTENSION_ID).toBe("agefiaohfielfgadiagemnflekbboblp");
    expect(calculateExtensionId(EMBEDDED_PUBLIC_KEY)).toBe(EMBEDDED_EXTENSION_ID);
    expect(EMBEDDED_EXTENSION_ID).toMatch(/^[a-p]{32}$/u);
    expect(EMBEDDED_EXTENSION_ID).not.toBe(STORE_EXTENSION_ID);
    expect(publicKeySha256()).toBe("064580e7584b56038064cd5b4a11e1bfde8ddf403a06cc974d2d63c59b7e155b");
  });

  it("adiciona a chave somente ao manifest Embedded", () => {
    expect(manifest).not.toHaveProperty("key");
    expect(manifestForVariant(manifest, "store")).not.toHaveProperty("key");
    expect(manifestForVariant({ ...manifest, key: "contaminação" }, "store")).not.toHaveProperty("key");
    expect(manifestForVariant(manifest, "embedded")).toHaveProperty("key", EMBEDDED_PUBLIC_KEY);
  });

  it("não mantém arquivos de chave privada no repositório", () => {
    const suspicious = sourceFiles(projectRoot).filter((path) =>
      /(?:^|[\\/])(?:private[-_.]?key|.*\.(?:pem|p12|pfx))$/iu.test(path)
    );
    expect(suspicious).toEqual([]);
    expect(Object.keys(JSON.parse(readFileSync(
      resolve(projectRoot, "config/embedded-extension.json"), "utf8",
    )))).toEqual(["publicKey"]);
  });
});

describe("variantes de build", () => {
  it("separa Store e Embedded sem mudar o host PROD", () => {
    expect(resolveBuildSettings("production")).toEqual({
      productionVariant: "store", transport: "native",
      hostName: NATIVE_HOST.production, outDir: "dist", extensionId: STORE_EXTENSION_ID,
    });
    expect(resolveBuildSettings("embedded", "mock")).toEqual({
      productionVariant: "embedded", transport: "native",
      hostName: NATIVE_HOST.production, outDir: "artifacts/embedded",
      extensionId: EMBEDDED_EXTENSION_ID,
    });
    expect(selectTransport({ MODE: "embedded", VITE_AURI_TRANSPORT: "mock" })).toEqual({
      kind: "native", hostName: NATIVE_HOST.production,
    });
  });

  it("mantém DEV isolado com o host .dev", () => {
    expect(resolveBuildSettings("dev-native")).toEqual({
      productionVariant: "store", transport: "native",
      hostName: NATIVE_HOST.development, outDir: "artifacts/dev-native",
      extensionId: DEV_EXTENSION_ID,
    });
    expect(selectTransport({ MODE: "dev-native" })).toEqual({
      kind: "native", hostName: NATIVE_HOST.development,
    });
    expect(resolveBuildSettings("development")).toMatchObject({
      transport: "mock", hostName: NATIVE_HOST.development, outDir: "dist",
      extensionId: DEV_EXTENSION_ID,
    });
    expect(DEV_EXTENSION_ID).toBe("lfneneebngmiikddoddnlcgobfjkodpm");
    expect(DEV_EXTENSION_ID).not.toBe(STORE_EXTENSION_ID);
    expect(DEV_EXTENSION_ID).not.toBe(EMBEDDED_EXTENSION_ID);
  });
});


describe("variante Native Messaging E2E", () => {
  it("fixa identidade pública exclusiva e nunca escolhe mock ou host PROD/DEV", () => {
    expect(E2E_EXTENSION_ID).toMatch(/^[a-p]{32}$/u);
    expect([STORE_EXTENSION_ID, EMBEDDED_EXTENSION_ID, DEV_EXTENSION_ID]).not.toContain(E2E_EXTENSION_ID);
    expect(calculateExtensionId(E2E_PUBLIC_KEY)).toBe(E2E_EXTENSION_ID);
    expect(resolveBuildSettings("e2e-native", "mock")).toEqual({
      productionVariant: "e2e", transport: "native", hostName: "app.auri.native_host.e2e",
      outDir: "artifacts/e2e-native", extensionId: E2E_EXTENSION_ID,
    });
    expect(selectTransport({ MODE: "e2e-native", VITE_AURI_TRANSPORT: "mock" })).toEqual({
      kind: "native", hostName: NATIVE_HOST.e2e,
    });
  });
  it("mantém versão e permissões e usa somente a chave pública E2E", () => {
    const result = manifestForVariant({ ...manifest, key: EMBEDDED_PUBLIC_KEY }, "e2e");
    expect(result).toMatchObject({ key: E2E_PUBLIC_KEY, version: manifest.version, name: "Auri Extension E2E", version_name: manifest.version + " E2E", permissions: manifest.permissions });
    expect(Object.keys(JSON.parse(readFileSync(resolve(projectRoot, "config/e2e-extension.json"), "utf8")))).toEqual(["publicKey"]);
    expect(manifest).not.toHaveProperty("key");
    expect(manifestForVariant(manifest, "embedded")).toHaveProperty("key", EMBEDDED_PUBLIC_KEY);
    expect(manifestForVariant(manifest, "store")).not.toHaveProperty("key");
  });
});


describe("versão declarada da variante E2E", () => {
  it.each(["0.3.1", "1.2.3.4"])("deriva versão e version_name de %s sem mudar o projeto", version => {
    expect(manifestForVariant({ ...manifest, version }, "e2e")).toMatchObject({ version, version_name: version + " E2E", key: E2E_PUBLIC_KEY });
  });
  it.each([undefined, 3, " 0.3.1", "0.3.1 ", "v0.3.1", "0.03.1", "0.3.1-beta", "1.2.3.4.5", "65536.1", "0.0.0"])("recusa versão não canônica %o", version => {
    expect(() => manifestForVariant({ ...manifest, version }, "e2e")).toThrow("Versão");
  });
});
