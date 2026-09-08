import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

import {
  manifestForVariant,
  resolveBuildSettings,
  type ProductionVariant,
} from "./build/extension-variants";

const projectRoot = dirname(fileURLToPath(import.meta.url));

function manifestVariantPlugin(outDir: string, variant: ProductionVariant): Plugin {
  return {
    name: "auri-manifest-variant",
    apply: "build",
    async closeBundle() {
      const manifestPath = resolve(projectRoot, outDir, "manifest.json");
      const source = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
      const manifest = manifestForVariant(source, variant);
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    },
  };
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, projectRoot, "");
  const settings = resolveBuildSettings(mode, environment.VITE_AURI_TRANSPORT);

  return {
    plugins: [react(), manifestVariantPlugin(settings.outDir, settings.productionVariant)],
    define: {
      __AURI_BUILD_TRANSPORT__: JSON.stringify(settings.transport),
      __AURI_NATIVE_HOST__: JSON.stringify(settings.hostName),
    },
    build: {
      outDir: settings.outDir,
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
