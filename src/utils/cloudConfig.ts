import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Configuração da NUVEM (Supabase) — opcional e independente do PDV.
 *
 * O MarketSystem é de uma única pessoa: sem operadores, sem papéis, sem login.
 * Os dados vivem no IndexedDB (offline-first). Este módulo existe apenas para
 * o ESPELHO em nuvem (vendas, estoque e caixa no Supabase Postgres, via
 * docs/CLOUD_SYNC.md). Sem as variáveis de ambiente, tudo segue 100% local.
 */

let client: SupabaseClient | null = null;

export function isCloudConfigured(): boolean {
  return Boolean(
    typeof import.meta.env !== 'undefined' &&
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isCloudConfigured()) return null;
  if (!client) {
    client = createClient(
      import.meta.env.VITE_SUPABASE_URL as string,
      import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      }
    );
  }
  return client;
}
