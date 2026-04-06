import { readFile, writeFile } from "node:fs/promises";
import { KEYWORDS_FILE } from "./hledger/journal.js";

export type KeywordIndex = Record<string, string[]>;

/** Load keyword index from data/keywords.json */
export async function loadKeywordIndex(): Promise<KeywordIndex> {
  try {
    const raw = await readFile(KEYWORDS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as KeywordIndex;
    }
  } catch {}
  return {};
}

/** Save keyword index — keys sorted alphabetically */
export async function saveKeywordIndex(index: KeywordIndex): Promise<void> {
  const sorted = Object.fromEntries(
    Object.entries(index).sort((a, b) => a[0].localeCompare(b[0])),
  );
  await writeFile(KEYWORDS_FILE, JSON.stringify(sorted, null, 2), "utf-8");
}

/** Find matching account for a description. Returns null if no match. */
export async function suggestAccount(
  description: string,
): Promise<string | null> {
  const index = await loadKeywordIndex();
  const lower = description.toLowerCase();

  // Sort keywords by length descending — longer matches are more specific
  const entries: [string, string][] = [];
  for (const [account, keywords] of Object.entries(index)) {
    for (const kw of keywords) {
      entries.push([kw.toLowerCase(), account]);
    }
  }
  entries.sort((a, b) => b[0].length - a[0].length);

  for (const [keyword, account] of entries) {
    if (lower.includes(keyword)) return account;
  }
  return null;
}
