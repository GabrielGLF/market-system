/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL do projeto Supabase (ex.: https://xxxx.supabase.co) — opcional */
  readonly VITE_SUPABASE_URL?: string;
  /** Chave anônima (pública) do Supabase — opcional */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}