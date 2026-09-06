import type { SaleItem } from '../types';

// Mecanismo de "Repetir Venda": um cliente fiel compra a mesma cesta
// repetidamente, então permitimos recarregar os itens de uma venda anterior
// direto no carrinho do PDV.
//
// Fluxos:
// 1. Histórico de Vendas (PDV desmontado): guardamos os itens no módulo
//    (pendingItems) e navegamos para o PDV — ao montar, ele consome o estado.
// 2. Cupom recém-finalizado (PDV já montado): disparamos o evento window
//    'market-system:repeat-sale' e o PDV escuta e aplica na hora.

const NAVIGATE_EVENT = 'market-system:navigate';
const REPEAT_SALE_EVENT = 'market-system:repeat-sale';

let pendingItems: SaleItem[] | null = null;

/** Pede para repetir uma venda: navega para o PDV e agenda o carregamento. */
export function requestRepeatSale(items: SaleItem[]) {
  if (!items || items.length === 0) return;
  pendingItems = items;
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: { view: 'pdv' } }));
  window.dispatchEvent(new CustomEvent(REPEAT_SALE_EVENT, { detail: { items } }));
}

/** Consome (e limpa) os itens pendentes — usado no mount do PDV. */
export function takePendingRepeatSale(): SaleItem[] | null {
  const items = pendingItems;
  pendingItems = null;
  return items;
}

/** Escuta o evento de repetição — usado enquanto o PDV está montado. */
export function subscribeRepeatSale(listener: (items: SaleItem[]) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail && Array.isArray(detail.items) && detail.items.length > 0) {
      // Consumido via evento (PDV já montado): limpa o estado pendente para
      // não reaplicar os itens num futuro mount do PDV.
      pendingItems = null;
      listener(detail.items as SaleItem[]);
    }
  };
  window.addEventListener(REPEAT_SALE_EVENT, handler);
  return () => window.removeEventListener(REPEAT_SALE_EVENT, handler);
}