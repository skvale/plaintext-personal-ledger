import { readFile, writeFile, readdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { runJson } from "./cache.js";
import { pickAmount, pickCommodity, extractTag } from "./parsing.js";
import { getWriteJournal, JOURNAL_DIR, STATEMENTS_DIR } from "./journal.js";
import { invalidateCache } from "./cache.js";
import { execAsync } from "./exec.js";
import { PENDING_IMPORT_TTL } from "./constants.js";
import { loadKeywordIndex } from "../keywords.js";
import type {
  RulesItem,
  ParsedRulesFile,
  CsvDetectionResult,
} from "./types.js";
export type { CsvDetectionResult };

// ─── Rules Files ──────────────────────────────────────────────────────────────

export async function getRulesFiles(): Promise<string[]> {
  try {
    const files = await readdir(JOURNAL_DIR);
    return files.filter((f) => f.endsWith(".rules")).sort();
  } catch {
    return [];
  }
}

export async function getRulePatternsByFile(): Promise<
  Record<string, string[]>
> {
  const files = await getRulesFiles();
  const result: Record<string, string[]> = {};
  for (const file of files) {
    try {
      const content = await getRulesContent(file);
      const parsed = parseRulesFile(content);
      result[file] = parsed.items
        .filter((item) => item.type === "rule" && "patterns" in item)
        .map(
          (item) => (item as { type: "rule"; patterns: string }).patterns ?? "",
        );
    } catch {
      result[file] = [];
    }
  }
  return result;
}

export async function getRulesContent(filename: string): Promise<string> {
  if (!/^[\w.-]+\.rules$/.test(filename)) throw new Error("Invalid filename");
  return readFile(join(JOURNAL_DIR, filename), "utf-8");
}

// ─── CSV Detection ─────────────────────────────────────────────────────────────

// Comprehensive map of CSV column name aliases to hledger field names
const CSV_FIELD_ALIASES: Record<string, string[]> = {
  date: [
    "date",
    "transaction date",
    "trans date",
    "posting date",
    "posted date",
    "trade date",
    "settlement date",
    "book date",
    "value date",
  ],
  date2: ["effective date", "post date", "settlement date"],
  description: [
    "description",
    "desc",
    "memo",
    "narration",
    "narrative",
    "particulars",
    "payee",
    "merchant",
    "transaction description",
    "trans desc",
    "reference",
    "details",
    "name",
  ],
  amount: [
    "amount",
    "total",
    "sum",
    "value",
    "net",
    "transaction amount",
    "trans amount",
  ],
  "amount-in": [
    "credit",
    "deposit",
    "credits",
    "deposits",
    "amount in",
    "money in",
    "inflow",
  ],
  "amount-out": [
    "debit",
    "withdrawal",
    "debits",
    "withdrawals",
    "amount out",
    "money out",
    "outflow",
    "charge",
  ],
  code: [
    "check",
    "check number",
    "cheque",
    "ref",
    "ref no",
    "transaction id",
    "id",
    "transaction ref",
  ],
  comment: [
    "note",
    "notes",
    "comment",
    "category",
    "tag",
    "type",
    "transaction type",
  ],
  currency: ["currency", "ccy", "cur"],
  balance: [
    "balance",
    "running balance",
    "available balance",
    "ledger balance",
  ],
};

// Build reverse lookup: normalized alias → hledger field
const ALIAS_TO_FIELD: Record<string, string> = {};
for (const [field, aliases] of Object.entries(CSV_FIELD_ALIASES)) {
  for (const alias of aliases) {
    ALIAS_TO_FIELD[normalizeKey(alias)] = field;
  }
}

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function sniffDateFormat(sample: string): string {
  const s = sample.trim();
  // ISO: 2024-01-15 or 2024/01/15
  if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(s)) {
    const sep = s[4];
    return `%Y${sep}%m${sep}%d`;
  }
  // MM/DD/YYYY — check zero-padded first
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return "%m/%d/%Y";
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return "%-m/%-d/%Y";
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return "%m-%d-%Y";
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) return "%-m-%-d-%Y";
  // MM/DD/YY
  if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(s)) return "%-m/%-d/%y";
  // Jan 15, 2024
  if (/^[A-Za-z]{3}\s+\d{1,2},?\s+\d{4}$/.test(s)) return "%b %-d, %Y";
  // 15 Jan 2024
  if (/^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/.test(s)) return "%-d %b %Y";
  return "%Y-%m-%d";
}

/** Parse a CSV line respecting quoted fields */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

export async function detectCsvFromPath(
  csvPath: string,
): Promise<CsvDetectionResult | null> {
  try {
    const raw = await readFile(csvPath, "utf-8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return null;

    const headers = parseCsvLine(lines[0]);
    const firstRow = parseCsvLine(lines[1]);

    // Map each column to an hledger field, skip duplicates
    const seen = new Set<string>();
    const mapped = headers.map((h) => {
      const field = ALIAS_TO_FIELD[normalizeKey(h)] ?? "";
      if (!field || seen.has(field)) return "";
      seen.add(field);
      return field;
    });

    // Sniff date format from the first data row
    const dateIdx = mapped.indexOf("date");
    const dateFormat =
      dateIdx >= 0 && firstRow[dateIdx]
        ? sniffDateFormat(firstRow[dateIdx])
        : "%Y-%m-%d";

    // Collect unique descriptions for rule generation
    const descIdx = mapped.indexOf("description");
    const descriptions: string[] = [];
    if (descIdx >= 0) {
      const seenDesc = new Set<string>();
      for (let r = 1; r < lines.length; r++) {
        const row = parseCsvLine(lines[r]);
        const rawDesc = row[descIdx]?.trim() ?? "";
        const desc = rawDesc.split(";")[0].trim();
        if (desc && !seenDesc.has(desc.toUpperCase())) {
          seenDesc.add(desc.toUpperCase());
          descriptions.push(desc);
        }
      }
    }

    return {
      skip: "1",
      fields: mapped.join(", "),
      dateFormat,
      currency: "$",
      account2: "expenses:unknown",
      descriptions: descriptions.slice(0, 200),
    };
  } catch {
    return null;
  }
}

export async function detectCsvDefaults(
  rulesFilename: string,
): Promise<CsvDetectionResult | null> {
  const csvName = rulesFilename.replace(/\.rules$/, "");
  if (!csvName.endsWith(".csv")) return null;

  let csvPath = "";
  async function findCsv(dir: string): Promise<void> {
    if (csvPath) return;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (csvPath) return;
        const full = join(dir, e.name);
        if (e.isDirectory()) await findCsv(full);
        else if (e.name === csvName) {
          csvPath = full;
          return;
        }
      }
    } catch {}
  }
  await findCsv(STATEMENTS_DIR);
  if (!csvPath) return null;
  return detectCsvFromPath(csvPath);
}

/** Generate a complete .rules file content from raw CSV text */
export async function generateRulesFromCsvContent(
  csvContent: string,
  csvName: string,
): Promise<string | null> {
  try {
    const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return null;

    const headers = parseCsvLine(lines[0]);
    const firstRow = parseCsvLine(lines[1]);

    // Map each column to an hledger field, skip duplicates
    const seen = new Set<string>();
    const mapped = headers.map((h) => {
      const field = ALIAS_TO_FIELD[normalizeKey(h)] ?? "";
      if (!field || seen.has(field)) return "";
      seen.add(field);
      return field;
    });

    // Sniff date format
    const dateIdx = mapped.indexOf("date");
    const dateFormat =
      dateIdx >= 0 && firstRow[dateIdx]
        ? sniffDateFormat(firstRow[dateIdx])
        : "%Y-%m-%d";

    // Detect amount-in/amount-out vs single amount
    const hasAmountInOut =
      mapped.includes("amount-in") || mapped.includes("amount-out");

    // Build fields line
    const fieldsLine = mapped.join(", ");

    // Collect unique descriptions for rule generation
    const descIdx = mapped.indexOf("description");
    const descriptions: string[] = [];
    if (descIdx >= 0) {
      const seenDesc = new Set<string>();
      for (let r = 1; r < lines.length; r++) {
        const row = parseCsvLine(lines[r]);
        const rawDesc = row[descIdx]?.trim() ?? "";
        const desc = rawDesc.split(";")[0].trim();
        if (desc && !seenDesc.has(desc.toUpperCase())) {
          seenDesc.add(desc.toUpperCase());
          descriptions.push(desc);
        }
      }
    }

    // Find unmapped columns for comments
    const unmapped = headers.filter((_, i) => !mapped[i]);

    // Build output
    const out: string[] = [];
    out.push(`# rules file generated from: ${csvName}`);
    out.push(`# headers: ${headers.join(", ")}`);
    out.push("");
    out.push("skip 1");
    out.push("");
    out.push(`fields ${fieldsLine}`);
    out.push("");
    out.push(`date-format ${dateFormat}`);
    out.push("");
    out.push("# default accounts — edit these");
    out.push("account1 expenses:unknown");
    out.push("account2 assets:checking");
    out.push("");

    if (hasAmountInOut) {
      out.push(
        "# amount-in/amount-out detected — hledger handles sign automatically",
      );
      out.push("");
    }

    if (unmapped.length > 0) {
      out.push("# unmapped columns (skipped):");
      unmapped.forEach((h) => out.push(`#   ${h}`));
      out.push("");
    }

    if (descriptions.length > 0) {
      const index = await loadKeywordIndex();
      out.push("# classification rules — edit accounts below:");
      for (const desc of descriptions) {
        const lower = desc.toLowerCase();
        let suggestedAccount = "";
        for (const [account, keywords] of Object.entries(index)) {
          if (keywords.some((kw: string) => lower.includes(kw.toLowerCase()))) {
            suggestedAccount = account;
            break;
          }
        }
        out.push("");
        out.push(`if ${desc}`);
        out.push(`  account1 ${suggestedAccount || "expenses:unknown"}`);
      }
      out.push("");
    }

    return out.join("\n");
  } catch {
    return null;
  }
}

/** Generate a complete .rules file content from a CSV file path */
export async function generateRulesFromCsv(
  csvPath: string,
): Promise<string | null> {
  try {
    const raw = await readFile(csvPath, "utf-8");
    const csvName = csvPath.split("/").pop() ?? csvPath;
    return generateRulesFromCsvContent(raw, csvName);
  } catch {
    return null;
  }
}

// ─── Rules Parsing ─────────────────────────────────────────────────────────────

// Top-level directive keywords that belong in the header, not items
const HEADER_DIRECTIVES = new Set([
  "skip",
  "fields",
  "date-format",
  "currency",
  "decimal-mark",
  "separator",
  "encoding",
  "timezone",
  "newest-first",
  "intra-day-reversed",
  "balance-type",
  "source",
  "archive",
]);

function isTopLevelDirective(line: string): boolean {
  const key = line.split(/\s+/)[0];
  return HEADER_DIRECTIVES.has(key) || /^account\d+$/.test(key);
}

export function parseRulesFile(content: string): ParsedRulesFile {
  const lines = content.split("\n");
  const headerLines: string[] = [];
  const items: RulesItem[] = [];
  let inHeader = true;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (inHeader) {
      if (line.startsWith("if ") || line.startsWith("include ")) {
        inHeader = false;
        continue;
      }
      headerLines.push(line);
      i++;
      continue;
    }

    if (isTopLevelDirective(line)) {
      headerLines.push(line);
      i++;
      continue;
    }

    if (line.startsWith("if ")) {
      const patterns = line.slice(3).trim();
      let account = "";
      const assignments: { key: string; value: string }[] = [];
      let j = i + 1;
      while (j < lines.length && /^\s+\S/.test(lines[j])) {
        const t = lines[j].trim();
        const spaceIdx = t.indexOf(" ");
        if (spaceIdx > 0) {
          const key = t.slice(0, spaceIdx);
          const val = t.slice(spaceIdx + 1).trim();
          assignments.push({ key, value: val });
          if (/^account\d*$/.test(key) && !account) account = val;
        }
        j++;
      }
      items.push({ type: "rule", id: `r${i}`, patterns, account, assignments });
      i = j;
    } else if (line.startsWith("include ")) {
      items.push({
        type: "include",
        id: `inc-${i}`,
        path: line.slice(8).trim(),
      });
      i++;
    } else if (/^; ===/.test(line)) {
      const label = line
        .replace(/^;\s*=+\s*/, "")
        .replace(/\s*=+\s*$/, "")
        .trim();
      if (label) items.push({ type: "section", id: `sec-${i}`, label });
      i++;
    } else {
      if (line.trim())
        items.push({ type: "raw", id: `raw-${i}`, content: line });
      i++;
    }
  }

  return { header: headerLines.join("\n"), items };
}

export function serializeRulesFile({ header, items }: ParsedRulesFile): string {
  const out: string[] = [header.trimEnd(), ""];
  for (const item of items) {
    if (item.type === "section") {
      out.push(`; === ${item.label} ===`);
    } else if (item.type === "include") {
      out.push(`include ${item.path}`);
    } else if (item.type === "raw") {
      out.push(item.content ?? "");
    } else {
      out.push(`if ${item.patterns ?? ""}`);
      if (item.assignments && item.assignments.length > 0) {
        for (const a of item.assignments) {
          out.push(` ${a.key} ${a.value}`);
        }
      } else if (item.account) {
        out.push(` account2 ${item.account}`);
      }
      out.push("");
    }
  }
  return (
    out
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd() + "\n"
  );
}

// ─── Rules Writing ─────────────────────────────────────────────────────────────

export async function appendRule(
  filename: string,
  patterns: string,
  account: string,
): Promise<{ success: boolean; error?: string; duplicate?: boolean }> {
  if (!/^[\w.-]+\.rules$/.test(filename))
    return { success: false, error: "Invalid filename" };
  try {
    const content = await getRulesContent(filename);
    const parsed = parseRulesFile(content);
    const existing = parsed.items.find(
      (item) => item.type === "rule" && item.patterns === patterns,
    );
    if (existing)
      return {
        success: false,
        duplicate: true,
        error: `Pattern already exists in ${filename}`,
      };
    parsed.items.push({
      type: "rule",
      id: `r${Date.now()}`,
      patterns,
      account,
      assignments: [{ key: "account2", value: account }],
    });
    return saveRulesFile(filename, parsed);
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function saveRulesFile(
  filename: string,
  parsed: ParsedRulesFile,
): Promise<{ success: boolean; error?: string }> {
  if (!/^[\w./-]+\.rules$/.test(filename))
    return { success: false, error: "Invalid filename" };
  try {
    await writeFile(
      join(JOURNAL_DIR, filename),
      serializeRulesFile(parsed),
      "utf-8",
    );
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function renameRulesFile(
  oldName: string,
  newName: string,
): Promise<{ success: boolean; error?: string }> {
  if (!/^[\w./-]+\.rules$/.test(oldName))
    return { success: false, error: "Invalid old filename" };
  if (!/^[\w./-]+\.rules$/.test(newName))
    return { success: false, error: "Invalid new filename" };
  if (oldName === newName) return { success: true };
  try {
    const { rename } = await import("node:fs/promises");
    await rename(join(JOURNAL_DIR, oldName), join(JOURNAL_DIR, newName));
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function rulesFileExists(filename: string): Promise<boolean> {
  try {
    const { stat } = await import("node:fs/promises");
    await stat(join(JOURNAL_DIR, filename));
    return true;
  } catch {
    return false;
  }
}

// ─── Preview Normalization ─────────────────────────────────────────────────────

function normalizePreview(raw: string): string {
  const blocks = raw.split(/\n\n+/);

  const postingRe = /^(\s{2,})(\S[^$\s]*)(\s+)(\S.*)$/;

  const processed = blocks.map((block) => {
    const lines = block.split("\n");
    let maxAcctLen = 0;
    for (const line of lines) {
      const m = line.match(postingRe);
      if (m) maxAcctLen = Math.max(maxAcctLen, m[2].length);
    }

    return lines
      .map((line, i) => {
        const m = line.match(/^(\s{2,})(\S[^\s]*)(\s{2,})(\S.*)$/);
        if (!m) return line;
        const [, , account, , rest] = m;
        const assertIdx = rest.indexOf(" = ");
        const amount = assertIdx >= 0 ? rest.slice(0, assertIdx) : rest;
        const assertion = assertIdx >= 0 ? rest.slice(assertIdx) : "";
        const isLastPosting = i === lines.length - 1;
        const padding = " ".repeat(Math.max(2, maxAcctLen - account.length + 2));
        if (isLastPosting && amount.trim() && !assertion) {
          return `    ${account}`;
        }
        return `    ${account}${padding}${amount}${assertion}`;
      })
      .join("\n");
  });

  return processed.join("\n\n");
}

// ─── CSV Import ────────────────────────────────────────────────────────────────

const pendingImports = new Map<
  string,
  { csvPath: string; rulesPath: string; ts: number; isTemp: boolean }
>();

export async function importCsvPreview(
  csvContent: string,
  rulesFilename: string,
): Promise<{ output: string; count: number; token: string }> {
  const { writeFile, unlink } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");

  if (!/^[\w.-]+\.rules$/.test(rulesFilename))
    throw new Error("Invalid rules filename");

  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const tmpPath = join(tmpdir(), `hledger-import-${token}.csv`);
  const rulesPath = join(JOURNAL_DIR, rulesFilename);
  const writeJournalPath = await getWriteJournal();

  await writeFile(tmpPath, csvContent, "utf-8");
  pendingImports.set(token, {
    csvPath: tmpPath,
    rulesPath,
    ts: Date.now(),
    isTemp: true,
  });

  prunePendingImports(unlink);

  try {
    const { stdout, stderr } = await execAsync(
      `hledger -f "${writeJournalPath}" -I import --dry-run --rules-file "${rulesPath}" "${tmpPath}"`,
    );
    const raw = [stdout, stderr].filter(Boolean).join("\n").trim();
    const output = normalizePreview(raw);
    const count = (output.match(/^\d{4}-\d{2}-\d{2}/gm) ?? []).length;
    return { output, count, token };
  } catch (e: any) {
    const raw = [e.stdout ?? "", e.stderr ?? ""]
      .filter(Boolean)
      .join("\n")
      .trim();
    const output = normalizePreview(raw);
    const count = (output.match(/^\d{4}-\d{2}-\d{2}/gm) ?? []).length;
    if (count > 0) return { output, count, token };
    throw new Error(raw || "Preview failed.");
  }
}

export async function importCsvConfirm(
  token: string,
): Promise<{ success: boolean; error?: string }> {
  const pending = pendingImports.get(token);
  if (!pending)
    return { success: false, error: "Session expired — please re-preview." };

  pendingImports.delete(token);
  const { unlink, writeFile, appendFile } = await import("node:fs/promises");
  const writeJournalPath = await getWriteJournal();

  try {
    const { stdout, stderr } = await execAsync(
      `hledger -f "${writeJournalPath}" -I import --dry-run --rules-file "${pending.rulesPath}" "${pending.csvPath}"`,
    );
    const raw = [stdout, stderr].filter(Boolean).join("\n").trim();
    const output = normalizePreview(raw);

    const blocks = output
      .split(/\n\n+/)
      .map((b) => b.trim())
      .filter((b) => /^\d{4}-\d{2}-\d{2}/.test(b));

    if (blocks.length === 0) {
      invalidateCache();
      return { success: true };
    }

    const { nanoid } = await import("nanoid");
    const csvName = pending.csvPath.startsWith(STATEMENTS_DIR)
      ? pending.csvPath.slice(STATEMENTS_DIR.length + 1)
      : (pending.csvPath.split("/").pop() ?? "");
    const annotated = blocks
      .map((block) => {
        const txid = nanoid(12);
        return block.replace(
          /^(\d{4}-\d{2}-\d{2}.*)$/m,
          `$1\n    ; txid: ${txid}, imported from ${csvName}`,
        );
      })
      .join("\n\n");

    await appendFile(writeJournalPath, "\n\n" + annotated + "\n");

    const csvDir = pending.csvPath.split("/").slice(0, -1).join("/");
    const csvBaseName = pending.csvPath.split("/").pop() ?? "";
    const dates = blocks
      .map((b) => b.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "")
      .filter(Boolean);
    const maxDate = [...dates].sort().pop() ?? "";
    if (maxDate) {
      await writeFile(
        `${csvDir}/.latest.${csvBaseName}`,
        maxDate + "\n",
        "utf-8",
      );
    }

    invalidateCache();
    return { success: true };
  } catch (e: any) {
    const msg = [e.stderr ?? "", e.stdout ?? ""]
      .filter(Boolean)
      .join("\n")
      .trim();
    return { success: false, error: msg.split("\n").slice(0, 3).join(" ") };
  } finally {
    if (pending.isTemp) await unlink(pending.csvPath).catch(() => {});
  }
}

export async function importCsvPreviewPath(
  csvAbs: string,
  rulesFilename: string,
): Promise<{ output: string; count: number; token: string }> {
  if (!/^[\w.-]+\.rules$/.test(rulesFilename))
    throw new Error("Invalid rules filename");

  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const rulesPath = join(JOURNAL_DIR, rulesFilename);
  const writeJournalPath = await getWriteJournal();

  pendingImports.set(token, {
    csvPath: csvAbs,
    rulesPath,
    ts: Date.now(),
    isTemp: false,
  });

  try {
    const { stdout, stderr } = await execAsync(
      `hledger -f "${writeJournalPath}" -I import --dry-run --rules-file "${rulesPath}" "${csvAbs}"`,
    );
    const raw = [stdout, stderr].filter(Boolean).join("\n").trim();
    const output = normalizePreview(raw);
    const count = (output.match(/^\d{4}-\d{2}-\d{2}/gm) ?? []).length;
    return { output, count, token };
  } catch (e: any) {
    const raw = [e.stdout ?? "", e.stderr ?? ""]
      .filter(Boolean)
      .join("\n")
      .trim();
    const output = normalizePreview(raw);
    const count = (output.match(/^\d{4}-\d{2}-\d{2}/gm) ?? []).length;
    if (count > 0) return { output, count, token };
    throw new Error(raw || "Preview failed.");
  }
}

function prunePendingImports(unlink: (path: string) => Promise<void>): void {
  const now = Date.now();
  for (const [k, v] of pendingImports) {
    if (now - v.ts > PENDING_IMPORT_TTL) {
      pendingImports.delete(k);
      unlink(v.csvPath).catch(() => {});
    }
  }
}
