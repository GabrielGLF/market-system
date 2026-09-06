import React, { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import { Layout } from './components/layout/Layout';
import { LoginScreen } from './components/auth/LoginScreen';
import { getSession, clearSession, buildSession, AuthSession } from './utils/auth';
import { logoutServer } from './utils/serverAuth';
import type { User } from './types';
import { Dashboard } from './pages/Dashboard';
import { PDV } from './pages/PDV';
import { Inventory } from './pages/Inventory';
import { Pricing } from './pages/Pricing';
import { PriceCalculator } from './pages/PriceCalculator';
import { Sales } from './pages/Sales';
import { Financial } from './pages/Financial';
import { Customers } from './pages/Customers';
import { CashRegister } from './pages/CashRegister';
import { StockMovements } from './pages/StockMovements';
import { Settings } from './pages/Settings';
import { CustomerDisplay } from './pages/CustomerDisplay';
import { MobileScanner } from './pages/MobileScanner';
import { seedDatabase } from './db/seed';
import { db } from './db';
import { installSyncHooks, startSyncEngine, stopSyncEngine, syncNow } from './utils/sync';

function App() {
  const [currentView, setCurrentView] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    return viewParam || 'dashboard';
  });

  const [isInitializing, setIsInitializing] = useState(true);
  const [user, setUser] = useState<AuthSession | null>(() => getSession());

  // Outbox de sincronização: hooks instalados uma única vez, antes de qualquer
  // gravação (toda escrita em tabela sincronizada gera entrada pendente).
  useEffect(() => {
    installSyncHooks();
  }, []);

  // Motor de sync: ativo apenas com sessão de nuvem (Supabase Auth). Login
  // local por PIN continua offline-first — o outbox acumula e é enviado depois.
  useEffect(() => {
    if (user?.provider === 'server') {
      startSyncEngine();
    } else {
      stopSyncEngine();
    }
    return () => stopSyncEngine();
  }, [user?.provider]);

  useEffect(() => {
    const initDb = async () => {
      try {
        const count = await db.products.count();
        if (count === 0) {
          console.log('Banco de dados vazio. Inicializando demonstração...');
          await seedDatabase();
        }
      } catch (err) {
        console.error('Erro ao inicializar banco:', err);
      } finally {
        setIsInitializing(false);
      }
    };
    initDb();
  }, []);

  // Atalho de teclado global para o PDV.
  // Obs: F1 (ajuda/atalhos) pertence ao Layout — aqui não, senão F1 navegaria
  // para o dashboard E abriria o modal de atalhos ao mesmo tempo.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setCurrentView('pdv');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Navegação programática via evento (ex.: "Repetir Venda" no histórico envia
  // o operador de volta ao PDV).
  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const view = (e as CustomEvent).detail?.view;
      if (typeof view === 'string' && view) setCurrentView(view);
    };
    window.addEventListener('market-system:navigate', handleNavigate);
    return () => window.removeEventListener('market-system:navigate', handleNavigate);
  }, []);

  // Controle de acesso por papel: operador de caixa não abre áreas administrativas
  const RESTRICTED_VIEWS: Record<string, string[]> = {
    CASHIER: ['settings', 'financial']
  };

  useEffect(() => {
    if (!user) return;
    const blocked = RESTRICTED_VIEWS[user.role] || [];
    if (blocked.includes(currentView)) {
      toast.error('Acesso restrito: operador de caixa não pode abrir esta área.');
      setCurrentView('dashboard');
    }
  }, [user, currentView]);

  const handleLoggedIn = (loggedUser: User) => {
    // Preserva o provider (server/local) gravado na sessão por quem autenticou
    const session = getSession() || buildSession(loggedUser);
    setUser(session);
    setCurrentView('dashboard');
    // Acabou de entrar com a conta: empurra o que ficou pendente offline
    if (session.provider === 'server') {
      void syncNow();
    }
  };

  const handleLogout = async () => {
    // Encerra a sessão na nuvem (melhor esforço, tolerante a offline) e depois a local
    await logoutServer();
    clearSession();
    setUser(null);
    setCurrentView('dashboard');
    toast.info('Sessão encerrada.');
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentView} />;
      case 'pdv':
        return <PDV />;
      case 'inventory':
        return <Inventory />;
      case 'pricing':
        return <Pricing />;
      case 'calculator':
        return <PriceCalculator />;
      case 'sales':
        return <Sales />;
      case 'financial':
        return <Financial />;
      case 'customers':
        return <Customers />;
      case 'cash':
        return <CashRegister />;
      case 'movements':
        return <StockMovements />;
      case 'settings':
        return <Settings user={user} />;
      case 'customer-display':
        return <CustomerDisplay />;
      case 'mobile-scanner':
        return <MobileScanner />;
      default:
        return <Dashboard onNavigate={setCurrentView} />;
    }
  };

  if (isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto"></div>
          <p className="text-sm font-semibold tracking-wider text-slate-300">Carregando MarketSystem...</p>
        </div>
      </div>
    );
  }

  // Visualizações isoladas em tela cheia (Display do Cliente e Scanner Mobile)
  if (currentView === 'customer-display' || currentView === 'mobile-scanner') {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        {renderView()}
        <Toaster position="top-center" richColors theme="dark" />
      </div>
    );
  }

  // Tela de login: o PDV (e todo o sistema) só abre com operador autenticado
  if (!user) {
    return (
      <>
        <LoginScreen onLoggedIn={handleLoggedIn} />
        <Toaster position="top-right" richColors theme="dark" />
      </>
    );
  }

  return (
    <>
      <Layout
        currentView={currentView}
        onNavigate={setCurrentView}
        user={user}
        onLogout={handleLogout}
      >
        {renderView()}
      </Layout>
      <Toaster position="top-right" richColors theme="system" />
    </>
  );
}

export default App;
