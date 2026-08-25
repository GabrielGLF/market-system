import { useEffect, useState, useCallback } from 'react';
import { SaleItem, PaymentMethodType } from '../types';

export interface CustomerDisplayState {
  status: 'IDLE' | 'CART' | 'PAYMENT' | 'COMPLETE';
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod?: PaymentMethodType;
  amountPaid?: number;
  change?: number;
  pixQrCode?: string;
  pixKey?: string;
}

const CHANNEL_NAME = 'market-customer-display';

export function useCustomerDisplay(isDisplay = false) {
  const [state, setState] = useState<CustomerDisplayState>({
    status: 'IDLE',
    items: [],
    subtotal: 0,
    discount: 0,
    total: 0,
  });
  
  const [channel, setChannel] = useState<BroadcastChannel | null>(null);

  useEffect(() => {
    const bc = new BroadcastChannel(CHANNEL_NAME);
    setChannel(bc);

    if (isDisplay) {
      bc.onmessage = (event) => {
        if (event.data.type === 'SYNC_STATE') {
          setState(event.data.state);
        }
      };
      
      // Request initial state on mount
      bc.postMessage({ type: 'REQUEST_STATE' });
    } else {
      bc.onmessage = (event) => {
        if (event.data.type === 'REQUEST_STATE') {
          // A display requested state, broadcast current state
          // Using a functional approach or ref for state might be needed here, 
          // but we can trust the broadcast for now.
          bc.postMessage({ type: 'SYNC_STATE', state: window.__lastCustomerDisplayState || {
             status: 'IDLE', items: [], subtotal: 0, discount: 0, total: 0 
          } });
        }
      };
    }

    return () => {
      bc.close();
    };
  }, [isDisplay]);

  const updateState = useCallback((newState: Partial<CustomerDisplayState>) => {
    if (isDisplay) return; // Display only receives
    
    setState((prev) => {
      const updated = { ...prev, ...newState };
      window.__lastCustomerDisplayState = updated;
      if (channel) {
        channel.postMessage({ type: 'SYNC_STATE', state: updated });
      }
      return updated;
    });
  }, [channel, isDisplay]);

  const setIdle = useCallback(() => updateState({ status: 'IDLE', items: [], subtotal: 0, discount: 0, total: 0, amountPaid: 0, change: 0, paymentMethod: undefined }), [updateState]);
  const updateCart = useCallback((items: SaleItem[], subtotal: number, discount: number, total: number) => updateState({ status: 'CART', items, subtotal, discount, total }), [updateState]);
  const startPayment = useCallback((method: PaymentMethodType, pixData?: {qr: string, key: string}) => updateState({ status: 'PAYMENT', paymentMethod: method, pixQrCode: pixData?.qr, pixKey: pixData?.key }), [updateState]);
  const updatePayment = useCallback((amountPaid: number, change: number) => updateState({ amountPaid, change }), [updateState]);
  const completeSale = useCallback(() => updateState({ status: 'COMPLETE' }), [updateState]);

  return {
    state,
    setIdle,
    updateCart,
    startPayment,
    updatePayment,
    completeSale,
  };
}

declare global {
  interface Window {
    __lastCustomerDisplayState: CustomerDisplayState;
  }
}
