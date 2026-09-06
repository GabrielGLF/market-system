import React, { useState, useEffect } from 'react';
import type { Product, Category } from '../../types';
import { db } from '../../db';
import { X, Save, AlertTriangle, Image as ImageIcon, Layers, Sparkles } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { calculateMargin } from '../../utils/calc';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
  productToEdit?: Product | null;
  onSave?: () => void;
  onSuccess?: () => void;
}

const PRESET_ICONS = ['📦', '🥤', '🍺', '🍚', '🥖', '🥛', '🥩', '🍎', '🍌', '🍫', '🧼', '🧹', '🚬', '🧀', '☕', '🍗', '🧴', '🥫'];

export function ProductModal({ isOpen, onClose, product, productToEdit, onSave, onSuccess }: ProductModalProps) {
  const currentProd = productToEdit || product;

  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    sku: '',
    barcode: '',
    categoryId: '',
    costPrice: 0,
    sellPrice: 0,
    stock: 0,
    minStock: 5,
    unit: 'UN',
    isActive: true,
    imageUrl: '📦'
  });

  const [hasAlternativeUnit, setHasAlternativeUnit] = useState(false);
  const [altName, setAltName] = useState('Unidade Avulsa');
  const [altFactor, setAltFactor] = useState(20);
  const [altPrice, setAltPrice] = useState(1.0);
  const [altBarcode, setAltBarcode] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [inactiveFound, setInactiveFound] = useState<Product | null>(null);

  useEffect(() => {
    db.categories.toArray().then(setCategories);
  }, []);

  useEffect(() => {
    if (currentProd) {
      setFormData(currentProd);
      if (currentProd.alternativeUnit) {
        setHasAlternativeUnit(true);
        setAltName(currentProd.alternativeUnit.name);
        setAltFactor(currentProd.alternativeUnit.factor);
        setAltPrice(currentProd.alternativeUnit.price);
        setAltBarcode(currentProd.alternativeUnit.barcode || '');
      } else {
        setHasAlternativeUnit(false);
      }
    } else {
      setFormData({
        name: '',
        sku: '',
        barcode: '',
        categoryId: '',
        costPrice: 0,
        sellPrice: 0,
        stock: 0,
        minStock: 5,
        unit: 'UN',
        isActive: true,
        imageUrl: '📦'
      });
      setHasAlternativeUnit(false);
    }
  }, [currentProd, isOpen]);

  // Detecção Inteligente de Inativos
  useEffect(() => {
    if (!currentProd && (formData.name || formData.sku || formData.barcode)) {
      const checkInactive = async () => {
        // Dedup via índices (barcode/sku/name) — O(log n) por lookup.
        // Antes: filter() varria a tabela inteira a cada 400ms de digitação.
        let found: Product | undefined;
        if (formData.barcode) {
          found = await db.products.where('barcode').equals(formData.barcode)
            .and(p => !p.isActive).first();
        }
        if (!found && formData.sku) {
          found = await db.products.where('sku').equals(formData.sku)
            .and(p => !p.isActive).first();
        }
        if (!found && formData.name) {
          found = await db.products.where('name').equalsIgnoreCase(formData.name)
            .and(p => !p.isActive).first();
        }
        setInactiveFound(found || null);
      };
      const timer = setTimeout(checkInactive, 400);
      return () => clearTimeout(timer);
    }
  }, [formData.name, formData.sku, formData.barcode, currentProd]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData(prev => ({ ...prev, imageUrl: event.target?.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      alert('Por favor, informe o nome do produto.');
      return;
    }

    // Código de barras duplicado faz o PDV vender o produto errado na leitura
    const barcode = (formData.barcode || '').trim();
    if (barcode) {
      const existingWithBarcode = await db.products
        .filter(p => p.barcode === barcode && p.id !== (currentProd?.id || ''))
        .first();
      if (existingWithBarcode) {
        alert(`Já existe outro produto com o código de barras "${barcode}" (${existingWithBarcode.name}). Use um código único.`);
        return;
      }
    }

    if (Number(formData.costPrice) < 0 || Number(formData.sellPrice) < 0) {
      alert('Os preços não podem ser negativos.');
      return;
    }

    if (hasAlternativeUnit && (Number(altFactor) < 1 || !altName.trim() || Number(altPrice) <= 0)) {
      alert('Preencha corretamente a fração: nome, fator (quantidade por pacote, mínimo 1) e preço maior que zero.');
      return;
    }

    const now = new Date().toISOString();
    let productId = currentProd?.id;
    const oldSellPrice = currentProd?.sellPrice;
    const oldCostPrice = currentProd?.costPrice;
    const newSellPrice = Number(formData.sellPrice || 0);
    const newCostPrice = Number(formData.costPrice || 0);

    const payload: Product = {
      ...(formData as Product),
      name: formData.name || '',
      sku: formData.sku || '',
      barcode: formData.barcode || String(Math.floor(1000000000000 + Math.random() * 9000000000000)),
      categoryId: formData.categoryId || categories[0]?.id || '',
      costPrice: Number(formData.costPrice || 0),
      sellPrice: Number(formData.sellPrice || 0),
      stock: Number(formData.stock || 0),
      minStock: Number(formData.minStock || 0),
      unit: formData.unit || 'UN',
      // Preserva o status ativo/inativo: salvar uma edição não deve reativar o produto
      isActive: currentProd ? currentProd.isActive : true,
      alternativeUnit: hasAlternativeUnit ? {
        name: altName,
        factor: Number(altFactor),
        price: Number(altPrice),
        barcode: altBarcode
      } : undefined
    };

    if (currentProd) {
      await db.products.update(currentProd.id, { ...payload, updatedAt: now });
    } else {
      productId = crypto.randomUUID();
      payload.id = productId;
      payload.createdAt = now;
      payload.updatedAt = now;
      await db.products.add(payload);
    }

    // Histórico íntegro de preço/custo: só para produtos EXISTENTES (produto novo
    // não tem "alteração" para registrar), registra mudança de custo OU de venda,
    // e grava a margem ANTERIOR real (antes ficava fixa em 0, corrompendo o histórico).
    const priceOrCostChanged = Boolean(currentProd) && (
      oldSellPrice !== newSellPrice || oldCostPrice !== newCostPrice
    );
    if (priceOrCostChanged && productId) {
      const oldMargin = oldSellPrice && oldSellPrice > 0
        ? calculateMargin(oldCostPrice || 0, oldSellPrice)
        : 0;
      const newMargin = calculateMargin(newCostPrice, newSellPrice);
      const changePercentage = oldSellPrice && oldSellPrice > 0
        ? ((newSellPrice - oldSellPrice) / oldSellPrice) * 100
        : 0;

      await db.priceHistories.add({
        id: crypto.randomUUID(),
        productId,
        productName: formData.name!,
        oldSellPrice: oldSellPrice || 0,
        newSellPrice,
        oldCostPrice: oldCostPrice || 0,
        newCostPrice,
        oldMargin: Number(oldMargin.toFixed(1)),
        newMargin: Number(newMargin.toFixed(1)),
        changePercentage: Number(changePercentage.toFixed(2)),
        date: now,
        reason: 'Atualização de Cadastro'
      });
    }

    onSave?.();
    onSuccess?.();
    onClose();
  };

  const handleReactivate = async () => {
    if (inactiveFound) {
      await db.products.update(inactiveFound.id, { 
        isActive: true, 
        inactiveSince: undefined,
        updatedAt: new Date().toISOString() 
      });
      onSave?.();
      onSuccess?.();
      onClose();
    }
  };

  if (!isOpen) return null;

  const margin = calculateMargin(Number(formData.costPrice || 0), Number(formData.sellPrice || 0)).toFixed(1);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">
              {currentProd ? 'Editar Produto' : 'Cadastrar Novo Produto'}
            </h2>
            <p className="text-xs text-slate-400">Preencha os detalhes comerciais e de estoque do item.</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-5">
          {/* Alerta Inteligente de Inativos */}
          {inactiveFound && !currentProd && (
            <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 p-4 rounded-xl flex items-start gap-3 shadow-xs">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Produto Inativo Detectado!</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Já existe um produto inativo chamado <strong>"{inactiveFound.name}"</strong> com este mesmo código/SKU. Deseja reativá-lo em vez de criar um duplicado?
                </p>
              </div>
              <button 
                onClick={handleReactivate} 
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow transition-colors"
              >
                Reativar Este Produto
              </button>
            </div>
          )}

          {/* Dados Principais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1">
                Nome do Produto *
              </label>
              <input 
                type="text" 
                name="name" 
                placeholder="Ex: Coca-Cola 2L, Arroz Camil 5kg..."
                value={formData.name || ''} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1">
                Categoria
              </label>
              <select 
                name="categoryId" 
                value={formData.categoryId || ''} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="">Selecione uma categoria...</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1">
                Unidade de Medida
              </label>
              <input 
                type="text" 
                name="unit" 
                placeholder="UN, KG, L, CX, PCT, LATA..."
                value={formData.unit || 'UN'} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm uppercase focus:ring-2 focus:ring-emerald-500 outline-none" 
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1">
                Código de Barras (EAN-13)
              </label>
              <input 
                type="text" 
                name="barcode" 
                placeholder="Ex: 7891234567890"
                value={formData.barcode || ''} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white font-mono text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1">
                SKU / Código Interno
              </label>
              <input 
                type="text" 
                name="sku" 
                placeholder="Ex: BEB-001"
                value={formData.sku || ''} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white font-mono text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
              />
            </div>
          </div>

          {/* Preços e Margem */}
          <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
              Valores & Precificação
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1 font-medium">Preço de Custo (R$)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  name="costPrice" 
                  value={formData.costPrice || 0} 
                  onChange={handleChange} 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white font-bold text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1 font-medium">Preço de Venda (R$)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  name="sellPrice" 
                  value={formData.sellPrice || 0} 
                  onChange={handleChange} 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-black text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1 font-medium">Margem Calculada</label>
                <div className="w-full px-3 py-2 bg-slate-200/60 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-bold text-sm text-slate-700 dark:text-slate-300">
                  {margin}% ({formatCurrency((formData.sellPrice || 0) - (formData.costPrice || 0))})
                </div>
              </div>
            </div>
          </div>

          {/* Estoque */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1">
                Estoque Atual
              </label>
              <input 
                type="number" 
                step="0.01" 
                name="stock" 
                value={formData.stock || 0} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white font-bold text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1">
                Estoque Mínimo (Alerta)
              </label>
              <input 
                type="number" 
                name="minStock" 
                value={formData.minStock || 0} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white font-bold text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
              />
            </div>
          </div>

          {/* Unidade de Venda Alternativa (Fração) */}
          <div className="bg-violet-50/50 dark:bg-violet-950/20 p-4 rounded-xl border border-violet-200 dark:border-violet-800/50 space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-violet-900 dark:text-violet-300 flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={hasAlternativeUnit} 
                  onChange={e => setHasAlternativeUnit(e.target.checked)} 
                  className="w-4 h-4 text-violet-600 rounded" 
                />
                <Layers className="w-4 h-4 text-violet-600" />
                Permitir Venda de Fração / Unidade Alternativa (Ex: Cigarro avulso de maço, Lata de pack)
              </label>
            </div>

            {hasAlternativeUnit && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-violet-800 dark:text-violet-300 uppercase mb-1">
                    Nome da Fração
                  </label>
                  <input 
                    type="text" 
                    value={altName} 
                    onChange={e => setAltName(e.target.value)} 
                    placeholder="Ex: Unidade Avulsa, 1 Lata"
                    className="w-full px-3 py-1.5 text-xs border border-violet-300 dark:border-violet-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white" 
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-violet-800 dark:text-violet-300 uppercase mb-1">
                    Fator (Qtd por Pacote)
                  </label>
                  <input 
                    type="number" 
                    value={altFactor} 
                    onChange={e => setAltFactor(Number(e.target.value))} 
                    placeholder="Ex: 20 un"
                    className="w-full px-3 py-1.5 text-xs border border-violet-300 dark:border-violet-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-bold" 
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-violet-800 dark:text-violet-300 uppercase mb-1">
                    Preço da Fração (R$)
                  </label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={altPrice} 
                    onChange={e => setAltPrice(Number(e.target.value))} 
                    placeholder="Ex: 1.00"
                    className="w-full px-3 py-1.5 text-xs border border-violet-300 dark:border-violet-700 rounded-lg bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 font-bold" 
                  />
                </div>
              </div>
            )}
          </div>

          {/* Imagem / Ícone Preset */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-2">
              Ícone ou Imagem do Produto
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {PRESET_ICONS.map((icon, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, imageUrl: icon }))}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-transform ${
                    formData.imageUrl === icon 
                      ? 'bg-emerald-100 border-2 border-emerald-500 scale-110 shadow-xs' 
                      : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {icon}
                </button>
              ))}

              <label className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium cursor-pointer flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
                Upload Foto
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            </div>
          </div>
        </div>

        {/* Footer com botões */}
        <div className="flex justify-end p-5 border-t border-slate-100 dark:border-slate-700 gap-3">
          <button 
            type="button"
            onClick={onClose} 
            className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium transition-colors"
          >
            Cancelar
          </button>
          <button 
            type="button"
            onClick={handleSave} 
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-md shadow-emerald-600/20 flex items-center gap-2 transition-colors"
          >
            <Save className="w-4 h-4" />
            Salvar Produto
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProductModal;
