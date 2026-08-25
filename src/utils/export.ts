import { db } from '../db';

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
    const data = JSON.parse(jsonString);
    
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        if (data[table.name]) {
          await table.clear();
          await table.bulkAdd(data[table.name]);
        }
      }
    });
    console.log('Database restored successfully');
  } catch (error) {
    console.error('Failed to import database:', error);
    throw error;
  }
}
