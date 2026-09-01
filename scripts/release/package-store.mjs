import { deflateRawSync } from "node:zlib";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const STORE_PACKAGE_NAME = "auri-extension-0.1.0-chromium.zip";
export const PRODUCTION_HOST = "app.auri.native_host";
export const DEVELOPMENT_HOST = "app.auri.native_host.dev";

const REQUIRED_ICONS = [
  "icons/auri-16.png",
  "icons/auri-32.png",
  "icons/auri-48.png",
  "icons/auri-128.png",
];
const EXPECTED_PERMISSIONS = ["activeTab", "nativeMessaging", "scripting"];
const DOS_DATE_1980_01_01 = (1 << 5) | 1;
const UTF8_FLAG = 0x0800;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function collectFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(root, absolutePath));
    } else if (entry.isFile() && !entry.name.endsWith(".map")) {
      files.push({
        name: relative(root, absolutePath).split(sep).join("/"),
        data: await readFile(absolutePath),
      });
    }
  }
  return files.sort((left, right) => left.name.localeCompare(right.name));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function validateProductionDist(distDirectory) {
  const distStats = await stat(distDirectory).catch(() => undefined);
  assert(distStats?.isDirectory(), "dist/ não existe; execute npm run build primeiro.");

  const files = await collectFiles(distDirectory);
  const names = files.map(({ name }) => name);
  const manifestEntry = files.find(({ name }) => name === "manifest.json");
  assert(manifestEntry, "manifest.json ausente em dist/.");
  const manifest = JSON.parse(manifestEntry.data.toString("utf8"));

  assert(manifest.manifest_version === 3, "O manifest precisa usar Manifest V3.");
  assert(manifest.name === "Auri", "O nome de produção precisa ser Auri.");
  assert(manifest.version === "0.1.0", "A versão da extensão precisa ser 0.1.0.");
  assert(
    JSON.stringify([...manifest.permissions].sort()) === JSON.stringify(EXPECTED_PERMISSIONS),
    "As permissões do manifest não correspondem ao conjunto mínimo aprovado.",
  );
  assert(!("background" in manifest), "O pacote não pode conter service worker/background.");
  assert(manifest.action?.default_popup === "index.html", "Popup de action inválido.");
  assert(names.includes("index.html"), "index.html ausente.");
  assert(names.some((name) => name.startsWith("assets/") && name.endsWith(".js")), "JS do popup ausente.");
  assert(names.some((name) => name.startsWith("assets/") && name.endsWith(".css")), "CSS do popup ausente.");
  for (const icon of REQUIRED_ICONS) assert(names.includes(icon), `Ícone ausente: ${icon}`);

  const javascript = files
    .filter(({ name }) => name.endsWith(".js"))
    .map(({ data }) => data.toString("utf8"))
    .join("\n");
  assert(javascript.includes(PRODUCTION_HOST), "O bundle não contém o Native Host de produção.");
  assert(!javascript.includes(DEVELOPMENT_HOST), "O bundle contém o Native Host DEV.");
  assert(!names.some((name) => name.endsWith(".map")), "O pacote contém sourcemaps.");
  assert(!names.some((name) => name.startsWith("node_modules/")), "O pacote contém node_modules.");
  assert(!names.some((name) => /^(src|tests)\//u.test(name)), "O pacote contém código-fonte ou testes.");

  return files;
}

export function createZipBuffer(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBuffer = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data, { level: 9 });
    const checksum = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(UTF8_FLAG, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(DOS_DATE_1980_01_01, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuffer, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(UTF8_FLAG, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(DOS_DATE_1980_01_01, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function listZipEntries(zipBuffer) {
  const endOffset = zipBuffer.length - 22;
  assert(zipBuffer.readUInt32LE(endOffset) === 0x06054b50, "ZIP sem diretório central válido.");
  const count = zipBuffer.readUInt16LE(endOffset + 10);
  let offset = zipBuffer.readUInt32LE(endOffset + 16);
  const names = [];
  for (let index = 0; index < count; index += 1) {
    assert(zipBuffer.readUInt32LE(offset) === 0x02014b50, "Entrada inválida no diretório central.");
    const nameLength = zipBuffer.readUInt16LE(offset + 28);
    const extraLength = zipBuffer.readUInt16LE(offset + 30);
    const commentLength = zipBuffer.readUInt16LE(offset + 32);
    names.push(zipBuffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

export async function createStorePackage(projectRoot) {
  const distDirectory = resolve(projectRoot, "dist");
  const releaseDirectory = resolve(projectRoot, "release");
  const outputPath = resolve(releaseDirectory, STORE_PACKAGE_NAME);
  const files = await validateProductionDist(distDirectory);
  const zipBuffer = createZipBuffer(files);
  const zipEntries = listZipEntries(zipBuffer);
  assert(
    JSON.stringify(zipEntries) === JSON.stringify(files.map(({ name }) => name)),
    "O conteúdo do ZIP diverge de dist/.",
  );
  await mkdir(releaseDirectory, { recursive: true });
  await writeFile(outputPath, zipBuffer);
  return { outputPath, files, zipBytes: zipBuffer.length };
}

async function main() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(scriptDirectory, "..", "..");
  const result = await createStorePackage(projectRoot);
  const distBytes = result.files.reduce((total, file) => total + file.data.length, 0);
  console.log(`Pacote criado: ${result.outputPath}`);
  console.log(`Arquivos: ${result.files.length}`);
  console.log(`Tamanho dist: ${distBytes} bytes`);
  console.log(`Tamanho ZIP: ${result.zipBytes} bytes`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
