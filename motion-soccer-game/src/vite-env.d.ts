/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_SIGNAL_URL: string; // Railway 시그널링 서버 (wss://...)
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
