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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors">
          <X className="w-6 h-6" />
        </button>
        
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Smartphone className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Parear Celular</h2>
          <p className="text-slate-500 mb-8">
            Use seu celular como leitor de código de barras. Acesse o link ou digite o código abaixo.
          </p>

          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-6">
            <div className="text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wider">Código de Pareamento</div>
            <div className="text-5xl font-bold tracking-widest text-slate-800 font-mono">
              {pairingCode}
            </div>
          </div>

          <div className="flex items-center gap-2 justify-center text-blue-600 font-medium hover:text-blue-700 cursor-pointer" onClick={() => window.open(mobileUrl, '_blank')}>
            <Link className="w-4 h-4" />
            <span>Abrir no mesmo dispositivo (Teste)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
