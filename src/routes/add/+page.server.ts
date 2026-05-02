import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getAccountNames, getVendors, appendTransaction, addAccountDeclaration } from '$lib/hledger.server.js';

export const load: PageServerLoad = async ({ url }) => {
  const [accounts, vendorRows] = await Promise.all([getAccountNames(), getVendors()]);
  const vendors = vendorRows.map((p) => p.vendor);
  return { accounts, vendors };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const data = await request.formData();

    const date = (data.get('date') as string)?.trim();
    const vendor = (data.get('vendor') as string)?.trim();
    const note = (data.get('note') as string)?.trim();
    const postingsJson = data.get('postings') as string;

    if (!date) return fail(400, { error: 'Date is required', date, vendor, note });
    if (!vendor) return fail(400, { error: 'Vendor is required', date, vendor, note });

    const description = note ? `${vendor} | ${note}` : vendor;

    let postings: { account: string; amount: string }[];
    try {
      postings = JSON.parse(postingsJson);
    } catch {
      return fail(400, { error: 'Invalid postings data', date, vendor, note });
    }

    const filled = postings.filter((p) => p.account.trim());
    if (filled.length < 2) {
      return fail(400, { error: 'At least 2 postings are required', date, vendor, note });
    }

    // Declare any new accounts so they show up in the accounts list
    const knownAccounts = await getAccountNames();
    const newAccounts = [...new Set(filled.map(p => p.account.trim()))].filter(a => !knownAccounts.includes(a));
    for (const acct of newAccounts) {
      await addAccountDeclaration(acct);
    }

    const result = await appendTransaction({ date, description, postings: filled });
    if (!result.success) {
      return fail(422, { error: result.error ?? 'Validation failed', date, vendor, note });
    }

    const from = new URL(request.url).searchParams.get('from') ?? '/register';
    redirect(303, from);
  }
};
