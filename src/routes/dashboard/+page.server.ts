import type { PageServerLoad } from './$types';
import {
  getNetWorth,
  getMonthSummary,
  getExpenseCategories,
  getRecentTransactions,
  getNetWorthHistory,
  getMonthlyIncome
} from '$lib/hledger.server.js';

export const load: PageServerLoad = async ({ url, parent }) => {
  const month = url.searchParams.get('month') ?? null;
  // hledger accepts YYYY-MM as a period (e.g. "2026-02")
  const period = month ?? 'thismonth';

  const [parentData, netWorth, monthSummary, expenseCategories, recentTransactions, netWorthHistory, monthlyHistory] =
    await Promise.all([
      parent(),
      getNetWorth(period),
      getMonthSummary(period),
      getExpenseCategories(period),
      getRecentTransactions(10, period),
      getNetWorthHistory(),
      getMonthlyIncome(6)
    ]);

  return { netWorth, monthSummary, expenseCategories, recentTransactions, uncategorizedCount: parentData.uncategorizedCount, month, netWorthHistory, monthlyHistory };
};
