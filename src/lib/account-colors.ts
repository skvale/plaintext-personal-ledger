/** Account type → color mapping used across all views */

export function accountType(acct: string): string {
  return acct.split(":")[0] || "unknown";
}

export function accountColor(acct: string): string {
  const t = accountType(acct);
  const map: Record<string, string> = {
    expenses: "text-accent-error",
    income: "text-accent-success",
    assets: "text-accent-primary",
    liabilities: "text-accent-warning",
    equity: "text-primary",
  };
  return map[t] ?? "text-primary";
}

export function accountBadgeClass(acct: string): string {
  const t = accountType(acct);
  return accountTypeBadgeColors[t] ?? accountTypeBadgeColors.equity;
}

/** Shared badge colors for account types — using theme-aware CSS variables */
export const accountTypeBadgeColors: Record<string, string> = {
  assets: "badge badge-assets",
  liabilities: "badge badge-liabilities",
  equity: "badge badge-equity",
  income: "badge badge-income",
  expenses: "badge badge-expenses",
};

/** Account path without the top-level type prefix (e.g. "bank:checking" from "assets:bank:checking") */
export function accountTail(acct: string): string {
  const idx = acct.indexOf(":");
  return idx >= 0 ? acct.slice(idx) : "";
}

/** Account path without the top-level type prefix, e.g. "expenses:food:dining" → "food:dining" */
export function accountWithoutType(acct: string): string {
  const idx = acct.indexOf(":");
  return idx >= 0 ? acct.slice(idx + 1) : acct;
}

/** Small dot color for compact views (table rows) */
export function accountDotClass(acct: string): string {
  const t = accountType(acct);
  const map: Record<string, string> = {
    expenses: "bg-accent-error",
    income: "bg-accent-success",
    assets: "bg-accent-primary",
    liabilities: "bg-accent-warning",
    equity: "bg-tertiary",
  };
  return map[t] ?? "bg-tertiary";
}

/** Sort priority: expense/income first, then liabilities, then assets (funding source last), then equity */
export function accountSortKey(acct: string): number {
  const t = accountType(acct);
  const order: Record<string, number> = {
    expenses: 0,
    income: 1,
    liabilities: 2,
    assets: 3,
    equity: 4,
  };
  return order[t] ?? 5;
}

/** Color for an amount based on its account context */
export function amountColor(amount: number, acct: string): string {
  if (amount === 0) return "text-slate-100";
  if (acct.startsWith("expenses")) return "text-rose-400";
  if (acct.startsWith("income")) return "text-emerald-400";
  if (acct.startsWith("assets"))
    return amount > 0 ? "text-blue-500" : "text-rose-400";
  if (acct.startsWith("liabilities"))
    return amount > 0 ? "text-slate-100" : "text-amber-400";
  return "text-slate-100";
}
