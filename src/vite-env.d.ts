/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AURI_MOCK_SCENARIO?: string;
  readonly VITE_AURI_TRANSPORT?: "mock" | "native";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __AURI_BUILD_TRANSPORT__: "mock" | "native";
declare const __AURI_NATIVE_HOST__: string;
