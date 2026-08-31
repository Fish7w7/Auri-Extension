/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AURI_MOCK_SCENARIO?: string;
  readonly VITE_AURI_TRANSPORT?: "mock" | "native";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
