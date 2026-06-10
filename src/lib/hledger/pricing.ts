import { readFile, writeFile } from "node:fs/promises";
import { PRICING_JOURNAL, SETTINGS_FILE } from "./journal.js";
import { invalidateCache } from "./cache.js";

export interface PriceEntry {
  date: string;
  ticker: string;
  price: number;
  line: number;
  raw: string;
}

export async function getPrices(): Promise<PriceEntry[]> {
  try {
    const content = await readFile(PRICING_JOURNAL, "utf-8");
    const lines = content.split("\n");
    const prices: PriceEntry[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(/^P\s+(\d{4}-\d{2}-\d{2})\s+(\S+)\s+\$?([\d,]+(?:\.\d+)?)/);
      if (m) {
        prices.push({
          date: m[1],
          ticker: m[2],
          price: parseFloat(m[3].replace(/,/g, "")),
          line: i,
          raw: line,
        });
      }
    }
    return prices;
  } catch {
    return [];
  }
}

export async function getPricingJournalRaw(): Promise<string> {
  try {
    return await readFile(PRICING_JOURNAL, "utf-8");
  } catch {
    return "";
  }
}

export async function savePricingJournal(
  content: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Normalize line endings, ensure trailing newline
    const normalized = content.replace(/\r\n/g, "\n").replace(/\n*$/, "\n");
    await writeFile(PRICING_JOURNAL, normalized, "utf-8");
    invalidateCache();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message ?? "Failed to save" };
  }
}

export async function appendPrice(
  date: string,
  ticker: string,
  price: number,
): Promise<{ success: boolean; error?: string }> {
  if (!date || !ticker || isNaN(price) || price <= 0) {
    return { success: false, error: "Invalid date, ticker, or price" };
  }

  const line = `P ${date} ${ticker.toUpperCase()} $${price.toFixed(2)}\n`;
  try {
    let content = "";
    try {
      content = await readFile(PRICING_JOURNAL, "utf-8");
    } catch {
      // file doesn't exist yet
    }
    const trimmed = content.endsWith("\n") ? content : content + "\n";
    await writeFile(PRICING_JOURNAL, trimmed + line, "utf-8");
    invalidateCache();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message ?? "Failed to write price" };
  }
}

export async function saveTrackedTickers(
  tickers: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    let settings: Record<string, unknown> = {};
    try {
      const raw = await readFile(SETTINGS_FILE, "utf-8");
      settings = JSON.parse(raw);
    } catch {
      // file doesn't exist yet
    }
    if (tickers.length === 0) {
      delete settings.trackedTickers;
    } else {
      settings.trackedTickers = tickers;
    }
    await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n", "utf-8");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message ?? "Failed to save tickers" };
  }
}

export type PopulateResult = {
  ticker: string;
  price: number | null;
  error?: string;
};

export async function populatePricesForDate(
  date: string,
  tickers: string[],
): Promise<{ results: PopulateResult[] }> {
  const results: PopulateResult[] = [];

  for (const raw of tickers) {
    const ticker = raw.trim().toUpperCase();
    if (!ticker) continue;

    try {
      const price = await fetchYahooPrice(ticker, date);
      results.push({
        ticker,
        price,
        error: price === null ? "No closing price for this date" : undefined,
      });
    } catch (e: any) {
      results.push({
        ticker,
        price: null,
        error: e.message ?? "Fetch failed",
      });
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  // Batch append successful prices
  const toAppend = results.filter(
    (r): r is PopulateResult & { price: number } =>
      r.price !== null && r.price > 0,
  );
  if (toAppend.length > 0) {
    const lines = toAppend.map(
      (r) => `P ${date} ${r.ticker} $${r.price.toFixed(2)}`,
    );
    await appendPricesBatch(lines);
  }

  return { results };
}

async function fetchYahooPrice(
  ticker: string,
  date: string,
): Promise<number | null> {
  const target = new Date(date + "T00:00:00Z");
  const targetTs = Math.floor(target.getTime() / 1000);
  const startTs = targetTs - 2 * 86400;
  const endTs = targetTs + 3 * 86400;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${startTs}&period2=${endTs}&interval=1d`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`Yahoo Finance returned HTTP ${res.status}`);

  const data: any = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return null;

  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] =
    result.indicators?.quote?.[0]?.close ??
    result.indicators?.adjclose?.[0]?.adjclose;

  // Match by exact calendar date (Yahoo timestamps align to market open, not midnight)
  if (timestamps.length && Array.isArray(closes)) {
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] == null) continue;
      const ts = timestamps[i];
      if (ts < startTs || ts >= endTs) continue;
      const candleDate = new Date(ts * 1000);
      if (candleDate.toISOString().slice(0, 10) === date) {
        return Math.round(closes[i]! * 100) / 100;
      }
    }
  }

  // Fall back to live price (candle not yet finalized)
  const live = result.meta?.regularMarketPrice;
  if (live != null) return Math.round(live * 100) / 100;
  return null;
}

async function appendPricesBatch(lines: string[]): Promise<void> {
  let content = "";
  try {
    content = await readFile(PRICING_JOURNAL, "utf-8");
  } catch {
    // file doesn't exist yet
  }
  const trimmed = content.endsWith("\n") ? content : content + "\n";
  const sep = content.trim() ? "\n" : "";
  await writeFile(PRICING_JOURNAL, trimmed + sep + lines.join("\n") + "\n", "utf-8");
  invalidateCache();
}

export async function deletePrice(
  lineIndex: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const content = await readFile(PRICING_JOURNAL, "utf-8");
    const lines = content.split("\n");
    if (lineIndex < 0 || lineIndex >= lines.length) {
      return { success: false, error: "Invalid line index" };
    }
    lines.splice(lineIndex, 1);
    await writeFile(PRICING_JOURNAL, lines.join("\n"), "utf-8");
    invalidateCache();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message ?? "Failed to delete price" };
  }
}
