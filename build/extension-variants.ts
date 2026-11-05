import { createHash, createPublicKey } from "node:crypto";

import e2eIdentity from "../config/e2e-extension.json";
import embeddedIdentity from "../config/embedded-extension.json";
import { NATIVE_HOST } from "../src/config/native-hosts";

export type ProductionVariant = "store" | "embedded" | "e2e";

export const STORE_EXTENSION_ID = "alnngjgmhiebpnjefjmhbhmhfpgoibnh";
export const DEV_EXTENSION_ID = "lfneneebngmiikddoddnlcgobfjkodpm";
export const EMBEDDED_PUBLIC_KEY = embeddedIdentity.publicKey;
export const E2E_PUBLIC_KEY = e2eIdentity.publicKey;

function publicKeyBytes(publicKey: string): Buffer {
  const normalized = publicKey.replace(/\s+/gu, "");
  const decoded = Buffer.from(normalized, "base64");
  if (!normalized || decoded.toString("base64") !== normalized) {
    throw new Error("Chave pública Embedded inválida.");
  }
  const parsed = createPublicKey({ key: decoded, format: "der", type: "spki" });
  if (parsed.asymmetricKeyType !== "rsa") {
    throw new Error("A chave pública Embedded precisa ser RSA.");
  }
  return decoded;
}

export function calculateExtensionId(publicKey = EMBEDDED_PUBLIC_KEY): string {
  const hexadecimal = createHash("sha256").update(publicKeyBytes(publicKey)).digest("hex").slice(0, 32);
  return [...hexadecimal]
    .map((character) => String.fromCharCode("a".charCodeAt(0) + Number.parseInt(character, 16)))
    .join("");
}

export function publicKeySha256(publicKey = EMBEDDED_PUBLIC_KEY): string {
  return createHash("sha256").update(publicKeyBytes(publicKey)).digest("hex");
}

export const EMBEDDED_EXTENSION_ID = calculateExtensionId();
export const E2E_EXTENSION_ID = calculateExtensionId(E2E_PUBLIC_KEY);
if ([STORE_EXTENSION_ID, DEV_EXTENSION_ID, EMBEDDED_EXTENSION_ID].includes(E2E_EXTENSION_ID)) {
  throw new Error("A identidade E2E precisa ser exclusiva.");
}

export function manifestForVariant(
  manifest: Record<string, unknown>,
  variant: ProductionVariant,
): Record<string, unknown> {
  const { key: _ignored, ...withoutKey } = manifest;
  if (variant === "e2e") {
    const version = manifest.version;
    if (typeof version !== "string" || !/^(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){0,3}$/u.test(version) ||
      version.split(".").some(part => Number(part) > 65535) || version.split(".").every(part => Number(part) === 0)) {
      throw new Error("Versão de manifest E2E inválida.");
    }
    return { ...withoutKey, key: E2E_PUBLIC_KEY, name: "Auri Extension E2E", version_name: version + " E2E" };
  }
  return variant === "embedded"
    ? { ...withoutKey, key: EMBEDDED_PUBLIC_KEY }
    : withoutKey;
}

export function resolveBuildSettings(mode: string, requestedTransport?: string) {
  if (mode === "e2e-native") {
    return {
      productionVariant: "e2e", transport: "native", hostName: NATIVE_HOST.e2e,
      outDir: "artifacts/e2e-native", extensionId: E2E_EXTENSION_ID,
    } as const;
  }
  const productionVariant: ProductionVariant = mode === "embedded" ? "embedded" : "store";
  const isProduction = mode === "production" || mode === "embedded";
  const transport = isProduction || mode === "dev-native" ||
    (mode === "development" && requestedTransport === "native")
    ? "native"
    : "mock";
  const hostName = isProduction ? NATIVE_HOST.production : NATIVE_HOST.development;
  const outDir = mode === "embedded"
    ? "artifacts/embedded"
    : mode === "dev-native"
      ? "artifacts/dev-native"
      : "dist";
  const extensionId = mode === "embedded"
    ? EMBEDDED_EXTENSION_ID
    : mode === "dev-native" || mode === "development"
      ? DEV_EXTENSION_ID
      : STORE_EXTENSION_ID;
  return { productionVariant, transport, hostName, outDir, extensionId } as const;
}
