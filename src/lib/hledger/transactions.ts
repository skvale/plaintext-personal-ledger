import { exec } from "node:child_process";
import { promisify } from "node:util";
import { nanoid } from "nanoid";
import { runJson, run, invalidateCache } from "./cache.js";
import { getWriteJournal } from "./journal.js";
import {
  pickAmount,
  pickCommodity,
  extractTag,
  fmtPosting,
  normaliseAmount,
  fmtAmount,
} from "./parsing.js";
import type { Transaction } from "./types.js";
import { sortJournalByDate } from "./journal-maintenance.js";

const execAsync = promisify(exec);

// ─── Tag Extraction Helper ────────────────────────────────────────────────────

/**
 * Extract a tag value from hledger's tag array format: [["tagname", "value"], ...]
 */
function getTxid(tags: string[][]): string | undefined {
  return extractTag(tags, "txid");
}

// ─── Read Transactions ─────────────────────────────────────────────────────────

/**
 * Get recent transactions for the dashboard.
 */
export async function getRecentTransactions(
  count = 10,
  period?: string,
): Promise<Transaction[]> {
  const args: string[] = ["print"];
  if (period) args.push("-p", period);
  const raw = await runJson<any[]>(args);
  if (!raw) return [];
  const slice = raw.slice(-count).reverse();
  return slice.map((tx, i) => {
    const allPostings = (tx.tpostings ?? []).map((p: any) => ({
      account: p.paccount ?? "",
      amount: pickAmount(p.pamount),
      commodity: pickCommodity(p.pamount),
    }));
    const visible = allPostings.filter(
      (p: any) => !p.account.startsWith("equity"),
    );
    // Pick a display posting (prefer expense/income, then first non-equity)
    const posting =
      visible.find(
        (p: any) =>
          p.account.startsWith("expenses") || p.account.startsWith("income"),
      ) ??
      visible[0] ??
      allPostings[0];
    const account = posting?.account ?? "";
    const commodity = posting?.commodity ?? "";
    // Match register: sum of positive non-equity postings
    const amount = visible
      .filter((p: any) => p.amount > 0)
      .reduce((s: number, p: any) => s + p.amount, 0);
    const txid = getTxid(tx.ttags ?? []);
    return {
      index: i,
      tindex: tx.tindex as number | undefined,
      txid,
      date: tx.tdate ?? "",
      description: tx.tpayee
        ? `${tx.tpayee} | ${tx.tdescription ?? ""}`
        : (tx.tdescription ?? ""),
      postings: visible.length > 0 ? visible : allPostings,
      account,
      amount,
      commodity,
    };
  });
}

/**
 * Get transactions with filtering and search.
 */
export async function getTransactions(
  opts: {
    account?: string;
    query?: string;
    from?: string;
    to?: string;
    drop?: number;
  } = {},
): Promise<Transaction[]> {
  const args = ["print"];
  if (opts.from) args.push("-b", opts.from);
  if (opts.to) args.push("-e", opts.to);
  if (opts.account) args.push(opts.account);
  const queryStr = opts.query?.replace(/"/g, "") ?? "";
  if (queryStr) args.push(`desc:"${queryStr}"`);

  let raw = await runJson<any[]>(args);
  if (!raw) raw = [];

  // If description search returned nothing, try matching account names instead
  if (raw.length === 0 && queryStr) {
    const acctArgs = ["print"];
    if (opts.from) acctArgs.push("-b", opts.from);
    if (opts.to) acctArgs.push("-e", opts.to);
    acctArgs.push(`acct:"${queryStr}"`);
    raw = (await runJson<any[]>(acctArgs)) ?? [];
  }
  const dropN = opts.drop ?? 0;

  const dropAcct = (acct: string) =>
    dropN > 0 ? acct.split(":").slice(dropN).join(":") || acct : acct;

  // When filtering by account, compute running balance for that account
  let balance = 0;

  return raw.map((tx, i) => {
    const postings = (tx.tpostings ?? []).map((p: any) => ({
      account: dropAcct(p.paccount ?? ""),
      amount: pickAmount(p.pamount),
      commodity: pickCommodity(p.pamount),
    }));

    if (opts.account) {
      const matched = postings.filter(
        (p: any) =>
          p.account === dropAcct(opts.account!) ||
          p.account.startsWith(dropAcct(opts.account!) + ":"),
      );
      matched.forEach((p: any) => {
        balance += p.amount;
      });
    }

    const tags = tx.ttags ?? [];
    const txid = getTxid(tags);

    // Bill detection: has liabilities:payable posting with negative amount
    const payablePost = (tx.tpostings ?? []).find((p: any) =>
      (p.paccount ?? "").startsWith("liabilities:payable"),
    );
    const payableAmt = payablePost
      ? (payablePost.pamount?.[0]?.aquantity?.floatingPoint ?? 0)
      : 0;
    const isBill = !!payablePost && payableAmt < 0;
    const billPaid = isBill && tags.some((t: string[]) => t[0] === "paymentid");

    return {
      index: i,
      tindex: tx.tindex as number | undefined,
      txid,
      date: tx.tdate ?? "",
      description: tx.tpayee
        ? `${tx.tpayee} | ${tx.tdescription ?? ""}`
        : (tx.tdescription ?? ""),
      postings,
      balance: opts.account ? balance : undefined,
      isBill,
      billPaid,
    };
  });
}

// ─── Account Operations ────────────────────────────────────────────────────────

/** All accounts: used + declared. For account pickers where users can assign to any account. */
export async function getAccountNames(): Promise<string[]> {
  const [usedOut, declaredOut] = await Promise.all([
    run(["-I", "accounts", "--used"]),
    run(["-I", "accounts", "--declared"]),
  ]);
  const used = usedOut.split("\n").filter(Boolean);
  const declared = declaredOut
    .split("\n")
    .filter(Boolean)
    .map((l) => l.replace(/\s*;.*$/, ""));
  return [...new Set([...used, ...declared])].sort();
}

/** Accounts in transactions + their parent accounts. For filters/search where aggregation matters. */
export async function getUsedAccountNames(): Promise<string[]> {
  const output = await run(["accounts", "--used"]);
  const used = output.split("\n").filter(Boolean);
  const all = new Set(used);
  for (const acct of used) {
    const parts = acct.split(":");
    for (let i = 1; i < parts.length; i++) {
      all.add(parts.slice(0, i).join(":"));
    }
  }
  return [...all].sort();
}

export async function getDeclaredAccounts(): Promise<string[]> {
  const output = await run(["accounts", "--declared"]);
  return output
    .split("\n")
    .filter(Boolean)
    .map((l) => l.replace(/\s*;.*$/, ""));
}

import { READ_JOURNAL } from "./journal.js";

export async function addAccountDeclaration(
  name: string,
): Promise<{ success: boolean; error?: string }> {
  const { readFile, writeFile } = await import("node:fs/promises");
  const JOURNAL = READ_JOURNAL;
  const content = await readFile(JOURNAL, "utf-8");
  // Insert after the last existing account declaration, or at top after comments
  const lines = content.split("\n");
  let lastAccountLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^account\s+/.test(lines[i])) lastAccountLine = i;
  }
  // Skip if already declared
  if (lines.some((l) => l.trim() === `account ${name}`))
    return { success: true };
  const insertAt = lastAccountLine >= 0 ? lastAccountLine + 1 : 0;
  lines.splice(insertAt, 0, `account ${name}`);
  await writeFile(JOURNAL, lines.join("\n"), "utf-8");
  try {
    await execAsync(`hledger -f "${JOURNAL}" check`);
    invalidateCache();
    return { success: true };
  } catch (e: any) {
    await writeFile(JOURNAL, content, "utf-8");
    return { success: false, error: "Validation failed" };
  }
}

export async function deleteAccountDeclaration(
  name: string,
): Promise<{ success: boolean; error?: string }> {
  const { readFile, writeFile } = await import("node:fs/promises");
  const JOURNAL = READ_JOURNAL;
  const content = await readFile(JOURNAL, "utf-8");
  const lines = content.split("\n");
  const filtered = lines.filter((l) => {
    const m = l.match(/^account\s+(.+?)(\s*;.*)?$/);
    return !(m && m[1].trim() === name);
  });
  if (filtered.length === lines.length)
    return { success: false, error: "Account declaration not found" };
  await writeFile(JOURNAL, filtered.join("\n"), "utf-8");
  invalidateCache();
  return { success: true };
}

// ─── Write Transactions ────────────────────────────────────────────────────────

export async function appendTransaction(txn: {
  date: string;
  description: string;
  comment?: string;
  postings: { account: string; amount: string }[];
}): Promise<{ success: boolean; error?: string; txid?: string }> {
  const { readFile, writeFile } = await import("node:fs/promises");

  // Generate a stable unique ID for this transaction
  const txid = nanoid(12);

  // Build journal entry text — tags go on indented comment line after header
  const commentParts = [`txid: ${txid}`];
  if (txn.comment) commentParts.push(txn.comment);
  const header = `\n${txn.date} ${txn.description}`;
  const lines = [header, `    ; ${commentParts.join(", ")}`];
  for (const p of txn.postings) {
    const amt = normaliseAmount(p.amount.trim());
    lines.push(fmtPosting(p.account, amt || undefined));
  }
  const entry = lines.join("\n") + "\n";

  const JOURNAL = await getWriteJournal();
  const original = await readFile(JOURNAL, "utf-8");
  await writeFile(JOURNAL, original + entry, "utf-8");

  try {
    await execAsync(`hledger -f "${JOURNAL}" check`);
    await sortJournalByDate();
    invalidateCache();
    return { success: true, txid };
  } catch (e: any) {
    // Revert
    await writeFile(JOURNAL, original, "utf-8");
    const msg: string = e.stderr ?? e.stdout ?? "Validation failed";
    // Trim the hledger error to something readable
    const clean = msg
      .split("\n")
      .filter((l: string) => l.trim())
      .slice(0, 3)
      .join(" ");
    return { success: false, error: clean };
  }
}

// ─── Journal Validation ─────────────────────────────────────────────────────────

export async function checkJournal(): Promise<{ ok: boolean; error?: string }> {
  const JOURNAL = await getWriteJournal();
  try {
    await execAsync(`hledger check -f "${JOURNAL}"`);
    return { ok: true };
  } catch (e: any) {
    const msg = [e.stderr ?? "", e.stdout ?? ""]
      .filter(Boolean)
      .join("\n")
      .trim();
    return { ok: false, error: msg };
  }
}

export async function getUncategorizedCount(): Promise<number> {
  const raw = await runJson<any[]>(["register", "expenses:unknown"]);
  return (raw ?? []).length;
}
