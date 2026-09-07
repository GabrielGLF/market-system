import React, { useState, useEffect } from 'react';
import { Toaster } from 'sonner';
import { Layout } from './components/layout/Layout';
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
import { installSyncHooks, startSyncEngine } from './utils/sync';
import { runAutoBackupIfDue } from './utils/cloudBackup';
import { setSoundEnabledCache } from './utils/audio';
import { useLiveQuery } from 'dexie-react-hooks';

function App() {
  const [currentView, setCurrentView] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    return viewParam || 'dashboard';
  });

  const [isInitializing, setIsInitializing] = useState(true);

  // Sincroniza o mute global (settings.soundEnabled) com o cache lido pelos
  // play*() — antes o toggle em Settings nunca era lido fora de Settings.
  const soundEnabled = useLiveQuery(async () => {
    const s = await db.settings.toCollection().first();
    return s?.soundEnabled ?? true;
  }, [], true);
  useEffect(() => {
    setSoundEnabledCache(soundEnabled ?? true);
  }, [soundEnabled]);

  // Outbox de sincronização: hooks instalados uma única vez, antes de qualquer
  // gravação (toda escrita em tabela sincronizada gera entrada pendente).
  useEffect(() => {
    installSyncHooks();
  }, []);

  // Espelho em nuvem (opcional): se o Supabase estiver configurado e conectado
  // neste dispositivo, o motor mantém o espelho atualizado. Sem nuvem, tudo
  // segue offline-first e o outbox apenas acumula.
  useEffect(() => {
    startSyncEngine();
  }, []);

  // Backup automático (lazy): ao abrir o app, se passaram 24h do último e a
  // nuvem está configurada, envia o backup completo em segundo plano.
  useEffect(() => {
    const t = setTimeout(() => { void runAutoBackupIfDue(); }, 15_000);
    return () => clearTimeout(t);
  }, []);

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
  // o usuário de volta ao PDV).
  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const view = (e as CustomEvent).detail?.view;
      if (typeof view === 'string' && view) setCurrentView(view);
    };
    window.addEventListener('market-system:navigate', handleNavigate);
    return () => window.removeEventListener('market-system:navigate', handleNavigate);
  }, []);

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
        return <Settings />;
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

  return (
    <>
      <Layout currentView={currentView} onNavigate={setCurrentView}>
        {renderView()}
      </Layout>
      <Toaster position="top-right" richColors theme="system" />
    </>
  );
}

export default App;
