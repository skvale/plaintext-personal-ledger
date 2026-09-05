import { runJson } from "./cache.js";
import {
  pickAmount,
  pickCommodity,
  periodStart,
  lastNMonths,
  ytdRange,
  generateMonthRange,
  findSubreport,
} from "./parsing.js";
import { getPrices } from "./pricing.js";
import type { CbrSubreport } from "./parsing.js";
import type { AccountBalance, ExpenseCategory, MonthlyData } from "./types.js";

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getNetWorth(period?: string): Promise<number> {
  const args = ["balancesheet", "-V", "--depth", "6", "-e", "tomorrow"];
  if (period && period !== "thismonth") args.push("-p", period);
  const json = await runJson<any>(args);
  if (!json) return 0;
  const subs: CbrSubreport[] = json.cbrSubreports ?? [];
  const sumR = (rows: any[]) =>
    (rows ?? []).reduce(
      (s: number, r: any) => s + pickAmount(r.prrAmounts?.[0]),
      0,
    );
  const assets = sumR(findSubreport(subs, /asset/i)?.[1]?.prRows ?? []);
  const liabs = sumR(findSubreport(subs, /liabilit/i)?.[1]?.prRows ?? []);
  return assets - liabs;
}

export async function getMonthSummary(
  period = "thismonth",
): Promise<{ income: number; expenses: number }> {
  const json = await runJson<any>([
    "incomestatement",
    "-B",
    "--depth",
    "1",
    "-p",
    period,
  ]);
  if (!json) return { income: 0, expenses: 0 };
  const subs: CbrSubreport[] = json.cbrSubreports ?? [];
  const rev = findSubreport(subs, /revenue|income/i);
  const exp = findSubreport(subs, /expense/i);
  return {
    income: Math.abs(pickAmount(rev?.[1].prTotals?.prrAmounts)),
    expenses: Math.abs(pickAmount(exp?.[1].prTotals?.prrAmounts)),
  };
}

export async function getExpenseCategories(
  period = "thismonth",
): Promise<ExpenseCategory[]> {
  const data = await runJson<any>([
    "bal",
    "-V",
    "expenses",
    "--tree",
    "--depth",
    "3",
    "-p",
    period,
  ]);
  if (!data) return [];
  const rows: any[] = Array.isArray(data) ? (data[0] ?? []) : [];
  const categories = rows
    .map((row) => {
      const name: string = row[0] ?? "";
      const amount = pickAmount(row[3]);
      return { name, shortName: name.split(":").pop() ?? name, amount };
    })
    .filter((c) => c.amount !== 0 && c.name !== "expenses");

  // Filter out parent accounts that have children in the results
  const names = new Set(categories.map((c) => c.name));
  const hasChildren = new Set<string>();
  for (const c of categories) {
    const parts = c.name.split(":");
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join(":");
      if (names.has(parent)) hasChildren.add(parent);
    }
  }
  return categories
    .filter((c) => !hasChildren.has(c.name))
    .sort((a, b) => b.amount - a.amount);
}

// ─── Balance Sheet ────────────────────────────────────────────────────────────

export interface BalanceSheetData {
  assets: AccountBalance[];
  liabilities: AccountBalance[];
  assetsTotal: number;
  liabsTotal: number;
  netWorth: number;
  history: (MonthlyData & { netWorth: number })[];
}

export interface MultiMonthBalanceSheet {
  months: string[]; // YYYY-MM labels
  accounts: {
    name: string;
    depth: number;
    type: "asset" | "liability";
    amounts: number[];
  }[];
  assetTotals: number[];
  liabTotals: number[];
  netWorths: number[];
}

export async function getBalanceSheetMultiMonth(
  monthCount: number,
): Promise<MultiMonthBalanceSheet> {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const rangeStart = new Date(
    now.getFullYear(),
    now.getMonth() - Math.max(0, monthCount - 1),
    1,
  );

  // Completed months (monthly interval over past months only)
  const [pastJson, currentJson] = await Promise.all([
    runJson<any>([
      "balancesheet",
      "-V",
      "--tree",
      "--auto",
      "--monthly",
      "--depth",
      "6",
      "-p",
      `${fmt(rangeStart)}..${fmt(currentStart)}`,
    ]),
    // Current month as of today — excludes future-dated transactions
    runJson<any>([
      "balancesheet",
      "-V",
      "--tree",
      "--auto",
      "--depth",
      "6",
      "-e",
      "tomorrow",
    ]),
  ]);

  if (!pastJson && !currentJson)
    return {
      months: [],
      accounts: [],
      assetTotals: [],
      liabTotals: [],
      netWorths: [],
    };

  const currentMonth = currentStart.toISOString().slice(0, 7);
  const pastDates: any[] = (pastJson?.cbrDates ?? []).filter((d: any) => {
    const s = Array.isArray(d) ? d[0]?.contents : d;
    return typeof s === "string" && /^\d{4}-\d{2}/.test(s);
  });
  const pastCols = pastDates.length;
  const months = [...pastDates.map((d) => periodStart(d)), currentMonth];

  const assetSubPast = findSubreport(pastJson?.cbrSubreports ?? [], /asset/i)?.[1];
  const liabSubPast = findSubreport(pastJson?.cbrSubreports ?? [], /liabilit/i)?.[1];
  const assetSubNow = findSubreport(currentJson?.cbrSubreports ?? [], /asset/i)?.[1];
  const liabSubNow = findSubreport(currentJson?.cbrSubreports ?? [], /liabilit/i)?.[1];

  const prefixTop = (name: string, top: string) =>
    name.startsWith(top + ":") || name === top ? name : `${top}:${name}`;

  const accounts = new Map<
    string,
    {
      name: string;
      depth: number;
      type: "asset" | "liability";
      past: number[];
      now: number;
    }
  >();

  const addRows = (
    sub: any,
    type: "asset" | "liability",
    cell: (i: number, row: any) => number,
  ) => {
    const top = type === "asset" ? "assets" : "liabilities";
    for (const row of sub?.prRows ?? []) {
      const name: string = row.prrName ?? "";
      if (!name) continue;
      const fullName = prefixTop(name, top);
      const depth = fullName.split(":").length - 1;
      if (depth === 0) continue;
      const past = Array.from({ length: pastCols }, (_, i) => cell(i, row));
      accounts.set(fullName, { name: fullName, depth, type, past, now: 0 });
    }
  };

  addRows(assetSubPast, "asset", (i, row) =>
    pickAmount(row.prrAmounts?.[i]),
  );
  addRows(liabSubPast, "liability", (i, row) =>
    pickAmount(row.prrAmounts?.[i]),
  );

  const setNow = (
    sub: any,
    type: "asset" | "liability",
  ) => {
    const top = type === "asset" ? "assets" : "liabilities";
    for (const row of sub?.prRows ?? []) {
      const name: string = row.prrName ?? "";
      if (!name) continue;
      const fullName = prefixTop(name, top);
      const depth = fullName.split(":").length - 1;
      if (depth === 0) continue;
      const value = pickAmount(row.prrAmounts?.[0]);
      const existing = accounts.get(fullName);
      if (existing) {
        existing.now = value;
      } else {
        accounts.set(fullName, {
          name: fullName,
          depth,
          type,
          past: Array(pastCols).fill(0),
          now: value,
        });
      }
    }
  };

  setNow(assetSubNow, "asset");
  setNow(liabSubNow, "liability");

  const flat = [...accounts.values()].map(({ name, depth, type, past, now }) => ({
    name,
    depth,
    type,
    amounts: [...past, now],
  }));

  const pastAssetTotals = pastDates.map((_: any, i: number) =>
    pickAmount(assetSubPast?.prTotals?.prrAmounts?.[i]),
  );
  const pastLiabTotals = pastDates.map((_: any, i: number) =>
    pickAmount(liabSubPast?.prTotals?.prrAmounts?.[i]),
  );
  const assetTotals = [
    ...pastAssetTotals,
    pickAmount(assetSubNow?.prTotals?.prrAmounts?.[0]),
  ];
  const liabTotals = [
    ...pastLiabTotals,
    pickAmount(liabSubNow?.prTotals?.prrAmounts?.[0]),
  ];
  const netWorths = assetTotals.map((a, i) => a - (liabTotals[i] ?? 0));

  return { months, accounts: flat, assetTotals, liabTotals, netWorths };
}

export async function getBalanceSheet(): Promise<BalanceSheetData> {
  const range = lastNMonths(12);
  const [snapshot, history] = await Promise.all([
    runJson<any>(["balancesheet", "-V", "--depth", "6", "-e", "tomorrow"]),
    runJson<any>(["balancesheet", "-V", "--monthly", "--depth", "1", "-p", range]),
  ]);

  const subs: CbrSubreport[] = snapshot?.cbrSubreports ?? [];
  const assetData = findSubreport(subs, /asset/i)?.[1];
  const liabData = findSubreport(subs, /liabilit/i)?.[1];

  const rowsToBalances = (rows: any[]): AccountBalance[] => {
    const raw = (rows ?? []).map((row) => ({
      name: row.prrName ?? "",
      amount: pickAmount(row.prrAmounts?.[0]),
      commodity: "$",
      depth: (row.prrName ?? "").split(":").length - 1,
    }));
    const result: AccountBalance[] = [];
    const seen = new Set<string>();
    for (const acc of raw) {
      const parts = acc.name.split(":");
      for (let i = 1; i < parts.length - 1; i++) {
        const parent = parts.slice(0, i + 1).join(":");
        if (!seen.has(parent) && !raw.some((r) => r.name === parent)) {
          result.push({ name: parent, amount: NaN, commodity: "$", depth: i });
          seen.add(parent);
        }
      }
      result.push(acc);
      seen.add(acc.name);
    }
    return result;
  };

  const histSubs: CbrSubreport[] = history?.cbrSubreports ?? [];
  const assetHist = findSubreport(histSubs, /asset/i)?.[1];
  const liabHist = findSubreport(histSubs, /liabilit/i)?.[1];
  const dates: any[] = history?.cbrDates ?? [];

  const historyData = dates.map((d, i) => {
    const assets = pickAmount(assetHist?.prTotals?.prrAmounts?.[i]);
    const liabs = pickAmount(liabHist?.prTotals?.prrAmounts?.[i]);
    return {
      month: periodStart(d),
      income: 0,
      expenses: 0,
      netWorth: assets - liabs,
    };
  });

  const sumRows = (rows: any[]) =>
    (rows ?? []).reduce(
      (s: number, r: any) => s + pickAmount(r.prrAmounts?.[0]),
      0,
    );

  const assetsTotal = sumRows(assetData?.prRows ?? []);
  const liabsTotal = sumRows(liabData?.prRows ?? []);

  return {
    assets: rowsToBalances(assetData?.prRows ?? []),
    liabilities: rowsToBalances(liabData?.prRows ?? []),
    assetsTotal,
    liabsTotal,
    netWorth: assetsTotal - liabsTotal,
    history: historyData,
  };
}

// ─── Income Statement ──────────────────────────────────────────────────────────

export async function getMonthlyIncome(
  months = 6,
  dateRange?: string,
): Promise<MonthlyData[]> {
  const range = dateRange ?? lastNMonths(months);
  const json = await runJson<any>([
    "incomestatement",
    "-B",
    "--monthly",
    "--depth",
    "1",
    "-p",
    range,
  ]);
  if (!json) return [];

  const dates: any[] = json.cbrDates ?? [];
  const subs: CbrSubreport[] = json.cbrSubreports ?? [];
  const rev = findSubreport(subs, /revenue|income/i);
  const exp = findSubreport(subs, /expense/i);

  const result = dates.map((d, i) => ({
    month: periodStart(d),
    income: Math.abs(pickAmount(rev?.[1].prTotals?.prrAmounts?.[i])),
    expenses: Math.abs(pickAmount(exp?.[1].prTotals?.prrAmounts?.[i])),
  }));

  const allMonths = generateMonthRange(months, dateRange);
  const dataMap = new Map(result.map((r) => [r.month, r]));
  return allMonths.map(
    (m) => dataMap.get(m) ?? { month: m, income: 0, expenses: 0 },
  );
}

export interface PnLLine {
  name: string;
  shortName: string;
  indent: number;
  amount: number;
}

export interface IncomeStatementDetail {
  periodLabel: string;
  income: PnLLine[];
  incomeTotal: number;
  expenses: PnLLine[];
  expensesTotal: number;
  net: number;
}

export interface MultiMonthPnL {
  months: string[];
  accounts: {
    name: string;
    depth: number;
    type: "income" | "expense";
    amounts: number[];
  }[];
  incomeTotals: number[];
  expenseTotals: number[];
  netTotals: number[];
}

export async function getMultiMonthPnL(
  monthCount: number,
): Promise<MultiMonthPnL> {
  const range = monthCount === 0 ? ytdRange() : lastNMonths(monthCount);
  const json = await runJson<any>([
    "incomestatement",
    "-B",
    "--tree",
    "--monthly",
    "--depth",
    "6",
    "-p",
    range,
  ]);
  if (!json)
    return {
      months: [],
      accounts: [],
      incomeTotals: [],
      expenseTotals: [],
      netTotals: [],
    };

  const dates: any[] = json.cbrDates ?? [];
  const months = dates.map((d) => periodStart(d));
  const subs: CbrSubreport[] = json.cbrSubreports ?? [];
  const revSub = findSubreport(subs, /revenue|income/i)?.[1];
  const expSub = findSubreport(subs, /expense/i)?.[1];

  function extractRows(sub: any, type: "income" | "expense") {
    const raw: {
      name: string;
      depth: number;
      type: typeof type;
      amounts: number[];
    }[] = [];
    for (const row of sub?.prRows ?? []) {
      const name: string = row.prrName ?? "";
      if (!name) continue;
      const depth = name.split(":").length - 1;
      if (depth === 0) continue;
      const amounts = dates.map((_: any, i: number) => {
        const raw = pickAmount(row.prrAmounts?.[i]);
        return raw;
      });
      if (amounts.some((a) => a !== 0)) raw.push({ name, depth, type, amounts });
    }
    raw.sort((a, b) => a.name.localeCompare(b.name));
    return raw;
  }

  const accounts = [
    ...extractRows(revSub, "income"),
    ...extractRows(expSub, "expense"),
  ];

  const incomeTotals = dates.map((_: any, i: number) =>
    pickAmount(revSub?.prTotals?.prrAmounts?.[i]),
  );
  const expenseTotals = dates.map((_: any, i: number) =>
    pickAmount(expSub?.prTotals?.prrAmounts?.[i]),
  );
  const netTotals = dates.map(
    (_: any, i: number) => incomeTotals[i] - expenseTotals[i],
  );

  return { months, accounts, incomeTotals, expenseTotals, netTotals };
}

export async function getIncomeStatementDetail(
  months: number,
  dateRange?: string,
): Promise<IncomeStatementDetail> {
  const range = dateRange ?? lastNMonths(months);
  const json = await runJson<any>([
    "incomestatement",
    "-B",
    "--tree",
    "--depth",
    "6",
    "-p",
    range,
  ]);

  const empty: IncomeStatementDetail = {
    periodLabel: range,
    income: [],
    incomeTotal: 0,
    expenses: [],
    expensesTotal: 0,
    net: 0,
  };
  if (!json) return empty;

  const subs: CbrSubreport[] = json.cbrSubreports ?? [];
  const rev = findSubreport(subs, /revenue|income/i)?.[1];
  const exp = findSubreport(subs, /expense/i)?.[1];

  const toLines = (rows: any[]): PnLLine[] =>
    (rows ?? [])
      .map((r: any) => {
        const name: string = r.prrName ?? "";
        return {
          name,
          shortName: name.split(":").pop() ?? "",
          indent: name.split(":").length - 1,
          amount: Math.abs(pickAmount(r.prrAmounts?.[0])),
        };
      })
      .filter((l) => l.amount > 0);

  const incomeLines = toLines(rev?.prRows ?? []);
  const expenseLines = toLines(exp?.prRows ?? []);
  const incomeTotal = Math.abs(pickAmount(rev?.prTotals?.prrAmounts));
  const expensesTotal = Math.abs(pickAmount(exp?.prTotals?.prrAmounts));

  return {
    periodLabel: range,
    income: incomeLines,
    incomeTotal,
    expenses: expenseLines,
    expensesTotal,
    net: incomeTotal - expensesTotal,
  };
}

// ─── Cash Flow ────────────────────────────────────────────────────────────────

export interface CashFlowMonth {
  month: string;
  accounts: { name: string; change: number }[];
  net: number;
}

export interface MultiMonthCashFlow {
  months: string[];
  accounts: { name: string; depth: number; amounts: number[] }[];
  totals: number[];
}

export async function getCashFlow(
  months = 6,
): Promise<{ monthly: CashFlowMonth[]; multi: MultiMonthCashFlow }> {
  const range = months === 0 ? ytdRange() : lastNMonths(months);
  const json = await runJson<any>([
    "cashflow",
    "-B",
    "--tree",
    "--monthly",
    "--depth",
    "6",
    "-p",
    range,
  ]);
  if (!json)
    return { monthly: [], multi: { months: [], accounts: [], totals: [] } };

  const dates: any[] = json.cbrDates ?? [];
  const monthList = dates.map((d) => periodStart(d));
  const subs: CbrSubreport[] = json.cbrSubreports ?? [];
  const cashSub = subs[0]?.[1];

  const monthly = dates.map((d, i) => {
    const rows: any[] = cashSub?.prRows ?? [];
    const accounts = rows
      .map((r) => ({
        name: r.prrName ?? "",
        change: pickAmount(r.prrAmounts?.[i]),
      }))
      .filter((a) => a.change !== 0);
    const net = pickAmount(cashSub?.prTotals?.prrAmounts?.[i]);
    return { month: periodStart(d), accounts, net };
  });

  const rawRows: { name: string; depth: number; amounts: number[] }[] = [];
  for (const row of cashSub?.prRows ?? []) {
    const name: string = row.prrName ?? "";
    if (!name) continue;
    const depth = name.split(":").length - 1;
    if (depth === 0) continue;
    const amounts = dates.map((_: any, i: number) =>
      pickAmount(row.prrAmounts?.[i]),
    );
    if (amounts.some((a) => a !== 0)) rawRows.push({ name, depth, amounts });
  }
  rawRows.sort((a, b) => a.name.localeCompare(b.name));

  const totals = dates.map((_: any, i: number) =>
    pickAmount(cashSub?.prTotals?.prrAmounts?.[i]),
  );

  return { monthly, multi: { months: monthList, accounts: rawRows, totals } };
}

// ─── Account Balances ──────────────────────────────────────────────────────────

export async function getAccountBalances(): Promise<AccountBalance[]> {
  const { getAccountNames } = await import("./transactions.js");
  const allNames = await getAccountNames();

  const data = await runJson<any>(["bal", "-V", "--flat", "--no-total", "-e", "tomorrow"]);
  const rows: any[] = Array.isArray(data) ? (data[0] ?? []) : [];
  const balanceMap = new Map<string, number>(
    rows.map((row) => [row[0] as string, pickAmount(row[3])]),
  );

  const nameSet = new Set(allNames);
  for (const name of allNames) {
    const parts = name.split(":");
    for (let i = 1; i < parts.length; i++) {
      nameSet.add(parts.slice(0, i).join(":"));
    }
  }

  return [...nameSet].sort().map((name) => ({
    name,
    amount: balanceMap.get(name) ?? 0,
    commodity: "$",
    depth: name.split(":").length - 1,
  }));
}

// ─── Net Worth History ────────────────────────────────────────────────────────

export async function getNetWorthHistory(): Promise<
  { month: string; netWorth: number }[]
> {
  const range = lastNMonths(13);
  const json = await runJson<any>([
    "balancesheet",
    "-V",
    "--monthly",
    "--depth",
    "1",
    "-p",
    range,
  ]);
  if (!json) return [];
  const subs: CbrSubreport[] = json.cbrSubreports ?? [];
  const assetHist = findSubreport(subs, /asset/i)?.[1];
  const liabHist = findSubreport(subs, /liabilit/i)?.[1];
  const dates: any[] = json.cbrDates ?? [];
  return dates.map((d, i) => ({
    month: periodStart(d),
    netWorth:
      pickAmount(assetHist?.prTotals?.prrAmounts?.[i]) -
      pickAmount(liabHist?.prTotals?.prrAmounts?.[i]),
  }));
}

// ─── Portfolio ────────────────────────────────────────────────────────────────

export async function getPortfolioData(months: number = 12): Promise<{
  accounts: { name: string; balance: number }[];
  costAccounts: { name: string; balance: number }[];
  history: { month: string; total: number }[];
  costHistory: { month: string; total: number }[];
}> {
  const range = lastNMonths(months);
  const [mktSnapshot, costSnapshot, mktHistJson, costHistJson] = await Promise.all([
    runJson<any>(["bal", "-V", "assets:investments", "--flat", "-e", "tomorrow"]),
    runJson<any>(["bal", "-B", "assets:investments", "--flat", "-e", "tomorrow"]),
    runJson<any>(["balancesheet", "-V", "--monthly", "--depth", "1", "-p", range, "assets:investments"]),
    runJson<any>(["balancesheet", "-B", "--monthly", "--depth", "1", "-p", range, "assets:investments"]),
  ]);

  const mktRows: any[] = Array.isArray(mktSnapshot) ? (mktSnapshot[0] ?? []) : [];
  const accounts = mktRows
    .filter((row) => row[0] && row[0] !== "assets:investments")
    .map((row) => ({ name: row[0] as string, balance: pickAmount(row[3]) }))
    .filter((a) => Math.abs(a.balance) > 0.01);

  const costRows: any[] = Array.isArray(costSnapshot) ? (costSnapshot[0] ?? []) : [];
  const costAccounts = costRows
    .filter((row) => row[0] && row[0] !== "assets:investments")
    .map((row) => ({ name: row[0] as string, balance: pickAmount(row[3]) }))
    .filter((a) => Math.abs(a.balance) > 0.01);

  const mktSubs: CbrSubreport[] = mktHistJson?.cbrSubreports ?? [];
  const mktAssetHist = findSubreport(mktSubs, /asset/i)?.[1];
  const mktDates: any[] = mktHistJson?.cbrDates ?? [];
  const history = mktDates.map((d, i) => ({
    month: periodStart(d),
    total: pickAmount(mktAssetHist?.prTotals?.prrAmounts?.[i]),
  }));

  const costSubs: CbrSubreport[] = costHistJson?.cbrSubreports ?? [];
  const costAssetHist = findSubreport(costSubs, /asset/i)?.[1];
  const costDates: any[] = costHistJson?.cbrDates ?? [];
  const costHistory = costDates.map((d, i) => ({
    month: periodStart(d),
    total: pickAmount(costAssetHist?.prTotals?.prrAmounts?.[i]),
  }));

  return { accounts, costAccounts, history, costHistory };
}

export interface HoldingEntry {
  ticker: string;
  shares: number;
  avgCost: number;
  costBasis: number;
  price: number;
  marketValue: number;
  gain: number;
  gainPct: number;
}

export async function getHoldings(): Promise<HoldingEntry[]> {
  const json = await runJson<any>(["bal", "-N", "assets:investments", "--flat", "-e", "tomorrow"]);
  if (!json) return [];

  const rows: any[] = Array.isArray(json[0]) ? json[0] : [];
  const byTicker = new Map<string, { shares: number; cost: number }>();

  for (const row of rows) {
    const amounts = row[3];
    if (!amounts) continue;
    const entries: any[] = Array.isArray(amounts) ? amounts : [amounts];
    for (const entry of entries) {
      const ticker: string = entry.acommodity ?? '';
      if (ticker === '$' || !ticker) continue;
      const shares = entry.aquantity?.floatingPoint ?? 0;
      const unitCost = entry.acost?.contents?.aquantity?.floatingPoint;
      const totalCost = unitCost != null ? shares * unitCost : 0;
      const existing = byTicker.get(ticker) ?? { shares: 0, cost: 0 };
      existing.shares += shares;
      existing.cost += totalCost;
      byTicker.set(ticker, existing);
    }
  }

  const prices = await getPrices();
  const latestPrice = new Map<string, number>();
  for (const p of prices) {
    latestPrice.set(p.ticker, p.price);
  }

  return [...byTicker.entries()]
    .map(([ticker, { shares, cost }]) => {
      const price = latestPrice.get(ticker) ?? 0;
      const marketValue = shares * price;
      const gain = marketValue - cost;
      const avgCost = shares > 0 ? cost / shares : 0;
      const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
      return { ticker, shares, avgCost, costBasis: cost, price, marketValue, gain, gainPct };
    })
    .filter(h => h.shares > 0)
    .sort((a, b) => b.marketValue - a.marketValue);
}

export async function getMonthlyHoldings(): Promise<{ month: string; holdings: HoldingEntry[] }[]> {
  const range = lastNMonths(13);
  const json = await runJson<any>([
    "bal", "-N", "assets:investments", "--flat", "--monthly", "-p", range,
  ]);
  if (!json) return [];

  const dates: string[] = (json.prDates ?? []).map((d: any) =>
    typeof d === 'string' ? d : (d.contents ?? '')
  );
  const rows: any[] = json.prRows ?? [];
  if (rows.length === 0) return [];

  const prices = await getPrices();

  return dates.map((date, monthIdx) => {
    const byTicker = new Map<string, number>();
    for (const row of rows) {
      const amounts = row.prrAmounts?.[monthIdx];
      if (!amounts) continue;
      const entries: any[] = Array.isArray(amounts) ? amounts : [amounts];
      for (const entry of entries) {
        const ticker: string = entry.acommodity ?? '';
        if (ticker === '$' || !ticker) continue;
        const shares = entry.aquantity?.floatingPoint ?? 0;
        byTicker.set(ticker, (byTicker.get(ticker) ?? 0) + shares);
      }
    }

    const holdings: HoldingEntry[] = [];
    for (const [ticker, shares] of byTicker) {
      const price = findPriceAt(prices, ticker, date);
      const marketValue = shares * price;
      holdings.push({
        ticker, shares, avgCost: 0, costBasis: 0,
        price, marketValue, gain: 0, gainPct: 0,
      });
    }
    holdings.sort((a, b) => b.marketValue - a.marketValue);
    return { month: date.slice(0, 7), holdings };
  });
}

function findPriceAt(prices: { ticker: string; date: string; price: number }[], ticker: string, date: string): number {
  const relevant = prices
    .filter(p => p.ticker === ticker && p.date <= date)
    .sort((a, b) => b.date.localeCompare(a.date));
  return relevant[0]?.price ?? 0;
}

export interface UnrealizedGains {
  total: number;
  periods: {
    period: string;
    ytd: number;
    m1: number;
    m3: number;
    m6: number;
    m12: number;
  };
  monthly: { month: string; cumulative: number }[];
}

export async function getUnrealizedGains(months: number = 12): Promise<UnrealizedGains> {
  const now = new Date();
  const range = lastNMonths(months);

  const [mktMonthlyJson, costMonthlyJson, realizedMonthlyJson] = await Promise.all([
    runJson<any>(["balancesheet", "-V", "--monthly", "--depth", "1", "-p", range, "assets:investments"]),
    runJson<any>(["balancesheet", "-B", "--monthly", "--depth", "1", "-p", range, "assets:investments"]),
    runJson<any>(["bal", "income:capital-gains", "--monthly", "--flat", "-p", range]),
  ]);

  const mktSubs: CbrSubreport[] = mktMonthlyJson?.cbrSubreports ?? [];
  const mktAssetHist = findSubreport(mktSubs, /asset/i)?.[1];
  const mktDates: any[] = mktMonthlyJson?.cbrDates ?? [];

  const costSubs: CbrSubreport[] = costMonthlyJson?.cbrSubreports ?? [];
  const costAssetHist = findSubreport(costSubs, /asset/i)?.[1];

  const realizedPrDates: any[] = realizedMonthlyJson?.prDates ?? [];
  const realizedPrRows: any[] = realizedMonthlyJson?.prRows ?? [];
  const realizedByMonth = new Map<string, number>();
  if (realizedPrRows.length > 0) {
    const amounts: any[] = realizedPrRows[0]?.prrAmounts ?? [];
    for (let i = 0; i < realizedPrDates.length; i++) {
      realizedByMonth.set(periodStart(realizedPrDates[i]), -pickAmount(amounts[i]));
    }
  }

  let cumRealized = 0;
  const monthly: { month: string; cumulative: number }[] = [];
  for (let i = 0; i < mktDates.length; i++) {
    const month = periodStart(mktDates[i]);
    const mktTotal = pickAmount(mktAssetHist?.prTotals?.prrAmounts?.[i]);
    const costTotal = pickAmount(costAssetHist?.prTotals?.prrAmounts?.[i]);
    const realizedThisPeriod = realizedByMonth.get(month) ?? 0;
    cumRealized += realizedThisPeriod;
    monthly.push({ month, cumulative: (mktTotal - costTotal) + cumRealized });
  }

  const total = monthly.length > 0 ? monthly[monthly.length - 1].cumulative : 0;

  function getCumulative(endMonth: string): number | undefined {
    for (let i = monthly.length - 1; i >= 0; i--) {
      if (monthly[i].month <= endMonth) return monthly[i].cumulative;
    }
  }

  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

  const ytdStart = `${now.getFullYear()}-01`;
  const m3Start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const m6Start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const m12Start = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const m3Str = `${m3Start.getFullYear()}-${String(m3Start.getMonth() + 1).padStart(2, '0')}`;
  const m6Str = `${m6Start.getFullYear()}-${String(m6Start.getMonth() + 1).padStart(2, '0')}`;
  const m12Str = `${m12Start.getFullYear()}-${String(m12Start.getMonth() + 1).padStart(2, '0')}`;

  const lastCum = getCumulative(lastMonthStr) ?? 0;
  const ytdCum = getCumulative(ytdStart) ?? 0;
  const m3Cum = getCumulative(m3Str) ?? 0;
  const m6Cum = getCumulative(m6Str) ?? 0;
  const m12Cum = getCumulative(m12Str) ?? 0;

  return {
    total,
    periods: {
      period: "gains",
      ytd: total - ytdCum,
      m1: total - lastCum,
      m3: total - m3Cum,
      m6: total - m6Cum,
      m12: total - m12Cum,
    },
    monthly,
  };
}

// ─── Vendors ───────────────────────────────────────────────────────────────────

export async function getVendors(): Promise<
  { vendor: string; count: number; total: number; lastDate: string }[]
> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    .toISOString()
    .slice(0, 10);
  const raw = await runJson<any[]>(["print", "-p", `${start}..${end}`]);
  if (!raw) return [];
  const map = new Map<
    string,
    { count: number; total: number; lastDate: string }
  >();
  for (const tx of raw) {
    const vendor: string =
      tx.tpayee?.trim() ||
      tx.tdescription?.split("|")[0]?.trim() ||
      (tx.tdescription ?? "");
    const date: string = tx.tdate ?? "";
    const postings: any[] = tx.tpostings ?? [];
    const hasExpenses = postings.some((p: any) =>
      (p.paccount ?? "").startsWith("expenses"),
    );
    if (!hasExpenses) continue;
    const total = postings.reduce((s: number, p: any) => {
      const acct: string = p.paccount ?? "";
      if (acct.startsWith("expenses"))
        return s + Math.abs(pickAmount(p.pamount));
      return s;
    }, 0);
    const existing = map.get(vendor);
    if (existing) {
      existing.count++;
      existing.total += total;
      if (date > existing.lastDate) existing.lastDate = date;
    } else {
      map.set(vendor, { count: 1, total, lastDate: date });
    }
  }
  return [...map.entries()]
    .map(([vendor, s]) => ({ vendor, ...s }))
    .sort((a, b) => b.total - a.total || b.lastDate.localeCompare(a.lastDate));
}

export interface MultiMonthVendors {
  months: string[];
  vendors: { vendor: string; amounts: number[]; total: number }[];
}

export async function getVendorsMultiMonth(
  monthCount: number,
): Promise<MultiMonthVendors> {
  const range = lastNMonths(monthCount);
  const raw = await runJson<any[]>(["print", "-p", range]);
  if (!raw) return { months: [], vendors: [] };

  const now = new Date();
  const months: string[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }

  const vendorMonths = new Map<string, Map<string, number>>();

  for (const tx of raw) {
    const vendor: string =
      tx.tpayee?.trim() ||
      tx.tdescription?.split("|")[0]?.trim() ||
      (tx.tdescription ?? "");
    const date: string = tx.tdate ?? "";
    const month = date.slice(0, 7);
    if (!month) continue;

    const postings: any[] = tx.tpostings ?? [];
    const hasExpenses = postings.some((p: any) =>
      (p.paccount ?? "").startsWith("expenses"),
    );
    if (!hasExpenses) continue;

    const expenseTotal = postings.reduce((s: number, p: any) => {
      const acct: string = p.paccount ?? "";
      if (acct.startsWith("expenses"))
        return s + Math.abs(pickAmount(p.pamount));
      return s;
    }, 0);

    if (!vendorMonths.has(vendor)) vendorMonths.set(vendor, new Map());
    const pm = vendorMonths.get(vendor)!;
    pm.set(month, (pm.get(month) ?? 0) + expenseTotal);
  }

  const vendors = [...vendorMonths.entries()]
    .map(([vendor, pm]) => {
      const amounts = months.map((m) => pm.get(m) ?? 0);
      const total = amounts.reduce((s, a) => s + a, 0);
      return { vendor, amounts, total };
    })
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total);

  return { months, vendors };
}
