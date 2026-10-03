import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

const ROOT = '/Users/kvale/dev2/plaintext-personal-ledger';
const MONTH = new Date().toISOString().slice(0, 7); // the docs accordion opens the current month by default

/**
 * Regression: Import needed two clicks.
 *
 * startImport() mutated mode/previewToken and then called goto(). The page's
 * $effect re-ran on those writes and called syncFromUrl(), which read
 * window.location.href — still the *old* URL, because goto() commits
 * history.pushState asynchronously. Seeing no ?import= param, it hit the
 * "close the panel" branch and reset mode to 'none', undoing the click.
 */
test('Import opens the panel on a single click and keeps it open', async ({ page }) => {
  const monthDir = join(ROOT, 'test', 'data', 'docs', MONTH);
  const csv = join(monthDir, 'single-click-regression.csv');
  mkdirSync(monthDir, { recursive: true });
  writeFileSync(csv, 'date,description,amount\n2026-10-01,Coffee,-4.50\n');

  try {
    await page.goto('/docs');

    const importBtn = page.getByRole('button', { name: 'Import' }).first();
    await expect(importBtn).toBeVisible();

    await importBtn.click();

    await expect(page).toHaveURL(/[?&]import=/);
    const panel = page.locator('#previewForm');
    await expect(panel).toBeVisible();

    // The panel used to open and then snap shut again once the URL committed and
    // the effect re-ran, so it has to survive past that.
    await page.waitForTimeout(500);
    await expect(panel).toBeVisible();
  } finally {
    rmSync(csv, { force: true });
  }
});

/**
 * The back button must still close the panel — that is the behaviour the ?import=
 * param exists for, and the fix must not have broken the "URL has no ?import=" path.
 */
test('browser back closes the import panel', async ({ page }) => {
  const monthDir = join(ROOT, 'test', 'data', 'docs', MONTH);
  const csv = join(monthDir, 'back-button-regression.csv');
  mkdirSync(monthDir, { recursive: true });
  writeFileSync(csv, 'date,description,amount\n2026-10-02,Tea,-2.50\n');

  try {
    await page.goto('/docs');

    await page.getByRole('button', { name: 'Import' }).first().click();
    await expect(page.locator('#previewForm')).toBeVisible();

    await page.goBack();

    await expect(page).not.toHaveURL(/[?&]import=/);
    await expect(page.locator('#previewForm')).toBeHidden();
  } finally {
    rmSync(csv, { force: true });
  }
});