import React, { useEffect, useState } from 'react';
import { X, Smartphone, Link } from 'lucide-react';

interface MobileScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBarcodeScanned: (barcode: string) => void;
}

export const MobileScannerModal: React.FC<MobileScannerModalProps> = ({ isOpen, onClose, onBarcodeScanned }) => {
  const [pairingCode, setPairingCode] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Generate a random 6 character code
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      setPairingCode(code);

      const bc = new BroadcastChannel('market-mobile-scanner');
      bc.onmessage = (event) => {
        if (event.data.type === 'BARCODE_SCANNED' && event.data.pairingCode === code) {
          onBarcodeScanned(event.data.barcode);
        }
      };

      return () => {
        bc.close();
      };
    }
  }, [isOpen, onBarcodeScanned]);

  if (!isOpen) return null;

  const mobileUrl = `${window.location.origin}?view=mobile-scanner&pair=${pairingCode}`;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden relative border border-slate-200 dark:border-slate-700">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
          <X className="w-5 h-5" />
        </button>
        
        <div className="p-7 text-center">
          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700/60 rounded-lg flex items-center justify-center mx-auto mb-4">
            <Smartphone className="w-6 h-6 text-slate-500 dark:text-slate-300" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1.5">Parear celular</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-7">
            Use seu celular como leitor de código de barras. Acesse o link ou digite o código abaixo.
          </p>

          <div className="bg-slate-50 dark:bg-slate-900/60 p-5 rounded-md border border-slate-200 dark:border-slate-700 mb-6">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Código de pareamento</div>
            <div className="text-4xl font-bold tracking-widest text-slate-900 dark:text-white font-mono">
              {pairingCode}
            </div>
          </div>

          <button
            onClick={() => window.open(mobileUrl, '_blank')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-slate-200 dark:border-slate-600 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Link className="w-3.5 h-3.5" />
            <span>Abrir no mesmo dispositivo (teste)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
