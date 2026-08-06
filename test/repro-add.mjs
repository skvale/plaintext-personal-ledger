import { chromium } from 'playwright';

const base = 'http://localhost:3009';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();

page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text()); });

await page.goto(`${base}/add?from=/register`);

await page.fill('input[name="vendor"]', 'ReproVendor');
await page.fill('input[name="note"]', 'test save');

const accts = page.locator('input[aria-label="Select an account"]');
const amounts = page.locator('input.w-48');

// Account 1: type + Enter to select/create
await accts.nth(0).click();
await accts.nth(0).fill('expenses:test');
await accts.nth(0).press('Enter');
await amounts.nth(0).fill('50');

// Account 2
await accts.nth(1).click();
await accts.nth(1).fill('assets:bank:checking');
await accts.nth(1).press('Enter');
await amounts.nth(1).fill('-50');

const btn = page.locator('button[type="submit"]');
console.log('button disabled:', await btn.isDisabled());

await btn.click();
await page.waitForTimeout(3000);
console.log('URL after save:', page.url());
console.log('vendor still visible:', await page.locator('input[name="vendor"]').count() > 0);

await browser.close();
