import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { db } from '../db';
import type { User } from '../types';
import { saveSession } from './auth';

/**
 * Autenticação EM NUVEM (Supabase) — opcional e complementar ao login local.
 *
 * O MarketSystem continua offline-first: sem VITE_SUPABASE_URL/ANON_KEY, este
 * módulo fica inativo e o sistema usa apenas o login local por PIN. Com as
 * variáveis configuradas, o operador pode entrar com e-mail + senha contra o
 * Supabase Auth. Se a rede cair, o login local por PIN segue funcionando
 * (fallback offline) — o PDV nunca fica bloqueado por falta de internet.
 */

let client: SupabaseClient | null = null;

export function isServerAuthConfigured(): boolean {
  return Boolean(
    typeof import.meta.env !== 'undefined' &&
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isServerAuthConfigured()) return null;
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

/** Encerra a sessão no Supabase (melhor esforço — a sessão local é sempre limpa). */
export async function logoutServer(): Promise<void> {
  const c = getSupabaseClient();
  if (c) {
    try {
      await c.auth.signOut();
    } catch {
      // offline: ignora, a sessão local já foi limpa pelo chamador
    }
  }
}

/**
 * Login com e-mail + senha contra o Supabase Auth. Em caso de sucesso:
 * 1. espelha o usuário na tabela local `users` (mesmo formato que o PDV usa);
 * 2. persiste a sessão local marcada como provider 'server'.
 *
 * Papel: usa `app_metadata.role` do Supabase se existir; senão reaproveita o
 * papel já cadastrado localmente; senão assume o mínimo privilégio (CASHIER).
 */
export async function loginWithServer(email: string, password: string): Promise<User> {
  const c = getSupabaseClient();
  if (!c) {
    throw new Error('Autenticação em nuvem não configurada. Adicione VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
  }

  const { data, error } = await c.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes('email not confirmed')) {
      throw new Error('Confirme seu e-mail antes de entrar.');
    }
    if (message.includes('rate limit') || message.includes('too many')) {
      throw new Error('Muitas tentativas. Aguarde alguns instantes e tente novamente.');
    }
    if (message.includes('invalid login credentials')) {
      throw new Error('E-mail ou senha inválidos.');
    }
    throw new Error('Não foi possível concluir o login agora. Tente novamente.');
  }
  const su = data.user;
  if (!su) {
    throw new Error('Não foi possível obter o usuário autenticado.');
  }

  const normalized = (email || '').trim().toLowerCase();
  const existing = await db.users.where('email').equals(normalized).first();

  const role = (su.app_metadata?.role as User['role']) || existing?.role || 'CASHIER';
  const name =
    (su.user_metadata?.name as string) ||
    existing?.name ||
    su.email ||
    normalized;

  const user: User = existing
    ? { ...existing, id: su.id, name, role }
    : { id: su.id, name, email: normalized, role };

  await db.users.put(user);
  saveSession(user, 'server');
  return user;
}
