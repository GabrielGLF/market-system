import React, { useState, useEffect } from 'react';
import { X, Save, User } from 'lucide-react';
import { db } from '../../db';
import { Customer } from '../../types';
import { toast } from 'sonner';

interface CustomerModalProps {
  onClose: () => void;
  customerToEdit?: Customer | null;
}

export function CustomerModal({ onClose, customerToEdit }: CustomerModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    document: '',
    creditLimit: 0,
    debtBalance: 0,
    notes: ''
  });

  useEffect(() => {
    if (customerToEdit) {
      setFormData({
        name: customerToEdit.name,
        phone: customerToEdit.phone,
        email: customerToEdit.email,
        document: customerToEdit.document,
        creditLimit: customerToEdit.creditLimit,
        debtBalance: customerToEdit.debtBalance,
        notes: customerToEdit.notes || ''
      });
    }
  }, [customerToEdit]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const now = new Date().toISOString();
      if (customerToEdit) {
        // debtBalance é derivado do extrato (debtRecords): nunca editável
        // manualmente, senão saldo diverge do histórico sem trilha.
        await db.customers.update(customerToEdit.id, {
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          document: formData.document,
          creditLimit: formData.creditLimit,
          notes: formData.notes,
          updatedAt: now
        });
        toast.success('Cliente atualizado com sucesso!');
      } else {
        await db.customers.add({
          id: crypto.randomUUID(),
          ...formData,
          createdAt: now,
          updatedAt: now
        });
        toast.success('Cliente cadastrado com sucesso!');
      }
      onClose();
    } catch (err) {
      toast.error('Erro ao salvar cliente.');
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center">
            <User className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mr-2" />
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
              {customerToEdit ? 'Editar Cliente' : 'Novo Cliente'}
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome Completo *</label>
            <input required type="text" name="name" value={formData.name} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="João da Silva" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">CPF / CNPJ</label>
              <input type="text" name="document" value={formData.document} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Telefone / WhatsApp</label>
              <input type="text" name="phone" value={formData.phone} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Limite de Crédito (R$)</label>
              <input type="number" step="0.01" min="0" name="creditLimit" value={formData.creditLimit} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
            {!customerToEdit && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Saldo Inicial Devedor (R$)</label>
                <input type="number" step="0.01" min="0" name="debtBalance" value={formData.debtBalance} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Observações</label>
            <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
          </div>

          <div className="flex justify-end pt-4 mt-6 border-t border-slate-200 dark:border-slate-700 space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors">
              Cancelar
            </button>
            <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium flex items-center transition-colors">
              <Save className="w-4 h-4 mr-2" /> Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
