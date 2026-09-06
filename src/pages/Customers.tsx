import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Users, Search, Plus, CreditCard, Clock, Phone, AlertCircle, Edit } from 'lucide-react';
import { Customer } from '../types';
import { CustomerModal } from '../components/customers/CustomerModal';
import { DebtPaymentModal } from '../components/customers/DebtPaymentModal';
import { DebtHistoryModal } from '../components/customers/DebtHistoryModal';

export function Customers() {
  const customers = useLiveQuery(() => db.customers.toArray()) || [];
  const settings = useLiveQuery(() => db.settings.toCollection().first());
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [customerForPayment, setCustomerForPayment] = useState<Customer | null>(null);
  
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [customerForHistory, setCustomerForHistory] = useState<Customer | null>(null);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.document.includes(searchTerm) || 
    c.phone.includes(searchTerm)
  );

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const openNewCustomer = () => {
    setCustomerToEdit(null);
    setIsCustomerModalOpen(true);
  };

  const openEditCustomer = (customer: Customer) => {
    setCustomerToEdit(customer);
    setIsCustomerModalOpen(true);
  };

  const openPayment = (customer: Customer) => {
    setCustomerForPayment(customer);
    setIsPaymentModalOpen(true);
  };

  const openHistory = (customer: Customer) => {
    setCustomerForHistory(customer);
    setIsHistoryModalOpen(true);
  };

  const sendWhatsApp = (customer: Customer) => {
    const cleanPhone = customer.phone.replace(/\D/g, '');
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    // Usa a chave Pix configurada nas configurações (antes estava fixa)
    const pixKey = settings?.pixKey || 'pix@marketsystem.com.br';
    const text = `Olá ${customer.name}, passando para lembrar do seu saldo pendente de ${formatCurrency(customer.debtBalance)} na loja. Chave Pix: ${pixKey}. Por favor, regularize assim que puder. Muito obrigado!`;
    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6 pb-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center">
            <Users className="w-6 h-6 mr-2 text-emerald-500" />
            Clientes e Fiado
          </h1>
          <p className="text-slate-500 dark:text-slate-400">Gerencie a caderneta e limite de crédito dos seus clientes</p>
        </div>
        
        <button onClick={openNewCustomer} className="flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition-colors font-medium">
          <Plus className="w-5 h-5 mr-1" /> Novo Cliente
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar por nome, CPF ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-600 dark:text-slate-400">
                <th className="py-3 px-4 font-medium border-b border-slate-200 dark:border-slate-700">Cliente</th>
                <th className="py-3 px-4 font-medium border-b border-slate-200 dark:border-slate-700">Contato</th>
                <th className="py-3 px-4 font-medium border-b border-slate-200 dark:border-slate-700 text-right">Limite</th>
                <th className="py-3 px-4 font-medium border-b border-slate-200 dark:border-slate-700 text-right">Saldo Devedor</th>
                <th className="py-3 px-4 font-medium border-b border-slate-200 dark:border-slate-700 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map(c => (
                <tr key={c.id} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="py-3 px-4">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.document}</p>
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400 text-sm">
                    <div className="flex items-center">
                      <Phone className="w-3 h-3 mr-1" /> {c.phone}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-300">
                    {formatCurrency(c.creditLimit)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`font-semibold ${c.debtBalance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                      {formatCurrency(c.debtBalance)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center space-x-1">
                      <button onClick={() => openEditCustomer(c)} className="p-1.5 text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700 rounded-lg" title="Editar Cliente">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => openHistory(c)} className="p-1.5 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg" title="Histórico da Caderneta">
                        <Clock className="w-4 h-4" />
                      </button>
                      <button onClick={() => openPayment(c)} className="p-1.5 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-lg" title="Quitar Dívida">
                        <CreditCard className="w-4 h-4" />
                      </button>
                      <button onClick={() => sendWhatsApp(c)} className="p-1.5 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg" title="Cobrar WhatsApp">
                        <Phone className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isCustomerModalOpen && (
        <CustomerModal 
          onClose={() => setIsCustomerModalOpen(false)} 
          customerToEdit={customerToEdit} 
        />
      )}

      {isPaymentModalOpen && customerForPayment && (
        <DebtPaymentModal 
          onClose={() => setIsPaymentModalOpen(false)} 
          customer={customerForPayment} 
        />
      )}

      {isHistoryModalOpen && customerForHistory && (
        <DebtHistoryModal 
          onClose={() => setIsHistoryModalOpen(false)} 
          customer={customerForHistory} 
        />
      )}
    </div>
  );
}
