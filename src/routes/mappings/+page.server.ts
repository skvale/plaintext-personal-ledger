import { fail } from '@sveltejs/kit';
import {
  getRulesFiles,
  getRulesContent,
  parseRulesFile,
  saveRulesFile,
  renameRulesFile,
  rulesFileExists,
  getAccountNames,
  detectCsvDefaults,
  detectCsvFromPath,
  generateRulesFromCsv,
  generateRulesFromCsvContent,
  STATEMENTS_DIR,
} from '$lib/hledger.server.js';
import { loadKeywordIndex, saveKeywordIndex, suggestAccount } from '$lib/keywords.js';
import type { ParsedRulesFile } from '$lib/hledger/index.js';
import { resolve, join } from 'node:path';
import { readdir } from 'node:fs/promises';
import type { Actions, PageServerLoad } from './$types.js';

/** Recursively find all CSV files in STATEMENTS_DIR */
async function listCsvFiles(dir: string = STATEMENTS_DIR, prefix = ''): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) results.push(...await listCsvFiles(join(dir, e.name), rel));
      else if (e.name.endsWith('.csv')) results.push(rel);
    }
  } catch {}
  return results.sort();
}

export const load: PageServerLoad = async ({ url }) => {
  const rulesFiles = await getRulesFiles();
  const active = url.searchParams.get('file') ?? rulesFiles[0] ?? '';
  const csvParam = url.searchParams.get('csv');

  let parsed: ParsedRulesFile = { header: '', items: [] };
  let rawContent = '';
  let csvDefaults: Awaited<ReturnType<typeof detectCsvDefaults>> = null;
  
  // If csv param provided, detect defaults from that CSV and create a new rules file
  if (csvParam) {
    const abs = resolve(join(STATEMENTS_DIR, csvParam));
    csvDefaults = await detectCsvDefaults(abs);
  } else if (active) {
    csvDefaults = await detectCsvDefaults(active);
  }

  if (active) {
    try {
      rawContent = await getRulesContent(active);
      parsed = parseRulesFile(rawContent);
    } catch {}
  }

  const [accounts, csvFiles, userKeywords] = await Promise.all([
    getAccountNames(), listCsvFiles(), loadKeywordIndex()
  ]);
  return { rulesFiles, active, parsed, rawContent, accounts, csvDefaults, csvFiles, userKeywords };
};

/** Extract keyword→account pairs from all rules files and merge into keywords.json */
async function learnKeywordsFromRules(): Promise<void> {
  try {
    const files = await getRulesFiles();
    const index = await loadKeywordIndex();
    const newEntries = new Map<string, string>(); // keyword → account

    for (const file of files) {
      try {
        const content = await getRulesContent(file);
        const parsed = parseRulesFile(content);

        for (const item of parsed.items) {
          if (item.type === 'rule' && item.patterns && item.account) {
            const patterns = item.patterns.split(/\s*\|\s*/);
            for (const pattern of patterns) {
              const trimmed = pattern.trim().toLowerCase();
              if (trimmed.length > 1 && !index[item.account]?.includes(trimmed)) {
                newEntries.set(trimmed, item.account);
              }
            }
          }
        }
      } catch {
        // Skip files that can't be parsed
      }
    }

    // Add new keywords to the index
    let changed = false;
    for (const [keyword, account] of newEntries) {
      if (!index[account]) index[account] = [];
      if (!index[account].includes(keyword)) {
        index[account].push(keyword);
        changed = true;
      }
    }

    if (changed) {
      await saveKeywordIndex(index);
    }
  } catch {
    // Silently fail — keyword learning is non-critical
  }
}

export const actions: Actions = {
  save: async ({ request }) => {
    const fd = await request.formData();
    const filename = (fd.get('filename') as string | null) ?? '';
    const payloadJson = (fd.get('payload') as string | null) ?? '{}';

    if (!filename) return fail(400, { error: 'No filename' });

    let parsed: ParsedRulesFile;
    try {
      parsed = JSON.parse(payloadJson);
    } catch {
      return fail(400, { error: 'Invalid payload' });
    }

    const result = await saveRulesFile(filename, parsed);
    if (!result.success) return fail(500, { error: result.error ?? 'Save failed' });

    // Learn keywords from all rules files
    await learnKeywordsFromRules();

    return { saved: true };
  },

  saveRaw: async ({ request }) => {
    const fd = await request.formData();
    const filename = (fd.get('filename') as string | null) ?? '';
    const raw = (fd.get('raw') as string | null) ?? '';

    if (!filename) return fail(400, { error: 'No filename' });

    let parsed: ParsedRulesFile;
    try {
      parsed = parseRulesFile(raw);
    } catch (e: any) {
      return fail(400, { error: `Parse error: ${e.message}` });
    }

    const result = await saveRulesFile(filename, parsed);
    if (!result.success) return fail(500, { error: result.error ?? 'Save failed' });
    return { saved: true };
  },

  create: async ({ request }) => {
    const fd = await request.formData();
    let name = ((fd.get('name') as string | null) ?? '').trim();
    if (!name) return fail(400, { createError: 'Name required' });
    if (!name.endsWith('.rules')) name = `${name}.rules`;
    if (!/^[\w.-]+\.rules$/.test(name)) return fail(400, { createError: 'Invalid filename' });
    const result = await saveRulesFile(name, {
      header: 'skip 1',
      items: [{ type: 'rule', id: 'r0', patterns: 'EXAMPLE', account: 'expenses:unknown', assignments: [{ key: 'account2', value: 'expenses:unknown' }] }],
    });
    if (!result.success) return fail(500, { createError: result.error ?? 'Create failed' });
    return { created: name };
  },

  detect: async ({ request }) => {
    const fd = await request.formData();
    const csvRel = (fd.get('csvFile') as string | null) ?? '';

    if (!csvRel) return fail(400, { detectError: 'No CSV file selected' });

    const abs = resolve(join(STATEMENTS_DIR, csvRel));
    if (!abs.startsWith(resolve(STATEMENTS_DIR))) return fail(403, { detectError: 'Forbidden' });

    const result = await detectCsvFromPath(abs);
    if (!result) return fail(400, { detectError: 'Could not parse CSV' });

    // Include keywords for client-side suggestion matching
    const userKeywords = await loadKeywordIndex();
    return { detected: result, userKeywords };
  },

  createFromExistingCsv: async ({ request }) => {
    const fd = await request.formData();
    const csvRel = (fd.get('csvRel') as string | null) ?? '';

    if (!csvRel) return fail(400, { createCsvError: 'No CSV file selected' });

    const abs = resolve(join(STATEMENTS_DIR, csvRel));
    if (!abs.startsWith(resolve(STATEMENTS_DIR))) return fail(403, { createCsvError: 'Forbidden' });

    // Read the CSV file and generate rules
    const raw = await (await import('node:fs/promises')).readFile(abs, 'utf-8');
    const csvName = csvRel.replace(/\.csv$/, '');
    const rulesName = `${csvName.replace(/[^a-zA-Z0-9._-]/g, '-')}.rules`;
    const rulesContent = await generateRulesFromCsvContent(raw, rulesName);
    if (!rulesContent) return fail(400, { createCsvError: 'Could not generate rules from CSV' });

    const parsed = parseRulesFile(rulesContent);
    const result = await saveRulesFile(rulesName, parsed);
    if (!result.success) return fail(500, { createCsvError: result.error ?? 'Save failed' });

    return { createdFromCsv: rulesName };
  },

  createFromCsv: async ({ request }) => {
    const fd = await request.formData();
    const csvFile = fd.get('csvFile');

    if (!csvFile || typeof csvFile === 'string') return fail(400, { createCsvError: 'No CSV file selected' });

    const csvContent = await csvFile.text();
    const rawName = (csvFile as File).name.replace(/\.csv$/, '');
    const rulesName = `${rawName.replace(/[^a-zA-Z0-9._-]/g, '-')}.rules`;

    const rulesContent = await generateRulesFromCsvContent(csvContent, rulesName);
    if (!rulesContent) return fail(400, { createCsvError: 'Could not generate rules from CSV' });

    const parsed = parseRulesFile(rulesContent);
    const result = await saveRulesFile(rulesName, parsed);
    if (!result.success) return fail(500, { createCsvError: result.error ?? 'Save failed' });

    return { createdFromCsv: rulesName };
  },

  rename: async ({ request }) => {
    const fd = await request.formData();
    const oldName = (fd.get('oldName') as string | null) ?? '';
    let newName = ((fd.get('newName') as string | null) ?? '').trim();

    if (!oldName) return fail(400, { renameError: 'No filename' });
    if (!newName) return fail(400, { renameError: 'New name required' });
    if (!newName.endsWith('.rules')) newName = `${newName}.rules`;
    if (!/^[\w./-]+\.rules$/.test(newName)) return fail(400, { renameError: 'Invalid filename' });
    if (oldName === newName) return fail(400, { renameError: 'Same name' });

    if (await rulesFileExists(newName)) return fail(400, { renameError: 'File already exists' });

    const result = await renameRulesFile(oldName, newName);
    if (!result.success) return fail(500, { renameError: result.error ?? 'Rename failed' });

    return { renamed: newName };
  }
};
