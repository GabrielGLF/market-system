import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Settings as SettingsIcon, Save, Database, Download, Upload, RefreshCw, Store, CreditCard, Bell, MapPin, Receipt, CloudUpload, CloudOff, Cloud } from 'lucide-react';
import { toast } from 'sonner';
import { seedDatabase } from '../db/seed';
import { exportDatabaseToJson, importDatabaseFromJson, downloadJson } from '../utils/export';
import { syncNow, getLastSyncAt, getLastSyncError } from '../utils/sync';
import { isServerAuthConfigured } from '../utils/serverAuth';
import { formatDateTime } from '../utils/format';
import type { StoreSettings } from '../types';
import type { AuthSession } from '../utils/auth';

interface SettingsProps {
  user?: AuthSession | null;
}

export function Settings({ user }: SettingsProps) {
  const settings = useLiveQuery(() => db.settings.toCollection().first());
  const pendingSync = useLiveQuery(() => db.syncOutbox.count(), [], 0);
  const serverConfigured = isServerAuthConfigured();
  const isCloudSession = user?.provider === 'server';
  
  const [formData, setFormData] = useState<Partial<StoreSettings>>({
    companyName: '',
    tradeName: '',
    document: '',
    phone: '',
    whatsapp: '',
    email: '',
    pixKey: '',
    pixKeyType: 'CPF',
    defaultCardFeeDebit: 1.5,
    defaultCardFeeCredit: 3.2,
    defaultCardFeeCreditInstallment: 5.5,
    soundEnabled: true,
    lowStockThresholdDefault: 5,
    receiptHeader: '',
    receiptFooter: 'Obrigado pela preferência! Volte sempre.',
    address: {
      street: '',
      number: '',
      neighborhood: '',
      city: '',
      state: '',
      zipCode: ''
    }
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        ...settings,
        address: settings.address || {
          street: '',
          number: '',
          neighborhood: '',
          city: '',
          state: '',
          zipCode: ''
        }
      });
    }
  }, [settings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (name.startsWith('addr_')) {
      const field = name.replace('addr_', '');
      setFormData(prev => ({
        ...prev,
        address: {
          ...prev.address!,
          [field]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : 
                 type === 'number' ? Number(value) : value
      }));
    }
  };

  const handleSave = async () => {
    try {
      if (settings?.id) {
        await db.settings.update(settings.id, formData as any);
      } else {
        await db.settings.add({ 
          ...formData as StoreSettings, 
          id: crypto.randomUUID()
        });
      }
      toast.success('Configurações salvas com sucesso!');
    } catch (err) {
      toast.error('Erro ao salvar configurações.');
      console.error(err);
    }
  };

  const handleExportBackup = async () => {
    try {
      // Antes: o JSON era gerado e descartado — nenhum arquivo era baixado.
      const json = await exportDatabaseToJson();
      const filename = `backup_marketsystem_${new Date().toISOString().slice(0, 10)}.json`;
      downloadJson(json, filename);
      toast.success('Backup exportado com sucesso!');
    } catch (err) {
      toast.error('Erro ao exportar backup.');
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = event.target?.result as string;
        // Só restaura se o arquivo for um backup válido (nunca apaga dados com
        // um arquivo corrompido/errado — antes o erro no onload passava em branco).
        await importDatabaseFromJson(json);
        toast.success('Backup restaurado com sucesso!');
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao restaurar arquivo de backup.');
        console.error(err);
      }
    };
    reader.onerror = () => {
      toast.error('Não foi possível ler o arquivo selecionado.');
    };
    reader.readAsText(file);
  };

  const handleSyncNow = async () => {
    const res = await syncNow();
    if (res.error) {
      toast.error(res.error);
    } else if (res.pushed > 0) {
      toast.success(`Sincronizado: ${res.pushed} registro(s) enviado(s).`);
    } else {
      toast.success('Tudo sincronizado — nada pendente.');
    }
  };

  const handleSeed = async () => {
    if (confirm('Atenção: Isso irá resetar todos os dados e recarregar uma base completa de demonstração em pt-BR. Deseja continuar?')) {
      try {
        await seedDatabase(true);
        toast.success('Dados de demonstração recarregados com sucesso!');
        setTimeout(() => window.location.reload(), 800);
      } catch (err) {
        toast.error('Erro ao recarregar dados.');
      }
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <SettingsIcon className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            Configurações da Loja & Sistema
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Personalize informações do comércio, taxas de cartão, dados do cupom e backup.
          </p>
        </div>
        
        <button 
          onClick={handleSave} 
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-md shadow-emerald-600/20 transition-colors font-semibold"
        >
          <Save className="w-5 h-5" /> Salvar Alterações
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Dados da Loja */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
            <Store className="w-5 h-5 text-emerald-600" />
            Identificação da Empresa
          </h2>
          
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Nome Fantasia</label>
            <input 
              type="text" 
              name="tradeName" 
              value={formData.tradeName || ''} 
              onChange={handleChange} 
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Razão Social</label>
            <input 
              type="text" 
              name="companyName" 
              value={formData.companyName || ''} 
              onChange={handleChange} 
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">CNPJ ou CPF</label>
              <input 
                type="text" 
                name="document" 
                value={formData.document || ''} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">WhatsApp / Telefone</label>
              <input 
                type="text" 
                name="whatsapp" 
                value={formData.whatsapp || ''} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">E-mail Comercial</label>
            <input 
              type="email" 
              name="email" 
              value={formData.email || ''} 
              onChange={handleChange} 
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
            />
          </div>
        </div>

        {/* Endereço */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
            <MapPin className="w-5 h-5 text-blue-600" />
            Endereço da Loja
          </h2>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Rua / Logradouro</label>
              <input 
                type="text" 
                name="addr_street" 
                value={formData.address?.street || ''} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Número</label>
              <input 
                type="text" 
                name="addr_number" 
                value={formData.address?.number || ''} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Bairro</label>
              <input 
                type="text" 
                name="addr_neighborhood" 
                value={formData.address?.neighborhood || ''} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Cidade</label>
              <input 
                type="text" 
                name="addr_city" 
                value={formData.address?.city || ''} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">UF</label>
              <input 
                type="text" 
                name="addr_state" 
                value={formData.address?.state || ''} 
                onChange={handleChange} 
                maxLength={2}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm uppercase focus:ring-2 focus:ring-emerald-500 outline-none" 
              />
            </div>
          </div>
        </div>

        {/* Financeiro e Pix */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
            <CreditCard className="w-5 h-5 text-emerald-600" />
            Configurações de Pagamento & Pix
          </h2>
          
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Tipo de Chave Pix</label>
              <select 
                name="pixKeyType" 
                value={formData.pixKeyType} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="CPF">CPF</option>
                <option value="CNPJ">CNPJ</option>
                <option value="PHONE">Telefone</option>
                <option value="EMAIL">E-mail</option>
                <option value="RANDOM">Chave Aleatória</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Chave Pix</label>
              <input 
                type="text" 
                name="pixKey" 
                value={formData.pixKey || ''} 
                onChange={handleChange} 
                placeholder="Ex: 11999999999 ou pix@loja.com"
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Taxa Débito (%)</label>
              <input 
                type="number" 
                step="0.1" 
                name="defaultCardFeeDebit" 
                value={formData.defaultCardFeeDebit} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Taxa Crédito (%)</label>
              <input 
                type="number" 
                step="0.1" 
                name="defaultCardFeeCredit" 
                value={formData.defaultCardFeeCredit} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Parcelado (%)</label>
              <input 
                type="number" 
                step="0.1" 
                name="defaultCardFeeCreditInstallment" 
                value={formData.defaultCardFeeCreditInstallment} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
              />
            </div>
          </div>
        </div>

        {/* Preferências e Cupom */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
            <Receipt className="w-5 h-5 text-violet-600" />
            Cupom Não-Fiscal & Sistema
          </h2>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Mensagem de Rodapé do Cupom</label>
            <input 
              type="text" 
              name="receiptFooter" 
              value={formData.receiptFooter || ''} 
              onChange={handleChange} 
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
            />
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
              <input 
                type="checkbox" 
                name="soundEnabled" 
                checked={formData.soundEnabled} 
                onChange={handleChange} 
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500" 
              />
              <div className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200 font-medium">
                <Bell className="w-4 h-4 text-amber-500" />
                Ativar bipes do leitor e efeitos sonoros de caixa
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Sincronização com a Nuvem */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <h2 className="text-base font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-2">
          <CloudUpload className="w-5 h-5 text-sky-600" />
          Sincronização com a Nuvem (Supabase)
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          O PDV continua offline-first: as vendas, o estoque e o caixa são gravados
          primeiro no dispositivo e espelhados na nuvem quando há conexão. Nada é
          enviado sem sessão de conta ativa.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {serverConfigured ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
              <Cloud className="w-3.5 h-3.5" /> Nuvem configurada
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
              <CloudOff className="w-3.5 h-3.5" /> Nuvem não configurada (VITE_SUPABASE_URL/KEY)
            </span>
          )}

          {isCloudSession ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
              Conta em nuvem ativa — sincronizando automaticamente
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
              Entre com a conta (nuvem) para ativar a sincronização
            </span>
          )}

          {pendingSync > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
              {pendingSync} registro(s) aguardando envio
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase">Última sincronização</p>
            <p className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5">
              {getLastSyncAt() ? formatDateTime(getLastSyncAt()!) : 'Nunca'}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase">Pendentes</p>
            <p className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5">
              {pendingSync} registro(s)
            </p>
          </div>
        </div>

        {getLastSyncError() && (
          <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-400">
            <strong>Último erro:</strong> {getLastSyncError()}
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={handleSyncNow}
            disabled={!serverConfigured || pendingSync === 0}
            className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            <CloudUpload className="w-4 h-4" /> Sincronizar Agora
          </button>
        </div>
      </div>

      {/* Banco de dados e Backup */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <h2 className="text-base font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-600" />
          Segurança, Backup & Manutenção
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Exporte uma cópia completa de todos os seus produtos, movimentações, vendas e clientes em arquivo JSON, ou restaure um backup anterior.
        </p>
        
        <div className="flex flex-wrap gap-3 items-center">
          <button 
            onClick={handleExportBackup} 
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg text-sm font-semibold transition-colors"
          >
            <Download className="w-4 h-4 text-emerald-600" /> Exportar Backup Completo (JSON)
          </button>
          
          <label className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg text-sm font-semibold transition-colors cursor-pointer">
            <Upload className="w-4 h-4 text-blue-600" /> 
            Restaurar Backup (JSON)
            <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
          </label>

          <button 
            onClick={handleSeed} 
            className="flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:text-rose-400 rounded-lg text-sm font-semibold transition-colors ml-auto border border-rose-200 dark:border-rose-800"
          >
            <RefreshCw className="w-4 h-4" /> Recarregar Dados de Demonstração
          </button>
        </div>
      </div>
    </div>
  );
}

export default Settings;
