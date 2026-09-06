import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import { Product } from '../../types';
import { Save, X, DollarSign, Percent } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { calculateMargin, calculateSellPrice } from '../../utils/calc';

interface QuickPricePopoverProps {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}

export function QuickPricePopover({ product, onClose, onSaved }: QuickPricePopoverProps) {
  const [sellPrice, setSellPrice] = useState(product.sellPrice);
  const [margin, setMargin] = useState(calculateMargin(product.costPrice, product.sellPrice));

  const handleSellPriceChange = (val: number) => {
    setSellPrice(val);
    setMargin(val > 0 ? calculateMargin(product.costPrice, val) : 0);
  };

  const handleMarginChange = (val: number) => {
    setMargin(val);
    if (val < 100) {
      setSellPrice(calculateSellPrice(product.costPrice, val));
    }
  };

  const handleSave = async () => {
    if (sellPrice !== product.sellPrice) {
      await db.products.update(product.id, { sellPrice, updatedAt: new Date().toISOString() });
      
      await db.priceHistories.add({
        id: uuidv4(),
        productId: product.id,
        productName: product.name,
        oldSellPrice: product.sellPrice,
        newSellPrice: sellPrice,
        oldCostPrice: product.costPrice,
        newCostPrice: product.costPrice,
        oldMargin: Number(calculateMargin(product.costPrice, product.sellPrice).toFixed(1)),
        newMargin: margin,
        changePercentage: product.sellPrice > 0 ? ((sellPrice - product.sellPrice) / product.sellPrice) * 100 : 0,
        date: new Date().toISOString(),
        reason: 'Edição rápida',
        userId: 'system'
      });
      onSaved();
    }
    onClose();
  };

  return (
    <div className="absolute z-10 mt-2 w-72 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 p-4">
      <div className="flex justify-between items-center mb-4 pb-2 border-b dark:border-slate-700">
        <h4 className="font-semibold text-gray-800 dark:text-slate-100">Editar Preço</h4>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200"><X size={16} /></button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Custo Atual</label>
          <div className="text-sm font-medium text-gray-700 dark:text-slate-300">R$ {product.costPrice.toFixed(2)}</div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Novo Preço de Venda</label>
          <div className="relative">
            <DollarSign className="absolute left-2 top-2 text-gray-400" size={14} />
            <input 
              type="number" 
              step="0.01" 
              value={sellPrice} 
              onChange={e => handleSellPriceChange(Number(e.target.value))}
              className="pl-8 w-full p-1.5 text-sm border rounded dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Margem Desejada (%)</label>
          <div className="relative">
            <Percent className="absolute left-2 top-2 text-gray-400" size={14} />
            <input 
              type="number" 
              step="0.1" 
              value={margin} 
              onChange={e => handleMarginChange(Number(e.target.value))}
              className="pl-8 w-full p-1.5 text-sm border rounded dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </div>

        <button 
          onClick={handleSave}
          className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-2 rounded shadow flex items-center justify-center"
        >
          <Save size={14} className="mr-2" /> Salvar
        </button>
      </div>
    </div>
  );
}
