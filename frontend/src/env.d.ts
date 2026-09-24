interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_USE_FIXTURES?: string;
  readonly VITE_FIXTURE_FAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
