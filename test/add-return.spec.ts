import { test, expect } from '@playwright/test';

// This suite gets its own server + DATA_DIR (see playwright.config.ts) so its
// writes never touch the journal the welcome suite drives.
test.use({ baseURL: 'http://localhost:3110' });

/**
 * Saving a transaction writes to the journal, which makes the server broadcast
 * `journal-changed` over SSE. That used to race the action's redirect: the
 * router let the later invalidation win, so the redirect was cancelled and the
 * user was stranded back on a stale /add form with no error shown.
 *
 * These tests pin the post-save destination. They run several saves in a row
 * because the race only lost ~1 in 5 times.
 */

const accountInputs = (page: import('@playwright/test').Page) =>
  page.locator('input[aria-label="Select an account"]');
const amountInputs = (page: import('@playwright/test').Page) => page.locator('input.w-48');

// hledger has to re-read and re-balance the journal on the way back, which can
// take a while. SvelteKit only commits the new URL once that finishes.
const NAV_TIMEOUT = 30_000;

/** Fills one posting row, creating the account if it isn't declared yet. */
async function setPosting(
  page: import('@playwright/test').Page,
  index: number,
  account: string,
  amount: string
) {
  const input = accountInputs(page).nth(index);
  await input.click();
  await input.fill(account);

  const existing = page.locator(`[data-combobox-item][data-value="${account}"]`);
  if (await existing.count()) {
    await existing.first().click();
  } else {
    // "Create <account>" option — also declares the account in the journal,
    // which means two writes and therefore two SSE broadcasts.
    await page.locator('[data-combobox-item][data-value="__create__"]').first().click();
  }
  await amountInputs(page).nth(index).fill(amount);
}

async function fillAndSave(page: import('@playwright/test').Page, vendor: string) {
  await page.locator('input[name="vendor"]').fill(vendor);
  await setPosting(page, 0, 'expenses:food:groceries', '50');
  await setPosting(page, 1, 'assets:bank:checking', '-50');
  await page.locator('button[type="submit"]').click();
}

test('pressing "n" then saving returns you to the view you came from', async ({ page }) => {
  for (let i = 0; i < 3; i++) {
    await page.goto('/balancesheet');
    await expect(page.locator('h1').first()).toBeVisible();
    // Move focus out of any autofocusable element so the shortcut fires.
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('n');

    await expect(page).toHaveURL(/\/add\?from=/);
    await fillAndSave(page, `ReturnTrip${i}`);

    await expect(page).toHaveURL(/\/balancesheet$/, { timeout: NAV_TIMEOUT });
    await expect(page.locator('input[name="vendor"]')).toHaveCount(0);
  }
});

test('saving returns you to the register when there is no known origin', async ({ page }) => {
  await page.goto('/add');
  await fillAndSave(page, 'NoOriginVendor');

  await expect(page).toHaveURL(/\/register/, { timeout: NAV_TIMEOUT });
});

test('an off-site "from" cannot bounce the redirect off the app', async ({ page }) => {
  await page.goto('/add?from=https%3A%2F%2Fevil.example');
  await fillAndSave(page, 'OpenRedirectVendor');

  await expect(page).toHaveURL(/\/register/, { timeout: NAV_TIMEOUT });
  expect(page.url()).not.toContain('evil.example');
});
