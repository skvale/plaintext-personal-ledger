import type { PageServerLoad } from "./$types";
import {
  getBalanceSheet,
  getBalanceSheetMultiMonth,
} from "$lib/hledger.server.js";

export const load: PageServerLoad = async ({ url }) => {
  const months = parseInt(url.searchParams.get("months") ?? "1");
  const [current, multiMonth] = await Promise.all([
    getBalanceSheet(),
    getBalanceSheetMultiMonth(months),
  ]);
  return { ...current, multiMonth, monthCount: months };
};
