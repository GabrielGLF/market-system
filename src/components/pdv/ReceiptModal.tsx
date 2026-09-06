import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { X, Printer, Share2, ShoppingBag, Check, Repeat } from 'lucide-react';
import { formatCurrency, formatDateTime, formatNumber } from '../../utils/format';
import type { Sale } from '../../types';
import { requestRepeatSale } from '../../utils/repeatSale';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ isOpen, onClose, sale }) => {
  const storeSettings = useLiveQuery(() => db.settings.toCollection().first());

  if (!isOpen || !sale) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleRepeat = () => {
    requestRepeatSale(sale.items);
    onClose();
  };

  const handleShare = () => {
    let text = `*COMPROVANTE DE VENDA - ${storeSettings?.tradeName || 'MarketSystem'}*\n`;
    text += `Cupom: #${sale.saleNumber}\n`;
    text += `Data: ${formatDateTime(sale.date)}\n`;
    if (sale.customerName) text += `Cliente: ${sale.customerName}\n`;
    text += `------------------------------\n`;
    sale.items.forEach(item => {
      text += `${formatNumber(item.quantity)}x ${item.productName} - ${formatCurrency(item.total)}\n`;
    });
    text += `------------------------------\n`;
    if (sale.discount > 0) text += `Desconto: -${formatCurrency(sale.discount)}\n`;
    text += `*TOTAL PAGO: ${formatCurrency(sale.total)}*\n`;
    text += `Formas de Pagamento: ${sale.paymentMethods.map(p => `${p.method}: ${formatCurrency(p.amount)}`).join(', ')}\n\n`;
    text += `${storeSettings?.receiptFooter || 'Obrigado pela preferência! Volte sempre.'}`;
    
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 print:bg-white print:p-0">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[92vh] print:shadow-none print:max-w-none print:w-[80mm] print:m-0 print:border-none border border-slate-200 dark:border-slate-700">
        
        {/* Header - Not printed */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between print:hidden">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            Cupom não fiscal #{sale.saleNumber}
          </h2>
          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Receipt Body */}
        <div className="flex-1 overflow-auto p-6 font-mono text-xs bg-white text-slate-900 print:p-2 print:overflow-visible thermal-receipt">
          <div className="text-center mb-4">
            <h1 className="font-black text-sm uppercase tracking-wider mb-0.5">
              {storeSettings?.tradeName || 'MARKETSYSTEM'}
            </h1>
            <div className="text-[11px] text-slate-600">{storeSettings?.companyName || ''}</div>
            <div className="text-[11px] text-slate-600">CNPJ/CPF: {storeSettings?.document || '00.000.000/0001-00'}</div>
            {storeSettings?.address?.street && (
              <div className="text-[10px] text-slate-500">
                {storeSettings.address.street}, {storeSettings.address.number} - {storeSettings.address.city}/{storeSettings.address.state}
              </div>
            )}
            {storeSettings?.whatsapp && (
              <div className="text-[10px] text-slate-500">WhatsApp: {storeSettings.whatsapp}</div>
            )}
            <div className="text-[10px] uppercase font-bold text-slate-400 mt-1">
              ** DOCUMENTO NÃO FISCAL **
            </div>
          </div>

          <div className="border-y border-dashed border-slate-400 py-1.5 mb-3 text-[11px]">
            <div className="flex justify-between">
              <span>DATA: {new Date(sale.date).toLocaleDateString('pt-BR')}</span>
              <span>HORA: {new Date(sale.date).toLocaleTimeString('pt-BR')}</span>
            </div>
            <div className="flex justify-between">
              <span>CUPOM: #{sale.saleNumber}</span>
            </div>
            {sale.customerName && (
              <div className="mt-0.5 font-bold">CLIENTE: {sale.customerName}</div>
            )}
          </div>

          <table className="w-full mb-3 text-[11px]">
            <thead>
              <tr className="border-b border-dashed border-slate-400 font-bold">
                <th className="text-left py-1">QTD</th>
                <th className="text-left py-1">ITEM</th>
                <th className="text-right py-1">UNIT</th>
                <th className="text-right py-1">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="py-1 align-top">{formatNumber(item.quantity)}</td>
                  <td className="py-1 align-top pr-1">{item.productName}</td>
                  <td className="text-right py-1 align-top">{formatCurrency(item.unitPrice)}</td>
                  <td className="text-right py-1 align-top font-bold">{formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-dashed border-slate-400 pt-2 mb-3 space-y-1">
            {sale.discount > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>SUBTOTAL:</span>
                <span>{formatCurrency(sale.subtotal)}</span>
              </div>
            )}
            {sale.discount > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>DESCONTO:</span>
                <span>-{formatCurrency(sale.discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-sm pt-1 border-t border-slate-300">
              <span>TOTAL A PAGAR:</span>
              <span>{formatCurrency(sale.total)}</span>
            </div>
          </div>

          {/* Formas de Pagamento Discriminadas */}
          <div className="border-t border-dashed border-slate-400 pt-2 mb-4 text-[11px] space-y-0.5">
            <div className="font-bold text-[10px] uppercase text-slate-500">PAGAMENTO:</div>
            {sale.paymentMethods.map((p, idx) => (
              <div key={idx} className="flex justify-between">
                <span>
                  {p.method === 'CASH' && 'Dinheiro'}
                  {p.method === 'PIX' && 'Pix'}
                  {p.method === 'CREDIT_CARD' && 'Cartão de Crédito'}
                  {p.method === 'DEBIT_CARD' && 'Cartão de Débito'}
                  {p.method === 'FIADO' && 'Caderneta (Fiado)'}
                  {p.method === 'VOUCHER' && 'Voucher/Vale'}
                </span>
                <span className="font-bold">{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </div>

          <div className="text-center text-[10px] text-slate-500 pt-2 border-t border-dashed border-slate-400">
            <p>{storeSettings?.receiptFooter || 'Obrigado pela preferência! Volte sempre.'}</p>
          </div>
        </div>

        {/* Footer Actions - Not printed */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 flex gap-2 print:hidden">
          <button 
            onClick={handleShare}
            className="flex-1 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <Share2 className="w-4 h-4" /> WhatsApp
          </button>

          <button
            onClick={handleRepeat}
            className="flex-1 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
            title="Recarregar os mesmos itens no carrinho (cliente fiel)"
          >
            <Repeat className="w-4 h-4" /> Repetir
          </button>
          
          <button 
            onClick={handlePrint}
            className="flex-1 py-2.5 bg-slate-900 dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-white text-white rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <Printer className="w-4 h-4" /> Imprimir
          </button>
        </div>

      </div>
    </div>
  );
};

export default ReceiptModal;
