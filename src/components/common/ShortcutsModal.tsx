import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  onClose: () => void;
}

export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  const shortcuts = [
    { key: 'F1', desc: 'Ajuda / Atalhos' },
    { key: 'F2', desc: 'Acessar PDV / Buscar Produto' },
    { key: 'F3', desc: 'Ativar Câmera (Leitor)' },
    { key: 'F4', desc: 'Finalizar Venda' },
    { key: 'F6', desc: 'Display do Cliente' },
    { key: 'F7', desc: 'Scanner via Celular' },
    { key: 'F8', desc: 'Cancelar Item / Venda' },
    { key: 'F9', desc: 'Voltar ao Dashboard' },
    { key: 'ESC', desc: 'Fechar Modais / Cancelar' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center">
            <Keyboard className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mr-2" />
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Atalhos de Teclado</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 space-y-2">
          {shortcuts.map(sc => (
            <div key={sc.key} className="flex justify-between items-center p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50">
              <span className="text-slate-600 dark:text-slate-300 font-medium">{sc.desc}</span>
              <kbd className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>
        
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-center">
          <button onClick={onClose} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium w-full transition-colors">
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
