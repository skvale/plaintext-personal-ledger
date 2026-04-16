import { test, expect } from '@playwright/test';
import { readFileSync, existsSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

async function waitForFile(path: string, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (existsSync(path)) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return existsSync(path);
}

// Each test gets its own data dir for parallel execution
const BASE_DIR = '/Users/kvale/dev2/plaintext-personal-ledger';
function getTestDataDir(projectName: string) {
  return join(BASE_DIR, 'test', 'data', projectName);
}

test('welcome page shows on startup', async ({ page }, testInfo) => {
  const DATA_DIR = getTestDataDir(testInfo.project.name);
  mkdirSync(DATA_DIR, { recursive: true });
  
  await page.goto('/');
  
  await expect(page.getByText('Personal accounting powered by hledger')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Get Started' })).toBeVisible();
});

test('set opening balances', async ({ page }, testInfo) => {
  const DATA_DIR = getTestDataDir(testInfo.project.name);
  mkdirSync(DATA_DIR, { recursive: true });
  
  // Clean start - remove existing files, keep dir
  try {
    rmSync(join(DATA_DIR, 'main.journal'), { force: true });
    rmSync(join(DATA_DIR, '2026.journal'), { force: true });
  } catch {}
  
  // Create minimal settings.json only
  writeFileSync(join(DATA_DIR, 'settings.json'), JSON.stringify({
    _version: 1,
    sidebar: { items: ['welcome', 'dashboard'] },
    learning: { enabled: true, level: 'beginner', completedTours: [], dismissedTips: [] },
    welcome: { enabled: true },
    import: { suggestions: true },
    keywords: []
  }, null, 2));
  
  const journalPath = join(DATA_DIR, '2026.journal');
  
  await page.goto('/');
  
  await page.getByRole('button', { name: 'Set opening balances' }).click();
  
  // Wait for form - use first amount input
  await expect(page.locator('input[name="amount"]').first()).toBeVisible();
  
  // Fill account (combobox) and amount
  await page.locator('input[name="amount"]').first().fill('1000');
  
  // For the account, use the first combobox with aria-label
  const accountInput = page.locator('input[aria-label="Select an account"]').first();
  await accountInput.fill('assets:bank:checking');
  await accountInput.press('Enter'); // Select if dropdown appears
  
  await page.getByRole('button', { name: 'Save to journal' }).click();
  
  // Verify journal file was created
  await waitForFile(journalPath);

  if (!existsSync(journalPath)) {
    throw new Error(`Journal file was not created at ${journalPath}`);
  }
  
  const content = readFileSync(journalPath, 'utf-8');
  if (!content.includes('assets:bank:checking')) {
    throw new Error('Journal file does not contain expected account');
  }
});