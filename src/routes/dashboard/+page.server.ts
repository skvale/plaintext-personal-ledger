import type { PageServerLoad } from './$types';
import {
  getNetWorth,
  getMonthSummary,
  getExpenseCategories,
  getRecentTransactions,
  getNetWorthHistory,
  getMonthlyIncome,
  lastNMonths
} from '$lib/hledger.server.js';

export const load: PageServerLoad = async ({ url, parent }) => {
  const month = url.searchParams.get('month') ?? null;
  // When no month specified, show current month for dashboard (income/expenses)
  const period = month ?? "thismonth";

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
