/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'mock' runs the whole app with no backend. 'live' talks to the server. */
  readonly VITE_API_MODE?: 'mock' | 'live';
  /** Base URL of the API, including the version prefix. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
