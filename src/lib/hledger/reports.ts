import { runJson } from "./cache.js";
import {
  pickAmount,
  pickCommodity,
  periodStart,
  lastNMonths,
  generateMonthRange,
  findSubreport,
} from "./parsing.js";
import type { CbrSubreport } from "./parsing.js";
import type { AccountBalance, ExpenseCategory, MonthlyData } from "./types.js";

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getNetWorth(period?: string): Promise<number> {
  const args = ["balancesheet", "--depth", "1"];
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
    "expenses",
    "--tree",
    "--depth",
    "2",
    "-p",
    period,
  ]);
  if (!data) return [];
  const rows: any[] = Array.isArray(data) ? (data[0] ?? []) : [];
  return rows
    .map((row) => {
      const name: string = row[0] ?? "";
      const amount = Math.abs(pickAmount(row[3]));
      return { name, shortName: name.split(":").pop() ?? name, amount };
    })
    .filter((c) => c.amount > 0 && c.name !== "expenses")
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
  const range = lastNMonths(monthCount);
  const json = await runJson<any>([
    "balancesheet",
    "--tree",
    "--auto",
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
      assetTotals: [],
      liabTotals: [],
      netWorths: [],
    };

  const dates: any[] = json.cbrDates ?? [];
  const months = dates.map((d) => periodStart(d));
  const subs: CbrSubreport[] = json.cbrSubreports ?? [];
  const assetSub = findSubreport(subs, /asset/i)?.[1];
  const liabSub = findSubreport(subs, /liabilit/i)?.[1];

  function extractRows(sub: any, type: "asset" | "liability") {
    const top = type === "asset" ? "assets" : "liabilities";
    const rows: MultiMonthBalanceSheet["accounts"] = [];
    for (const row of sub?.prRows ?? []) {
      const name: string = row.prrName ?? "";
      if (!name) continue;
      const fullName =
        name.startsWith(top + ":") || name === top ? name : `${top}:${name}`;
      const depth = fullName.split(":").length - 1;
      if (depth === 0) continue;
      const amounts = dates.map((_: any, i: number) =>
        pickAmount(row.prrAmounts?.[i]),
      );
      rows.push({ name: fullName, depth, type, amounts });
    }
    return rows;
  }

  const accounts = [
    ...extractRows(assetSub, "asset"),
    ...extractRows(liabSub, "liability"),
  ];

  const assetTotals = dates.map((_: any, i: number) =>
    pickAmount(assetSub?.prTotals?.prrAmounts?.[i]),
  );
  const liabTotals = dates.map((_: any, i: number) =>
    pickAmount(liabSub?.prTotals?.prrAmounts?.[i]),
  );
  const netWorths = dates.map(
    (_: any, i: number) => assetTotals[i] - liabTotals[i],
  );

  return { months, accounts, assetTotals, liabTotals, netWorths };
}

export async function getBalanceSheet(): Promise<BalanceSheetData> {
  const range = lastNMonths(12);
  const [snapshot, history] = await Promise.all([
    runJson<any>(["balancesheet", "--depth", "6"]),
    runJson<any>(["balancesheet", "--monthly", "--depth", "1", "-p", range]),
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
  const range = lastNMonths(monthCount);
  const json = await runJson<any>([
    "incomestatement",
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
      const amounts = dates.map((_: any, i: number) =>
        Math.abs(pickAmount(row.prrAmounts?.[i])),
      );
      if (amounts.some((a) => a > 0)) raw.push({ name, depth, type, amounts });
    }
    raw.sort((a, b) => a.name.localeCompare(b.name));
    return raw;
  }

  const accounts = [
    ...extractRows(revSub, "income"),
    ...extractRows(expSub, "expense"),
  ];

  const incomeTotals = dates.map((_: any, i: number) =>
    Math.abs(pickAmount(revSub?.prTotals?.prrAmounts?.[i])),
  );
  const expenseTotals = dates.map((_: any, i: number) =>
    Math.abs(pickAmount(expSub?.prTotals?.prrAmounts?.[i])),
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
  const range = lastNMonths(months);
  const json = await runJson<any>([
    "cashflow",
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

  const data = await runJson<any>(["bal", "--flat", "--no-total"]);
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

export async function getPortfolioData(): Promise<{
  accounts: { name: string; balance: number }[];
  history: { month: string; total: number }[];
}> {
  const range = lastNMonths(13);
  const [snapshot, histJson] = await Promise.all([
    runJson<any>(["bal", "assets:investments", "--flat"]),
    runJson<any>([
      "balancesheet",
      "--monthly",
      "--depth",
      "1",
      "-p",
      range,
      "assets:investments",
    ]),
  ]);

  const rows: any[] = Array.isArray(snapshot) ? (snapshot[0] ?? []) : [];
  const accounts = rows
    .filter((row) => row[0] && row[0] !== "assets:investments")
    .map((row) => ({ name: row[0] as string, balance: pickAmount(row[3]) }))
    .filter((a) => Math.abs(a.balance) > 0.01);

  const subs: CbrSubreport[] = histJson?.cbrSubreports ?? [];
  const assetHist = findSubreport(subs, /asset/i)?.[1];
  const dates: any[] = histJson?.cbrDates ?? [];
  const history = dates.map((d, i) => ({
    month: periodStart(d),
    total: pickAmount(assetHist?.prTotals?.prrAmounts?.[i]),
  }));

  return { accounts, history };
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

export async function getUnrealizedGains(): Promise<UnrealizedGains> {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const monthsAgo = (n: number) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - n);
    return fmt(d);
  };
  const ytdStart = `${now.getFullYear()}-01-01`;

  const range = lastNMonths(13);
  const [totalJson, ytdJson, m1Json, m3Json, m6Json, m12Json, monthlyJson] =
    await Promise.all([
      runJson<any>(["bal", "income:unrealized", "--no-total", "--flat"]),
      runJson<any>([
        "bal",
        "income:unrealized",
        "--no-total",
        "--flat",
        "-p",
        `${ytdStart}..`,
      ]),
      runJson<any>([
        "bal",
        "income:unrealized",
        "--no-total",
        "--flat",
        "-p",
        `${monthsAgo(1)}..`,
      ]),
      runJson<any>([
        "bal",
        "income:unrealized",
        "--no-total",
        "--flat",
        "-p",
        `${monthsAgo(3)}..`,
      ]),
      runJson<any>([
        "bal",
        "income:unrealized",
        "--no-total",
        "--flat",
        "-p",
        `${monthsAgo(6)}..`,
      ]),
      runJson<any>([
        "bal",
        "income:unrealized",
        "--no-total",
        "--flat",
        "-p",
        `${monthsAgo(12)}..`,
      ]),
      runJson<any>([
        "bal",
        "income:unrealized",
        "--monthly",
        "--flat",
        "-p",
        range,
      ]),
    ]);

  function extractSigned(json: any): number {
    const rows: any[] = Array.isArray(json) ? (json[0] ?? []) : [];
    return -rows.reduce((sum, row) => sum + pickAmount(row[3]), 0);
  }

  const prDates: any[] = monthlyJson?.prDates ?? [];
  const prRows: any[] = monthlyJson?.prRows ?? [];
  let cumulative = 0;
  const monthly: { month: string; cumulative: number }[] = [];

  if (prRows.length > 0) {
    const amounts: any[] = prRows[0]?.prrAmounts ?? [];
    for (let i = 0; i < prDates.length; i++) {
      const month = periodStart(prDates[i]);
      const change = -pickAmount(amounts[i]);
      cumulative += change;
      monthly.push({ month, cumulative });
    }
  }

  return {
    total: extractSigned(totalJson),
    periods: {
      period: "gains",
      ytd: extractSigned(ytdJson),
      m1: extractSigned(m1Json),
      m3: extractSigned(m3Json),
      m6: extractSigned(m6Json),
      m12: extractSigned(m12Json),
    },
    monthly,
  };
}

// ─── Vendors ───────────────────────────────────────────────────────────────────

export async function getVendors(): Promise<
  { vendor: string; count: number; total: number; lastDate: string }[]
> {
  const now = new Date();
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const since = threeYearsAgo.toISOString().slice(0, 10);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    .toISOString()
    .slice(0, 10);
  const raw = await runJson<any[]>(["print", "-p", `${since}..${endOfMonth}`]);
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
