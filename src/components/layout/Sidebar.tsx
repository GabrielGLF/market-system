import React from 'react';
import { 
  LayoutDashboard, ShoppingCart, Package, Tags, Calculator, 
  BarChart3, Wallet, Users, LayoutList, Settings, Store, 
  ArrowRightLeft 
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  collapsed?: boolean;
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pdv', label: 'PDV (Vendas)', icon: ShoppingCart, badge: 'F2' },
  { id: 'inventory', label: 'Estoque & Produtos', icon: Package },
  { id: 'movements', label: 'Movimentações', icon: ArrowRightLeft },
  { id: 'pricing', label: 'Preços & Margens', icon: Tags },
  { id: 'calculator', label: 'Calculadora de Preço', icon: Calculator },
  { id: 'sales', label: 'Histórico de Vendas', icon: LayoutList },
  { id: 'financial', label: 'Painel Financeiro', icon: BarChart3 },
  { id: 'customers', label: 'Clientes / Fiado', icon: Users },
  { id: 'cash', label: 'Caixa', icon: Wallet },
  { id: 'settings', label: 'Configurações', icon: Settings },
];

export function Sidebar({ currentView, onNavigate, collapsed = false }: SidebarProps) {
  return (
    <div className={`flex flex-col h-full bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 shadow-sm transition-all duration-300 ${collapsed ? 'w-20' : 'w-64'}`}>
      <div className={`flex items-center justify-center h-16 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-inner ${collapsed ? 'px-0' : 'px-3'}`}>
        <Store className={`w-6 h-6 shrink-0 ${collapsed ? 'mr-0' : 'mr-2'}`} />
        {!collapsed && <h1 className="text-xl font-bold tracking-wider whitespace-nowrap">MarketSystem</h1>}
      </div>
      
      <div className="flex-1 overflow-y-auto py-4">
        <nav className={`space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
          {menuItems.map((item) => {
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
                    collapsed ? 'justify-center py-2.5' : 'justify-between px-3 py-2.5',
                    isActive 
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 font-bold shadow-xs' 
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-200'
                  )
                )}
              >
                <div className={`flex items-center ${collapsed ? 'justify-center' : ''}`}>
                  <Icon className={clsx('w-5 h-5 shrink-0', collapsed ? 'mr-0' : 'mr-3', isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400')} />
                  {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
                </div>
                {!collapsed && item.badge && (
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
      
      <div className="p-4 border-t border-slate-200 dark:border-slate-700">
        {collapsed ? (
          <div className="text-center text-slate-400 dark:text-slate-500 text-lg" title="MarketSystem ERP v1.0">
            📦
          </div>
        ) : (
          <div className="text-xs text-center text-slate-500 dark:text-slate-400">
            MarketSystem ERP v1.0 • Pronto para Produção
          </div>
        )}
      </div>
    </div>
  );
}

export default Sidebar;
