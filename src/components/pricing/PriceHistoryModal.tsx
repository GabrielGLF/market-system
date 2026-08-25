import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import { PriceHistory, Product } from '../../types';
import { X, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface PriceHistoryModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
}

export function PriceHistoryModal({ product, isOpen, onClose }: PriceHistoryModalProps) {
  const [history, setHistory] = useState<PriceHistory[]>([]);

  useEffect(() => {
    if (isOpen) {
      db.priceHistories
        .where('productId').equals(product.id)
        .reverse()
        .sortBy('date')
        .then(setHistory);
    }
  }, [isOpen, product.id]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Histórico de Preços</h2>
            <p className="text-sm text-gray-500">{product.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {history.length === 0 ? (
            <div className="text-center text-gray-500 py-8">Nenhum histórico de alteração encontrado.</div>
          ) : (
            <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
              {history.map((record, index) => {
                const isIncrease = record.newSellPrice > record.oldSellPrice;
                const isDecrease = record.newSellPrice < record.oldSellPrice;
                
                return (
                  <div key={record.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 ${
                      isIncrease ? 'bg-green-500' : isDecrease ? 'bg-red-500' : 'bg-gray-400'
                    }`}>
                      {isIncrease ? <TrendingUp size={16} className="text-white" /> : 
                       isDecrease ? <TrendingDown size={16} className="text-white" /> : 
                       <Minus size={16} className="text-white" />}
                    </div>
                    
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-lg shadow border border-gray-100 bg-white">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-gray-800">R$ {record.oldSellPrice.toFixed(2)} → R$ {record.newSellPrice.toFixed(2)}</span>
                        <span className="text-xs text-gray-400">{new Date(record.date).toLocaleDateString()}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        Variação: <span className={isIncrease ? 'text-green-600' : isDecrease ? 'text-red-600' : ''}>
                          {record.changePercentage > 0 ? '+' : ''}{record.changePercentage.toFixed(2)}%
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-2 flex justify-between">
                        <span>Por: {record.userId}</span>
                        <span>Motivo: {record.reason}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
