/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_SESSION_TTL_MINUTES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
