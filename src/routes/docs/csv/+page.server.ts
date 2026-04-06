import { error } from '@sveltejs/kit';
import { STATEMENTS_DIR } from '$lib/hledger.server.js';
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { PageServerLoad } from './$types';

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  function splitLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current);
    return fields;
  }

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map(splitLine);
  return { headers, rows };
}

// Normalise various date formats to YYYY-MM-DD for comparison, returns null if unrecognised.
function normaliseDate(val: string): string | null {
  const iso = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const mdy = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  const dmy = val.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[1].padStart(2, '0')}-${dmy[2].padStart(2, '0')}`;
  return null;
}

function maxCsvDate(headers: string[], rows: string[][]): string | null {
  // Prefer columns whose header contains "date"
  const dateColIdx = headers.findIndex((h) => /date/i.test(h));
  const colsToCheck = dateColIdx >= 0
    ? [dateColIdx]
    : headers.map((_, i) => i);

  let max: string | null = null;
  for (const row of rows) {
    for (const ci of colsToCheck) {
      const norm = normaliseDate(row[ci] ?? '');
      if (norm && (!max || norm > max)) max = norm;
    }
  }
  return max;
}

export const load: PageServerLoad = async ({ url }) => {
  const rel = url.searchParams.get('p') ?? '';
  if (!rel) throw error(400, 'Missing path');

  const abs = resolve(join(STATEMENTS_DIR, rel));
  if (!abs.startsWith(resolve(STATEMENTS_DIR))) throw error(403, 'Forbidden');

  let text: string;
  try {
    text = await readFile(abs, 'utf-8');
  } catch {
    throw error(404, 'File not found');
  }

  const name = abs.split('/').pop() ?? rel;
  const dir = abs.split('/').slice(0, -1).join('/');
  const { headers, rows } = parseCsv(text);

  // Read .latest.FILENAME if it exists
  let latestImport: string | null = null;
  try {
    const content = await readFile(`${dir}/.latest.${name}`, 'utf-8');
    latestImport = content.trim().split('\n')[0] || null;
  } catch { /* not yet imported */ }

  const newestCsvDate = maxCsvDate(headers, rows);

  // import status:
  // 'never'    — no .latest file
  // 'complete' — .latest date >= newest date in CSV
  // 'partial'  — .latest date < newest date in CSV (new rows available)
  let importStatus: 'never' | 'complete' | 'partial';
  if (!latestImport) {
    importStatus = 'never';
  } else if (!newestCsvDate || latestImport >= newestCsvDate) {
    importStatus = 'complete';
  } else {
    importStatus = 'partial';
  }

  // Pass date column index so the client can mark imported rows
  const dateColIndex = headers.findIndex((h) => /date/i.test(h));

  return { name, rel, headers, rows, latestImport, newestCsvDate, importStatus, dateColIndex };
};
