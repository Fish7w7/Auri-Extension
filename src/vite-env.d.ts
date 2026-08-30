/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AURI_MOCK_SCENARIO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
