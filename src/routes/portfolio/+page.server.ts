import type { PageServerLoad } from './$types';
import { getPortfolioData, getTransactions, getUnrealizedGains } from '$lib/hledger.server.js';

export const load: PageServerLoad = async ({ url }) => {
  const monthsParam = url.searchParams.get('months');
  const monthCount = monthsParam !== null ? parseInt(monthsParam) : 1;
  const months = monthCount === 0 ? (new Date().getMonth() + 1) : monthCount;

  const [portfolio, recentTxns, gains] = await Promise.all([
    getPortfolioData(12),
    getTransactions({ account: 'assets:investments', from: undefined, to: undefined }),
    getUnrealizedGains(13)
  ]);

  const monthly = gains.monthly;
  const slicedMonthly = monthly.slice(-months);
  const prevCumulative = monthly.length > months ? monthly[monthly.length - months - 1].cumulative : 0;
  const tableGains = slicedMonthly.map((m: any, i: number) => ({
    month: m.month,
    gain: i === 0 ? m.cumulative - prevCumulative : m.cumulative - slicedMonthly[i - 1].cumulative
  }));
  const tableTotal = tableGains.reduce((s: number, g: any) => s + g.gain, 0);

  const recent = [...recentTxns].reverse().slice(0, 15);
  const totalGain = gains.total;
  return { ...portfolio, recentTxns: recent, gains, monthCount, totalGain, tableGains, tableTotal };
};
