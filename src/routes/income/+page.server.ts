import type { PageServerLoad } from './$types';
import { getMonthlyIncome, getIncomeStatementDetail, getMultiMonthPnL } from '$lib/hledger.server.js';

export const load: PageServerLoad = async ({ url }) => {
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const period = url.searchParams.get('period') ?? 'month';
  const monthsParam = url.searchParams.get('months');
  const monthCount = monthsParam !== null ? parseInt(monthsParam) : 1;

  // Build date range string for hledger if from/to are supplied
  const dateRange = from ? `${from}..${to || ''}` : undefined;

  const months = dateRange ? 12 : (monthCount === 0 ? new Date().getMonth() + 1 : monthCount);

  const [monthly, multiMonth] = await Promise.all([
    getMonthlyIncome(months, dateRange),
    getMultiMonthPnL(monthCount)
  ]);
  return { monthly, from, to, period, multiMonth, monthCount };
};
