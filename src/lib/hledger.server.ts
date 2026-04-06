/**
 * plaintext-personal-ledger Server Library
 *
 * This module re-exports all functionality from the modular hledger/ subdirectory.
 * The subdirectory contains well-organized, focused modules for each concern.
 *
 * Modules:
 * - constants.ts    - Magic numbers and constants
 * - journal.ts      - Journal file paths and configuration
 * - runner.ts       - hledger CLI version checking
 * - cache.ts        - Caching and CLI execution
 * - parsing.ts       - Amount/date parsing helpers
 * - transactions.ts  - Transaction CRUD operations
 * - reports.ts       - Balance sheets, income statements, etc.
 * - import.ts        - CSV import/export
 * - reconcile.ts     - Bank reconciliation
 * - git.ts           - Git integration
 * - budget.ts        - Budget management
 * - documents.ts      - Document attachment
 * - triage.ts        - Uncategorized transaction handling
 * - recurring.ts      - Recurring rules and forecast
 *
 * Legacy code has been migrated to these modules. This file provides backwards
 * compatibility by re-exporting everything from the new modular structure.
 */

// Re-export everything from the new modular structure for backwards compatibility
export * from "./hledger/index.js";

// ─── Settings ─────────────────────────────────────────────────────────────────

import { readFile } from "node:fs/promises";
import { watch } from "node:fs";
import {
  SETTINGS_FILE,
  JOURNAL,
  RECURRING_JOURNAL,
} from "./hledger/journal.js";
import { invalidateCache } from "./hledger/cache.js";
import { type Settings, mergeSettings } from "./settings.js";

export async function getSettings(): Promise<Settings> {
  try {
    const raw = await readFile(SETTINGS_FILE, "utf-8");
    return mergeSettings(JSON.parse(raw) as Partial<Settings>);
  } catch {
    return mergeSettings({});
  }
}

// ─── Default Commodity ────────────────────────────────────────────────────────

export async function getDefaultCommodity(): Promise<string> {
  const content = await readFile(JOURNAL, "utf-8").catch(() => "");
  const match = content.match(/^D\s+(.+)$/m);
  return match?.[1]?.trim() ?? "$1,000.00";
}

export async function setDefaultCommodity(directive: string): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  const content = await readFile(JOURNAL, "utf-8").catch(() => "");
  const hasD = /^D\s+.+$/m.test(content);
  const updated = hasD
    ? content.replace(/^D\s+.+$/m, `D ${directive}`)
    : `D ${directive}\n${content}`;
  await writeFile(JOURNAL, updated, "utf-8");
  invalidateCache();
}

// ─── Watch Journal Files ──────────────────────────────────────────────────────

for (const file of [JOURNAL, RECURRING_JOURNAL]) {
  try {
    watch(file, () => {
      invalidateCache();
    });
  } catch {
    // File may not exist yet — that's fine
  }
}
