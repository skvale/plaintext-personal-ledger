import {
  readFile,
  writeFile,
  readdir,
  stat,
  mkdir,
  access,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { runJson } from "./cache.js";
import { extractTag } from "./parsing.js";
import { STATEMENTS_DIR, READ_JOURNAL, getWriteJournal } from "./journal.js";
import { invalidateCache } from "./cache.js";
import type {
  DocFile,
  DocFolder,
  TransactionDoc,
  EditableTransaction,
} from "./types.js";

export type { DocFile, DocFolder, TransactionDoc, EditableTransaction };

// ─── Latest Import Date ───────────────────────────────────────────────────────

async function readLatestImportDate(
  csvAbs: string,
): Promise<string | undefined> {
  const name = csvAbs.split("/").pop() ?? "";
  const dir = csvAbs.split("/").slice(0, -1).join("/");
  try {
    const content = await readFile(`${dir}/.latest.${name}`, "utf-8");
    return content.trim().split("\n")[0] || undefined;
  } catch {
    return undefined;
  }
}

// ─── Document Listing ─────────────────────────────────────────────────────────

export async function getDocuments(): Promise<DocFolder[]> {
  const folders: DocFolder[] = [];

  async function scanDir(dir: string, prefix: string) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }

    for (const entry of entries.sort().reverse()) {
      const fullPath = join(dir, entry);
      const s = await stat(fullPath).catch(() => null);
      if (!s) continue;

      if (s.isDirectory()) {
        const isMonth = /^\d{4}-\d{2}$/.test(entry);
        if (isMonth) {
          let children: string[];
          try {
            children = await readdir(fullPath);
          } catch {
            continue;
          }
          const files: DocFile[] = [];
          for (const child of children.sort()) {
            if (child.startsWith(".")) continue;
            const cs = await stat(join(fullPath, child)).catch(() => null);
            if (!cs || !cs.isFile()) continue;
            const ext = child.split(".").pop()?.toLowerCase() ?? "";
            const relPath = prefix
              ? `${prefix}/${entry}/${child}`
              : `${entry}/${child}`;
            const latestImport =
              ext === "csv"
                ? await readLatestImportDate(join(fullPath, child))
                : undefined;
            files.push({
              name: child,
              relPath,
              ext,
              size: cs.size,
              latestImport,
            });
          }
          const label = prefix ? `${prefix} › ${entry}` : entry;
          if (files.length > 0) folders.push({ name: label, files });
        } else {
          await scanDir(fullPath, entry);
        }
      } else if (s.isFile()) {
        const ext = entry.split(".").pop()?.toLowerCase() ?? "";
        const relPath = prefix ? `${prefix}/${entry}` : entry;
        const last = folders.find((f) => f.name === (prefix || ""));
        if (last) {
          last.files.push({ name: entry, relPath, ext, size: s.size });
        } else {
          folders.push({
            name: prefix || "",
            files: [{ name: entry, relPath, ext, size: s.size }],
          });
        }
      }
    }
  }

  await scanDir(STATEMENTS_DIR, "");
  return folders;
}

// ─── Transaction Documents ────────────────────────────────────────────────────

export async function getTransactionDocs(): Promise<TransactionDoc[]> {
  const txns = await runJson<any[]>(["print"]);
  if (!Array.isArray(txns)) return [];

  // Build set of doc paths that have been paid
  const paidDocPaths = new Set<string>();
  for (const tx of txns) {
    const comment: string = tx.tcomment ?? "";
    const m = comment.match(/doc:\s*([^\s,]+)/);
    if (!m) continue;
    const hasPositivePayable = (tx.tpostings ?? []).some(
      (p: any) =>
        p.paccount?.startsWith("liabilities:payable") &&
        (p.pamount?.[0]?.aquantity?.floatingPoint ?? 0) > 0,
    );
    if (hasPositivePayable) paidDocPaths.add(m[1]);
  }

  const results: TransactionDoc[] = [];
  for (const tx of txns) {
    const comment: string = tx.tcomment ?? "";
    const m = comment.match(/doc:\s*([^\s,]+)/);
    if (!m) continue;
    const desc = tx.tpayee
      ? `${tx.tpayee} | ${tx.tdescription ?? ""}`
      : (tx.tdescription ?? "");
    const pipeIdx = desc.indexOf("|");
    const vendor =
      (pipeIdx >= 0 ? desc.slice(0, pipeIdx).trim() : desc) || desc;
    const payablePosting = (tx.tpostings ?? []).find((p: any) =>
      p.paccount?.startsWith("liabilities:payable"),
    );
    const amount = payablePosting
      ? Math.abs(payablePosting.pamount?.[0]?.aquantity?.floatingPoint ?? 0)
      : 0;
    const isBill =
      !!payablePosting &&
      (payablePosting.pamount?.[0]?.aquantity?.floatingPoint ?? 0) < 0;
    const unpaid = isBill && !paidDocPaths.has(m[1]);
    const txid = extractTag(tx.ttags ?? [], "txid");
    results.push({
      tindex: tx.tindex,
      txid,
      date: tx.tdate,
      description: desc,
      docPath: m[1],
      unpaid,
      amount,
      vendor,
    });
  }
  return results;
}

// ─── Transaction Block Helpers ────────────────────────────────────────────────

/**
 * Find the indented comment line after the header.
 */
function findCommentLine(
  lines: string[],
  block: { start: number; end: number },
): number {
  const next = block.start + 1;
  if (next < block.end && /^\s+;/.test(lines[next])) return next;
  return -1;
}

/**
 * Append a tag to the transaction's indented comment line.
 */
function appendToCommentLine(
  lines: string[],
  block: { start: number; end: number },
  content: string,
): void {
  const cidx = findCommentLine(lines, block);
  if (cidx >= 0) {
    lines[cidx] = lines[cidx].trimEnd() + `, ${content}`;
  } else {
    lines.splice(block.start + 1, 0, `    ; ${content}`);
  }
}

/**
 * Remove a tag from a transaction.
 */
export function removeTransactionTag(
  lines: string[],
  blockStart: number,
  tag: string,
  blockEnd?: number,
): void {
  const tagCommaRe = new RegExp(`,\\s*${tag}:\\s*[^\\s,]+`);
  const tagSoleRe = new RegExp(`\\s*;\\s*${tag}:\\s*[^\\s,]+\\s*$`);

  lines[blockStart] = lines[blockStart]
    .replace(tagCommaRe, "")
    .replace(tagSoleRe, "")
    .trimEnd();

  const end = blockEnd ?? lines.length;
  const next = blockStart + 1;
  if (next < end && /^\s+;/.test(lines[next])) {
    lines[next] = lines[next].replace(tagCommaRe, "").trimEnd();
    if (/^\s+;\s*$/.test(lines[next])) {
      lines.splice(next, 1);
    }
  }
}

// ─── Document Attachment ──────────────────────────────────────────────────────

export async function attachDocToTransaction(
  id: string | number,
  docPath: string,
): Promise<{ success: boolean; error?: string }> {
  const resolved = await resolveTransactionBlock(String(id));
  if (!resolved) return { success: false, error: "Transaction not found" };
  const { lines, block } = resolved;

  // Remove any existing doc: tag
  lines[block.start] = lines[block.start]
    .replace(/[,;]\s*doc:\s*\S+/g, "")
    .trimEnd();
  const cidx = findCommentLine(lines, block);
  if (cidx >= 0) {
    lines[cidx] = lines[cidx].replace(/,\s*doc:\s*\S+/g, "").trimEnd();
    if (/^\s+;\s*$/.test(lines[cidx])) {
      lines.splice(cidx, 1);
    }
  }

  appendToCommentLine(lines, block, `doc: ${docPath}`);

  const JOURNAL = await getWriteJournal();
  await writeFile(JOURNAL, lines.join("\n"), "utf-8");
  invalidateCache();
  return { success: true };
}

export async function addTransactionTag(
  id: string | number,
  tag: string,
  value: string,
): Promise<{ success: boolean; error?: string }> {
  const resolved = await resolveTransactionBlock(String(id));
  if (!resolved) return { success: false, error: "Transaction not found" };
  const { lines, block } = resolved;

  appendToCommentLine(lines, block, `${tag}: ${value}`);

  const JOURNAL = await getWriteJournal();
  await writeFile(JOURNAL, lines.join("\n"), "utf-8");
  invalidateCache();
  return { success: true };
}

// ─── Document Upload ──────────────────────────────────────────────────────────

export async function uploadDocument(
  month: string, // YYYY-MM
  filename: string,
  buffer: Buffer,
  subdir: "statements" | "bills" | "attachments" = "statements",
): Promise<{ success: boolean; relPath?: string; error?: string }> {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const dir = join(STATEMENTS_DIR, subdir, month);
  await mkdir(dir, { recursive: true });

  const ext =
    safe.lastIndexOf(".") > 0 ? safe.slice(safe.lastIndexOf(".")) : "";
  const base = ext ? safe.slice(0, -ext.length) : safe;
  let finalName = safe;
  let n = 1;
  while (true) {
    try {
      await access(join(dir, finalName));
      finalName = `${base}-${n}${ext}`;
      n++;
    } catch {
      break;
    }
  }

  await writeFile(join(dir, finalName), buffer);
  return { success: true, relPath: `${subdir}/${month}/${finalName}` };
}

// ─── Transaction Block Resolution ─────────────────────────────────────────────

interface TransactionBlock {
  start: number;
  end: number;
  tindex: number;
}

function findTransactionBlock(
  lines: string[],
  tindex: number,
): { start: number; end: number } | null {
  const txnStarts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\d{4}-\d{2}-\d{2}/.test(lines[i])) txnStarts.push(i);
  }
  const start = txnStarts[tindex - 1];
  if (start === undefined) return null;
  let end = start + 1;
  while (
    end < lines.length &&
    (lines[end].startsWith("    ") || lines[end].startsWith("\t"))
  ) {
    end++;
  }
  return { start, end };
}

function findTransactionBlockByTxid(
  lines: string[],
  txid: string,
): { start: number; end: number; tindex: number } | null {
  let txCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\d{4}-\d{2}-\d{2}/.test(lines[i])) {
      txCount++;
      let end = i + 1;
      while (
        end < lines.length &&
        (lines[end].startsWith("    ") || lines[end].startsWith("\t"))
      ) {
        end++;
      }
      for (let j = i; j < end; j++) {
        const match = lines[j].match(/;\s*txid:\s*([^\s,]+)/);
        if (match && match[1] === txid) {
          return { start: i, end, tindex: txCount };
        }
      }
    }
  }
  return null;
}

export async function resolveTransactionBlock(
  id: string,
): Promise<{
  lines: string[];
  block: TransactionBlock;
  original: string;
} | null> {
  const original = await readFile(READ_JOURNAL, "utf-8");
  const lines = original.split("\n");

  // Expand includes to get all lines from included files
  const allLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("include ")) {
      const includedFile = trimmed.slice(8).trim();
      const absPath = join(dirname(READ_JOURNAL), includedFile);
      try {
        const incContent = await readFile(absPath, "utf-8");
        allLines.push(...incContent.split("\n"));
      } catch {
        allLines.push(line); // fallback
      }
    } else {
      allLines.push(line);
    }
  }

  if (!/^\d+$/.test(id)) {
    const block = findTransactionBlockByTxid(allLines, id);
    if (block) return { lines: allLines, block, original };
    // Try original lines too
    const block2 = findTransactionBlockByTxid(lines, id);
    if (block2) return { lines, block: block2, original };
    return null;
  }

  const tindex = parseInt(id, 10);
  const block = findTransactionBlock(allLines, tindex);
  if (!block) return null;
  return { lines: allLines, block: { ...block, tindex }, original };
}

// ─── Transaction Edit ─────────────────────────────────────────────────────────

export async function getTransactionForEdit(
  id: string | number,
): Promise<EditableTransaction | null> {
  const resolved = await resolveTransactionBlock(String(id));
  if (!resolved) return null;
  const { lines, block } = resolved;

  const headerLine = lines[block.start];
  const headerMatch = headerLine.match(
    /^(\d{4}-\d{2}-\d{2})\s*[*!]?\s*(.+?)(?:\s*;.*)?$/,
  );
  if (!headerMatch) return null;

  const date = headerMatch[1];
  const description = headerMatch[2].trim();

  const rawText = lines.slice(block.start, block.end).join("\n");
  const docMatch = rawText.match(/[;,]\s*doc:\s*([^\s,]+)/);
  const docPath = docMatch?.[1];
  const txidMatch = rawText.match(/;\s*txid:\s*([^\s,]+)/);
  const txid = txidMatch?.[1];

  const postings: { account: string; amount: string }[] = [];
  for (let i = block.start + 1; i < block.end; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s+;/.test(line)) continue;
    const trimmed = line.replace(/^[\t ]+/, "").replace(/^[*!]\s*/, "");
    const parts = trimmed.match(/^(.+?)\s{2,}(.+)$/) ?? trimmed.match(/^(.+)$/);
    postings.push({
      account: parts?.[1]?.trim() ?? trimmed,
      amount: parts?.[2]?.trim() ?? "",
    });
  }

  return {
    tindex: block.tindex,
    txid,
    date,
    description,
    postings,
    docPath,
    rawText,
  };
}

// ─── Related Payable ─────────────────────────────────────────────────────────

export async function getRelatedPayable(txn: {
  tindex: number;
  description: string;
  postings: { account: string; amount: string }[];
}): Promise<{
  type: "bill" | "payment";
  related: {
    tindex: number;
    txid: string;
    date: string;
    description: string;
    amount: number;
    paid: boolean;
    postings: { account: string; amount: number }[];
  }[];
} | null> {
  const payablePosting = txn.postings.find((p) =>
    p.account.startsWith("liabilities:payable"),
  );
  if (!payablePosting) return null;

  let amt = parseFloat(payablePosting.amount.replace(/[$,]/g, ""));
  if (isNaN(amt)) {
    const explicitSum = txn.postings.reduce((s, p) => {
      if (p === payablePosting) return s;
      const n = parseFloat(p.amount.replace(/[$,]/g, ""));
      return s + (isNaN(n) ? 0 : n);
    }, 0);
    amt = -explicitSum;
  }
  if (amt === 0) return null;

  const isBill = amt < 0;

  const resolved = await resolveTransactionBlock(String(txn.tindex));
  const rawBlock = resolved
    ? resolved.lines.slice(resolved.block.start, resolved.block.end).join("\n")
    : "";
  const thisTxid = rawBlock.match(/txid:\s*([^\s,]+)/)?.[1] ?? "";
  const thisPaymentid = rawBlock.match(/paymentid:\s*([^\s,]+)/)?.[1] ?? "";
  const thisBillid = rawBlock.match(/billid:\s*([^\s,]+)/)?.[1] ?? "";

  const allTxns = await runJson<any[]>(["print", "liabilities:payable"]);
  if (!Array.isArray(allTxns)) return null;

  const related: {
    tindex: number;
    txid: string;
    date: string;
    description: string;
    amount: number;
    paid: boolean;
    postings: { account: string; amount: number }[];
  }[] = [];

  function extractPostings(tx: any): { account: string; amount: number }[] {
    return (tx.tpostings ?? []).map((p: any) => ({
      account: p.paccount ?? "",
      amount: p.pamount?.[0]?.aquantity?.floatingPoint ?? 0,
    }));
  }

  for (const tx of allTxns) {
    if (tx.tindex === txn.tindex) continue;

    const tags = tx.ttags ?? [];
    const txTxid = extractTag(tags, "txid") ?? "";
    const txBillid = extractTag(tags, "billid") ?? "";

    const pp = (tx.tpostings ?? []).find((p: any) =>
      (p.paccount ?? "").startsWith("liabilities:payable"),
    );
    if (!pp) continue;
    const ppAmt = pp.pamount?.[0]?.aquantity?.floatingPoint ?? 0;

    if (isBill && ppAmt > 0) {
      const match =
        (thisTxid && txBillid === thisTxid) ||
        (thisPaymentid && txTxid === thisPaymentid);
      if (match) {
        related.push({
          tindex: tx.tindex,
          txid: txTxid,
          date: tx.tdate ?? "",
          description: tx.tdescription ?? "",
          amount: Math.abs(ppAmt),
          paid: true,
          postings: extractPostings(tx),
        });
      }
    } else if (!isBill && ppAmt < 0) {
      const txPaymentid = extractTag(tags, "paymentid") ?? "";
      const match =
        (thisBillid && txTxid === thisBillid) ||
        (thisTxid && txPaymentid === thisTxid);
      if (match) {
        related.push({
          tindex: tx.tindex,
          txid: txTxid,
          date: tx.tdate ?? "",
          description: tx.tdescription ?? "",
          amount: Math.abs(ppAmt),
          paid: false,
          postings: extractPostings(tx),
        });
      }
    }
  }

  return { type: isBill ? "bill" : "payment", related };
}

// ─── Transaction Update ───────────────────────────────────────────────────────

import { normaliseAmount, fmtPosting } from "./parsing.js";
import { sortJournalByDate } from "./journal-maintenance.js";
import { execAsync } from "./exec.js";

export async function updateTransaction(
  id: string | number,
  data: {
    date: string;
    description: string;
    postings: { account: string; amount: string }[];
  },
): Promise<{ success: boolean; error?: string; txid?: string }> {
  const { nanoid } = await import("nanoid");
  const resolved = await resolveTransactionBlock(String(id));
  if (!resolved)
    return { success: false, error: "Transaction not found in main journal" };
  const { lines, block, original } = resolved;

  const oldHeader = lines[block.start];
  const headerCommentMatch = oldHeader.match(/\s+(;.*)$/);
  const commentLineIdx = findCommentLine(lines, block);
  let comment = "";
  if (commentLineIdx >= 0) {
    comment = lines[commentLineIdx].replace(/^\s+/, "").trim();
  } else if (headerCommentMatch) {
    comment = headerCommentMatch[1].trim();
  }

  let txid: string | undefined;
  const txidMatch = comment.match(/txid:\s*([^\s,]+)/);
  if (txidMatch) {
    txid = txidMatch[1];
  } else {
    txid = nanoid(12);
    comment = comment
      ? `; txid: ${txid}, ${comment.slice(2)}`
      : `; txid: ${txid}`;
  }

  const oldPostings: { account: string; amount: string; cleared: boolean }[] =
    [];
  for (let i = block.start + 1; i < block.end; i++) {
    const line = lines[i];
    if (/^\s+;/.test(line)) continue;
    const m = line.match(/^\s+(\*\s+|!\s+)?(\S+)/);
    if (!m) continue;
    const cleared = m[1]?.trim() === "*";
    const acct = m[2];
    const amtMatch = line.match(/^\s+(?:\*\s+|!\s+)?\S+\s{2,}(.+)$/);
    const amt = amtMatch?.[1]?.trim() ?? "";
    oldPostings.push({ account: acct, amount: amt, cleared });
  }

  const headerLine = `${data.date} ${data.description}`;
  const newLines = [headerLine];
  if (comment) newLines.push(`    ${comment}`);
  for (const p of data.postings) {
    const amt = normaliseAmount(p.amount.trim());
    const oldP = oldPostings.find((o) => o.account === p.account);
    const amountChanged = !oldP || normaliseAmount(oldP.amount) !== amt;
    const cleared = oldP?.cleared && !amountChanged;
    newLines.push(fmtPosting(p.account, amt || undefined, cleared));
  }

  // Determine which file to write to based on where the transaction is located
  const writeJournal = await getWriteJournal();
  const writeJournalContent = await readFile(writeJournal, "utf-8");
  const writeLines = writeJournalContent.split("\n");
  
  // Check if transaction exists in write journal
  const idStr = String(id);
  const blockInWrite = typeof block.tindex === 'number'
    ? findTransactionBlock(writeLines, block.tindex)
    : findTransactionBlockByTxid(writeLines, idStr);
  
  let targetFile: string;
  let targetLines: string[];
  
  if (blockInWrite) {
    // Transaction found in write journal - write there directly
    targetFile = writeJournal;
    targetLines = writeLines;
    const blockIdx = blockInWrite;
    targetLines.splice(blockIdx.start, blockIdx.end - blockIdx.start, ...newLines);
  } else {
    // Transaction not in write journal - append to write journal
    targetFile = writeJournal;
    targetLines = [...writeLines, "", ...newLines];
  }
  
  const updated = targetLines;
  
  await writeFile(targetFile, updated.join("\n"), "utf-8");
  try {
    await execAsync(`hledger -f "${writeJournal}" check`);
    await sortJournalByDate();
    invalidateCache();
    return { success: true, txid };
  } catch (e: any) {
    await writeFile(targetFile, original, "utf-8");
    const msg: string = e.stderr ?? e.stdout ?? "Validation failed";
    return {
      success: false,
      error: msg
        .split("\n")
        .filter((l: string) => l.trim())
        .slice(0, 3)
        .join(" "),
    };
  }
}

export async function updateTransactionRaw(
  id: string | number,
  rawText: string,
): Promise<{ success: boolean; error?: string }> {
  const resolved = await resolveTransactionBlock(String(id));
  if (!resolved)
    return { success: false, error: "Transaction not found in main journal" };
  const { lines, block, original } = resolved;

  const newLines = rawText.split("\n").filter((l, i, arr) => {
    if (i === arr.length - 1 && l.trim() === "") return false;
    return true;
  });

  // Determine which file to write to
  const writeJournal = await getWriteJournal();
  const writeJournalContent = await readFile(writeJournal, "utf-8");
  const writeLines = writeJournalContent.split("\n");
  
  const idStr = String(id);
  const blockInWrite = typeof block.tindex === 'number'
    ? findTransactionBlock(writeLines, block.tindex)
    : findTransactionBlockByTxid(writeLines, idStr);
  
  let targetFile: string;
  let targetLines: string[];
  
  if (blockInWrite) {
    targetFile = writeJournal;
    targetLines = writeLines;
  } else {
    targetFile = READ_JOURNAL;
    targetLines = lines;
  }
  
  const blockIdx = blockInWrite || block;
  const updated = [
    ...targetLines.slice(0, blockIdx.start),
    ...newLines,
    ...targetLines.slice(blockIdx.end),
  ];
  
  await writeFile(targetFile, updated.join("\n"), "utf-8");
  try {
    await execAsync(`hledger -f "${writeJournal}" check`);
    await sortJournalByDate();
    invalidateCache();
    return { success: true };
  } catch (e: any) {
    await writeFile(targetFile, original, "utf-8");
    const msg: string = e.stderr ?? e.stdout ?? "Validation failed";
    return {
      success: false,
      error: msg
        .split("\n")
        .filter((l: string) => l.trim())
        .slice(0, 3)
        .join(" "),
    };
  }
}

// ─── Transaction Delete ───────────────────────────────────────────────────────

export async function deleteTransaction(
  id: string | number,
): Promise<{ success: boolean; error?: string }> {
  const pre = await resolveTransactionBlock(String(id));
  if (!pre)
    return { success: false, error: "Transaction not found in main journal" };
  const blockText = pre.lines.slice(pre.block.start, pre.block.end).join("\n");
  const billid = blockText.match(/billid:\s*([^\s,]+)/)?.[1];
  const paymentid = blockText.match(/paymentid:\s*([^\s,]+)/)?.[1];

  const JOURNAL = await getWriteJournal();

  if (billid) {
    const billRes = await resolveTransactionBlock(billid);
    if (billRes) {
      removeTransactionTag(billRes.lines, billRes.block.start, "paymentid");
      await writeFile(JOURNAL, billRes.lines.join("\n"), "utf-8");
    }
  }
  if (paymentid) {
    const payRes = await resolveTransactionBlock(paymentid);
    if (payRes) {
      removeTransactionTag(payRes.lines, payRes.block.start, "billid");
      await writeFile(JOURNAL, payRes.lines.join("\n"), "utf-8");
    }
  }

  const resolved = await resolveTransactionBlock(String(id));
  if (!resolved)
    return {
      success: false,
      error: "Transaction not found after link cleanup",
    };
  const { lines, block, original } = resolved;

  let removeEnd = block.end;
  if (removeEnd < lines.length && lines[removeEnd].trim() === "") removeEnd++;

  const updated = [...lines.slice(0, block.start), ...lines.slice(removeEnd)];
  await writeFile(JOURNAL, updated.join("\n"), "utf-8");
  try {
    await execAsync(`hledger -f "${JOURNAL}" check`);
    invalidateCache();
    return { success: true };
  } catch (e: any) {
    await writeFile(JOURNAL, original, "utf-8");
    const msg: string = e.stderr ?? e.stdout ?? "Validation failed";
    return {
      success: false,
      error: msg
        .split("\n")
        .filter((l: string) => l.trim())
        .slice(0, 3)
        .join(" "),
    };
  }
}
