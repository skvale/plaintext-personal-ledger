import type { PageServerLoad } from './$types';
import { getVendors, getVendorsMultiMonth } from '$lib/hledger.server.js';

export const load: PageServerLoad = async ({ url }) => {
  const monthCount = parseInt(url.searchParams.get('months') ?? '1');
  const [vendors, multiMonth] = await Promise.all([
    getVendors(),
    getVendorsMultiMonth(monthCount)
  ]);
  return { vendors, multiMonth, monthCount };
};
