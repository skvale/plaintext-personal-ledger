import { resolve, dirname, join } from "node:path";
import { readFile, readdir, access, writeFile } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const BASE_JOURNAL = "main.journal";
const DATA_DIR = process.env.DATA_DIR ?? resolve(process.cwd(), "data");

// ─── Decimal mark / thousands separator ────────────────────────────────────────
// The app writes grouped amounts ("$1,000"), which hledger only reads back as one
// thousand when a `D` directive is in scope. `D` is scoped per-file and is NOT
// inherited across `include`, so a segment hledger parses on its own — e.g.
// `hledger -f 2026.journal check` after a write — falls back to treating `,` as
// the decimal mark and silently reads $1,000 as 1. main.journal carries the
// directive; every other journal file needs its own copy for standalone parses.
export const DEFAULT_DECIMAL_DIRECTIVE = "D $1,000.00";

const DIRECTIVE_RE = /^[ \t]*D\s+\S+[ \t]*$/m;

async function readDecimalDirective(): Promise<string> {
  try {
    const m = (await readFile(READ_JOURNAL, "utf-8")).match(DIRECTIVE_RE);
    if (m) return m[0].trim();
  } catch {
    // main.journal missing or unreadable — fall back to the app's own default.
  }
  return DEFAULT_DECIMAL_DIRECTIVE;
}

export async function ensureDecimalDirective(file: string): Promise<void> {
  let content: string;
  try {
    content = await readFile(file, "utf-8");
  } catch {
    return; // Missing file — never create one here; first-run detection relies
    // on the journal not existing yet.
  }
  if (DIRECTIVE_RE.test(content)) return;

  const directive = await readDecimalDirective();
  if (content.trim() === "") {
    await writeFile(file, `${directive}\n`, "utf-8");
    return;
  }

  // Keep any existing leading blank/comment lines above the directive.
  const lines = content.split("\n");
  let at = 0;
  while (
    at < lines.length &&
    (lines[at].trim() === "" || lines[at].trimStart().startsWith(";"))
  )
    at++;
  lines.splice(at, 0, directive, "");
  await writeFile(file, lines.join("\n"), "utf-8");
}

/**
 * Validate the ledger with `hledger check`.
 *
 * Targets main.journal rather than an individual segment: hledger scopes the `D`
 * directive per-file and does not inherit it through `include`, so checking e.g.
 * data/2026.journal on its own re-reads `$1,500` as 1.5 and reports phantom
 * balance-assertion failures. Falls back to the write journal during first-run
 * setup, before main.journal exists.
 */
export async function runJournalCheck(): Promise<void> {
  let file = READ_JOURNAL;
  try {
    await access(file);
  } catch {
    file = await getWriteJournal();
  }
  await ensureDecimalDirective(file);
  await execAsync(`hledger -f "${file}" check`, { timeout: 15000 });
}

/**
 * One-time self-heal: make sure every journal file the app owns carries the `D`
 * directive, so standalone parses (and the `hledger check` calls above) agree with
 * how main.journal is read. Safe to call repeatedly; only writes files that are
 * actually missing the directive.
 */
export async function ensureManagedJournalDirectives(): Promise<void> {
  const files = new Set<string>([
    READ_JOURNAL,
    RECURRING_JOURNAL,
    BUDGET_JOURNAL,
    PRICING_JOURNAL,
  ]);
  files.add(await getWriteJournal());
  try {
    for (const name of await readdir(STATEMENTS_DIR)) {
      if (name.endsWith(".journal")) files.add(resolve(STATEMENTS_DIR, name));
    }
  } catch {
    // No statements directory yet — nothing to heal there.
  }
  for (const file of files) {
    try {
      await ensureDecimalDirective(file);
    } catch (e) {
      console.error(`Could not set decimal directive in ${file}`, e);
    }
  }
}

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
      await writeFile(resolvedPath, `${await readDecimalDirective()}\n`, "utf-8");
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
      await writeFile(resolvedPath, `${await readDecimalDirective()}\n`, "utf-8");
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
export const PRICING_JOURNAL = join(JOURNAL_DIR, "pricing.journal");
