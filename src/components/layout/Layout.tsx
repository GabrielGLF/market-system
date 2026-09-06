import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ShortcutsModal } from '../common/ShortcutsModal';

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  onNavigate: (view: string) => void;
}

export function Layout({ children, currentView, onNavigate }: LayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setIsShortcutsOpen(true);
      } else if (e.key === 'Escape') {
        setIsShortcutsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-900 overflow-hidden text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0 transition-transform duration-300 ease-in-out`}>
        <Sidebar 
          currentView={currentView} 
          collapsed={isSidebarCollapsed}
          onNavigate={(v) => { onNavigate(v); setIsSidebarOpen(false); }} 
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <Header 
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onToggleSidebar={() => setIsSidebarCollapsed(c => !c)}
          sidebarCollapsed={isSidebarCollapsed}
          onOpenShortcuts={() => setIsShortcutsOpen(true)}
          onNavigate={onNavigate}
        />
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>

      {isShortcutsOpen && <ShortcutsModal onClose={() => setIsShortcutsOpen(false)} />}
    </div>
  );
}
