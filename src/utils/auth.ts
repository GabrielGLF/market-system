import { db } from '../db';
import type { User } from '../types';

/**
 * Autenticação LOCAL (offline-first): o MarketSystem não tem backend — os dados
 * vivem no IndexedDB do navegador. O login valida e-mail + PIN contra a tabela
 * `users`, com o PIN armazenado como hash SHA-256 (nunca em texto puro), e a
 * sessão fica no localStorage. Não é autenticação de servidor.
 */

const SESSION_KEY = 'marketsystem.session';

export interface AuthSession {
  userId: string;
  name: string;
  email: string;
  role: User['role'];
  loginAt: string;
  /** Como a sessão foi criada: 'server' (Supabase) ou 'local' (PIN offline) */
  provider?: 'server' | 'local';
}

/** Hash SHA-256 em hexadecimal — Web Crypto (disponível em navegadores e Node 19+). */
export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verifica o PIN do usuário. Prefere `pinHash` (novo); cai para o PIN legado
 * em texto puro quando o cadastro ainda não foi migrado.
 */
export async function verifyPin(user: Pick<User, 'pin' | 'pinHash'>, pin: string): Promise<boolean> {
  if (!pin) return false;
  if (user.pinHash) {
    return (await hashPin(pin)) === user.pinHash;
  }
  return user.pin === pin;
}

/** Monta a sessão a partir do usuário autenticado. */
export function buildSession(user: User, provider: 'server' | 'local' = 'local'): AuthSession {
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    loginAt: new Date().toISOString(),
    provider
  };
}

export function saveSession(user: User, provider: 'server' | 'local' = 'local'): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(buildSession(user, provider)));
}

export function getSession(): AuthSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (parsed && typeof parsed.userId === 'string' && parsed.name && parsed.role) {
      return {
        ...parsed,
        // Sessões antigas (antes do provider) continuam válidas como 'local'
        provider: parsed.provider || 'local'
      } as AuthSession;
    }
  } catch {
    // localStorage corrompido: ignora e exige novo login
  }
  return null;
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Autentica e-mail + PIN. Em caso de sucesso, persiste a sessão e devolve o
 * usuário. Se o cadastro ainda tiver PIN legado, migra para hash na hora.
 */
export async function login(email: string, pin: string): Promise<User> {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized || !pin) {
    throw new Error('Informe e-mail e PIN.');
  }

  const user = await db.users.where('email').equals(normalized).first();
  if (!user) {
    throw new Error('Usuário não encontrado com este e-mail.');
  }

  const ok = await verifyPin(user, pin);
  if (!ok) {
    throw new Error('PIN incorreto. Tente novamente.');
  }

  // Migra PIN legado (texto puro) para hash sem exigir ação do usuário
  if (!user.pinHash && user.pin) {
    const pinHash = await hashPin(user.pin);
    await db.users.update(user.id, { pinHash, pin: undefined });
  }

  saveSession(user);
  return user;
}