import packageMetadata from "../../package.json";

export const EXTENSION_VERSION = packageMetadata.version;

export const NATIVE_HOST = {
  production: "app.auri.native_host",
  development: "app.auri.native_host.dev",
} as const;

export const NATIVE_REQUEST_TIMEOUT_MS = 20_000;
