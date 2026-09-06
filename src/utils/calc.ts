export function calculateSmartChange(changeAmount: number) {
  let remaining = Math.round(changeAmount * 100);
  const result: { value: number; count: number; type: 'NOTE' | 'COIN' }[] = [];
  
  const moneyTypes = [
    { value: 20000, type: 'NOTE' },
    { value: 10000, type: 'NOTE' },
    { value: 5000, type: 'NOTE' },
    { value: 2000, type: 'NOTE' },
    { value: 1000, type: 'NOTE' },
    { value: 500, type: 'NOTE' },
    { value: 200, type: 'NOTE' },
    { value: 100, type: 'COIN' },
    { value: 50, type: 'COIN' },
    { value: 25, type: 'COIN' },
    { value: 10, type: 'COIN' },
    { value: 5, type: 'COIN' },
    { value: 1, type: 'COIN' }
  ] as const;

  for (const money of moneyTypes) {
    if (remaining >= money.value) {
      const count = Math.floor(remaining / money.value);
      remaining = remaining % money.value;
      result.push({
        value: money.value / 100,
        count,
        type: money.type
      });
    }
  }

  return result;
}

export function calculateMargin(cost: number, sell: number): number {
  if (sell <= 0) return 0;
  return ((sell - cost) / sell) * 100;
}

export function calculateMarkup(cost: number, sell: number): number {
  if (cost <= 0) return 0;
  return ((sell - cost) / cost) * 100;
}

export function calculateSellPrice(cost: number, desiredMarginPercentage: number): number {
  if (desiredMarginPercentage >= 100) return cost; // Evitar divisão por zero ou negativa
  const multiplier = 1 - (desiredMarginPercentage / 100);
  return Number((cost / multiplier).toFixed(2));
}

export function calculateMaxCost(sell: number, desiredMarginPercentage: number): number {
  return Number((sell * (1 - (desiredMarginPercentage / 100))).toFixed(2));
}

export function convertAlternativeUnitStock(qty: number, factor: number): number {
  return Number((qty * factor).toFixed(3));
}

/**
 * Converte uma quantidade vendida na unidade alternativa (fração) para a
 * unidade do pacote/embalagem. Usada para baixar estoque e calcular autonomia.
 * Ex.: 3 cigarros avulsos com fator 20 → 0.15 pacotes.
 */
export function toPackUnits(quantity: number, factor?: number): number {
  return factor && factor > 0 ? Number((quantity / factor).toFixed(3)) : quantity;
}
