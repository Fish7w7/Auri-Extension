import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  EMBEDDED_EXTENSION_ID,
  EMBEDDED_PUBLIC_KEY,
  calculateExtensionId,
  manifestForVariant,
  publicKeySha256,
  resolveBuildSettings,
} from "../../build/extension-variants";
import manifest from "../../public/manifest.json";
import { NATIVE_HOST } from "../../src/config/native-hosts";
import { selectTransport } from "../../src/transport/create-transport";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const EDGE_EXTENSION_ID = "alnngjgmhiebpnjefjmhbhmhfpgoibnh";

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
    expect(EMBEDDED_EXTENSION_ID).not.toBe(EDGE_EXTENSION_ID);
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
      hostName: NATIVE_HOST.production, outDir: "dist",
    });
    expect(resolveBuildSettings("embedded", "mock")).toEqual({
      productionVariant: "embedded", transport: "native",
      hostName: NATIVE_HOST.production, outDir: "artifacts/embedded",
    });
    expect(selectTransport({ MODE: "embedded", VITE_AURI_TRANSPORT: "mock" })).toEqual({
      kind: "native", hostName: NATIVE_HOST.production,
    });
  });

  it("mantém DEV isolado com o host .dev", () => {
    expect(resolveBuildSettings("dev-native")).toEqual({
      productionVariant: "store", transport: "native",
      hostName: NATIVE_HOST.development, outDir: "artifacts/dev-native",
    });
    expect(selectTransport({ MODE: "dev-native" })).toEqual({
      kind: "native", hostName: NATIVE_HOST.development,
    });
    expect(resolveBuildSettings("development")).toMatchObject({
      transport: "mock", hostName: NATIVE_HOST.development, outDir: "dist",
    });
  });
});
