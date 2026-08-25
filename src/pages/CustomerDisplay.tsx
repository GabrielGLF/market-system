import React from 'react';
import { useCustomerDisplay } from '../hooks/useCustomerDisplay';
import { ShoppingCart, QrCode, CheckCircle2, Store } from 'lucide-react';
import { formatCurrency } from '../utils/format';

export const CustomerDisplay: React.FC = () => {
  const { state } = useCustomerDisplay(true);

  if (state.status === 'IDLE') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-8">
        <Store className="w-32 h-32 text-blue-500 mb-8" />
        <h1 className="text-6xl font-bold mb-4 text-center">Seja bem-vindo(a)!</h1>
        <p className="text-2xl text-slate-400">Caixa Livre</p>
        <div className="absolute bottom-8 right-8 text-xl text-slate-500">
          {new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR')}
        </div>
      </div>
    );
  }

  if (state.status === 'COMPLETE') {
    return (
      <div className="min-h-screen bg-green-900 flex flex-col items-center justify-center text-white p-8">
        <CheckCircle2 className="w-48 h-48 text-green-400 mb-8 animate-bounce" />
        <h1 className="text-6xl font-bold mb-4 text-center">Obrigado pela preferência!</h1>
        <p className="text-3xl text-green-200">Volte Sempre</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex p-6 gap-6">
      {/* Lista de Itens */}
      <div className="flex-1 bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col">
        <div className="bg-blue-600 text-white p-6 flex items-center gap-4">
          <ShoppingCart className="w-8 h-8" />
          <h2 className="text-3xl font-bold">Suas Compras</h2>
        </div>
        
        <div className="flex-1 overflow-auto p-6">
          <table className="w-full text-lg">
            <thead>
              <tr className="border-b-2 border-slate-200 text-left text-slate-500">
                <th className="pb-4 font-semibold">Item</th>
                <th className="pb-4 font-semibold text-right">Qtd</th>
                <th className="pb-4 font-semibold text-right">Preço</th>
                <th className="pb-4 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {state.items.map((item, index) => (
                <tr key={`${item.productId}-${index}`} className="border-b border-slate-100 animate-in fade-in slide-in-from-left-4">
                  <td className="py-4">
                    <div className="font-semibold text-slate-800">{item.productName}</div>
                  </td>
                  <td className="py-4 text-right">{item.quantity} {item.unit}</td>
                  <td className="py-4 text-right text-slate-600">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-4 text-right font-bold text-slate-800">{formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {state.items.length === 0 && (
            <div className="text-center text-slate-400 py-12 text-xl">
              Nenhum item adicionado
            </div>
          )}
        </div>
      </div>

      {/* Resumo e Pagamento */}
      <div className="w-[450px] bg-slate-800 rounded-2xl shadow-xl text-white flex flex-col overflow-hidden">
        <div className="p-8 flex-1">
          <h3 className="text-2xl text-slate-400 mb-8">Resumo da Compra</h3>
          
          <div className="space-y-4 mb-8 text-xl">
            <div className="flex justify-between text-slate-300">
              <span>Subtotal:</span>
              <span>{formatCurrency(state.subtotal)}</span>
            </div>
            {state.discount > 0 && (
              <div className="flex justify-between text-red-400">
                <span>Desconto:</span>
                <span>-{formatCurrency(state.discount)}</span>
              </div>
            )}
          </div>

          <div className="border-t border-slate-700 pt-6 mb-8">
            <div className="text-slate-400 mb-2 text-xl">Total a Pagar</div>
            <div className="text-6xl font-bold text-blue-400">
              {formatCurrency(state.total)}
            </div>
          </div>

          {state.status === 'PAYMENT' && (
            <div className="animate-in fade-in slide-in-from-bottom-4">
              <div className="bg-slate-700 rounded-xl p-6 mb-6">
                <div className="text-xl text-slate-300 mb-2">Método de Pagamento</div>
                <div className="text-3xl font-bold text-white mb-4">
                  {state.paymentMethod === 'CASH' && 'Dinheiro'}
                  {state.paymentMethod === 'PIX' && 'Pix'}
                  {state.paymentMethod === 'CREDIT_CARD' && 'Cartão de Crédito'}
                  {state.paymentMethod === 'DEBIT_CARD' && 'Cartão de Débito'}
                  {state.paymentMethod === 'FIADO' && 'Caderneta (Fiado)'}
                </div>

                {state.amountPaid !== undefined && state.amountPaid > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-600">
                    <div className="flex justify-between text-xl mb-2">
                      <span className="text-slate-400">Valor Recebido:</span>
                      <span className="text-green-400">{formatCurrency(state.amountPaid)}</span>
                    </div>
                    {state.change !== undefined && state.change > 0 && (
                      <div className="flex justify-between text-2xl font-bold">
                        <span className="text-slate-300">Troco:</span>
                        <span className="text-yellow-400">{formatCurrency(state.change)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {state.paymentMethod === 'PIX' && state.pixQrCode && (
                <div className="bg-white rounded-xl p-6 text-center text-slate-900">
                  <QrCode className="w-12 h-12 mx-auto mb-4 text-blue-600" />
                  <div className="font-bold text-xl mb-4">Escaneie para pagar</div>
                  <img src={state.pixQrCode} alt="QR Code Pix" className="w-full h-auto rounded-lg mb-4" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
