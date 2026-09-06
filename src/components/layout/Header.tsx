import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { 
  Menu, WifiOff, Sun, Moon, Monitor,
  Keyboard, ShoppingCart, Wallet, ChevronDown, LogOut,
  PanelLeftClose, PanelLeftOpen, Cloud, ShieldCheck, CloudUpload
} from 'lucide-react';
import type { AuthSession } from '../../utils/auth';

interface HeaderProps {
  onOpenSidebar: () => void;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
  onOpenShortcuts: () => void;
  onNavigate: (view: string) => void;
  user: AuthSession;
  onLogout: () => void;
}

const roleLabel: Record<AuthSession['role'], string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  CASHIER: 'Operador de Caixa'
};

export function Header({ onOpenSidebar, onToggleSidebar, sidebarCollapsed, onOpenShortcuts, onNavigate, user, onLogout }: HeaderProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('theme') as any) || 'system';
  });

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const activeCashSession = useLiveQuery(() => 
    db.cashSessions.where('status').equals('OPEN').first()
  );

  const pendingSync = useLiveQuery(() => db.syncOutbox.count(), [], 0);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.remove('light', 'dark');
      root.classList.add(systemTheme);
    } else {
      root.classList.remove('light', 'dark');
      root.classList.add(theme);
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const isCashOpen = !!activeCashSession;

  return (
    <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 shadow-xs z-30">
      <div className="flex items-center">
        <button 
          onClick={onOpenSidebar}
          className="lg:hidden p-2 mr-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md"
        >
          <Menu className="w-5 h-5" />
        </button>
        
        {/* Colapsar / Expandir barra lateral (desktop) */}
        <button
          onClick={onToggleSidebar}
          className="hidden lg:flex p-2 mr-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
          title={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
        </button>
        
        <div className="hidden sm:flex items-center ml-2 space-x-2">
          {isOnline && user.provider === 'server' && pendingSync > 0 ? (
            <span className="flex items-center text-amber-600 dark:text-amber-400 text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-800/50" title="Aguardando envio para a nuvem">
              <CloudUpload className="w-3.5 h-3.5 mr-1.5" /> {pendingSync} pendente{pendingSync > 1 ? 's' : ''}
            </span>
          ) : isOnline ? (
            <span className="flex items-center text-emerald-600 dark:text-emerald-400 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span> {user.provider === 'server' ? 'Sincronizado' : 'Online (local)'}
            </span>
          ) : (
            <span className="flex items-center text-amber-600 dark:text-amber-400 text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-800/50">
              <WifiOff className="w-3.5 h-3.5 mr-1.5" /> Modo Offline (IndexedDB)
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Quick Actions */}
        <button
          onClick={() => onNavigate('pdv')}
          className="flex items-center px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-sm shadow-emerald-600/20 transition-colors cursor-pointer"
        >
          <ShoppingCart className="w-3.5 h-3.5 mr-1.5" /> PDV (F2)
        </button>
        
        <button
          onClick={() => onNavigate('cash')}
          className={`flex items-center px-3 py-1.5 rounded-lg font-bold text-xs transition-colors cursor-pointer border ${
            isCashOpen 
              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300' 
              : 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300'
          }`}
          title={isCashOpen ? 'Caixa Aberto - Clique para detalhes' : 'Caixa Fechado - Clique para abrir'}
        >
          <Wallet className="w-3.5 h-3.5 mr-1.5" /> 
          <span className="hidden sm:inline">{isCashOpen ? 'Caixa Aberto' : 'Caixa Fechado'}</span>
          <span className={`w-2 h-2 rounded-full ml-1.5 ${isCashOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
        </button>

        <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block"></div>

        <button
          onClick={onOpenShortcuts}
          className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          title="Atalhos de Teclado (F1)"
        >
          <Keyboard className="w-4 h-4" />
        </button>

        <button
          onClick={toggleTheme}
          className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          title="Alternar Tema (Claro / Escuro / Sistema)"
        >
          {theme === 'light' ? <Sun className="w-4 h-4 text-amber-500" /> : theme === 'dark' ? <Moon className="w-4 h-4 text-blue-400" /> : <Monitor className="w-4 h-4" />}
        </button>

        {/* User Profile Selector */}
        <div className="relative pl-1 border-l border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center bg-slate-100 dark:bg-slate-700/80 px-2.5 py-1.5 rounded-xl cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors gap-2"
          >
            <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-black">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-bold text-slate-800 dark:text-white leading-none">{user.name}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{roleLabel[user.role]}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
          </button>

          {/* Menu do Usuário Logado */}
          {isUserMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-50">
              <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-700">
                <p className="text-sm font-bold text-slate-800 dark:text-white">{user.name}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{user.email}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                    {roleLabel[user.role]}
                  </span>
                  {user.provider === 'server' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300" title="Sessão validada no Supabase Auth">
                      <Cloud className="w-3 h-3" /> Nuvem
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300" title="Sessão local por PIN (offline-first)">
                      <ShieldCheck className="w-3 h-3" /> Local
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => { setIsUserMenuOpen(false); onLogout(); }}
                className="w-full px-3 py-2.5 text-left text-xs font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 text-rose-600 dark:text-rose-400"
              >
                <LogOut className="w-4 h-4" />
                Sair da Conta
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
