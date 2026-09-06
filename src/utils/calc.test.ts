import { describe, it, expect } from 'vitest';
import {
  calculateSmartChange,
  calculateMargin,
  calculateMarkup,
  calculateSellPrice,
  calculateMaxCost,
  convertAlternativeUnitStock,
  toPackUnits,
} from './calc';

describe('calculateSmartChange (troco)', () => {
  it('decompõe o troco em notas e moedas sem sobrar centavos', () => {
    const result = calculateSmartChange(48.76);
    const totalCents = result.reduce((acc, r) => acc + r.value * 100 * r.count, 0);
    expect(totalCents).toBe(4876);
    // Deve conter uma nota de 20, uma de 10, etc.
    expect(result.find(r => r.value === 20)?.count).toBe(2);
    expect(result.find(r => r.value === 5)?.count).toBe(1);
    expect(result.find(r => r.value === 2)?.count).toBe(1);
    expect(result.find(r => r.value === 1)?.count).toBe(1);
    expect(result.find(r => r.value === 0.5)?.count).toBe(1);
    expect(result.find(r => r.value === 0.25)?.count).toBe(1);
    expect(result.find(r => r.value === 0.01)?.count).toBe(1);
  });

  it('retorna lista vazia para troco zero', () => {
    expect(calculateSmartChange(0)).toEqual([]);
  });

  it('lida com centavos exatos (ex.: 0.05)', () => {
    const result = calculateSmartChange(0.05);
    const totalCents = result.reduce((acc, r) => acc + r.value * 100 * r.count, 0);
    expect(totalCents).toBe(5);
  });
});

describe('calculateMargin / calculateMarkup', () => {
  it('margem = (venda - custo) / venda', () => {
    expect(calculateMargin(6.5, 10)).toBeCloseTo(35, 5);
  });

  it('margem 0 quando preço de venda é zero', () => {
    expect(calculateMargin(5, 0)).toBe(0);
  });

  it('margem negativa quando vende abaixo do custo', () => {
    expect(calculateMargin(10, 8)).toBeLessThan(0);
  });

  it('markup = (venda - custo) / custo', () => {
    expect(calculateMarkup(6.5, 10)).toBeCloseTo(53.846, 3);
  });

  it('markup 0 quando custo é zero', () => {
    expect(calculateMarkup(0, 10)).toBe(0);
  });
});

describe('calculateSellPrice / calculateMaxCost', () => {
  it('preço de venda a partir de custo e margem desejada', () => {
    // custo 10 com margem 35% -> 10 / (1 - 0.35) = 15.38
    expect(calculateSellPrice(10, 35)).toBe(15.38);
  });

  it('protege contra margem >= 100% (não divide por zero)', () => {
    expect(calculateSellPrice(10, 100)).toBe(10);
    expect(calculateSellPrice(10, 150)).toBe(10);
  });

  it('custo máximo suportado por preço e margem', () => {
    // venda 20 com margem 35% -> 20 * (1 - 0.35) = 13
    expect(calculateMaxCost(20, 35)).toBe(13);
  });
});

describe('unidades fracionadas (fator de conversão)', () => {
  it('converte estoque da unidade alternativa para a do pacote', () => {
    expect(convertAlternativeUnitStock(0.15, 20)).toBe(3);
  });

  it('toPackUnits: converte fração vendida para pacotes', () => {
    // 3 avulsos de um produto com fator 20 = 0.15 pacotes
    expect(toPackUnits(3, 20)).toBe(0.15);
  });

  it('toPackUnits: sem fator mantém a quantidade (unidade normal)', () => {
    expect(toPackUnits(5, undefined)).toBe(5);
    expect(toPackUnits(5)).toBe(5);
  });

  it('toPackUnits: fator inválido (0 ou negativo) não divide', () => {
    expect(toPackUnits(3, 0)).toBe(3);
    expect(toPackUnits(3, -1)).toBe(3);
  });

  it('conversão de volta: pacotes vendidos viram quantidade da fração', () => {
    // 0.15 pacote * 20 = 3 unidades avulsas
    expect(convertAlternativeUnitStock(0.15, 20)).toBe(3);
  });
});