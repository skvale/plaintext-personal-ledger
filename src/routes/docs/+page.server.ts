import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  getDocuments,
  getAccountNames,
  uploadDocument,
  appendTransaction,
  getRulesFiles,
  getRulesContent,
  importCsvPreviewPath,
  importCsvConfirm,
  appendRule,
  getTransactionDocs,
  getTxnSuggestions,
  getSettings,
  STATEMENTS_DIR,
  detectCsvDefaults,
  generateRulesFromCsvContent,
  parseRulesFile,
  saveRulesFile,
  type DocFolder
} from '$lib/hledger.server.js';
import { join, resolve } from 'node:path';

function detectGaps(folders: DocFolder[]): string[] {
  const monthFolders = folders
    .map((f) => {
      const m = f.name.match(/(\d{4}-\d{2})$/);
      return m ? { month: m[1], files: f.files.map((x) => x.name) } : null;
    })
    .filter(Boolean) as { month: string; files: string[] }[];

  const byFile: Record<string, string[]> = {};
  for (const { month, files } of monthFolders) {
    for (const name of files) {
      if (!name.endsWith('.csv')) continue;
      (byFile[name] ??= []).push(month);
    }
  }

  const gaps: string[] = [];
  for (const [name, months] of Object.entries(byFile)) {
    if (months.length < 2) continue;
    const sorted = [...months].sort();
    for (let i = 0; i < sorted.length - 1; i++) {
      const [y1, m1] = sorted[i].split('-').map(Number);
      const [y2, m2] = sorted[i + 1].split('-').map(Number);
      const diff = (y2 - y1) * 12 + (m2 - m1);
      for (let g = 1; g < diff; g++) {
        const totalMonth = m1 - 1 + g;
        const gy = y1 + Math.floor(totalMonth / 12);
        const gm = (totalMonth % 12) + 1;
        gaps.push(`${name} — ${gy}-${String(gm).padStart(2, '0')}`);
      }
    }
  }
  return gaps;
}

export const load: PageServerLoad = async () => {
  const [folders, accounts, rulesFiles, txnDocs] = await Promise.all([
    getDocuments(),
    getAccountNames(),
    getRulesFiles(),
    getTransactionDocs()
  ]);

  // Build relPath → transaction lookup
  const docTransactions: Record<string, { tindex: number; txid?: string; date: string; description: string; unpaid: boolean; amount: number; vendor: string }[]> = {};
  for (const td of txnDocs) {
    (docTransactions[td.docPath] ??= []).push({ tindex: td.tindex, txid: td.txid, date: td.date, description: td.description, unpaid: td.unpaid, amount: td.amount, vendor: td.vendor });
  }
  const paymentAccounts = accounts.filter(
    (a) => a.startsWith('assets:') || (a.startsWith('liabilities:') && !a.startsWith('liabilities:payable'))
  );
  const rulesContents: Record<string, string> = {};
  for (const file of rulesFiles) {
    try { rulesContents[file] = await getRulesContent(file); }
    catch { rulesContents[file] = ''; }
  }
  const today = new Date().toISOString().slice(0, 10);
  const expenseAccounts = accounts.filter((a) => a.startsWith('expenses:'));
  const gaps = detectGaps(folders);

  // Group folders by month so statements and invoices for the same month appear together
  const monthMap = new Map<string, { label: string; files: typeof folders[0]['files'] }[]>();
  for (const folder of folders) {
    const monthMatch = folder.name.match(/(\d{4}-\d{2})$/);
    if (monthMatch) {
      const month = monthMatch[1];
      const label = folder.name.replace(/\s*›?\s*\d{4}-\d{2}$/, '').trim();
      const sections = monthMap.get(month) ?? [];
      sections.push({ label, files: folder.files });
      monthMap.set(month, sections);
    }
  }
  const monthGroups = [...monthMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, sections]) => ({ month, sections }));

  return { folders, monthGroups, accounts, expenseAccounts, paymentAccounts, today, gaps, rulesFiles, rulesContents, docTransactions };
};

export const actions: Actions = {
  upload: async ({ request }) => {
    const data = await request.formData();
    const file = data.get('file') as File | null;
    const month = (data.get('month') as string)?.trim();

    if (!file || file.size === 0) return fail(400, { error: 'No file selected' });
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return fail(400, { error: 'Invalid month' });

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadDocument(month, file.name, buffer);
    if (!result.success) return fail(500, { error: result.error ?? 'Upload failed' });
    return { uploaded: true, relPath: result.relPath };
  },

  invoice: async ({ request }) => {
    const fd = await request.formData();
    const file = fd.get('file') as File | null;
    const date = (fd.get('date') as string)?.trim();
    const vendor = (fd.get('vendor') as string)?.trim();
    const description = (fd.get('description') as string)?.trim();
    const filenameOverride = (fd.get('filename') as string)?.trim() || undefined;
    const postingsJson = (fd.get('postings') as string) ?? '[]';
    const paid = fd.get('paid') === 'true';
    const payAccount = (fd.get('payAccount') as string)?.trim();

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, { invoiceError: 'Date required' });
    const month = date.slice(0, 7);
    const fullDescription = vendor && description ? `${vendor} | ${description}` : (vendor || description || '');
    if (!vendor && !description) return fail(400, { invoiceError: 'Vendor or description required' });

    let postings: { account: string; amount: string }[];
    try { postings = JSON.parse(postingsJson); } catch { return fail(400, { invoiceError: 'Invalid postings' }); }
    postings = postings.filter(p => p.account && p.amount);
    if (postings.length === 0) return fail(400, { invoiceError: 'At least one account and amount required' });
    if (paid && !payAccount) return fail(400, { invoiceError: 'Payment account required when marking as paid' });

    let comment: string | undefined;
    if (file && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const uploadResult = await uploadDocument(month, filenameOverride ?? file.name, buffer, 'bills');
      if (!uploadResult.success) return fail(500, { invoiceError: uploadResult.error ?? 'Upload failed' });
      comment = `doc: ${uploadResult.relPath}`;
    }

    const balanceAccount = paid ? payAccount! : 'liabilities:payable';
    const txnResult = await appendTransaction({
      date,
      description: fullDescription,
      comment,
      postings: [
        ...postings,
        { account: balanceAccount, amount: '' }
      ]
    });
    if (!txnResult.success) return fail(422, { invoiceError: txnResult.error ?? 'Transaction failed' });

    return { invoiced: true };
  },

  preview: async ({ request }) => {
    const fd = await request.formData();
    const csvRel = fd.get('csvRel') as string;
    const rulesFile = fd.get('rulesFile') as string;

    if (!csvRel || !rulesFile) return fail(400, { previewError: 'Missing file or rules.' });

    const abs = resolve(join(STATEMENTS_DIR, csvRel));
    if (!abs.startsWith(resolve(STATEMENTS_DIR))) return fail(403, { previewError: 'Forbidden.' });

    try {
      const { output, count, token } = await importCsvPreviewPath(abs, rulesFile);
      // Extract descriptions of unmapped transactions (those with expenses:unknown)
      const unmapped: string[] = [];
      const txBlocks = output.split(/(?=^\d{4}-\d{2}-\d{2})/m);
      for (const block of txBlocks) {
        if (block.includes('expenses:unknown') || block.includes('income:unknown')) {
          const firstLine = block.split('\n')[0]?.trim() ?? '';
          // Extract description: "2026-03-15 WHOLE FOODS" → "WHOLE FOODS"
          const desc = firstLine.replace(/^\d{4}-\d{2}-\d{2}\s*/, '').replace(/\s*\|.*$/, '').trim();
          if (desc && !unmapped.includes(desc)) unmapped.push(desc);
        }
      }
      const settings = await getSettings();
      const suggestionsEnabled = settings.import?.suggestions !== false;
      const suggestions = suggestionsEnabled && unmapped.length > 0 ? await getTxnSuggestions(unmapped) : {};
      return { preview: output, previewCount: count, token, selectedRules: rulesFile, unmapped, suggestions };
    } catch (e: any) {
      return fail(500, { previewError: e.message ?? 'Preview failed.' });
    }
  },

  pay: async ({ request }) => {
    const fd = await request.formData();
    const date = (fd.get('date') as string)?.trim();
    const vendor = (fd.get('vendor') as string)?.trim();
    const amount = (fd.get('amount') as string)?.trim();
    const paymentAccount = (fd.get('paymentAccount') as string)?.trim();
    const docPath = (fd.get('docPath') as string)?.trim();

    if (!date || !vendor || !amount || !paymentAccount)
      return fail(400, { payError: 'Missing fields.' });

    const result = await appendTransaction({
      date,
      description: vendor,
      comment: docPath ? `doc: ${docPath}` : undefined,
      postings: [
        { account: 'liabilities:payable', amount },
        { account: paymentAccount, amount: '' }
      ]
    });
    if (!result.success) return fail(422, { payError: result.error ?? 'Payment failed.' });
    return { paid: true };
  },

  confirm: async ({ request }) => {
    const fd = await request.formData();
    const token = (fd.get('token') as string | null) ?? '';

    if (!token) return fail(400, { importError: 'Missing session token — please re-preview.' });

    const result = await importCsvConfirm(token);
    if (!result.success) return fail(400, { importError: result.error ?? 'Import failed.' });
    return { importSuccess: true };
  },

  addMappings: async ({ request }) => {
    const fd = await request.formData();
    const rulesFile = (fd.get('rulesFile') as string) ?? '';
    const mappingsJson = (fd.get('mappings') as string) ?? '[]';

    if (!rulesFile) return fail(400, { mappingError: 'No rules file' });

    let mappings: { pattern: string; account: string }[];
    try { mappings = JSON.parse(mappingsJson); } catch { return fail(400, { mappingError: 'Invalid data' }); }

    const errors: string[] = [];
    for (const m of mappings) {
      if (!m.pattern || !m.account) continue;
      const result = await appendRule(rulesFile, m.pattern, m.account);
      if (!result.success && !result.duplicate) errors.push(`${m.pattern}: ${result.error}`);
    }

    if (errors.length) return fail(400, { mappingError: errors.join('; ') });
    return { mappingsSaved: true, count: mappings.filter(m => m.pattern && m.account).length };
  },

  createRuleFromCsv: async ({ request }) => {
    const fd = await request.formData();
    const csvRel = (fd.get('csvRel') as string | null) ?? '';

    if (!csvRel) return fail(400, { createRuleError: 'No CSV file selected' });

    const abs = resolve(join(STATEMENTS_DIR, csvRel));
    if (!abs.startsWith(resolve(STATEMENTS_DIR))) return fail(403, { createRuleError: 'Forbidden' });

    // Read the CSV file and generate rules
    const raw = await (await import('node:fs/promises')).readFile(abs, 'utf-8');
    // Extract just the filename without path or date prefix (e.g., "History" from "statements/2026-04/History.csv")
    const csvFileName = csvRel.split('/').pop()?.replace(/\.csv$/, '') ?? 'import';
    const rulesName = `${csvFileName.replace(/[^a-zA-Z0-9._-]/g, '-')}.rules`;
    const rulesContent = await generateRulesFromCsvContent(raw, rulesName);
    if (!rulesContent) return fail(400, { createRuleError: 'Could not generate rules from CSV' });

    const parsed = parseRulesFile(rulesContent);
    const result = await saveRulesFile(rulesName, parsed);
    if (!result.success) return fail(500, { createRuleError: result.error ?? 'Save failed' });

    return { createdFromCsv: rulesName };
  }
};
