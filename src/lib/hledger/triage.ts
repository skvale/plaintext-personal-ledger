import { runJson } from "./cache.js";
import { pickAmount, pickCommodity, extractTag } from "./parsing.js";
import { invalidateCache } from "./cache.js";
import { execAsync } from "./exec.js";
import { getWriteJournal } from "./journal.js";
import { getRulesFiles, getRulesContent, parseRulesFile } from "./import.js";
import { getAccountNames } from "./transactions.js";
import { suggestAccount } from "../keywords.js";
import type { UncategorizedTxn } from "./types.js";

export type { UncategorizedTxn };

// ─── Uncategorized Transactions ───────────────────────────────────────────────

export async function getUncategorizedTransactions(): Promise<
  UncategorizedTxn[]
> {
  const raw = await runJson<any[]>(["print", "expenses:unknown"]);
  if (!Array.isArray(raw)) return [];

  const results: UncategorizedTxn[] = [];
  for (const txn of raw) {
    const postings: any[] = txn.tpostings ?? [];
    for (const posting of postings) {
      if (posting.paccount === "expenses:unknown") {
        const other =
          postings.find((p: any) => p.paccount !== "expenses:unknown")
            ?.paccount ?? "";
        const txid = extractTag(txn.ttags ?? [], "txid");
        results.push({
          tindex: txn.tindex,
          txid,
          date: txn.tdate,
          description: txn.tpayee
            ? `${txn.tpayee} | ${txn.tdescription ?? ""}`
            : (txn.tdescription ?? ""),
          amount: Math.abs(pickAmount(posting.pamount)),
          commodity: pickCommodity(posting.pamount),
          otherAccount: other,
        });
      }
    }
  }
  return results;
}

// ─── Suggestions ───────────────────────────────────────────────────────────────

export async function getTxnSuggestions(
  descriptions: string[],
): Promise<Record<string, { account: string; source: "journal" | "rule" }>> {
  const result: Record<
    string,
    { account: string; source: "journal" | "rule" }
  > = {};

  // Rule-based suggestions
  const rulesFiles = await getRulesFiles();
  const ruleEntries: { pattern: string; account: string }[] = [];
  for (const file of rulesFiles) {
    try {
      const content = await getRulesContent(file);
      const parsed = parseRulesFile(content);
      for (const item of parsed.items) {
        if (
          item.type === "rule" &&
          item.account &&
          item.account !== "expenses:unknown"
        ) {
          for (const pat of (item.patterns ?? "").split("|")) {
            const p = pat.trim();
            if (p) ruleEntries.push({ pattern: p, account: item.account });
          }
        }
      }
    } catch {}
  }
  for (const desc of descriptions) {
    const lower = desc.toLowerCase();
    for (const { pattern, account } of ruleEntries) {
      if (lower.includes(pattern.toLowerCase())) {
        result[desc] = { account, source: "rule" };
        break;
      }
    }
  }

  // Journal-based suggestions
  try {
    const raw = await runJson<any[]>([
      "-I",
      "print",
      "acct:expenses",
      "not:acct:expenses:unknown",
    ]);
    if (Array.isArray(raw)) {
      const journalEntries: {
        desc: string;
        account: string;
        words: string[];
      }[] = [];
      for (const txn of raw) {
        const desc: string = txn.tdescription ?? "";
        const expPosting = (txn.tpostings ?? []).find(
          (p: any) =>
            p.paccount?.startsWith("expenses:") &&
            p.paccount !== "expenses:unknown",
        );
        if (expPosting && desc) {
          journalEntries.push({
            desc,
            account: expPosting.paccount,
            words: desc
              .toLowerCase()
              .split(/\W+/)
              .filter((w) => w.length > 2),
          });
        }
      }

      for (const desc of descriptions) {
        if (result[desc]) continue;
        const exact = journalEntries.find((e) => e.desc === desc);
        if (exact) {
          result[desc] = { account: exact.account, source: "journal" };
          continue;
        }
        const queryWords = desc
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length > 2);
        if (queryWords.length === 0) continue;
        let bestScore = 0;
        let bestAccount = "";
        for (const entry of journalEntries) {
          const overlap = queryWords.filter((w) =>
            entry.words.includes(w),
          ).length;
          const score =
            overlap / Math.max(queryWords.length, entry.words.length);
          if (overlap > 0 && score > bestScore) {
            bestScore = score;
            bestAccount = entry.account;
          }
        }
        if (bestAccount && bestScore >= 0.3) {
          result[desc] = { account: bestAccount, source: "journal" };
        }
      }
    }
  } catch {}

  // Keyword fallback
  try {
    const accounts = await getAccountNames();
    const expenseAccounts = accounts.filter(
      (a) => a.startsWith("expenses:") && a !== "expenses:unknown",
    );

    for (const desc of descriptions) {
      if (result[desc]) continue;
      const lower = desc.toLowerCase();

      let suggestedAccount = "";
      const kwSuggestion = await suggestAccount(desc);
      if (kwSuggestion) suggestedAccount = kwSuggestion;
      if (suggestedAccount) {
        result[desc] = { account: suggestedAccount, source: "journal" };
      }
    }
  } catch {}

  return result;
}

// ─── Recategorize ─────────────────────────────────────────────────────────────

export async function recategorizeMany(
  tindexes: number[],
  newAccount: string,
): Promise<{ success: boolean; error?: string }> {
  for (const tindex of tindexes) {
    const r = await recategorize(tindex, newAccount);
    if (!r.success) return r;
  }
  return { success: true };
}

export async function recategorize(
  tindex: number,
  newAccount: string,
): Promise<{ success: boolean; error?: string }> {
  const { readFile, writeFile } = await import("node:fs/promises");

  if (!newAccount || !/^[a-zA-Z][\w:. -]*$/.test(newAccount))
    return { success: false, error: "Invalid account name" };

  const JOURNAL = await getWriteJournal();
  const original = await readFile(JOURNAL, "utf-8");
  const lines = original.split("\n");

  const txnStarts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\d{4}-\d{2}-\d{2}/.test(lines[i])) txnStarts.push(i);
  }

  if (tindex < 1 || tindex > txnStarts.length)
    return {
      success: false,
      error: `Transaction ${tindex} not found in journal`,
    };

  const start = txnStarts[tindex - 1];
  const end = tindex < txnStarts.length ? txnStarts[tindex] : lines.length;

  let found = false;
  const newLines = [...lines];
  for (let i = start; i < end; i++) {
    if (/\bexpenses:unknown\b/.test(newLines[i])) {
      newLines[i] = newLines[i].replace(/\bexpenses:unknown\b/, newAccount);
      found = true;
      break;
    }
  }

  if (!found)
    return {
      success: false,
      error: "expenses:unknown not found in this transaction",
    };

  await writeFile(JOURNAL, newLines.join("\n"), "utf-8");
  try {
    await execAsync(`hledger -f "${JOURNAL}" check`);
    invalidateCache();
    return { success: true };
  } catch (e: any) {
    await writeFile(JOURNAL, original, "utf-8");
    const msg = (e.stderr ?? e.stdout ?? "")
      .split("\n")
      .filter((l: string) => l.trim())
      .slice(0, 3)
      .join(" ");
    return { success: false, error: msg || "Validation failed" };
  }
}
