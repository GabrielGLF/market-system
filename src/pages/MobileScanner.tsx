import React, { useEffect, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { QrCode, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { playBeep } from '../utils/audio';

export const MobileScanner: React.FC = () => {
  const [pairingCode, setPairingCode] = useState('');
  const [isPaired, setIsPaired] = useState(false);
  const [scannedItems, setScannedItems] = useState<{barcode: string, time: Date}[]>([]);
  const [scanner, setScanner] = useState<Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const pair = urlParams.get('pair');
    if (pair) {
      setPairingCode(pair);
      handlePair(pair);
    }
    
    return () => {
      if (scanner && isScanning) {
        scanner.stop().catch(console.error);
      }
    };
  }, []);

  const handlePair = (code: string) => {
    if (code.length >= 6) {
      setIsPaired(true);
      startScanner();
    }
  };

  const startScanner = async () => {
    try {
      const html5QrCode = new Html5Qrcode("reader");
      setScanner(html5QrCode);
      
      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleScan(decodedText);
        },
        (errorMessage) => {
          // parse errors are frequent, ignore them
        }
      );
      setIsScanning(true);
    } catch (err) {
      console.error("Error starting scanner", err);
      alert("Erro ao acessar a câmera. Verifique as permissões.");
    }
  };

  const handleScan = (barcode: string) => {
    // Prevent double scans within 1.5 seconds
    setScannedItems(prev => {
      const last = prev[0];
      if (last && last.barcode === barcode && (new Date().getTime() - last.time.getTime() < 1500)) {
        return prev;
      }
      
      // Notify PDV
      const bc = new BroadcastChannel('market-mobile-scanner');
      bc.postMessage({ type: 'BARCODE_SCANNED', barcode, pairingCode });
      bc.close();
      
      // Feedback
      playBeep();
      if (navigator.vibrate) {
        navigator.vibrate(100);
      }
      
      return [{ barcode, time: new Date() }, ...prev].slice(0, 5);
    });
  };

  if (!isPaired) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <Smartphone className="w-20 h-20 text-blue-500 mb-6" />
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Scanner Mobile</h1>
        <p className="text-slate-500 text-center mb-8">
          Digite o código exibido no PDV para parear seu celular.
        </p>
        
        <input
          type="text"
          maxLength={6}
          placeholder="Código de 6 dígitos"
          className="w-full max-w-xs text-center text-3xl font-bold tracking-widest p-4 rounded-xl border-2 border-slate-300 mb-6 uppercase"
          value={pairingCode}
          onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
        />
        
        <button
          onClick={() => handlePair(pairingCode)}
          disabled={pairingCode.length < 6}
          className="w-full max-w-xs bg-blue-600 text-white font-bold py-4 rounded-xl disabled:opacity-50"
        >
          Parear e Iniciar
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      <div className="p-4 bg-slate-900 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <QrCode className="text-blue-400" />
          <span className="font-bold">Scanner Ativo</span>
        </div>
        <div className="flex items-center gap-2 text-green-400 text-sm">
          <Wifi className="w-4 h-4" /> Pareado: {pairingCode}
        </div>
      </div>
      
      <div className="flex-1 relative">
        <div id="reader" className="w-full h-full bg-black"></div>
        {/* Overlay para mira */}
        <div className="absolute inset-0 pointer-events-none border-[40px] border-black/50">
          <div className="w-full h-full border-2 border-green-500/50 relative">
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-red-500/50 -translate-y-1/2"></div>
          </div>
        </div>
      </div>
      
      <div className="h-64 bg-slate-900 p-4 overflow-y-auto">
        <h3 className="text-slate-400 text-sm font-semibold mb-3 uppercase tracking-wider">Últimas Leituras</h3>
        {scannedItems.length === 0 ? (
          <div className="text-slate-600 text-center py-4">Aponte para um código de barras</div>
        ) : (
          <div className="space-y-2">
            {scannedItems.map((item, idx) => (
              <div key={idx} className="bg-slate-800 p-3 rounded-lg flex justify-between items-center animate-in fade-in slide-in-from-top-2">
                <span className="font-mono text-green-400 font-bold">{item.barcode}</span>
                <span className="text-slate-500 text-sm">{item.time.toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
