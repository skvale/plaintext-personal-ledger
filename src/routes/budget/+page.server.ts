import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  getBudgetEntries,
  saveBudgetEntries,
  getBudgetStatus,
  getAccountNames
} from '$lib/hledger.server.js';

export const load: PageServerLoad = async ({ url }) => {
  const period = url.searchParams.get('period') ?? 'thismonth';
  const [budgetStatus, entries, accounts] = await Promise.all([
    getBudgetStatus(period),
    getBudgetEntries(),
    getAccountNames()
  ]);
  return { budgetStatus, entries, accounts, period };
};

export const actions: Actions = {
  set: async ({ request }) => {
    const data = await request.formData();
    const account = (data.get('account') as string)?.trim();
    const amountStr = (data.get('amount') as string)?.trim();

    if (!account) return fail(400, { error: 'Account is required' });
    const amount = parseFloat(amountStr.replace(/[$,]/g, ''));
    if (isNaN(amount) || amount <= 0) return fail(400, { error: 'Amount must be a positive number' });

    const entries = await getBudgetEntries();
    const existing = entries.findIndex((e) => e.account === account);
    if (existing >= 0) entries[existing].amount = amount;
    else entries.push({ account, amount });
    await saveBudgetEntries(entries);
    return { saved: true };
  },

  remove: async ({ request }) => {
    const data = await request.formData();
    const account = (data.get('account') as string)?.trim();
    if (!account) return fail(400, { error: 'Account is required' });

    const entries = await getBudgetEntries();
    await saveBudgetEntries(entries.filter((e) => e.account !== account));
    return { removed: true };
  }
};
