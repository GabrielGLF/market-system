import React, { useState } from 'react';
import { X, Printer, AlertTriangle } from 'lucide-react';
import { Sale } from '../../types';
import { db } from '../../db';

interface SaleDetailModalProps {
  sale: Sale;
  onClose: () => void;
  onUpdate: () => void;
}

export const SaleDetailModal: React.FC<SaleDetailModalProps> = ({ sale, onClose, onUpdate }) => {
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

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
            const restockQty = item.isAlternativeUnit && item.originalUnitFactor
              ? item.quantity / item.originalUnitFactor
              : item.quantity;
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
              userId: 'admin',
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
              <span className="text-xs text-gray-500 dark:text-slate-400 block">Operador</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">Caixa 01</span>
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
                      <td className="px-4 py-2 text-right">{item.quantity} {item.unit}</td>
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
          <div className="grid grid-cols-2 gap-4 mb-6">
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
            </div>
            <div className="border dark:border-slate-700 rounded-lg p-4 text-slate-800 dark:text-slate-200">
              <ul className="space-y-2 text-sm">
                {sale.paymentMethods.map((pm, idx) => (
                  <li key={idx} className="flex justify-between">
                    <span>{pm.method}</span>
                    <span className="font-medium">R$ {pm.amount.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {sale.status === 'COMPLETED' && (
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
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Printer size={16} /> Reimprimir Cupom
          </button>
        </div>
      </div>
    </div>
  );
};
