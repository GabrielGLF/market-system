import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { 
  Menu, WifiOff, Sun, Moon, Monitor,
  Keyboard, ShoppingCart, Wallet, PanelLeftClose, PanelLeftOpen, CloudUpload
} from 'lucide-react';

interface HeaderProps {
  onOpenSidebar: () => void;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
  onOpenShortcuts: () => void;
  onNavigate: (view: string) => void;
}

export function Header({ onOpenSidebar, onToggleSidebar, sidebarCollapsed, onOpenShortcuts, onNavigate }: HeaderProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('theme') as any) || 'system';
  });

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
          {isOnline && pendingSync > 0 ? (
            <span className="flex items-center text-amber-600 dark:text-amber-400 text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-800/50" title="Aguardando envio para a nuvem">
              <CloudUpload className="w-3.5 h-3.5 mr-1.5" /> {pendingSync} pendente{pendingSync > 1 ? 's' : ''}
            </span>
          ) : isOnline ? (
            <span className="flex items-center text-emerald-600 dark:text-emerald-400 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span> Online
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

      </div>
    </header>
  );
}

export default Header;
