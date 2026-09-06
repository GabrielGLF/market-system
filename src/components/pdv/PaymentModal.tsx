import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { 
  X, CreditCard, Banknote, QrCode, Ticket, 
  BookUser, Plus, Trash2, Copy, Check, AlertCircle 
} from 'lucide-react';
import { formatCurrency, normalizeText } from '../../utils/format';
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
  const [customerFilter, setCustomerFilter] = useState('');
  const filteredCustomers = useMemo(() => {
    const q = normalizeText(customerFilter.trim());
    if (!q) return customers;
    return customers.filter(c => normalizeText(c.name).includes(q) || c.phone.includes(q));
  }, [customers, customerFilter]);
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

  const paymentMethods: { id: PaymentMethodType; label: string; icon: any }[] = [
    { id: 'CASH', label: 'Dinheiro', icon: Banknote },
    { id: 'PIX', label: 'Pix', icon: QrCode },
    { id: 'CREDIT_CARD', label: 'Crédito', icon: CreditCard },
    { id: 'DEBIT_CARD', label: 'Débito', icon: CreditCard },
    { id: 'VOUCHER', label: 'Voucher', icon: Ticket },
    { id: 'FIADO', label: 'Fiado', icon: BookUser },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row max-h-[92vh] border border-slate-200 dark:border-slate-700">
        
        {/* Left Side - Payment Methods & Input */}
        <div className="w-full md:w-1/2 p-5 flex flex-col border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-700 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Pagamento</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Use uma ou mais formas para compor o total.</p>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Grid de Formas de Pagamento */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {paymentMethods.map(pm => {
              const Icon = pm.icon;
              const isSelected = currentMethod === pm.id;
              return (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => setCurrentMethod(pm.id)}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-md border transition-colors cursor-pointer ${
                    isSelected 
                      ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900'
                      : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500'
                  }`}
                >
                  <Icon className="w-4 h-4 mb-1" />
                  <span className="text-[11px] font-medium">{pm.label}</span>
                </button>
              );
            })}
          </div>

          {/* Se for Fiado: Seletor de Cliente */}
          {currentMethod === 'FIADO' && (
            <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-md border border-slate-200 dark:border-slate-700 space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Cliente da caderneta
              </label>
              {/* Escalabilidade: com centenas de clientes, renderizar todos em
                  <option> pesa o modal; filtra por digitação (sem acentos) e
                  mostra no máximo 50. */}
              <input
                type="text"
                value={customerFilter}
                onChange={e => setCustomerFilter(e.target.value)}
                placeholder="Filtrar clientes por nome ou telefone…"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-slate-400 outline-none"
              />
              <select
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-slate-400 outline-none"
                size={Math.min(6, Math.max(1, filteredCustomers.length))}
              >
                <option value="">Selecione o cliente cadastrado…</option>
                {filteredCustomers.slice(0, 50).map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} — saldo {formatCurrency(c.debtBalance)} · limite {formatCurrency(c.creditLimit)}
                  </option>
                ))}
              </select>

              {selectedCustomer && (
                <div className="text-[11px] text-slate-600 dark:text-slate-300 flex justify-between pt-1">
                  <span>Disponível: <strong>{formatCurrency(Math.max(0, selectedCustomer.creditLimit - selectedCustomer.debtBalance))}</strong></span>
                  <span>Saldo: {formatCurrency(selectedCustomer.debtBalance)}</span>
                </div>
              )}
            </div>
          )}

          {/* Se for Pix: Chave da Loja */}
          {currentMethod === 'PIX' && (
            <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-md border border-slate-200 dark:border-slate-700 text-center space-y-2">
              <div className="font-semibold text-slate-600 dark:text-slate-300 text-xs">
                Chave Pix da loja
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 rounded-md flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-slate-800 dark:text-slate-200 truncate">{pixKey}</span>
                <button 
                  onClick={handleCopyPix}
                  className="px-2.5 py-1 bg-slate-900 dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-white text-white rounded text-xs font-semibold flex items-center gap-1 shrink-0 transition-colors"
                >
                  {copiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedPix ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          )}

          {/* Campo de Valor a Inserir */}
          <div className="mt-auto pt-2">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Valor em {paymentMethods.find(p => p.id === currentMethod)?.label}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 text-xl font-bold tabular-nums bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <button 
                onClick={handleAddPayment}
                disabled={parseFloat(currentAmount) <= 0 || isNaN(parseFloat(currentAmount))}
                className="bg-slate-900 dark:bg-slate-100 dark:text-slate-900 text-white px-5 rounded-md font-semibold hover:bg-slate-700 dark:hover:bg-white disabled:opacity-50 flex items-center gap-1.5 text-sm transition-colors"
              >
                <Plus className="w-4 h-4" /> Inserir
              </button>
            </div>
          </div>
        </div>

        {/* Right Side - Summary */}
        <div className="w-full md:w-1/2 bg-slate-50 dark:bg-slate-900/50 p-5 flex flex-col justify-between overflow-y-auto">
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Total da venda</div>
            <div className="text-3xl font-bold tabular-nums text-slate-900 dark:text-white tracking-tight">{formatCurrency(total)}</div>
          </div>

          <div className="my-4 flex-1 overflow-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md p-3 min-h-32">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Valores inseridos</div>
            {payments.length === 0 ? (
              <div className="text-center text-slate-400 py-6 text-xs">Nenhum pagamento inserido ainda.</div>
            ) : (
              <div className="space-y-2">
                {payments.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between px-2.5 py-2 bg-slate-50 dark:bg-slate-900/60 rounded-md border border-slate-100 dark:border-slate-700">
                    <div className="font-medium text-xs text-slate-700 dark:text-slate-200">
                      {paymentMethods.find(pm => pm.id === p.method)?.label}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-sm text-slate-900 dark:text-white tabular-nums">{formatCurrency(p.amount)}</span>
                      <button onClick={() => handleRemovePayment(idx)} className="text-slate-300 hover:text-rose-600 dark:text-slate-600 dark:hover:text-rose-400 p-1 transition-colors" title="Remover">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="font-medium text-slate-600 dark:text-slate-400">Falta pagar</span>
              <span className={`font-bold tabular-nums ${remaining > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                {formatCurrency(remaining)}
              </span>
            </div>
            
            {change > 0 && (
              <div className="flex justify-between items-center text-base bg-amber-50 dark:bg-amber-950/40 p-3 rounded-md border border-amber-200 dark:border-amber-800/60">
                <span className="font-semibold text-amber-800 dark:text-amber-300">Troco</span>
                <span className="font-bold tabular-nums text-amber-900 dark:text-amber-200">{formatCurrency(change)}</span>
              </div>
            )}
          </div>

          {change > 0 && <SmartChangeDisplay changeAmount={change} />}

          <button
            onClick={handleFinalize}
            disabled={totalPaid < total}
            className="w-full bg-slate-900 dark:bg-slate-100 dark:text-slate-900 text-white py-3.5 rounded-lg font-semibold text-base hover:bg-slate-700 dark:hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed mt-4 transition-colors flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" /> Finalizar venda
          </button>
        </div>

      </div>
    </div>
  );
};

export default PaymentModal;
