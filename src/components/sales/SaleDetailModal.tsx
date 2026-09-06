import React, { useState } from 'react';
import { X, Printer, AlertTriangle, Copy, RotateCcw } from 'lucide-react';
import { Sale, PaymentMethodType } from '../../types';
import { db } from '../../db';
import { requestRepeatSale } from '../../utils/repeatSale';
import { ReceiptModal } from '../pdv/ReceiptModal';
import { toPackUnits } from '../../utils/calc';
import { formatNumber, formatCurrency } from '../../utils/format';
import { computePartialReturn, applyPartialReturn, ReturnRequestItem } from '../../utils/saleReturns';
import { toast } from 'sonner';

interface SaleDetailModalProps {
  sale: Sale;
  onClose: () => void;
  onUpdate: () => void;
}

export const SaleDetailModal: React.FC<SaleDetailModalProps> = ({ sale, onClose, onUpdate }) => {
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Devolução parcial
  const [isReturning, setIsReturning] = useState(false);
  const [returnRequests, setReturnRequests] = useState<Record<number, number>>({});
  const [returnReason, setReturnReason] = useState('');
  const [isSavingReturn, setIsSavingReturn] = useState(false);

  const openReturnMode = () => {
    const init: Record<number, number> = {};
    sale.items.forEach((_, idx) => { init[idx] = 0; });
    setReturnRequests(init);
    setReturnReason('');
    setIsReturning(true);
  };

  const buildReturnRequests = (): ReturnRequestItem[] => {
    return Object.entries(returnRequests)
      .map(([idx, qty]) => ({
        productId: sale.items[Number(idx)]?.productId || '',
        quantity: qty
      }))
      .filter(r => r.productId && r.quantity > 0);
  };

  const returnResult = isReturning
    ? computePartialReturn(sale, buildReturnRequests(), returnReason)
    : null;

  const paymentMethodLabel = (m: PaymentMethodType) => {
    switch (m) {
      case 'CASH': return 'Dinheiro';
      case 'PIX': return 'Pix';
      case 'CREDIT_CARD': return 'Crédito';
      case 'DEBIT_CARD': return 'Débito';
      case 'FIADO': return 'Fiado';
      case 'VOUCHER': return 'Vale';
      case 'SPLIT': return 'Dividido';
      default: return m;
    }
  };

  const handleConfirmReturn = async () => {
    if (!returnReason.trim()) {
      toast.error('Informe o motivo da devolução.');
      return;
    }
    if (isSavingReturn) return; // Evita duplicar a devolução com cliques rápidos
    if (!returnResult || !returnResult.ok) {
      toast.error(returnResult && !returnResult.ok ? returnResult.error : 'Selecione os itens a devolver.');
      return;
    }

    setIsSavingReturn(true);
    try {
      await applyPartialReturn(sale, buildReturnRequests(), returnReason);
      toast.success(`Devolução de R$ ${returnResult.refund.toFixed(2)} registrada com sucesso!`);
      setIsReturning(false);
      setReturnReason('');
      onUpdate(); // recarrega a venda selecionada com os valores já ajustados
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar devolução.');
      console.error(err);
    } finally {
      setIsSavingReturn(false);
    }
  };

  const handleRepeatSale = () => {
    requestRepeatSale(sale.items);
    toast.success(`Itens da venda #${sale.saleNumber} enviados para o PDV.`);
    onClose();
  };

  const handleCancelSale = async () => {
    if (!cancelReason.trim()) {
      alert("Por favor, informe o motivo do cancelamento.");
      return;
    }

    if (isCancelling) return; // Evita estorno duplicado em cliques rápidos
    setIsCancelling(true);

    try {
      await db.transaction('rw', [db.sales, db.products, db.stockMovements, db.customers, db.debtRecords, db.cashSessions], async () => {
        await db.sales.update(sale.id, {
          status: 'CANCELLED',
          cancelReason,
          cancelledAt: new Date().toISOString()
        });

        for (const item of sale.items) {
          // Itens fracionados usam productId com sufixo '-alt' e quantidade na unidade
          // alternativa: converte de volta para a unidade do pacote ao repor o estoque.
          const rawProductId = item.productId.replace('-alt', '');
          const product = await db.products.get(rawProductId);
          if (product) {
            const restockQty = toPackUnits(item.quantity, item.isAlternativeUnit ? item.originalUnitFactor : undefined);
            const previousStock = product.stock;
            const newStock = Number((previousStock + restockQty).toFixed(3));
            await db.products.update(product.id, { stock: newStock });

            await db.stockMovements.add({
              id: crypto.randomUUID(),
              productId: product.id,
              productName: product.name,
              type: 'RETURN',
              quantity: Number(restockQty.toFixed(3)),
              previousStock,
              newStock,
              reason: `Estorno de Venda #${sale.saleNumber}: ${cancelReason}`,
              date: new Date().toISOString(),
              costPrice: item.costPrice
            });
          }
        }

        if (sale.paymentMethods.some(p => p.method === 'FIADO') && sale.customerId) {
          const customer = await db.customers.get(sale.customerId);
          if (customer) {
            const fiadoAmount = sale.paymentMethods.find(p => p.method === 'FIADO')?.amount || 0;
            const newBalance = customer.debtBalance - fiadoAmount;
            await db.customers.update(customer.id, { debtBalance: newBalance });
            
            await db.debtRecords.add({
              id: crypto.randomUUID(),
              customerId: customer.id,
              saleId: sale.id,
              type: 'PAYMENT',
              amount: fiadoAmount,
              previousBalance: customer.debtBalance,
              newBalance: newBalance,
              date: new Date().toISOString(),
              description: `Estorno de venda #${sale.saleNumber}`,
              receiptNumber: ''
            });
          }
        }

        // Reverte os totais da sessão de caixa da venda estornada
        if (sale.cashierSessionId) {
          const session = await db.cashSessions.get(sale.cashierSessionId);
          if (session) {
            const totalPaid = sale.paymentMethods.reduce((acc, pm) => acc + pm.amount, 0);
            const change = Math.max(0, totalPaid - sale.total);
            const cashAmount = sale.paymentMethods
              .filter(pm => pm.method === 'CASH')
              .reduce((acc, pm) => acc + pm.amount, 0);
            const netCash = Math.max(0, cashAmount - change);

            const totals = { ...session.totalSales };
            sale.paymentMethods.forEach(pm => {
              if (pm.method === 'CASH') totals.cash -= netCash;
              else if (pm.method === 'PIX') totals.pix -= pm.amount;
              else if (pm.method === 'CREDIT_CARD') totals.credit -= pm.amount;
              else if (pm.method === 'DEBIT_CARD') totals.debit -= pm.amount;
              else if (pm.method === 'FIADO') totals.fiado -= pm.amount;
              else if (pm.method === 'VOUCHER') totals.voucher -= pm.amount;
            });

            await db.cashSessions.update(session.id, {
              totalSales: totals,
              expectedCashInDrawer: Number((session.expectedCashInDrawer - netCash).toFixed(2))
            });
          }
        }
      });
      onUpdate();
      onClose();
    } catch (error) {
      console.error(error);
      alert("Erro ao cancelar venda.");
      setIsCancelling(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 print:hidden">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            Detalhes da Venda <span className="text-gray-500 dark:text-slate-400 text-sm">#{sale.saleNumber}</span>
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg"><X size={20}/></button>
        </div>
        
        <div className="p-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 dark:bg-slate-900/60 p-3 rounded-lg">
              <span className="text-xs text-gray-500 dark:text-slate-400 block">Data/Hora</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{new Date(sale.date).toLocaleString()}</span>
            </div>
            <div className="bg-gray-50 dark:bg-slate-900/60 p-3 rounded-lg">
              <span className="text-xs text-gray-500 dark:text-slate-400 block">Status</span>
              <span className={`font-medium ${sale.status === 'COMPLETED' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {sale.status}
              </span>
            </div>
            <div className="bg-gray-50 dark:bg-slate-900/60 p-3 rounded-lg">
              <span className="text-xs text-gray-500 dark:text-slate-400 block">Cliente</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{sale.customerName || 'Consumidor Final'}</span>
            </div>
            <div className="bg-gray-50 dark:bg-slate-900/60 p-3 rounded-lg">
              <span className="text-xs text-gray-500 dark:text-slate-400 block">Caixa</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">Balcão</span>
            </div>
          </div>

          <h3 className="font-medium mb-3 text-slate-800 dark:text-slate-200">Itens da Venda</h3>
          <div className="border dark:border-slate-700 rounded-lg overflow-hidden mb-6">
            <table className="w-full text-sm text-slate-700 dark:text-slate-300">
              <thead className="bg-gray-50 dark:bg-slate-900/60">
                <tr>
                  <th className="px-4 py-2 text-left">Produto</th>
                  <th className="px-4 py-2 text-right">Qtd</th>
                  <th className="px-4 py-2 text-right">Preço</th>
                  <th className="px-4 py-2 text-right">Custo Histórico</th>
                  <th className="px-4 py-2 text-right">Desc.</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Lucro</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item, idx) => {
                  const lucro = item.total - (item.costPrice * item.quantity);
                  return (
                    <tr key={idx} className="border-t dark:border-slate-700">
                      <td className="px-4 py-2">{item.productName}</td>
                      <td className="px-4 py-2 text-right">{formatNumber(item.quantity)} {item.unit}</td>
                      <td className="px-4 py-2 text-right">R$ {item.unitPrice.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">R$ {item.costPrice.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-red-500">{item.discount > 0 ? `- R$ ${item.discount.toFixed(2)}` : '-'}</td>
                      <td className="px-4 py-2 text-right font-medium">R$ {item.total.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-green-600">R$ {lucro.toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <h3 className="font-medium mb-3 text-slate-800 dark:text-slate-200">Pagamento</h3>
          <div className="grid grid-cols-2 gap-4 mb-2">
            <div className="border dark:border-slate-700 rounded-lg p-4 space-y-2 text-slate-800 dark:text-slate-200">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-slate-400">Subtotal</span>
                <span>R$ {sale.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-red-500 dark:text-red-400">
                <span>Desconto</span>
                <span>- R$ {sale.discount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t dark:border-slate-700">
                <span>Total Pago</span>
                <span>R$ {sale.total.toFixed(2)}</span>
              </div>
              {(sale.refundedAmount || 0) > 0 && (
                <div className="flex justify-between text-xs text-amber-600 dark:text-amber-400 pt-1">
                  <span>Total devolvido</span>
                  <span>- R$ {(sale.refundedAmount || 0).toFixed(2)}</span>
                </div>
              )}
            </div>
            <div className="border dark:border-slate-700 rounded-lg p-4 text-slate-800 dark:text-slate-200">
              <ul className="space-y-2 text-sm">
                {sale.paymentMethods.map((pm, idx) => (
                  <li key={idx} className="flex justify-between">
                    <span>{paymentMethodLabel(pm.method)}</span>
                    <span className="font-medium">R$ {pm.amount.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Trilha de devoluções parciais desta venda */}
          {sale.refunds && sale.refunds.length > 0 && (
            <div className="border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-1.5">
                <RotateCcw size={14} /> Devoluções desta venda ({sale.refunds.length})
              </h4>
              <div className="space-y-2">
                {sale.refunds.map((r, i) => (
                  <div key={i} className="text-xs text-slate-600 dark:text-slate-300 border-t border-amber-200 dark:border-amber-800 pt-2">
                    <div className="flex justify-between">
                      <span className="font-medium">{new Date(r.date).toLocaleString('pt-BR')} · R$ {r.amount.toFixed(2)}</span>
                      <span className="text-amber-700 dark:text-amber-400">{r.reason}</span>
                    </div>
                    <div className="mt-0.5 text-slate-500 dark:text-slate-400">
                      {r.items.map(it => `${it.quantity}× ${it.productName}`).join(', ')}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      Reembolso: {r.paymentRefunds.map(p => `${paymentMethodLabel(p.method)} R$ ${p.amount.toFixed(2)}`).join(' + ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sale.status === 'COMPLETED' && !isReturning && (
            <div className="border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 rounded-lg p-4 mt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <RotateCcw size={20} />
                  <span className="font-medium">Devolução parcial de itens (reembolso proporcional ao pagamento)</span>
                </div>
                <button onClick={openReturnMode} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
                  Devolver Itens
                </button>
              </div>
            </div>
          )}

          {isReturning && (
            <div className="border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 rounded-lg p-4 mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                  Devolução Parcial — selecione as quantidades e o motivo
                </h4>
                <button onClick={() => setIsReturning(false)} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                  ← Voltar
                </button>
              </div>

              <div className="space-y-2">
                {sale.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-amber-200 dark:border-amber-800/60">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{item.productName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Disponível: {formatNumber(item.quantity)} {item.unit} · Valor: {formatCurrency(item.total)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={item.quantity}
                        step="0.001"
                        value={returnRequests[idx] || ''}
                        placeholder="0"
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          const clamped = Number.isNaN(val)
                            ? 0
                            : Math.min(item.quantity, Math.max(0, val));
                          setReturnRequests(prev => ({ ...prev, [idx]: clamped }));
                        }}
                        className="w-20 px-2 py-1.5 text-right text-sm font-bold text-amber-800 dark:text-amber-300 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-md focus:ring-1 focus:ring-amber-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setReturnRequests(prev => ({ ...prev, [idx]: item.quantity }))}
                        className="px-2 py-1.5 text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 rounded-md hover:bg-amber-200 dark:hover:bg-amber-900"
                      >
                        Tudo
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">
                  Motivo da Devolução *
                </label>
                <input
                  type="text"
                  value={returnReason}
                  onChange={e => setReturnReason(e.target.value)}
                  placeholder="Ex: Cliente devolveu, produto com defeito..."
                  className="w-full border border-amber-300 dark:border-amber-700 rounded-md shadow-sm p-2 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-1 focus:ring-amber-500 outline-none"
                />
              </div>

              {returnResult && returnResult.ok ? (
                <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-amber-200 dark:border-amber-800/60 space-y-1">
                  <div className="flex justify-between text-sm font-bold text-slate-800 dark:text-white">
                    <span>Reembolso Total</span>
                    <span className="text-amber-700 dark:text-amber-400">R$ {returnResult.refund.toFixed(2)}</span>
                  </div>
                  {returnResult.paymentRefunds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                      {returnResult.paymentRefunds.map((p, i) => (
                        <span key={i} className="px-2 py-0.5 bg-amber-50 dark:bg-amber-950/40 rounded-md border border-amber-200 dark:border-amber-800/60">
                          {paymentMethodLabel(p.method)}: R$ {p.amount.toFixed(2)}
                        </span>
                      ))}
                    </div>
                  )}
                  {returnResult.paymentRefunds.some(p => p.method === 'FIADO') && (
                    <p className="text-[11px] text-purple-700 dark:text-purple-300">
                      Parte paga em fiado será abatida da caderneta do cliente.
                    </p>
                  )}
                  {returnResult.fullyReturned && (
                    <p className="text-[11px] text-slate-500">Todos os itens devolvidos — a venda será marcada como cancelada.</p>
                  )}
                </div>
              ) : (
                returnResult && !returnResult.ok && (
                  <p className="text-xs text-red-500 dark:text-red-400">{returnResult.error}</p>
                )
              )}

              <div className="flex justify-end gap-2">
                <button onClick={() => setIsReturning(false)} className="px-4 py-2 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 rounded-lg text-sm hover:bg-amber-100 dark:hover:bg-amber-950/40">
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmReturn}
                  disabled={!returnResult?.ok || isSavingReturn || !returnReason.trim()}
                  className="px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <RotateCcw size={14} />
                  {isSavingReturn ? 'Confirmando...' : 'Confirmar Devolução'}
                </button>
              </div>
            </div>
          )}

          {sale.status === 'COMPLETED' && !isReturning && (
            <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 rounded-lg p-4 mt-6">
              {!isCancelling ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                    <AlertTriangle size={20} />
                    <span className="font-medium">Deseja cancelar esta venda?</span>
                  </div>
                  <button onClick={() => setIsCancelling(true)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
                    Cancelar Venda
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-red-800 dark:text-red-300">Motivo do Cancelamento</label>
                  <input type="text" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="w-full border-red-300 dark:border-red-800 rounded-md shadow-sm p-2 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-red-500 focus:border-red-500" placeholder="Ex: Cliente desistiu, erro de lançamento..." />
                  <div className="flex justify-end gap-2 mt-3">
                    <button onClick={() => setIsCancelling(false)} className="px-4 py-2 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg text-sm hover:bg-red-100 dark:hover:bg-red-950/40">Voltar</button>
                    <button onClick={handleCancelSale} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">Confirmar Estorno</button>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {sale.status === 'CANCELLED' && (
             <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 rounded-lg p-4 mt-6 text-red-800 dark:text-red-300">
               <strong>Venda Cancelada.</strong> Motivo: {sale.cancelReason}
             </div>
          )}
        </div>

        <div className="p-4 border-t dark:border-slate-700 flex justify-end gap-2 bg-gray-50 dark:bg-slate-900/60">
          {sale.status === 'COMPLETED' && (
            <button onClick={handleRepeatSale} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
              <Copy size={16} /> Repetir Venda
            </button>
          )}
          <button onClick={() => setIsReceiptOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Printer size={16} /> Reimprimir Cupom
          </button>
        </div>
      </div>

      {/* Reimpressão do cupom reutiliza o ReceiptModal (botão antes não fazia nada) */}
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        sale={sale}
      />
    </div>
  );
};
