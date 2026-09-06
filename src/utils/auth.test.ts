import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin } from './auth';
import type { User } from '../types';

describe('auth local (hash de PIN)', () => {
  it('hashPin gera hash hexadecimal determinístico de 64 chars', async () => {
    const h1 = await hashPin('1234');
    const h2 = await hashPin('1234');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('PINs diferentes geram hashes diferentes', async () => {
    expect(await hashPin('1234')).not.toBe(await hashPin('12345'));
    expect(await hashPin('1234')).not.toBe(await hashPin('4321'));
  });

  it('verifyPin aceita PIN correto e rejeita incorreto (modo hash)', async () => {
    const user = { pinHash: await hashPin('1111') } as Pick<User, 'pin' | 'pinHash'>;
    expect(await verifyPin(user, '1111')).toBe(true);
    expect(await verifyPin(user, '2222')).toBe(false);
  });

  it('verifyPin aceita PIN legado em texto puro (migração)', async () => {
    const user = { pin: '1234' } as Pick<User, 'pin' | 'pinHash'>;
    expect(await verifyPin(user, '1234')).toBe(true);
    expect(await verifyPin(user, '0000')).toBe(false);
  });

  it('verifyPin rejeita PIN vazio', async () => {
    const user = { pin: '1234' } as Pick<User, 'pin' | 'pinHash'>;
    expect(await verifyPin(user, '')).toBe(false);
    const hashed = { pinHash: await hashPin('1234') } as Pick<User, 'pin' | 'pinHash'>;
    expect(await verifyPin(hashed, '')).toBe(false);
  });
});