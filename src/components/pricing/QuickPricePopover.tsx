import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import { Product } from '../../types';
import { Save, X, DollarSign, Percent } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface QuickPricePopoverProps {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}

export function QuickPricePopover({ product, onClose, onSaved }: QuickPricePopoverProps) {
  const [sellPrice, setSellPrice] = useState(product.sellPrice);
  const [margin, setMargin] = useState(
    product.sellPrice > 0 ? ((product.sellPrice - product.costPrice) / product.sellPrice) * 100 : 0
  );

  const handleSellPriceChange = (val: number) => {
    setSellPrice(val);
    if (val > 0) {
      setMargin(((val - product.costPrice) / val) * 100);
    } else {
      setMargin(0);
    }
  };

  const handleMarginChange = (val: number) => {
    setMargin(val);
    if (val < 100) {
      setSellPrice(product.costPrice / (1 - val / 100));
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
        oldMargin: product.sellPrice > 0 ? ((product.sellPrice - product.costPrice) / product.sellPrice) * 100 : 0,
        newMargin: margin,
        changePercentage: ((sellPrice - product.sellPrice) / product.sellPrice) * 100,
        date: new Date().toISOString(),
        reason: 'Edição rápida',
        userId: 'system'
      });
      onSaved();
    }
    onClose();
  };

  return (
    <div className="absolute z-10 mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 p-4">
      <div className="flex justify-between items-center mb-4 pb-2 border-b">
        <h4 className="font-semibold text-gray-800">Editar Preço</h4>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Custo Atual</label>
          <div className="text-sm font-medium text-gray-700">R$ {product.costPrice.toFixed(2)}</div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Novo Preço de Venda</label>
          <div className="relative">
            <DollarSign className="absolute left-2 top-2 text-gray-400" size={14} />
            <input 
              type="number" 
              value={sellPrice.toFixed(2)} 
              onChange={e => handleSellPriceChange(Number(e.target.value))}
              className="pl-8 w-full p-1.5 text-sm border rounded"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Margem Desejada (%)</label>
          <div className="relative">
            <Percent className="absolute left-2 top-2 text-gray-400" size={14} />
            <input 
              type="number" 
              value={margin.toFixed(2)} 
              onChange={e => handleMarginChange(Number(e.target.value))}
              className="pl-8 w-full p-1.5 text-sm border rounded"
            />
          </div>
        </div>

        <button 
          onClick={handleSave}
          className="w-full mt-2 bg-indigo-600 text-white text-sm py-2 rounded shadow hover:bg-indigo-700 flex items-center justify-center"
        >
          <Save size={14} className="mr-2" /> Salvar
        </button>
      </div>
    </div>
  );
}
