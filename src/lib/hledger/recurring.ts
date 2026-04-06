import { readFile, writeFile } from "node:fs/promises";
import { runJson } from "./cache.js";
import { pickAmount } from "./parsing.js";
import { getWriteJournal, RECURRING_JOURNAL } from "./journal.js";
import { invalidateCache } from "./cache.js";
import { execAsync } from "./exec.js";
import { fmtPosting, fmtAmount } from "./parsing.js";
import type { ForecastTransaction, ForecastPosting } from "./types.js";

export type { ForecastTransaction, ForecastPosting };

// ─── Recurring Rules ──────────────────────────────────────────────────────────

export interface RecurringRule {
  id: number;
  frequency: string;
  from?: string;
  description?: string;
  postings: { account: string; amount: string }[];
}

export async function getRecurringRules(): Promise<RecurringRule[]> {
  const content = await readFile(RECURRING_JOURNAL, "utf-8").catch(() => "");
  if (!content.trim()) return [];
  const lines = content.split("\n");
  const rules: RecurringRule[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trimStart().startsWith("~")) {
      const spec = line.replace(/^\s*~\s*/, "").trim();
      const fromMatch = spec.match(/\bfrom\s+(\d{4}-\d{2}-\d{2})/);
      const from = fromMatch?.[1];
      const withoutFrom = spec.replace(/\bfrom\s+\d{4}-\d{2}-\d{2}/, "").trim();
      const freqMatch = withoutFrom.match(
        /^(monthly|weekly|yearly|daily|quarterly|biweekly|bimonthly)/i,
      );
      const frequency =
        freqMatch?.[1]?.toLowerCase() ?? withoutFrom.split(/\s/)[0];
      const description =
        withoutFrom.replace(frequency, "").trim() || undefined;

      const postings: { account: string; amount: string }[] = [];
      i++;
      while (
        i < lines.length &&
        (lines[i].startsWith("    ") || lines[i].startsWith("\t"))
      ) {
        const posting = lines[i].trim();
        if (posting) {
          const parts =
            posting.match(/^(.+?)\s{2,}(\S+.*)$/) ?? posting.match(/^(.+)$/);
          postings.push({
            account: parts?.[1]?.trim() ?? posting,
            amount: parts?.[2]?.trim() ?? "",
          });
        }
        i++;
      }
      rules.push({ id: rules.length, frequency, from, description, postings });
    } else {
      i++;
    }
  }
  return rules;
}

function serializeRule(rule: RecurringRule): string {
  const periodSpec = [rule.frequency, rule.from ? `from ${rule.from}` : ""]
    .filter(Boolean)
    .join(" ");
  const header = rule.description
    ? `~ ${periodSpec}  ${rule.description}`
    : `~ ${periodSpec}`;
  const postingLines = rule.postings.map((p) => {
    const amt = p.amount.trim();
    return amt
      ? `    ${p.account}  ${amt.startsWith("$") ? amt : "$" + amt}`
      : `    ${p.account}`;
  });
  return [header, ...postingLines].join("\n");
}

export async function saveRecurringRules(
  rules: RecurringRule[],
): Promise<{ success: boolean; error?: string }> {
  const header = `; Recurring transaction rules\n; These generate forecast transactions when hledger is run with --forecast.\n; Materialize past-due entries via the Forecast UI to turn them into real transactions.\n`;
  const body = rules.map(serializeRule).join("\n\n");
  await writeFile(RECURRING_JOURNAL, header + "\n" + body + "\n", "utf-8");
  try {
    const JOURNAL = await getWriteJournal();
    await execAsync(`hledger -f "${JOURNAL}" check`);
    invalidateCache();
    return { success: true };
  } catch (e: any) {
    const msg: string = e.stderr ?? e.stdout ?? "Validation failed";
    const clean = msg
      .split("\n")
      .filter((l: string) => l.trim())
      .slice(0, 3)
      .join(" ");
    return { success: false, error: clean };
  }
}

export async function appendRecurringRule(
  rule: RecurringRule,
): Promise<{ success: boolean; error?: string }> {
  const periodSpec = [rule.frequency, rule.from ? `from ${rule.from}` : ""]
    .filter(Boolean)
    .join(" ");

  const lines = [
    rule.description
      ? `\n~ ${periodSpec}  ${rule.description}`
      : `\n~ ${periodSpec}`,
  ];
  for (const p of rule.postings) {
    const amt = p.amount.trim();
    if (amt) {
      const num = amt.replace(/^\$/, "");
      lines.push(`    ${p.account}  $${num}`);
    } else {
      lines.push(`    ${p.account}`);
    }
  }
  const entry = lines.join("\n") + "\n";

  const original = await readFile(RECURRING_JOURNAL, "utf-8").catch(() => "");
  await writeFile(RECURRING_JOURNAL, original + entry, "utf-8");

  try {
    const JOURNAL = await getWriteJournal();
    await execAsync(`hledger -f "${JOURNAL}" check`);
    invalidateCache();
    return { success: true };
  } catch (e: any) {
    await writeFile(RECURRING_JOURNAL, original, "utf-8");
    const msg: string = e.stderr ?? e.stdout ?? "Validation failed";
    const clean = msg
      .split("\n")
      .filter((l: string) => l.trim())
      .slice(0, 3)
      .join(" ");
    return { success: false, error: clean };
  }
}

// ─── Forecast ─────────────────────────────────────────────────────────────────

export async function getPastDueForecast(): Promise<ForecastTransaction[]> {
  const today = new Date().toISOString().slice(0, 10);
  const range = `2000-01-01..${today}`;
  const raw = await runJson<any[]>([
    "print",
    "--forecast",
    "-p",
    range,
    "tag:generated-transaction",
  ]);
  if (!raw) return [];
  return raw.map((tx: any) => ({
    date: tx.tdate ?? "",
    description: tx.tdescription ?? "",
    postings: (tx.tpostings ?? []).map((p: any) => {
      const amt = pickAmount(p.pamount);
      return {
        account: p.paccount ?? "",
        amount: amt,
        auto: !p.pamount?.length,
      };
    }),
  }));
}

export async function materializePastDue(
  transactions: ForecastTransaction[],
): Promise<{ success: boolean; error?: string }> {
  if (!transactions.length) return { success: true };

  const lines: string[] = [];
  for (const tx of transactions) {
    lines.push(`\n${tx.date} ${tx.description}`);
    for (const p of tx.postings) {
      lines.push(
        fmtPosting(p.account, p.auto ? undefined : fmtAmount(p.amount)),
      );
    }
  }
  const entry = lines.join("\n") + "\n";

  const journalPath = await getWriteJournal();
  const original = await readFile(journalPath, "utf-8");
  await writeFile(journalPath, original + entry, "utf-8");

  try {
    const cmd = `hledger -f "${journalPath}" check`;
    await execAsync(cmd);
    invalidateCache();
    return { success: true };
  } catch (e: any) {
    await writeFile(journalPath, original, "utf-8");
    const msg: string = e.stderr ?? e.stdout ?? "Validation failed";
    const clean = msg
      .split("\n")
      .filter((l: string) => l.trim())
      .slice(0, 3)
      .join(" ");
    return { success: false, error: clean };
  }
}

export async function getForecast(months = 3): Promise<ForecastTransaction[]> {
  const rules = await getRecurringRules();
  const earliestFrom = rules
    .map((r) => r.from)
    .filter(Boolean)
    .sort()[0];
  const forecastArg = earliestFrom
    ? `--forecast=${earliestFrom}..`
    : "--forecast";
  const end = new Date();
  end.setMonth(end.getMonth() + months + 1);
  end.setDate(1);
  const rangeStart = earliestFrom ?? new Date().toISOString().slice(0, 10);
  const rangeEnd = end.toISOString().slice(0, 10);
  const range = `${rangeStart}..${rangeEnd}`;
  const realRaw = await runJson<any[]>(["print", "-p", range]);
  const realKeys = new Set<string>(
    (realRaw ?? []).map((tx: any) => {
      const desc = (tx.tdescription || tx.tcomment || "")
        .trim()
        .replace(/\n.*$/s, "");
      return `${tx.tdate}|${desc}`;
    }),
  );

  const raw = await runJson<any[]>([
    "print",
    "-I",
    forecastArg,
    "-p",
    range,
    "tag:generated-transaction",
  ]);
  if (!raw) return [];
  return raw
    .filter((tx: any) => {
      const desc = (tx.tdescription || tx.tcomment || "")
        .trim()
        .replace(/\n.*$/s, "");
      return !realKeys.has(`${tx.tdate}|${desc}`);
    })
    .map((tx: any) => {
      const postings = (tx.tpostings ?? []).map((p: any) => ({
        account: p.paccount ?? "",
        amount: pickAmount(p.pamount),
        auto: false,
      }));
      if (postings.length > 0) postings[postings.length - 1].auto = true;
      const description = (tx.tdescription || tx.tcomment || "")
        .trim()
        .replace(/\n.*$/s, "");
      return { date: tx.tdate ?? "", description, postings };
    });
}
