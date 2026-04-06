import type { Actions, PageServerLoad } from './$types.js';
import { fail } from '@sveltejs/kit';
import { appendTransaction, getSettings, getAccountNames, getTransactions, getDefaultCommodity, setDefaultCommodity, isHledgerAvailable, getHledgerVersion } from '$lib/hledger.server.js';

export const load: PageServerLoad = async () => {
  const hledgerOk = await isHledgerAvailable();
  const hledgerInfo = await getHledgerVersion();
  const hledgerVersion = hledgerInfo?.version ?? '';

  const [settings, accounts, txns, commodity] = await Promise.all([
    getSettings(),
    hledgerOk ? getAccountNames() : Promise.resolve([]),
    hledgerOk ? getTransactions({ account: 'equity:opening balances' }) : Promise.resolve([]),
    hledgerOk ? getDefaultCommodity() : Promise.resolve('$1,000.00')
  ]);

  // Find existing opening balances transaction
  const openingTxn = txns.find(t =>
    t.description.toLowerCase().includes('opening balance')
  ) ?? null;

  return { accounts, openingTxn, commodity, hledgerOk, hledgerVersion, hledgerSupported: hledgerInfo?.supported ?? false, hledgerMessage: hledgerInfo?.message };
};

export const actions: Actions = {
  openingBalances: async ({ request }) => {
    const fd = await request.formData();
    const date = (fd.get('date') as string) || new Date().toISOString().slice(0, 10);
    const rows = fd.getAll('account').map((a, i) => {
      let amount = (fd.getAll('amount')[i] as string).trim();
      // Prepend $ if the user typed a bare number
      if (amount && /^-?[\d,]+(\.\d+)?$/.test(amount)) {
        amount = amount.startsWith('-') ? `-$${amount.slice(1)}` : `$${amount}`;
      }
      return { account: (a as string).trim(), amount };
    }).filter(r => r.account && r.amount);

    if (rows.length === 0) {
      return fail(400, { error: 'Add at least one account with an amount' });
    }

    const postings = [
      ...rows,
      { account: 'equity:opening balances', amount: '' }
    ];

    const result = await appendTransaction({
      date,
      description: 'opening balances',
      postings
    });

    if (!result.success) {
      return fail(400, { error: result.error ?? 'Failed to save' });
    }

    return { success: true };
  },

  setCommodity: async ({ request }) => {
    const fd = await request.formData();
    const directive = (fd.get('commodity') as string)?.trim();
    if (!directive) return fail(400, { error: 'Commodity directive is required' });
    await setDefaultCommodity(directive);
    return { commoditySuccess: true };
  }
};
