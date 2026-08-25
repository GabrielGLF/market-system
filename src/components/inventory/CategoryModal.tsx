import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import type { Category } from '../../types';
import { X, Save, Trash2, Edit2, FolderPlus } from 'lucide-react';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const COLOR_PRESETS = [
  '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', 
  '#f59e0b', '#ef4444', '#06b6d4', '#64748b'
];

export function CategoryModal({ isOpen, onClose, onSuccess }: CategoryModalProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [formData, setFormData] = useState({ id: '', name: '', color: '#10b981', icon: 'Box', description: '' });
  const [editing, setEditing] = useState(false);

  const loadCategories = async () => {
    const data = await db.categories.toArray();
    setCategories(data);
  };

  useEffect(() => {
    if (isOpen) loadCategories();
  }, [isOpen]);

  const handleSave = async () => {
    if (!formData.name.trim()) return;

    if (editing) {
      await db.categories.update(formData.id, formData);
    } else {
      await db.categories.add({ ...formData, id: crypto.randomUUID() });
    }
    setFormData({ id: '', name: '', color: '#10b981', icon: 'Box', description: '' });
    setEditing(false);
    await loadCategories();
    onSuccess?.();
  };

  const handleEdit = (c: Category) => {
    setFormData({
      id: c.id,
      name: c.name,
      color: c.color,
      icon: c.icon,
      description: c.description || ''
    });
    setEditing(true);
  };

  const handleDelete = async (id: string) => {
    const productsCount = await db.products.where('categoryId').equals(id).count();
    if (productsCount > 0) {
      alert(`Não é possível excluir: existem ${productsCount} produtos vinculados a esta categoria.`);
      return;
    }
    if (confirm('Deseja excluir esta categoria?')) {
      await db.categories.delete(id);
      await loadCategories();
      onSuccess?.();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-slate-700">
        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-emerald-600" />
              Gerenciamento de Categorias
            </h2>
            <p className="text-xs text-slate-400">Cadastre e personalize os setores da sua loja.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Formulário */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              {editing ? 'Editar Categoria' : 'Nova Categoria'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1">
                  Nome da Categoria
                </label>
                <input
                  type="text"
                  placeholder="Ex: Bebidas, Padaria, Limpeza..."
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1">
                  Cor de Destaque
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5 flex-wrap">
                    {COLOR_PRESETS.map((color, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, color }))}
                        className={`w-6 h-6 rounded-full transition-transform ${
                          formData.color === color ? 'scale-125 ring-2 ring-emerald-500 ring-offset-2' : ''
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    value={formData.color}
                    onChange={e => setFormData(prev => ({ ...prev, color: e.target.value }))}
                    className="w-8 h-8 rounded cursor-pointer ml-auto border-none bg-transparent"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setFormData({ id: '', name: '', color: '#10b981', icon: 'Box', description: '' });
                  }}
                  className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-200 rounded-lg"
                >
                  Cancelar Edição
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Save className="w-4 h-4" />
                {editing ? 'Atualizar' : 'Adicionar Categoria'}
              </button>
            </div>
          </div>

          {/* Lista de Categorias */}
          <div>
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
              Categorias Existentes ({categories.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto">
              {categories.map(c => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    <span className="font-semibold text-slate-800 dark:text-white text-sm">{c.name}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(c)}
                      className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CategoryModal;
