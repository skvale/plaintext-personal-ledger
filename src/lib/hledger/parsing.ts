// ─── Amount Parsing ─────────────────────────────────────────────────────────────

/**
 * Recursively unwrap hledger's nested amount structure.
 * Handles: [[{aquantity:{floatingPoint:N}}]], [{aquantity:{...}}], {floatingPoint:N}
 */
export function pickAmount(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (Array.isArray(val)) {
    if (val.length === 0) return 0;
    return pickAmount(val[0]);
  }
  const obj = val as Record<string, unknown>;
  if (typeof obj.floatingPoint === "number") return obj.floatingPoint;
  if (obj.aquantity !== undefined) return pickAmount(obj.aquantity);
  if (obj.acommodity !== undefined) return pickAmount(obj.aquantity); // amount object
  return 0;
}

/**
 * Extract commodity symbol from hledger's nested amount structure.
 */
export function pickCommodity(val: unknown): string {
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0] as Record<string, unknown>;
    if (Array.isArray(first) && first.length > 0) return pickCommodity(first);
    return (first?.acommodity as string) ?? "$";
  }
  return "$";
}

// ─── Date/Period Helpers ────────────────────────────────────────────────────────

/**
 * Dates in multi-period reports come as [{contents:"YYYY-MM-DD", tag:"Exact"}, ...]
 * This extracts the start date string of a period.
 */
export function periodStart(d: unknown): string {
  if (Array.isArray(d)) {
    const first = d[0] as Record<string, unknown>;
    if (first?.contents) return String(first.contents).slice(0, 7); // "YYYY-MM"
  }
  return String(d).slice(0, 7);
}

/**
 * hledger doesn't support "last N months" — compute a concrete date range.
 * Returns "YYYY-MM-DD..YYYY-MM-DD" covering N months up to and including the current month.
 */
export function lastNMonths(n: number): string {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const start = new Date(now.getFullYear(), now.getMonth() - (n - 1), 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return `${fmt(start)}..${fmt(end)}`;
}

/**
 * Generate YYYY-MM strings for N months ending at current month.
 * Used to ensure the output array has exactly N entries, filling in zeros for missing months.
 */
export function generateMonthRange(n: number, dateRange?: string): string[] {
  const months: string[] = [];
  let start: Date;
  let end: Date;
  if (dateRange) {
    const [s, e] = dateRange.split("..");
    start = new Date(s + "T00:00:00");
    end = e ? new Date(e + "T00:00:00") : new Date();
  } else {
    const now = new Date();
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    start = new Date(now.getFullYear(), now.getMonth() - (n - 1), 1);
  }
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    months.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
    );
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

// ─── Report Structure Helpers ──────────────────────────────────────────────────

/**
 * hledger compound balance report JSON:
 *   cbrSubreports: [title, {prRows, prTotals, prDates}, isPositive][]
 *   cbrTotals: {prrAmounts: [[amount][]], ...}
 */
export type CbrSubreport = [
  string,
  { prRows: any[]; prTotals: any; prDates: any[] },
  boolean,
];

/**
 * Find a subreport in a compound balance report by title pattern.
 */
export function findSubreport(subs: CbrSubreport[], pattern: RegExp) {
  return subs.find((s) => pattern.test(s[0]));
}

// ─── Tag Extraction ────────────────────────────────────────────────────────────

/**
 * Extract a tag value from hledger's tag array format: [["tagname", "value"], ...]
 */
export function extractTag(
  tags: string[][],
  tagName: string,
): string | undefined {
  return tags.find((t) => t[0] === tagName)?.[1]?.trim();
}

// ─── Journal Formatting ────────────────────────────────────────────────────────

import { AMOUNT_COL, AMOUNT_WIDTH } from "./constants.js";

/**
 * Format a posting line with amounts aligned to a consistent column.
 * e.g.  "    assets:bank:checking          $-1,802.00"
 *        ^4 spaces^  ^account^  ^padding^  ^amount right-aligned^
 */
export function fmtPosting(
  account: string,
  amount?: string,
  cleared?: boolean,
): string {
  const indent = "    ";
  const status = cleared ? "* " : "";
  if (!amount) return `${indent}${status}${account}`;
  const accountPart = `${indent}${status}${account}`;
  // Pad so amount field starts at AMOUNT_COL - AMOUNT_WIDTH
  const startCol = AMOUNT_COL - AMOUNT_WIDTH;
  const padding = Math.max(2, startCol - accountPart.length);
  const amountStr = amount.padStart(AMOUNT_WIDTH);
  return accountPart + " ".repeat(padding) + amountStr;
}

/**
 * Format a number as currency string.
 */
export function fmtAmount(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `$${sign}${Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Prepend $ to bare numeric amounts like "39" or "-12.50" → "$39" / "-$12.50" */
export function normaliseAmount(amt: string): string {
  if (!amt) return amt;
  // Handle balance assertions/assignments: "amount = assertion"
  const eqIdx = amt.indexOf(" = ");
  if (eqIdx >= 0) {
    const left = normaliseAmount(amt.slice(0, eqIdx).trim());
    const right = normaliseAmount(amt.slice(eqIdx + 3).trim());
    return `${left} = ${right}`;
  }
  // Already has a currency symbol or commodity — leave it alone
  if (/[^0-9.\-,\s]/.test(amt)) return amt;
  // Bare number: add $ and commas
  const negative = amt.startsWith("-");
  const bare = negative ? amt.slice(1) : amt;
  const [intPart, decPart] = bare.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const formatted = decPart !== undefined ? `${grouped}.${decPart}` : grouped;
  return negative ? `-$${formatted}` : `$${formatted}`;
}
