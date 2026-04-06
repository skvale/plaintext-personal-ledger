import { fail } from '@sveltejs/kit';
import {
  getUncategorizedTransactions,
  getAccountNames,
  getRulesFiles,
  getRulePatternsByFile,
  getTxnSuggestions,
  getSettings,
  recategorize,
  recategorizeMany,
  appendRule
} from '$lib/hledger.server.js';
import type { Actions, PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
  const [transactions, accounts, rulesFiles, rulePatterns] = await Promise.all([
    getUncategorizedTransactions(),
    getAccountNames(),
    getRulesFiles(),
    getRulePatternsByFile()
  ]);

  const settings = await getSettings();
  const suggestionsEnabled = settings.import?.suggestions !== false;
  const suggestions = suggestionsEnabled && transactions.length
    ? await getTxnSuggestions(transactions.map((t) => t.description))
    : {};

  return { transactions, accounts, rulesFiles, rulePatterns, suggestions };
};

export const actions: Actions = {
  recategorize: async ({ request }) => {
    const fd = await request.formData();
    const tindex = parseInt((fd.get('tindex') as string | null) ?? '', 10);
    const newAccount = ((fd.get('account') as string | null) ?? '').trim();

    if (isNaN(tindex)) return fail(400, { tindex: -1, error: 'Invalid transaction' });
    if (!newAccount) return fail(400, { tindex, error: 'Please enter an account' });

    const result = await recategorize(tindex, newAccount);
    if (!result.success) return fail(400, { tindex, error: result.error ?? 'Failed' });

    const rulesFile = ((fd.get('rulesFile') as string | null) ?? '').trim();
    const pattern = ((fd.get('pattern') as string | null) ?? '').trim();
    if (rulesFile && pattern) {
      await appendRule(rulesFile, pattern, newAccount);
    }

    return { tindex, success: true };
  },

  recategorizeMany: async ({ request }) => {
    const fd = await request.formData();
    const tindexesJson = (fd.get('tindexes') as string | null) ?? '[]';
    const newAccount = ((fd.get('account') as string | null) ?? '').trim();

    if (!newAccount) return fail(400, { error: 'Missing account' });

    let tindexes: number[];
    try { tindexes = JSON.parse(tindexesJson); }
    catch { return fail(400, { error: 'Invalid tindexes' }); }

    const result = await recategorizeMany(tindexes, newAccount);
    if (!result.success) return fail(400, { error: result.error ?? 'Failed' });
    return { bulkSuccess: true, count: tindexes.length };
  }
};
