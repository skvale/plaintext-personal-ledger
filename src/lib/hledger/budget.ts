import { readFile, writeFile } from "node:fs/promises";
import { runJson } from "./cache.js";
import { pickAmount } from "./parsing.js";
import { getWriteJournal, BUDGET_JOURNAL } from "./journal.js";
import { fmtPosting, fmtAmount } from "./parsing.js";

// ─── Budget Types ─────────────────────────────────────────────────────────────

export interface BudgetEntry {
  account: string;
  amount: number; // monthly target, positive
}

// ─── Budget Operations ─────────────────────────────────────────────────────────

export async function getBudgetEntries(): Promise<BudgetEntry[]> {
  try {
    const content = await readFile(BUDGET_JOURNAL, "utf-8");
    const entries: BudgetEntry[] = [];
    let inBlock = false;
    for (const line of content.split("\n")) {
      if (line.trimStart().startsWith("~")) {
        inBlock = true;
        continue;
      }
      if (!inBlock) continue;
      if (line.startsWith("    ") || line.startsWith("\t")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(";")) continue;
        const m = trimmed.match(/^(.+?)\s{2,}\$?([\d,]+(?:\.\d+)?)$/);
        if (m) {
          const amount = parseFloat(m[2].replace(/,/g, ""));
          if (!isNaN(amount) && amount > 0)
            entries.push({ account: m[1].trim(), amount });
        }
      } else {
        inBlock = false;
      }
    }
    return entries;
  } catch {
    return [];
  }
}

export async function saveBudgetEntries(entries: BudgetEntry[]): Promise<void> {
  const header =
    `; Monthly budget targets\n` +
    `; CLI: hledger balance --budget -p thismonth expenses\n`;

  // Auto-add include directive to main journal if missing
  try {
    const mainJournalPath = await getWriteJournal();
    const mainContent = await readFile(mainJournalPath, "utf-8");
    if (!mainContent.includes("include budget.journal")) {
      const includeDirective = "\ninclude budget.journal\n";
      await writeFile(mainJournalPath, mainContent + includeDirective, "utf-8");
    }
  } catch {
    /* main journal may not exist yet */
  }

  if (entries.length === 0) {
    await writeFile(BUDGET_JOURNAL, header, "utf-8");
    return;
  }
  const postingLines = entries
    .sort((a, b) => a.account.localeCompare(b.account))
    .map((e) => fmtPosting(e.account, fmtAmount(e.amount)));
  await writeFile(
    BUDGET_JOURNAL,
    `${header}\n~ monthly\n${postingLines.join("\n")}\n`,
    "utf-8",
  );
}

export async function getBudgetStatus(
  period = "thismonth",
): Promise<{ account: string; budget: number; actual: number }[]> {
  const entries = await getBudgetEntries();
  if (entries.length === 0) return [];

  const data = await runJson<any>(["bal", "expenses", "--tree", "-p", period]);
  const rows: any[] = Array.isArray(data) ? (data[0] ?? []) : [];
  const balMap = new Map<string, number>();
  for (const row of rows)
    balMap.set(row[0] as string, Math.abs(pickAmount(row[3])));

  return entries
    .map((e) => ({
      account: e.account,
      budget: e.amount,
      actual: balMap.get(e.account) ?? 0,
    }))
    .sort((a, b) => a.account.localeCompare(b.account));
}
