import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getAccountsWithUncleared, getReconcileData, setTransactionCleared } from '$lib/hledger.server.js';

export const load: PageServerLoad = async ({ url }) => {
  const account = url.searchParams.get('account') ?? '';

  const reconcilableAccounts = await getAccountsWithUncleared();

  if (!account) {
    return { account: '', reconcilableAccounts, transactions: [], clearedBalance: 0 };
  }

  const { transactions, clearedBalance } = await getReconcileData(account);
  return { account, reconcilableAccounts, transactions, clearedBalance };
};

export const actions: Actions = {
  toggle: async ({ request }) => {
    const data = await request.formData();
    const tindex = parseInt(data.get('tindex') as string);
    const cleared = data.get('cleared') === 'true';
    const account = data.get('account') as string;

    const result = await setTransactionCleared(tindex, cleared, account);
    if (!result.success) return fail(422, { error: result.error });
    return { toggled: true };
  }
};
