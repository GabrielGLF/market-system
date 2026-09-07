import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import {
  Menu, WifiOff, Sun, Moon, Monitor,
  Keyboard, ShoppingCart, Wallet, PanelLeftClose, PanelLeftOpen, CloudUpload
} from 'lucide-react';
import { Badge } from '../ui';

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
    <header className="h-14 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-3 sm:px-4 z-30 shrink-0">
      <div className="flex items-center min-w-0">
        <button
          onClick={onOpenSidebar}
          className="lg:hidden p-2 mr-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Colapsar / Expandir barra lateral (desktop) */}
        <button
          onClick={onToggleSidebar}
          className="hidden lg:flex p-2 mr-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          title={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
        </button>

        <div className="hidden sm:flex items-center ml-1">
          {isOnline && pendingSync > 0 ? (
            <Badge tone="warning" title="Aguardando envio para a nuvem">
              <CloudUpload className="w-3.5 h-3.5" /> {pendingSync} pendente{pendingSync > 1 ? 's' : ''}
            </Badge>
          ) : isOnline ? (
            <Badge tone="positive" dot pulse>Online</Badge>
          ) : (
            <Badge tone="warning" title="Dados salvos localmente (IndexedDB)">
              <WifiOff className="w-3.5 h-3.5" /> Offline
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={() => onNavigate('pdv')}
          className="flex items-center px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer"
        >
          <ShoppingCart className="w-3.5 h-3.5 mr-1.5" /> PDV
          <kbd className="hidden md:inline ml-1.5 px-1 py-px rounded text-[10px] font-mono bg-white/20">F2</kbd>
        </button>

        <button
          onClick={() => onNavigate('cash')}
          className="flex items-center px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors cursor-pointer text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          title={isCashOpen ? 'Caixa aberto — ver detalhes' : 'Caixa fechado — clique para abrir'}
        >
          <Wallet className="w-3.5 h-3.5 mr-1.5" />
          <span className="hidden sm:inline">{isCashOpen ? 'Caixa aberto' : 'Caixa fechado'}</span>
          <span className={`w-1.5 h-1.5 rounded-full ml-1.5 ${isCashOpen ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        </button>

        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5 hidden sm:block" />

        <button
          onClick={onOpenShortcuts}
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          title="Atalhos de teclado (F1)"
        >
          <Keyboard className="w-4 h-4" />
        </button>

        <button
          onClick={toggleTheme}
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          title="Alternar tema (claro / escuro / sistema)"
        >
          {theme === 'light' ? <Sun className="w-4 h-4" /> : theme === 'dark' ? <Moon className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
        </button>

      </div>
    </header>
  );
}

export default Header;
