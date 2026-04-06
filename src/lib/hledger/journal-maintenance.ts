import { readFile, writeFile } from "node:fs/promises";
import { getWriteJournal } from "./journal.js";
import { execAsync } from "./exec.js";
import { invalidateCache } from "./cache.js";

/**
 * Sort transaction blocks in the journal by date.
 * Preserves the preamble (directives, account declarations, comments before first transaction).
 * Transaction blocks = date-prefixed header + indented posting lines.
 */
export async function sortJournalByDate(): Promise<void> {
  const journalPath = await getWriteJournal();
  const content = await readFile(journalPath, "utf-8");
  const lines = content.split("\n");

  // Find where transactions start (first line matching YYYY-MM-DD)
  const dateRe = /^\d{4}-\d{2}-\d{2}/;
  let firstTxLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (dateRe.test(lines[i])) {
      firstTxLine = i;
      break;
    }
  }
  if (firstTxLine < 0) return; // no transactions

  const preamble = lines.slice(0, firstTxLine);
  const rest = lines.slice(firstTxLine);

  // Parse transaction blocks: each starts with a date line, includes following indented/blank lines
  interface TxBlock {
    date: string;
    lines: string[];
  }
  const blocks: TxBlock[] = [];
  let current: TxBlock | null = null;

  for (const line of rest) {
    const dateMatch = line.match(dateRe);
    if (dateMatch) {
      if (current) blocks.push(current);
      current = { date: dateMatch[0], lines: [line] };
    } else if (current) {
      current.lines.push(line);
    } else {
      // Stray lines before first transaction in rest — attach to preamble
      preamble.push(line);
    }
  }
  if (current) blocks.push(current);

  // Stable sort by date
  blocks.sort((a, b) => a.date.localeCompare(b.date));

  const sorted = [...preamble, ...blocks.flatMap((b) => b.lines)].join("\n");
  await writeFile(journalPath, sorted, "utf-8");
}

/**
 * Sort the entire journal file using hledger's built-in sort.
 */
export async function sortJournal(): Promise<{
  success: boolean;
  error?: string;
}> {
  const journalPath = await getWriteJournal();
  const original = await readFile(journalPath, "utf-8");
  const lines = original.split("\n");

  // Find index of first transaction line
  let firstTxIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\d{4}-\d{2}-\d{2}/.test(lines[i])) {
      firstTxIdx = i;
      break;
    }
  }
  if (firstTxIdx === -1) return { success: true };

  // Header: everything before first transaction, trim trailing blank lines
  let headerEnd = firstTxIdx;
  while (headerEnd > 0 && lines[headerEnd - 1].trim() === "") headerEnd--;
  const header = lines.slice(0, headerEnd).join("\n");

  // Split body into transaction blocks (each block = date line + its postings)
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of lines.slice(firstTxIdx)) {
    if (/^\d{4}-\d{2}-\d{2}/.test(line) && current.length > 0) {
      blocks.push(current.join("\n").trimEnd());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.some((l) => l.trim())) blocks.push(current.join("\n").trimEnd());

  // Stable sort by date
  blocks.sort((a, b) => {
    const da = a.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
    const db = b.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
    return da.localeCompare(db);
  });

  const sorted = header + "\n\n" + blocks.join("\n\n") + "\n";
  await writeFile(journalPath, sorted, "utf-8");

  try {
    const cmd = `hledger -f "${journalPath}" check`;
    await execAsync(cmd);
    invalidateCache();
    return { success: true };
  } catch (e: any) {
    await writeFile(journalPath, original, "utf-8");
    return { success: false, error: "Sort broke validation — reverted" };
  }
}
