import { v4 as uuidv4 } from 'uuid';

/** Guards centralizados para APIs de browser — offline-first não pode derrubar o PDV em HTTP/WebView antigo. */

export function canUseBroadcast(): boolean {
  return typeof window !== 'undefined' && 'BroadcastChannel' in window;
}

export function createBroadcastChannel(name: string): BroadcastChannel | null {
  try {
    if (!canUseBroadcast()) return null;
    return new BroadcastChannel(name);
  } catch {
    return null;
  }
}

export function canUseAudio(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.AudioContext || w.webkitAudioContext);
}

export function canUseClipboard(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.clipboard) &&
    typeof navigator.clipboard?.writeText === 'function'
  );
}

export async function copyTextSafe(text: string): Promise<boolean> {
  try {
    if (canUseClipboard()) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback para contexto não-seguro (HTTP em rede local de PDV): textarea + execCommand.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function isSecureContextSafe(): boolean {
  try {
    return typeof window !== 'undefined' && window.isSecureContext === true;
  } catch {
    return false;
  }
}

export function canUseSubtleCrypto(): boolean {
  try {
    return Boolean(
      typeof crypto !== 'undefined' &&
        crypto.subtle &&
        typeof crypto.subtle.encrypt === 'function'
    );
  } catch {
    return false;
  }
}

/** UUID seguro com fallback para HTTP/WebView sem crypto.randomUUID. */
export function safeRandomUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // cai para o fallback abaixo
  }
  try {
    return uuidv4();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Código de pareamento com aleatoriedade criptográfica quando disponível. */
export function safePairingCode(length = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(length);
      crypto.getRandomValues(buf);
      return Array.from(buf, (n) => alphabet[n % alphabet.length]).join('');
    }
  } catch {
    // fallback abaixo
  }
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // modo privado/quota cheia: ignora, app segue offline em memória
  }
}
