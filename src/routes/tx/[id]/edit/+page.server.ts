import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  getTransactionForEdit,
  updateTransaction,
  getAccountNames,
  getVendors,
  addAccountDeclaration
} from '$lib/hledger.server.js';

export const load: PageServerLoad = async ({ params, url }) => {
  const ref = url.searchParams.get('ref') ?? '/register';
  const [txn, accounts, vendorRows] = await Promise.all([
    getTransactionForEdit(params.id),
    getAccountNames(),
    getVendors()
  ]);

  if (!txn) redirect(303, ref);
  const vendors = vendorRows.map((p) => p.vendor);
  return { txn, accounts, vendors, ref };
};

export const actions: Actions = {
  update: async ({ params, request, url }) => {
    const ref = url.searchParams.get('ref') ?? '/register';
    const data = await request.formData();

    const date = (data.get('date') as string)?.trim();
    const vendor = (data.get('vendor') as string)?.trim();
    const note = (data.get('note') as string)?.trim();
    const postingsJson = data.get('postings') as string;

    if (!date) return fail(400, { error: 'Date is required' });
    if (!vendor) return fail(400, { error: 'Vendor is required' });

    const description = note ? `${vendor} | ${note}` : vendor;

    let postings: { account: string; amount: string }[];
    try {
      postings = JSON.parse(postingsJson);
    } catch {
      return fail(400, { error: 'Invalid postings data' });
    }

    const filled = postings.filter((p) => p.account.trim());
    if (filled.length < 2) return fail(400, { error: 'At least 2 postings required' });

    // Declare any new accounts so they show up in the accounts list
    const knownAccounts = await getAccountNames();
    const newAccounts = [...new Set(filled.map(p => p.account.trim()))].filter(a => !knownAccounts.includes(a));
    for (const acct of newAccounts) {
      await addAccountDeclaration(acct);
    }

    const result = await updateTransaction(params.id, { date, description, postings: filled });
    if (!result.success) return fail(422, { error: result.error ?? 'Update failed' });

    // Redirect back to register if ref was empty (default), otherwise go to detail page
    // If ref=/register, users typically want to go back to register after edit
    const redirectUrl = ref === '/register' ? ref : `/tx/${params.id}?ref=${encodeURIComponent(ref)}`;
    redirect(303, redirectUrl);
  }
};
