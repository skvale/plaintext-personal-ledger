import { readFile } from "node:fs/promises";
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  getPricingJournalRaw,
  getPrices,
  savePricingJournal,
  saveTrackedTickers,
  populatePricesForDate,
  SETTINGS_FILE,
  getSettings,
} from "$lib/hledger.server.js";

export const load: PageServerLoad = async () => {
  const [raw, settings] = await Promise.all([
    getPricingJournalRaw(),
    getSettings(),
  ]);

  // Only discover tickers from pricing.journal if key missing from settings
  let rawSettings: Record<string, unknown> = {};
  try { rawSettings = JSON.parse(await readFile(SETTINGS_FILE, "utf-8")); } catch {}
  const tickers = "trackedTickers" in rawSettings
    ? (settings.trackedTickers ?? [])
    : [...new Set((await getPrices()).map((p) => p.ticker))].sort();

  return { raw, trackedTickers: tickers };
};

export const actions: Actions = {
  save: async ({ request }) => {
    const fd = await request.formData();
    const content = (fd.get("content") as string) ?? "";

    const result = await savePricingJournal(content);
    if (!result.success) {
      return fail(500, { error: result.error ?? "Failed to save" });
    }

    return { saved: true };
  },

  saveTickers: async ({ request }) => {
    const fd = await request.formData();
    const raw = (fd.get("tickers") as string) ?? "";
    const tickers = raw
      .split(/[\n,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    const result = await saveTrackedTickers(tickers);
    if (!result.success) {
      return fail(500, { error: result.error ?? "Failed to save tickers" });
    }

    return { tickersSaved: true };
  },

  populate: async ({ request }) => {
    const fd = await request.formData();
    const date = (fd.get("date") as string) ?? "";
    const raw = (fd.get("tickers") as string) ?? "";

    if (!date) {
      return fail(400, { populateError: "Date is required" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return fail(400, { populateError: "Invalid date format (use YYYY-MM-DD)" });
    }

    const tickers = raw
      .split(/[\n,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (tickers.length === 0) {
      return fail(400, { populateError: "No tickers configured" });
    }

    const { results } = await populatePricesForDate(date, tickers);

    const fetched = results.filter((r) => r.price !== null);
    const failed = results.filter((r) => r.price === null);

    return {
      populateDone: true,
      populateResults: results,
      populateSummary:
        fetched.length > 0
          ? `Fetched ${fetched.length} price${fetched.length > 1 ? "s" : ""} for ${date}`
          : `No prices found for ${date}`,
      populateError:
        failed.length > 0 && fetched.length === 0
          ? `Failed to fetch any prices for ${date}`
          : undefined,
    };
  },
};
