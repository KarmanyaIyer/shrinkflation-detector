interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_USE_FIXTURES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
