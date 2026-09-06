import { db } from '../db';

const KNOWN_TABLES = new Set([
  'products', 'categories', 'stockMovements', 'priceHistories', 'sales',
  'customers', 'debtRecords', 'cashSessions', 'cashMovements', 'settings',
  'users', 'syncOutbox'
]);

/**
 * Valida a ESTRUTURA de um backup antes de qualquer escrita. Nunca permita que
 * um arquivo inválido apague silenciosamente os dados existentes.
 * Retorna null se OK, ou a mensagem do erro encontrado.
 */
export function validateBackupData(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return 'Arquivo de backup inválido: esperado um objeto contendo as tabelas.';
  }

  const record = data as Record<string, unknown>;
  const knownKeys = Object.keys(record).filter(k => KNOWN_TABLES.has(k));

  if (knownKeys.length === 0) {
    return 'Arquivo de backup inválido: nenhuma tabela conhecida encontrada no arquivo.';
  }

  for (const key of knownKeys) {
    if (!Array.isArray(record[key])) {
      return `Arquivo de backup inválido: a tabela "${key}" não é uma lista de registros.`;
    }
  }

  return null;
}

export async function exportDatabaseToJson(): Promise<string> {
  const data: Record<string, any[]> = {};
  
  for (const table of db.tables) {
    data[table.name] = await table.toArray();
  }
  
  return JSON.stringify(data);
}

export function downloadJson(jsonString: string, filename: string) {
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importDatabaseFromJson(jsonString: string): Promise<void> {
  try {
    let data: unknown;
    try {
      data = JSON.parse(jsonString);
    } catch {
      throw new Error('Arquivo de backup corrompido: não é um JSON válido.');
    }

    // Valida a estrutura ANTES de tocar na base — um arquivo errado nunca
    // pode apagar dados existentes.
    const validationError = validateBackupData(data);
    if (validationError) {
      throw new Error(validationError);
    }

    const backup = data as Record<string, unknown[]>;

    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        // Limpa SEMPRE: se a tabela não vier no backup, ela deve ficar vazia
        // e não preservar dados antigos (antes, tabelas ausentes não eram limpas).
        await table.clear();
        const rows = backup[table.name];
        if (rows && rows.length > 0) {
          await table.bulkAdd(rows);
        }
      }
    });
    console.log('Database restored successfully');
  } catch (error) {
    console.error('Failed to import database:', error);
    throw error;
  }
}
