import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

const ROOT = '/Users/kvale/dev2/plaintext-personal-ledger';
const MONTH = new Date().toISOString().slice(0, 7);
const DATA = join(ROOT, 'test', 'data');
const MONTH_DIR = join(DATA, 'docs', MONTH);
const REL = `${MONTH}/visa.csv`;
const CSV = join(MONTH_DIR, 'visa.csv');
const CSV2 = join(MONTH_DIR, 'visa-renewed.csv');
const REL2 = `${MONTH}/visa-renewed.csv`;
const LATEST = join(MONTH_DIR, '.latest.visa.csv');
const RULES = join(DATA, 'visa.csv.rules');
const RULES_LATEST = join(DATA, '.latest.visa.csv.rules');
const JOURNAL = join(DATA, '2026.journal');

const RULES_CONTENT = [
  'skip 1',
  'date-format %Y-%m-%d',
  'currency $',
  'fields date, description, amount',
  'account1 expenses:unknown',
  'account2 liabilities:credit-card',
  '',
].join('\n');

const CSV_V1 = [
  'date,description,amount',
  '2026-01-05,COFFEE,4.50',
  '2026-01-06,GAS,30.00',
  '2026-02-01,RENT,1000.00',
  '2026-02-03,GROCERY,55.25',
  '',
].join('\n');

const CSV_V2 = CSV_V1 + '2026-03-04,COFFEE,5.00\n';

function oneShotImport(page: import('@playwright/test').Page) {
  return page
    .locator('#previewForm')
    .getByRole('button', { name: 'Import', exact: true });
}

// The row Import button for our CSV specifically — other specs (or leftovers)
// can leave additional CSVs on the docs page.
function rowImport(page: import('@playwright/test').Page) {
  return page
    .locator('div.flex.flex-wrap.items-center')
    .filter({ hasText: 'visa.csv' })
    .getByRole('button', { name: 'Import', exact: true });
}

function journalCount(journal: string, date: string, payee: string): number {
  const blocks = journal.split(/\n\n+/);
  return blocks.filter((b) => b.startsWith(date) && b.includes(payee)).length;
}

test('.latest.visa.csv watermark survives a round trip', async ({ page }) => {
  rmSync(MONTH_DIR, { recursive: true, force: true });
  mkdirSync(MONTH_DIR, { recursive: true });
  rmSync(RULES_LATEST, { force: true });
  writeFileSync(RULES, RULES_CONTENT);
  writeFileSync(CSV, CSV_V1);
  const journalBackup = existsSync(JOURNAL) ? readFileSync(JOURNAL, 'utf8') : '';

  try {
    // ── Pass 1: everything is new ────────────────────────────────────────────
    await page.goto('/docs');
    await rowImport(page).click();
    await expect(page.locator('#previewForm')).toBeVisible();
    await oneShotImport(page).click();
    await expect(page.getByText('Import complete')).toBeVisible();
    await expect(page.getByText('Imported 4 transactions')).toBeVisible();

    expect(existsSync(LATEST)).toBe(true);
    expect(readFileSync(LATEST, 'utf8')).toBe('2026-02-03\n');

    let journal = readFileSync(JOURNAL, 'utf8');
    expect(journalCount(journal, '2026-01-05', 'COFFEE')).toBe(1);

    // The file list reads the watermark back as a badge.
    await page.goto('/docs');
    await expect(page.getByText('Latest: 2026-02-03')).toBeVisible();

    // ── Pass 2: one genuinely new row ────────────────────────────────────────
    writeFileSync(CSV, CSV_V2);
    await page.goto(`/docs?import=${encodeURIComponent(REL)}`);
    await expect(page.locator('#previewForm')).toBeVisible();
    await oneShotImport(page).click();
    await expect(page.getByText('Import complete')).toBeVisible();
    await expect(page.getByText('Imported 1 transaction')).toBeVisible();

    expect(readFileSync(LATEST, 'utf8')).toBe('2026-03-04\n');

    journal = readFileSync(JOURNAL, 'utf8');
    expect(journalCount(journal, '2026-03-04', 'COFFEE')).toBe(1);
    expect(journalCount(journal, '2026-01-05', 'COFFEE')).toBe(1);

    // ── Pass 3: nothing new ──────────────────────────────────────────────────
    await page.goto(`/docs?import=${encodeURIComponent(REL)}`);
    await expect(page.locator('#previewForm')).toBeVisible();
    await oneShotImport(page).click();
    await expect(page.getByText('Import complete')).toBeVisible();

    expect(readFileSync(LATEST, 'utf8')).toBe('2026-03-04\n');
    journal = readFileSync(JOURNAL, 'utf8');
    expect(journalCount(journal, '2026-03-04', 'COFFEE')).toBe(1);
    expect(journalCount(journal, '2026-02-03', 'GROCERY')).toBe(1);

    // ── Pass 4: re-downloaded statement under a NEW filename ─────────────────
    // No .latest.visa-renewed.csv exists — dedupe must come from the
    // rules-keyed watermark (.latest.visa.csv.rules).
    expect(existsSync(RULES_LATEST)).toBe(true);
    writeFileSync(CSV2, CSV_V2);
    await page.goto(`/docs?import=${encodeURIComponent(REL2)}`);
    await expect(page.locator('#previewForm')).toBeVisible();
    await oneShotImport(page).click();
    await expect(page.getByText('Import complete')).toBeVisible();
    await expect(page.getByText('duplicates skipped')).toBeVisible();

    // Nothing new reached the journal, and the rules watermark held.
    journal = readFileSync(JOURNAL, 'utf8');
    expect(journalCount(journal, '2026-03-04', 'COFFEE')).toBe(1);
    expect(journalCount(journal, '2026-01-05', 'COFFEE')).toBe(1);
    expect(readFileSync(RULES_LATEST, 'utf8')).toBe('2026-03-04\n');

    // The new file's own watermark gets seeded so its badge reads back too.
    expect(readFileSync(join(MONTH_DIR, '.latest.visa-renewed.csv'), 'utf8'))
      .toBe('2026-03-04\n');
  } finally {
    writeFileSync(JOURNAL, journalBackup);
    rmSync(CSV, { force: true });
    rmSync(CSV2, { force: true });
    rmSync(LATEST, { force: true });
    rmSync(join(MONTH_DIR, '.latest.visa-renewed.csv'), { force: true });
    rmSync(RULES, { force: true });
    rmSync(RULES_LATEST, { force: true });
  }
});
