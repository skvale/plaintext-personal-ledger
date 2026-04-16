import { resolve, dirname, join } from "node:path";
import { readFile, access, writeFile } from "node:fs/promises";

const BASE_JOURNAL = "main.journal";
const DATA_DIR = process.env.DATA_DIR ?? resolve(process.cwd(), "data");

// Read journal - always main.journal (the base/canonical journal with all includes)
export const READ_JOURNAL = resolve(DATA_DIR, BASE_JOURNAL);
export const MAIN_JOURNAL = READ_JOURNAL;

// Write journal - defaults to current year journal (e.g., data/2026.journal)
// Can be overridden via settings.json (writeJournal or journal key)
// Cached after first call
let writeJournalCache: string | null = null;

export async function getWriteJournal(): Promise<string> {
  if (writeJournalCache) return writeJournalCache;

  const currentYear = new Date().getFullYear();
  const yearJournal = `${currentYear}.journal`;

  try {
    const settingsPath = resolve(DATA_DIR, "settings.json");
    await access(settingsPath); // Check file exists
    const content = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(content) as {
      journal?: string;
      writeJournal?: string;
    };
    // Use writeJournal if set, otherwise fall back to journal setting, then year journal
    const journal = settings.writeJournal || settings.journal || yearJournal;
    // Strip leading "data/" if present (settings may include it)
    const journalBase = journal.replace(/^data\//, "");
    // Ensure path is absolute or relative to DATA_DIR
    const journalPath = journal.startsWith("/")
      ? journal
      : journalBase;
    const resolvedPath = resolve(DATA_DIR, journalPath);
    // Create journal file if it doesn't exist
    try {
      await access(resolvedPath);
    } catch {
      await writeFile(resolvedPath, "", "utf-8");
    }
    writeJournalCache = resolvedPath;
    return writeJournalCache;
  } catch (e) {
    console.error(e);
    // Fall back to year journal if settings can't be read
    const resolvedPath = resolve(DATA_DIR, yearJournal);
    try {
      await access(resolvedPath);
    } catch {
      await writeFile(resolvedPath, "", "utf-8");
    }
    writeJournalCache = resolvedPath;
    return writeJournalCache;
  }
}

// Legacy export for compatibility - used for reading
export const JOURNAL = READ_JOURNAL;

export const RECURRING_JOURNAL =
  process.env.RECURRING_JOURNAL_FILE ??
  resolve(DATA_DIR, "recurring.journal");

export const STATEMENTS_DIR =
  process.env.STATEMENTS_DIR ?? resolve(DATA_DIR, "docs");

export const SETTINGS_FILE =
  process.env.SETTINGS_FILE ?? resolve(DATA_DIR, "settings.json");

export const KEYWORDS_FILE =
  process.env.KEYWORDS_FILE ?? resolve(DATA_DIR, "keywords.json");

export const JOURNAL_DIR = dirname(READ_JOURNAL);

export const BUDGET_JOURNAL = join(JOURNAL_DIR, "budget.journal");
