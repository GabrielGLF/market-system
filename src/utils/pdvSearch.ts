import { db } from '../db';
import type { Product } from '../types';

/**
 * Motor de busca do PDV, desenhado para catálogos grandes.
 *
 * Antes: a cada tecla, `db.products.filter(...)` varria TODA a tabela dentro
 * do useLiveQuery — com 5.000 produtos eram 5.000 serializações completas por
 * tecla, e cada venda re-disparava a varredura (o live query observa a tabela).
 *
 * Agora: cache incremental de documentos mínimos de busca — produtos entram/
 * saem do cache via índice `updatedAt` (revalida só o que mudou, com sobreposição
 * de 5s para writes no mesmo milissegundo), a busca por termo roda em memória
 * sobre esses documentos (sem tocar o IndexedDB) e só os resultados são
 * materializados via bulkGet. Produtos apagados se auto-removem do cache
 * (bulkGet retorna undefined → delete).
 */

interface SearchDoc {
  id: string;
  nameLower: string;
  skuLower: string;
  barcode: string;
  altBarcode: string;
  categoryId: string;
  active: boolean;
}

const cache = new Map<string, SearchDoc>();

/** Timestamp (ms) da última revalidação. 0 = cache ainda vazio. */
let lastSyncedAt = 0;

/** Sobreposição na revalidação incremental (protege writes no mesmo ms). */
const OVERLAP_MS = 5000;

async function revalidate(): Promise<void> {
  if (lastSyncedAt === 0) {
    // Carga inicial: uma varredura completa, uma única vez por sessão.
    const all = await db.products.toArray();
    for (const p of all) cache.set(p.id, toDoc(p));
    lastSyncedAt = Date.now();
    return;
  }

  const from = new Date(Math.max(0, lastSyncedAt - OVERLAP_MS)).toISOString();
  const changed = await db.products.where('updatedAt').above(from).toArray();
  if (changed.length === 0) return;

  let maxTs = lastSyncedAt;
  for (const p of changed) {
    cache.set(p.id, toDoc(p));
    const ts = p.updatedAt ? new Date(p.updatedAt).getTime() : Date.now();
    if (ts > maxTs) maxTs = ts;
  }
  lastSyncedAt = maxTs;
}

function toDoc(p: Product): SearchDoc {
  return {
    id: p.id,
    nameLower: (p.name || '').toLowerCase(),
    skuLower: (p.sku || '').toLowerCase(),
    barcode: p.barcode || '',
    altBarcode: p.alternativeUnit?.barcode || '',
    categoryId: p.categoryId || '',
    active: p.isActive,
  };
}

/** Pontuação de relevância — menor = melhor. */
function scoreMatch(doc: SearchDoc, lower: string): number {
  if (doc.barcode === lower) return 0;          // código de barras completo (leitor/bipe)
  if (doc.skuLower.startsWith(lower)) return 1; // SKU prefixo
  if (doc.nameLower.startsWith(lower)) return 2; // nome começando com o termo
  if (doc.barcode.startsWith(lower)) return 3;
  if (doc.nameLower.includes(lower)) return 4;
  if (doc.skuLower.includes(lower)) return 5;
  return -1; // não casou
}

/**
 * Busca produtos do PDV por termo + categoria.
 *
 * Custo por tecla: O(catálogo) sobre objetos mínimos em memória (sem IndexedDB,
 * sem serialização estruturada) + O(resultados) leituras indexadas. Código de
 * barras exato é O(log n) direto no índice.
 */
export async function searchProducts(
  term: string,
  categoryId: string | null,
  limit = 60
): Promise<Product[]> {
  await revalidate();

  const trimmed = term.trim();
  const lower = trimmed.toLowerCase();

  // Código de barras/SKU exato: caminho rápido via índice, sem varredura.
  if (lower && /^\d{6,}$/.test(trimmed)) {
    const byBarcode = await db.products.where('barcode').equals(trimmed).first();
    if (byBarcode && byBarcode.isActive && (!categoryId || byBarcode.categoryId === categoryId)) {
      return [byBarcode];
    }
  }

  const matches: { doc: SearchDoc; score: number }[] = [];
  for (const doc of cache.values()) {
    if (!doc.active) continue;
    if (categoryId && doc.categoryId !== categoryId) continue;
    if (lower) {
      const score = scoreMatch(doc, lower);
      // Código de barras alternativo (fração) casa por igualdade exata.
      if (score < 0 && !(doc.altBarcode && doc.altBarcode === trimmed)) continue;
      matches.push({ doc, score: score < 0 ? 6 : score });
    } else {
      matches.push({ doc, score: 0 });
    }
  }

  matches.sort((a, b) => a.score - b.score);
  const top = matches.slice(0, limit);
  if (top.length === 0) return [];

  const ids = top.map(m => m.doc.id);
  const products = await db.products.bulkGet(ids);

  const out: Product[] = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (!p) {
      // Produto apagado após o cache: auto-cura.
      cache.delete(ids[i]);
      continue;
    }
    if (p.isActive) out.push(p);
  }
  return out;
}

export interface ProductByCodeResult {
  product: Product;
  /** true quando o código casou com o da unidade alternativa (fração). */
  isAlternative: boolean;
}

/**
 * Localiza um produto pelo código lido (scanner USB, câmera ou celular).
 * O(1)-ish: índice `barcode` e índice `alternativeUnit.barcode` — nunca varre a tabela.
 */
export async function getProductByCode(code: string): Promise<ProductByCodeResult | null> {
  const direct = await db.products.where('barcode').equals(code).first();
  if (direct && direct.isActive) return { product: direct, isAlternative: false };

  const viaAlt = await db.products
    .where('alternativeUnit.barcode')
    .equals(code)
    .first();
  if (viaAlt && viaAlt.isActive) return { product: viaAlt, isAlternative: true };

  return null;
}

/** Nº de documentos em cache (exposto para testes/diagnóstico). */
export function cacheSize(): number {
  return cache.size;
}

/** Zera o cache (testes). */
export function resetCache(): void {
  cache.clear();
  lastSyncedAt = 0;
}
