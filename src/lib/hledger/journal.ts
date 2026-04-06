import { resolve, dirname, join } from "node:path";
import { readFile, access } from "node:fs/promises";

const BASE_JOURNAL = "data/main.journal";

// Read journal - always main.journal (the base/canonical journal with all includes)
export const READ_JOURNAL = resolve(process.cwd(), BASE_JOURNAL);

// Write journal - defaults to current year journal (e.g., data/2026.journal)
// Can be overridden via settings.json (writeJournal or journal key)
// Cached after first call
let writeJournalCache: string | null = null;

export async function getWriteJournal(): Promise<string> {
  if (writeJournalCache) return writeJournalCache;

  const currentYear = new Date().getFullYear();
  const yearJournal = `data/${currentYear}.journal`;

  try {
    const settingsPath = resolve(process.cwd(), "data/settings.json");
    await access(settingsPath); // Check file exists
    const content = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(content) as {
      journal?: string;
      writeJournal?: string;
    };
    // Use writeJournal if set, otherwise fall back to journal setting, then year journal
    const journal = settings.writeJournal || settings.journal || yearJournal;
    // Ensure path starts with data/ if not absolute
    const journalPath = journal.startsWith("/")
      ? journal
      : journal.startsWith("data/")
        ? journal
        : `data/${journal}`;
    writeJournalCache = resolve(process.cwd(), journalPath);
    return writeJournalCache;
  } catch (e) {
    console.error(e);
    // Fall back to year journal if settings can't be read
    writeJournalCache = resolve(process.cwd(), yearJournal);
    return writeJournalCache;
  }
}

// Legacy export for compatibility - used for reading
export const JOURNAL = READ_JOURNAL;

export const RECURRING_JOURNAL =
  process.env.RECURRING_JOURNAL_FILE ??
  resolve(process.cwd(), "data/recurring.journal");

export const STATEMENTS_DIR =
  process.env.STATEMENTS_DIR ?? resolve(dirname(JOURNAL), "docs");

export const SETTINGS_FILE =
  process.env.SETTINGS_FILE ?? resolve(dirname(JOURNAL), "settings.json");

export const KEYWORDS_FILE =
  process.env.KEYWORDS_FILE ?? resolve(process.cwd(), "data/keywords.json");

export const JOURNAL_DIR = dirname(JOURNAL);

export const BUDGET_JOURNAL = join(dirname(JOURNAL), "budget.journal");
