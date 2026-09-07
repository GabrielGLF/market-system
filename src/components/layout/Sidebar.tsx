import React from 'react';
import {
  LayoutDashboard, ShoppingCart, Package, Tags, Calculator,
  BarChart3, Wallet, Users, LayoutList, Settings, Store,
  ArrowRightLeft, type LucideIcon
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  collapsed?: boolean;
}

interface MenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

const sections: { title: string; items: MenuItem[] }[] = [
  {
    title: 'Operação',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'pdv', label: 'PDV (Vendas)', icon: ShoppingCart, badge: 'F2' },
      { id: 'cash', label: 'Caixa', icon: Wallet },
      { id: 'sales', label: 'Histórico de Vendas', icon: LayoutList },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { id: 'inventory', label: 'Estoque & Produtos', icon: Package },
      { id: 'movements', label: 'Movimentações', icon: ArrowRightLeft },
      { id: 'pricing', label: 'Preços & Margens', icon: Tags },
      { id: 'calculator', label: 'Calculadora de Preço', icon: Calculator },
      { id: 'financial', label: 'Painel Financeiro', icon: BarChart3 },
      { id: 'customers', label: 'Clientes / Fiado', icon: Users },
    ],
  },
  {
    title: 'Sistema',
    items: [{ id: 'settings', label: 'Configurações', icon: Settings }],
  },
];

export function Sidebar({ currentView, onNavigate, collapsed = false }: SidebarProps) {
  const renderItem = (item: MenuItem) => {
    const Icon = item.icon;
    const isActive = currentView === item.id;

    return (
      <button
        key={item.id}
        onClick={() => onNavigate(item.id)}
        title={collapsed ? item.label : undefined}
        className={twMerge(
          clsx(
            'w-full flex items-center rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer',
            collapsed ? 'justify-center py-2.5' : 'justify-between px-3 py-2',
            isActive
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-200'
          )
        )}
      >
        <span className="flex items-center min-w-0">
          <Icon className={clsx('w-[18px] h-[18px] shrink-0', collapsed ? 'mr-0' : 'mr-3', isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400')} />
          {!collapsed && <span className="whitespace-nowrap truncate">{item.label}</span>}
        </span>
        {!collapsed && item.badge && (
          <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
            {item.badge}
          </kbd>
        )}
      </button>
    );
  };

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transition-all duration-300 ${collapsed ? 'w-[72px]' : 'w-60'}`}>
      <div className={`flex items-center h-16 border-b border-slate-200 dark:border-slate-700 ${collapsed ? 'justify-center px-0' : 'px-4'}`}>
        <span className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
          <Store className="w-4 h-4" />
        </span>
        {!collapsed && <span className="ml-2.5 text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">MarketSystem</span>}
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        <nav className={`space-y-4 ${collapsed ? 'px-2' : 'px-3'}`}>
          {sections.map((section) => (
            <div key={section.title}>
              {!collapsed && (
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">{section.items.map(renderItem)}</div>
            </div>
          ))}
        </nav>
      </div>

      <div className="px-3 py-3 border-t border-slate-200 dark:border-slate-700">
        {!collapsed && (
          <p className="text-[11px] text-center text-slate-400 dark:text-slate-500">
            MarketSystem ERP · v1.0
          </p>
        )}
      </div>
    </div>
  );
}

export default Sidebar;
