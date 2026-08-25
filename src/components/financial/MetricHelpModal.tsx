import React from 'react';
import { X, HelpCircle, TrendingUp, AlertCircle } from 'lucide-react';

interface MetricHelpModalProps {
  title: string;
  definition: string;
  formula?: string;
  tip: string;
  onClose: () => void;
}

export const MetricHelpModal: React.FC<MetricHelpModalProps> = ({ title, definition, formula, tip, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden relative">
        <button onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"><X size={20} /></button>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><HelpCircle size={24} /></div>
            <h3 className="text-xl font-bold text-gray-800">{title}</h3>
          </div>
          
          <div className="space-y-4 text-sm text-gray-600">
            <div>
              <strong className="text-gray-800 block mb-1 flex items-center gap-2"><AlertCircle size={16}/> O que significa?</strong>
              <p>{definition}</p>
            </div>
            
            {formula && (
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                <strong className="text-gray-800 block mb-1">Como é calculado?</strong>
                <code className="text-blue-700 font-mono">{formula}</code>
              </div>
            )}
            
            <div className="bg-green-50 p-4 rounded-lg border border-green-100 text-green-800">
              <strong className="block mb-1 flex items-center gap-2"><TrendingUp size={16}/> Dica Prática</strong>
              <p>{tip}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
