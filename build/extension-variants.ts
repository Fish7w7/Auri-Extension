import { createHash, createPublicKey } from "node:crypto";

import embeddedIdentity from "../config/embedded-extension.json";
import { NATIVE_HOST } from "../src/config/native-hosts";

export type ProductionVariant = "store" | "embedded";

export const EMBEDDED_PUBLIC_KEY = embeddedIdentity.publicKey;

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

export function manifestForVariant(
  manifest: Record<string, unknown>,
  variant: ProductionVariant,
): Record<string, unknown> {
  const { key: _ignored, ...withoutKey } = manifest;
  return variant === "embedded"
    ? { ...withoutKey, key: EMBEDDED_PUBLIC_KEY }
    : withoutKey;
}

export function resolveBuildSettings(mode: string, requestedTransport?: string) {
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
  return { productionVariant, transport, hostName, outDir } as const;
}
