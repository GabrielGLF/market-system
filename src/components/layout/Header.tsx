import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { 
  Menu, Wifi, WifiOff, Sun, Moon, Monitor, 
  Keyboard, User, ShoppingCart, Wallet, ChevronDown, Check 
} from 'lucide-react';
import { toast } from 'sonner';

interface HeaderProps {
  onOpenSidebar: () => void;
  onOpenShortcuts: () => void;
  onNavigate: (view: string) => void;
}

export function Header({ onOpenSidebar, onOpenShortcuts, onNavigate }: HeaderProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('theme') as any) || 'system';
  });

  const [activeUser, setActiveUser] = useState<{ name: string; role: 'ADMIN' | 'MANAGER' | 'CASHIER' }>(() => {
    const saved = localStorage.getItem('market_active_user');
    return saved ? JSON.parse(saved) : { name: 'Admin Principal', role: 'ADMIN' };
  });

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const activeCashSession = useLiveQuery(() => 
    db.cashSessions.where('status').equals('OPEN').first()
  );

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

  const handleSelectUser = (name: string, role: 'ADMIN' | 'MANAGER' | 'CASHIER') => {
    const newUser = { name, role };
    setActiveUser(newUser);
    localStorage.setItem('market_active_user', JSON.stringify(newUser));
    setIsUserMenuOpen(false);
    toast.success(`Usuário alterado para "${name}" (${role})`);
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
        
        <div className="hidden sm:flex items-center ml-2 space-x-2">
          {isOnline ? (
            <span className="flex items-center text-emerald-600 dark:text-emerald-400 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span> Online & Sincronizado
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
              {activeUser.name.charAt(0)}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-bold text-slate-800 dark:text-white leading-none">{activeUser.name}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{activeUser.role}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
          </button>

          {/* User Menu Dropdown */}
          {isUserMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-50">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700 text-xs font-semibold text-slate-400 uppercase">
                Alternar Usuário Ativo
              </div>

              <button
                onClick={() => handleSelectUser('Admin Geral', 'ADMIN')}
                className="w-full px-3 py-2 text-left text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between text-slate-800 dark:text-slate-200"
              >
                <div>
                  <p>Admin Geral</p>
                  <p className="text-[10px] text-slate-400 font-normal">Acesso total ao sistema</p>
                </div>
                {activeUser.role === 'ADMIN' && <Check className="w-4 h-4 text-emerald-600" />}
              </button>

              <button
                onClick={() => handleSelectUser('Carlos Gerente', 'MANAGER')}
                className="w-full px-3 py-2 text-left text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between text-slate-800 dark:text-slate-200"
              >
                <div>
                  <p>Carlos Gerente</p>
                  <p className="text-[10px] text-slate-400 font-normal">Gerente de Loja</p>
                </div>
                {activeUser.role === 'MANAGER' && <Check className="w-4 h-4 text-emerald-600" />}
              </button>

              <button
                onClick={() => handleSelectUser('Ana Operadora', 'CASHIER')}
                className="w-full px-3 py-2 text-left text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between text-slate-800 dark:text-slate-200"
              >
                <div>
                  <p>Ana Operadora</p>
                  <p className="text-[10px] text-slate-400 font-normal">Operadora de Caixa</p>
                </div>
                {activeUser.role === 'CASHIER' && <Check className="w-4 h-4 text-emerald-600" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
