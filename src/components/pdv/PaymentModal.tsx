import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { 
  X, CreditCard, Banknote, QrCode, Ticket, 
  BookUser, Plus, Trash2, Copy, Check, AlertCircle 
} from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { SmartChangeDisplay } from './SmartChangeDisplay';
import type { PaymentMethodType, PaymentMethodEntry, Customer } from '../../types';
import { toast } from 'sonner';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  onComplete: (payments: PaymentMethodEntry[], customerId?: string, customerName?: string) => void;
  onPaymentChange: (paid: number, change: number, method?: PaymentMethodType, pixData?: any) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ 
  isOpen, onClose, total, onComplete, onPaymentChange 
}) => {
  const [payments, setPayments] = useState<PaymentMethodEntry[]>([]);
  const [currentMethod, setCurrentMethod] = useState<PaymentMethodType>('CASH');
  const [currentAmount, setCurrentAmount] = useState(total.toString());
  
  // Fiado / Customer state
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const customers = useLiveQuery(() => db.customers.toArray()) || [];
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  // Store settings for Pix key
  const storeSettings = useLiveQuery(() => db.settings.toCollection().first());
  const pixKey = storeSettings?.pixKey || 'pix@marketsystem.com.br';
  const [copiedPix, setCopiedPix] = useState(false);

  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
  const remaining = Math.max(0, total - totalPaid);
  const change = Math.max(0, totalPaid - total);

  useEffect(() => {
    if (isOpen) {
      setPayments([]);
      setCurrentMethod('CASH');
      setCurrentAmount(total.toString());
      setSelectedCustomerId('');
      setCopiedPix(false);
      onPaymentChange(0, 0);
    }
  }, [isOpen, total]);

  useEffect(() => {
    if (currentMethod === 'PIX' && remaining > 0) {
      onPaymentChange(totalPaid, change, currentMethod, { 
        qr: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixKey)}`, 
        key: pixKey 
      });
    } else {
      onPaymentChange(totalPaid, change, payments.length > 0 ? payments[0].method : currentMethod);
    }
  }, [payments, currentMethod, totalPaid, change, remaining, pixKey]);

  if (!isOpen) return null;

  const handleAddPayment = () => {
    const amount = parseFloat(currentAmount);
    if (isNaN(amount) || amount <= 0) return;
    
    // Se for fiado, valida cliente e limite
    if (currentMethod === 'FIADO') {
      if (!selectedCustomer) {
        toast.error('Selecione um cliente para registrar na caderneta (fiado).');
        return;
      }
      // Considera o valor de fiado JÁ inserido nesta venda, senão o limite
      // poderia ser estourado somando vários lançamentos no mesmo cupom.
      const fiadoAlreadyAdded = payments
        .filter(p => p.method === 'FIADO')
        .reduce((acc, p) => acc + p.amount, 0);
      const newDebt = (selectedCustomer.debtBalance || 0) + fiadoAlreadyAdded + amount;
      if (newDebt > selectedCustomer.creditLimit) {
        toast.error(`Limite de crédito excedido! Limite: ${formatCurrency(selectedCustomer.creditLimit)}, Dívida atual: ${formatCurrency(selectedCustomer.debtBalance + fiadoAlreadyAdded)}.`);
        return;
      }
    }

    setPayments([...payments, { method: currentMethod, amount }]);
    
    const newTotalPaid = totalPaid + amount;
    const newRemaining = Math.max(0, total - newTotalPaid);
    setCurrentAmount(newRemaining.toString());
  };

  const handleRemovePayment = (index: number) => {
    const newPayments = payments.filter((_, i) => i !== index);
    setPayments(newPayments);
    
    const newTotalPaid = newPayments.reduce((acc, p) => acc + p.amount, 0);
    const newRemaining = Math.max(0, total - newTotalPaid);
    setCurrentAmount(newRemaining.toString());
  };

  const handleFinalize = () => {
    if (totalPaid >= total) {
      const hasFiado = payments.some(p => p.method === 'FIADO');
      onComplete(
        payments, 
        hasFiado ? selectedCustomer?.id : undefined, 
        hasFiado ? selectedCustomer?.name : undefined
      );
    }
  };

  const handleCopyPix = () => {
    navigator.clipboard.writeText(pixKey);
    setCopiedPix(true);
    toast.success('Chave Pix copiada para a área de transferência!');
    setTimeout(() => setCopiedPix(false), 2500);
  };

  const paymentMethods: { id: PaymentMethodType; label: string; icon: any; color: string }[] = [
    { id: 'CASH', label: 'Dinheiro', icon: Banknote, color: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-400' },
    { id: 'PIX', label: 'Pix', icon: QrCode, color: 'bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border-teal-400' },
    { id: 'CREDIT_CARD', label: 'Crédito', icon: CreditCard, color: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-400' },
    { id: 'DEBIT_CARD', label: 'Débito', icon: CreditCard, color: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-400' },
    { id: 'VOUCHER', label: 'Voucher / Vale', icon: Ticket, color: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-400' },
    { id: 'FIADO', label: 'Caderneta (Fiado)', icon: BookUser, color: 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-400' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row max-h-[92vh] border border-slate-200 dark:border-slate-700">
        
        {/* Left Side - Payment Methods & Input */}
        <div className="w-full md:w-1/2 p-6 flex flex-col border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-700 overflow-y-auto">
          <div className="flex justify-between items-center mb-5">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">Forma de Pagamento</h2>
              <p className="text-xs text-slate-400">Selecione uma ou mais formas para compor o total.</p>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Grid de Formas de Pagamento */}
          <div className="grid grid-cols-2 gap-2.5 mb-5">
            {paymentMethods.map(pm => {
              const Icon = pm.icon;
              const isSelected = currentMethod === pm.id;
              return (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => setCurrentMethod(pm.id)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all cursor-pointer ${
                    isSelected 
                      ? `${pm.color} ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-800 font-bold shadow-xs` 
                      : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <Icon className="w-5 h-5 mb-1.5" />
                  <span className="text-xs">{pm.label}</span>
                </button>
              );
            })}
          </div>

          {/* Se for Fiado: Seletor de Cliente */}
          {currentMethod === 'FIADO' && (
            <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-800/60 space-y-2">
              <label className="block text-xs font-bold text-purple-900 dark:text-purple-300 uppercase">
                Selecione o Cliente da Caderneta *
              </label>
              <select
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(e.target.value)}
                className="w-full px-3 py-2 border border-purple-300 dark:border-purple-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-xs font-medium focus:ring-2 focus:ring-purple-500 outline-none"
              >
                <option value="">Selecione o cliente cadastrado...</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} (Saldo Devedor: {formatCurrency(c.debtBalance)} | Limite: {formatCurrency(c.creditLimit)})
                  </option>
                ))}
              </select>

              {selectedCustomer && (
                <div className="text-[11px] text-purple-800 dark:text-purple-300 flex justify-between pt-1">
                  <span>Limite Disponível: <strong>{formatCurrency(Math.max(0, selectedCustomer.creditLimit - selectedCustomer.debtBalance))}</strong></span>
                  <span>Saldo Atual: {formatCurrency(selectedCustomer.debtBalance)}</span>
                </div>
              )}
            </div>
          )}

          {/* Se for Pix: QR Code e Chave */}
          {currentMethod === 'PIX' && (
            <div className="mb-4 p-4 bg-teal-50 dark:bg-teal-950/40 rounded-xl border border-teal-200 dark:border-teal-800/60 text-center space-y-2">
              <div className="font-bold text-teal-900 dark:text-teal-300 text-xs uppercase tracking-wider">
                Chave Pix da Loja
              </div>
              <div className="bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 p-2 rounded-lg flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-slate-800 dark:text-slate-200 truncate">{pixKey}</span>
                <button 
                  onClick={handleCopyPix}
                  className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-bold flex items-center gap-1 shrink-0 transition-colors"
                >
                  {copiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedPix ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          )}

          {/* Campo de Valor a Inserir */}
          <div className="mt-auto pt-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Valor com {paymentMethods.find(p => p.id === currentMethod)?.label}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 text-xl font-black bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <button 
                onClick={handleAddPayment}
                disabled={parseFloat(currentAmount) <= 0 || isNaN(parseFloat(currentAmount))}
                className="bg-emerald-600 text-white px-5 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5 text-sm shadow-md shadow-emerald-600/20 transition-colors"
              >
                <Plus className="w-4 h-4" /> Inserir
              </button>
            </div>
          </div>
        </div>

        {/* Right Side - Summary */}
        <div className="w-full md:w-1/2 bg-slate-50 dark:bg-slate-900/50 p-6 flex flex-col justify-between overflow-y-auto">
          <div>
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Total da Venda</div>
            <div className="text-4xl font-black text-slate-800 dark:text-white">{formatCurrency(total)}</div>
          </div>

          <div className="my-4 flex-1 overflow-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 min-h-32">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Valores Inseridos</div>
            {payments.length === 0 ? (
              <div className="text-center text-slate-400 py-6 text-xs">Nenhum pagamento inserido ainda.</div>
            ) : (
              <div className="space-y-2">
                {payments.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-100 dark:border-slate-700">
                    <div className="font-semibold text-xs text-slate-700 dark:text-slate-200">
                      {paymentMethods.find(pm => pm.id === p.method)?.label}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-sm text-slate-800 dark:text-white">{formatCurrency(p.amount)}</span>
                      <button onClick={() => handleRemovePayment(idx)} className="text-rose-400 hover:text-rose-600 p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center text-base">
              <span className="font-semibold text-slate-600 dark:text-slate-400">Falta Pagar:</span>
              <span className={`font-black ${remaining > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                {formatCurrency(remaining)}
              </span>
            </div>
            
            {change > 0 && (
              <div className="flex justify-between items-center text-lg bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-800/60">
                <span className="font-bold text-amber-800 dark:text-amber-300">Troco a Devolver:</span>
                <span className="font-black text-amber-900 dark:text-amber-200">{formatCurrency(change)}</span>
              </div>
            )}
          </div>

          {change > 0 && <SmartChangeDisplay changeAmount={change} />}

          <button
            onClick={handleFinalize}
            disabled={totalPaid < total}
            className="w-full bg-emerald-600 text-white py-3.5 rounded-xl font-bold text-base hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed mt-4 shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" /> Finalizar Venda (F4)
          </button>
        </div>

      </div>
    </div>
  );
};

export default PaymentModal;
