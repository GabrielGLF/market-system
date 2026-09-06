/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL pública do projeto Supabase — opcional */
  readonly VITE_SUPABASE_URL?: string;
  /** Chave publishable/anon pública do Supabase — opcional */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
