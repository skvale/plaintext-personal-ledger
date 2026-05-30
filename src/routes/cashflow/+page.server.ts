import type { PageServerLoad } from './$types';
import { getCashFlow } from '$lib/hledger.server.js';

export const load: PageServerLoad = async ({ url }) => {
  const monthsParam = url.searchParams.get('months');
  const months = monthsParam !== null ? Number(monthsParam) : 1;
  const data = await getCashFlow(months);
  return { data, months };
};
