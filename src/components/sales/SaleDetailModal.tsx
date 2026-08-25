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

    try {
      await db.transaction('rw', db.sales, db.products, db.stockMovements, db.customers, db.debtRecords, async () => {
        await db.sales.update(sale.id, {
          status: 'CANCELLED',
          cancelReason,
          cancelledAt: new Date().toISOString()
        });

        for (const item of sale.items) {
          const product = await db.products.get(item.productId);
          if (product) {
            const previousStock = product.stock;
            const newStock = previousStock + item.quantity;
            await db.products.update(product.id, { stock: newStock });

            await db.stockMovements.add({
              id: crypto.randomUUID(),
              productId: product.id,
              productName: product.name,
              type: 'RETURN',
              quantity: item.quantity,
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
      });
      onUpdate();
      onClose();
    } catch (error) {
      console.error(error);
      alert("Erro ao cancelar venda.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            Detalhes da Venda <span className="text-gray-500 text-sm">#{sale.saleNumber}</span>
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20}/></button>
        </div>
        
        <div className="p-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 p-3 rounded-lg">
              <span className="text-xs text-gray-500 block">Data/Hora</span>
              <span className="font-medium">{new Date(sale.date).toLocaleString()}</span>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <span className="text-xs text-gray-500 block">Status</span>
              <span className={`font-medium ${sale.status === 'COMPLETED' ? 'text-green-600' : 'text-red-600'}`}>
                {sale.status}
              </span>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <span className="text-xs text-gray-500 block">Cliente</span>
              <span className="font-medium">{sale.customerName || 'Consumidor Final'}</span>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <span className="text-xs text-gray-500 block">Operador</span>
              <span className="font-medium">Caixa 01</span>
            </div>
          </div>

          <h3 className="font-medium mb-3">Itens da Venda</h3>
          <div className="border rounded-lg overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
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
                    <tr key={idx} className="border-t">
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

          <h3 className="font-medium mb-3">Pagamento</h3>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span>R$ {sale.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-red-500">
                <span>Desconto</span>
                <span>- R$ {sale.discount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t">
                <span>Total Pago</span>
                <span>R$ {sale.total.toFixed(2)}</span>
              </div>
            </div>
            <div className="border rounded-lg p-4">
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
            <div className="border border-red-200 bg-red-50 rounded-lg p-4 mt-6">
              {!isCancelling ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertTriangle size={20} />
                    <span className="font-medium">Deseja cancelar esta venda?</span>
                  </div>
                  <button onClick={() => setIsCancelling(true)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
                    Cancelar Venda
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-red-800">Motivo do Cancelamento</label>
                  <input type="text" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="w-full border-red-300 rounded-md shadow-sm p-2 text-sm focus:ring-red-500 focus:border-red-500" placeholder="Ex: Cliente desistiu, erro de lançamento..." />
                  <div className="flex justify-end gap-2 mt-3">
                    <button onClick={() => setIsCancelling(false)} className="px-4 py-2 border border-red-300 text-red-700 rounded-lg text-sm hover:bg-red-100">Voltar</button>
                    <button onClick={handleCancelSale} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">Confirmar Estorno</button>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {sale.status === 'CANCELLED' && (
             <div className="border border-red-200 bg-red-50 rounded-lg p-4 mt-6 text-red-800">
               <strong>Venda Cancelada.</strong> Motivo: {sale.cancelReason}
             </div>
          )}
        </div>

        <div className="p-4 border-t flex justify-end gap-2 bg-gray-50">
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Printer size={16} /> Reimprimir Cupom
          </button>
        </div>
      </div>
    </div>
  );
};
