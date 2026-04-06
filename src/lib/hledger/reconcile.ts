import { readFile, writeFile } from "node:fs/promises";
import { runJson } from "./cache.js";
import { pickAmount, extractTag } from "./parsing.js";
import { getWriteJournal } from "./journal.js";
import { invalidateCache } from "./cache.js";
import { execAsync } from "./exec.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ReconcileTx {
  tindex: number;
  txid?: string;
  date: string;
  description: string;
  amount: number;
  status: "cleared" | "pending" | "uncleared";
}

// ─── Reconcile Skip Accounts ───────────────────────────────────────────────────

async function getReconcileSkipAccounts(): Promise<Set<string>> {
  const journalPath = await getWriteJournal();
  const content = await readFile(journalPath, "utf-8");
  const skipped = new Set<string>();
  for (const line of content.split("\n")) {
    const m = line.match(/^account\s+(\S+).*;\s*reconcile\s*:\s*skip/);
    if (m) skipped.add(m[1]);
  }
  return skipped;
}

// ─── Reconcile Patterns ────────────────────────────────────────────────────────

// Accounts that make sense to reconcile against a statement
const RECONCILABLE_PATTERNS = [
  "assets:bank",
  "assets:checking",
  "assets:savings",
  "assets:brokerage",
  "assets:investment",
  "liabilities:credit",
  "liabilities:card",
];

// Accounts that don't make sense to reconcile
const NON_RECONCILABLE_PATTERNS = [
  "assets:cash",
  "assets:house",
  "assets:home",
  "assets:property",
  "assets:reimbursement",
  "assets:receivable",
  "liabilities:mortgage",
  "liabilities:loan",
  "liabilities:student",
  "liabilities:payable",
];

function isReconcilable(acct: string): boolean {
  const lower = acct.toLowerCase();
  if (!lower.includes(":")) return false;
  if (NON_RECONCILABLE_PATTERNS.some((p) => lower.startsWith(p))) return false;
  if (RECONCILABLE_PATTERNS.some((p) => lower.startsWith(p))) return true;
  return lower.startsWith("assets:");
}

// ─── Reconcile Operations ─────────────────────────────────────────────────────

export async function getAccountsWithUncleared(): Promise<string[]> {
  try {
    const [txns, skipSet] = await Promise.all([
      runJson<any[]>(["print", "status:!"]),
      getReconcileSkipAccounts(),
    ]);
    if (!Array.isArray(txns)) return [];
    const seen = new Set<string>();
    for (const tx of txns) {
      for (const p of tx.tpostings ?? []) {
        const acct: string = p.paccount ?? "";
        if (!isReconcilable(acct)) continue;
        if (
          skipSet.has(acct) ||
          [...skipSet].some((s) => acct.startsWith(s + ":"))
        )
          continue;
        if ((p.pstatus ?? "Unmarked") !== "Cleared") seen.add(acct);
      }
    }
    const all = [...seen].sort();
    return all.filter(
      (a) => !all.some((b) => b !== a && b.startsWith(a + ":")),
    );
  } catch {
    return [];
  }
}

export async function getReconcileData(account: string): Promise<{
  transactions: ReconcileTx[];
  clearedBalance: number;
}> {
  const printData = await runJson<any[]>(["print", account]);

  const transactions: ReconcileTx[] = (printData ?? []).map((tx: any) => {
    const postings = (tx.tpostings ?? []).filter(
      (p: any) =>
        p.paccount === account || p.paccount.startsWith(account + ":"),
    );
    const amount = postings.reduce(
      (s: number, p: any) => s + pickAmount(p.pamount),
      0,
    );
    const ps: string =
      postings.length > 0 ? (postings[0].pstatus ?? "Unmarked") : "Unmarked";
    const status =
      ps === "Cleared" ? "cleared" : ps === "Pending" ? "pending" : "uncleared";
    const txDesc = tx.tpayee
      ? `${tx.tpayee} | ${tx.tdescription ?? ""}`
      : (tx.tdescription ?? "");
    const txid = extractTag(tx.ttags ?? [], "txid");
    return {
      tindex: tx.tindex,
      txid,
      date: tx.tdate,
      description: txDesc,
      amount,
      status,
    };
  });

  const clearedBalance = transactions
    .filter((tx) => tx.status === "cleared")
    .reduce((s, tx) => s + tx.amount, 0);

  return { transactions, clearedBalance };
}

export async function setTransactionCleared(
  tindex: number,
  cleared: boolean,
  account: string,
): Promise<{ success: boolean; error?: string }> {
  const journalPath = await getWriteJournal();
  const original = await readFile(journalPath, "utf-8");
  const lines = original.split("\n");

  const txnStarts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\d{4}-\d{2}-\d{2}/.test(lines[i])) txnStarts.push(i);
  }

  if (tindex < 1 || tindex > txnStarts.length)
    return { success: false, error: `Transaction ${tindex} not found` };

  const lineIdx = txnStarts[tindex - 1];
  const nextTxnLine =
    tindex < txnStarts.length ? txnStarts[tindex] : lines.length;

  let modified = false;
  for (let i = lineIdx + 1; i < nextTxnLine; i++) {
    const m = lines[i].match(/^(\s+)([*!]\s+)?([^\s;].*)$/);
    if (!m) continue;
    const [, indent, , rest] = m;
    const acctName = rest.split(/\s{2,}/)[0].trim();
    if (acctName !== account && !acctName.startsWith(account + ":")) continue;
    lines[i] = cleared ? `${indent}* ${rest}` : `${indent}${rest}`;
    modified = true;
  }

  if (!modified) return { success: false, error: "Posting not found" };

  await writeFile(journalPath, lines.join("\n"), "utf-8");
  try {
    const cmd = `hledger -f "${journalPath}" check`;
    await execAsync(cmd);
    invalidateCache();
    return { success: true };
  } catch (e: any) {
    await writeFile(journalPath, original, "utf-8");
    return { success: false, error: "Validation failed" };
  }
}
