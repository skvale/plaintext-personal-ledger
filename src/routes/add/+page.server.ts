import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getAccountNames, getVendors, appendTransaction, addAccountDeclaration } from '#lib/hledger.server.js';

export const load: PageServerLoad = async ({ url }) => {
  const [accounts, vendorRows] = await Promise.all([getAccountNames(), getVendors()]);
  const vendors = vendorRows.map((p) => p.vendor);
  return { accounts, vendors };
};

const FALLBACK_RETURN = '/register';

/** Accepts only same-origin relative paths, so `from` can never bounce off-site. */
function safeReturnTo(raw: string | null): string {
  if (!raw) return FALLBACK_RETURN;
  // Reject anything absolute or protocol-relative before parsing.
  if (!raw.startsWith('/') || raw.startsWith('//')) return FALLBACK_RETURN;
  let parsed: URL;
  try {
    parsed = new URL(raw, 'http://local.invalid');
  } catch {
    return FALLBACK_RETURN;
  }
  if (parsed.origin !== 'http://local.invalid') return FALLBACK_RETURN;
  const path = parsed.pathname + parsed.search;
  // Never bounce straight back to the form.
  if (path === '/add') return FALLBACK_RETURN;
  return path;
}

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

    // Only honour a same-origin relative path. Anything else means we don't
    // know where the user came from, so fall back to the register.
    const from = safeReturnTo(new URL(request.url).searchParams.get('from'));
    redirect(303, from);
  }
};
