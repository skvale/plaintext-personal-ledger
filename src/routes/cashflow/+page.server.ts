import type { PageServerLoad } from './$types';
import { getCashFlow } from '$lib/hledger.server.js';

export const load: PageServerLoad = async ({ url }) => {
  const months = Number(url.searchParams.get('months') ?? '6');
  const data = await getCashFlow(months);
  return { data, months };
};
