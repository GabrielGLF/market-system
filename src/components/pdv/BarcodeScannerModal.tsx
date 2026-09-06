import React, { useEffect, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera } from 'lucide-react';
import { playBeep } from '../../utils/audio';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBarcodeScanned: (barcode: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({ isOpen, onClose, onBarcodeScanned }) => {
  const [scanner, setScanner] = useState<Html5Qrcode | null>(null);

  useEffect(() => {
    if (isOpen) {
      const html5QrCode = new Html5Qrcode("modal-reader");
      setScanner(html5QrCode);
      
      html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 300, height: 150 } },
        (decodedText) => {
          playBeep();
          onBarcodeScanned(decodedText);
          html5QrCode.stop().then(() => onClose()).catch(console.error);
        },
        () => {}
      ).catch(err => {
        console.error("Camera start error", err);
        alert("Erro ao acessar a câmera.");
        onClose();
      });

      return () => {
        html5QrCode.stop().catch(() => {});
      };
    }
  }, [isOpen, onBarcodeScanned, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg overflow-hidden w-full max-w-lg relative border border-slate-200 dark:border-slate-700">
        <div className="absolute top-4 right-4 z-10">
          <button onClick={() => { scanner?.stop(); onClose(); }} className="p-2 bg-black/50 text-white rounded-md hover:bg-black/70">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 bg-slate-900 text-white flex items-center gap-2">
          <Camera className="w-5 h-5" />
          <span className="font-semibold">Leitor de Câmera</span>
        </div>
        
        <div className="relative bg-black w-full" style={{ minHeight: '300px' }}>
          <div id="modal-reader" className="w-full h-full"></div>
        </div>
      </div>
    </div>
  );
};
