import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createEmbeddedPackage } from "./package-store.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..", "..");

createEmbeddedPackage(projectRoot)
  .then((result) => {
    const distBytes = result.files.reduce((total, file) => total + file.data.length, 0);
    console.log(`Pacote Embedded criado: ${result.outputPath}`);
    console.log(`Metadata criado: ${result.metadataPath}`);
    console.log(`Extension ID: ${result.metadata.extensionId}`);
    console.log(`Arquivos: ${result.files.length}`);
    console.log(`Tamanho build: ${distBytes} bytes`);
    console.log(`Tamanho ZIP: ${result.zipBytes} bytes`);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
