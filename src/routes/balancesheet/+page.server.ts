import type { PageServerLoad } from "./$types";
import {
  getBalanceSheet,
  getBalanceSheetMultiMonth,
} from "$lib/hledger.server.js";

export const load: PageServerLoad = async ({ url }) => {
  const monthsParam = url.searchParams.get("months");
  const months = monthsParam !== null ? parseInt(monthsParam) : 1;
  const [current, multiMonth] = await Promise.all([
    getBalanceSheet(),
    getBalanceSheetMultiMonth(months),
  ]);
  return { ...current, multiMonth, monthCount: months };
};
