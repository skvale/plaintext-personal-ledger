import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  getForecast,
  materializePastDue,
  getRecurringRules,
  saveRecurringRules,
  appendRecurringRule,
  getAccountNames,
  getNetWorth,
  getMonthSummary,
  getAccountBalances
} from '$lib/hledger.server.js';
import type { ForecastTransaction, RecurringRule } from '$lib/hledger.server.js';

export const load: PageServerLoad = async ({ url }) => {
  const months = Number(url.searchParams.get('months') ?? '3');
  const [transactions, netWorth, currentMonth, allBalances, rules, accounts] = await Promise.all([
    getForecast(months),
    getNetWorth(),
    getMonthSummary('thismonth'),
    getAccountBalances(),
    getRecurringRules(),
    getAccountNames()
  ]);

  // Build a map of current balances for asset/liability accounts (funding sources)
  const accountBalances: Record<string, number> = {};
  for (const b of allBalances) {
    if (b.name.startsWith('assets') || b.name.startsWith('liabilities')) {
      accountBalances[b.name] = b.amount;
    }
  }

  return { transactions, months, netWorth, currentMonth, accountBalances, rules, accounts };
};

export const actions: Actions = {
  materialize: async ({ request }) => {
    const data = await request.formData();
    const json = data.get('transactions') as string;
    const shouldUpdateRule = data.get('updateRule') === 'true';

    let transactions: ForecastTransaction[];
    try {
      transactions = JSON.parse(json);
    } catch {
      return fail(400, { error: 'Invalid data' });
    }

    // Optionally sync updated amounts back to the recurring rule
    if (shouldUpdateRule && transactions.length === 1) {
      const tx = transactions[0];
      const rules = await getRecurringRules();
      const ruleIdx = rules.findIndex(
        (r) => (r.description ?? '') === tx.description
      );
      if (ruleIdx >= 0) {
        const rule = rules[ruleIdx];
        rules[ruleIdx] = {
          ...rule,
          postings: rule.postings.map((p, i) => {
            const newAmt = tx.postings[i];
            if (!newAmt || newAmt.auto) return p;
            const sign = newAmt.amount < 0 ? '-' : '';
            return { ...p, amount: `$${sign}${Math.abs(newAmt.amount).toFixed(2)}` };
          })
        };
        const saveResult = await saveRecurringRules(rules);
        if (!saveResult.success) return fail(422, { error: saveResult.error ?? 'Rule update failed' });
      }
    }

    const result = await materializePastDue(transactions);
    if (!result.success) return fail(422, { error: result.error ?? 'Failed' });
    return { materialized: true };
  },

  addRule: async ({ request }) => {
    const data = await request.formData();
    const frequency = (data.get('frequency') as string)?.trim();
    const from = (data.get('from') as string)?.trim() || undefined;
    const description = (data.get('description') as string)?.trim() || undefined;
    const postingsJson = data.get('postings') as string;

    if (!frequency) return fail(400, { addError: 'Frequency is required' });

    let postings: { account: string; amount: string }[];
    try { postings = JSON.parse(postingsJson); }
    catch { return fail(400, { addError: 'Invalid postings data' }); }

    const filled = postings.filter((p) => p.account.trim());
    if (filled.length < 2) return fail(400, { addError: 'At least 2 postings are required' });

    const result = await appendRecurringRule({ id: -1, frequency, from, description, postings: filled });
    if (!result.success) return fail(422, { addError: result.error ?? 'Validation failed' });
    return { ruleSaved: true };
  },

  saveRules: async ({ request }) => {
    const data = await request.formData();
    const json = data.get('rules') as string;
    let rules: RecurringRule[];
    try { rules = JSON.parse(json); }
    catch { return fail(400, { saveError: 'Invalid data' }); }

    const result = await saveRecurringRules(rules);
    if (!result.success) return fail(422, { saveError: result.error ?? 'Save failed' });
    return { ruleSaved: true };
  }
};
