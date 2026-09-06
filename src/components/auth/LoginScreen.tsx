import React, { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import {
  Store, Lock, LogIn, AlertCircle, Eye, EyeOff, User as UserIcon,
  WifiOff, Cloud, ShieldCheck
} from 'lucide-react';
import { login } from '../../utils/auth';
import { isServerAuthConfigured, loginWithServer } from '../../utils/serverAuth';
import type { User } from '../../types';

interface LoginScreenProps {
  onLoggedIn: (user: User) => void;
}

const roleLabel: Record<User['role'], string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  CASHIER: 'Operador de Caixa'
};

export function LoginScreen({ onLoggedIn }: LoginScreenProps) {
  const users = useLiveQuery(() => db.users.toArray()) || [];
  const serverConfigured = isServerAuthConfigured();

  // E-mail é compartilhado entre os dois fluxos (conta e local)
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isServerLoading, setIsServerLoading] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  const emailRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ---- Login LOCAL (PIN) — funciona sempre, inclusive offline ----
  const handleLocalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !pin) {
      setError('Informe o e-mail e o PIN do operador.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const user = await login(email, pin);
      onLoggedIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
      setIsLoading(false);
    }
  };

  // ---- Login na NUVEM (Supabase) — quando configurado e online ----
  const handleServerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setServerError('Informe o e-mail e a senha da conta.');
      return;
    }
    setServerError('');
    setIsServerLoading(true);
    try {
      const user = await loginWithServer(email, password);
      onLoggedIn(user);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Falha ao entrar com a conta.');
      setIsServerLoading(false);
    }
  };

  const quickSelect = (u: User) => {
    setEmail(u.email);
    setError('');
    setServerError('');
    pinRef.current?.focus();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950">
      <div className="w-full max-w-md space-y-5">
        {/* Marca */}
        <div className="flex items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-900/40">
            <Store className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-wide">MarketSystem</h1>
            <p className="text-xs text-emerald-300/80 font-medium">PDV & Gestão Comercial</p>
          </div>
        </div>

        {/* Aviso offline quando a conta em nuvem está configurada mas sem rede */}
        {serverConfigured && !online && (
          <div className="flex items-center gap-2 p-3 bg-amber-950/50 border border-amber-700/60 rounded-xl text-sm text-amber-200">
            <WifiOff className="w-4 h-4 shrink-0" />
            Sem conexão com a internet — usando acesso local offline (PIN).
          </div>
        )}

        {/* Login na Nuvem (Supabase) */}
        {serverConfigured && online && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60">
              <h2 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Cloud className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Entrar com a conta (nuvem)
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Validação segura pelo Supabase Auth. Use a senha da sua conta.
              </p>
            </div>
            <form onSubmit={handleServerSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1.5">E-mail</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="conta@loja.com"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1.5">Senha</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {serverError && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-sm text-rose-700 dark:text-rose-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {serverError}
                </div>
              )}
              <button
                type="submit"
                disabled={isServerLoading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all"
              >
                <LogIn className="w-4 h-4" />
                {isServerLoading ? 'Verificando...' : 'Entrar com a conta'}
              </button>
            </form>
          </div>
        )}

        {/* Acesso local (PIN) — fallback offline e modo sem nuvem */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60">
            <h2 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              {serverConfigured ? 'Acesso local (fallback offline)' : 'Acesso do Operador'}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              E-mail + PIN gravado neste dispositivo — funciona sem internet.
            </p>
          </div>

          <form onSubmit={handleLocalSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1.5">E-mail</label>
              <div className="relative">
                <UserIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={emailRef}
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operador@loja.com"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1.5">PIN</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={pinRef}
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  autoComplete="current-password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono tracking-widest"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  tabIndex={-1}
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-sm text-rose-700 dark:text-rose-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
            >
              <LogIn className="w-4 h-4" />
              {isLoading ? 'Verificando...' : 'Entrar no PDV'}
            </button>
          </form>

          {users.length > 0 && (
            <div className="px-5 pb-5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase mb-2">
                Operadores cadastrados — clique para preencher o e-mail
              </p>
              <div className="space-y-1.5">
                {users.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => quickSelect(u)}
                    className="w-full flex items-center gap-3 p-2.5 bg-slate-50 dark:bg-slate-900/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-black shrink-0">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{u.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{u.email}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0">
                      {roleLabel[u.role]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Nota offline-first */}
        <p className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
          <WifiOff className="w-3.5 h-3.5" />
          Dados locais e offline-first (IndexedDB) — o PDV nunca trava sem internet.
        </p>
      </div>
    </div>
  );
}

export default LoginScreen;
