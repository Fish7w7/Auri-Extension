import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

import { NATIVE_HOST } from "./src/config/native-hosts";

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, projectRoot, "");
  const transport =
    mode === "production" ||
    mode === "dev-native" ||
    (mode === "development" && environment.VITE_AURI_TRANSPORT === "native")
      ? "native"
      : "mock";
  const hostName = mode === "production"
    ? NATIVE_HOST.production
    : NATIVE_HOST.development;

  return {
    plugins: [react()],
    define: {
      __AURI_BUILD_TRANSPORT__: JSON.stringify(transport),
      __AURI_NATIVE_HOST__: JSON.stringify(hostName),
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        input: {
          popup: resolve(projectRoot, "index.html"),
        },
        output: {
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  };
});
