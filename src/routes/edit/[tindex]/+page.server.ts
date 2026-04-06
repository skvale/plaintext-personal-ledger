import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTransactionForEdit } from '$lib/hledger.server.js';

// Legacy redirect: /edit/123 → /tx/123 (or /tx/<txid> if available)
export const load: PageServerLoad = async ({ params, url }) => {
  const ref = url.searchParams.get('ref') ?? '/register';
  const txn = await getTransactionForEdit(params.tindex);
  const id = txn?.txid ?? params.tindex;
  redirect(301, `/tx/${id}?ref=${encodeURIComponent(ref)}`);
};
