import { test, expect } from '@playwright/test';

// Own server + DATA_DIR (see playwright.config.ts), seeded with a year of income
// and expenses so the YTD table really is wider than the viewport.
test.use({ baseURL: 'http://localhost:3111' });

/**
 * The P&L table has a sticky Account column, so parking the horizontal scroll
 * at the right-hand end keeps row labels readable while showing the recent
 * months and the total — the numbers you actually came to read. It used to open
 * at the far left, with only January visible.
 *
 * A narrow viewport makes the overflow deterministic rather than depending on
 * how wide the amount columns happen to render.
 */
test.use({ viewport: { width: 900, height: 800 } });

const scroll = (page: import('@playwright/test').Page) =>
  page.locator('div.overflow-x-auto').first();

async function scrollState(page: import('@playwright/test').Page) {
  return scroll(page).evaluate((el) => ({
    scrollLeft: el.scrollLeft,
    // How close to the far right we are. Browsers report fractional values.
    atEnd: el.scrollLeft >= el.scrollWidth - el.clientWidth - 1,
    overflowing: el.scrollWidth > el.clientWidth,
  }));
}

test('YTD P&L opens scrolled to the right-hand end', async ({ page }) => {
  await page.goto('/income?months=0');

  const table = scroll(page);
  await expect(table.locator('table')).toBeVisible();

  // The effect sets scrollLeft after layout, so give it a beat.
  await expect
    .poll(async () => (await scrollState(page)).atEnd, { timeout: 5000 })
    .toBe(true);
});

test('the table is still at the left when nothing overflows', async ({ page }) => {
  // A single-month view is narrow; scrollLeft must stay 0 rather than being
  // driven to some bogus value.
  await page.goto('/income?months=1');
  const table = scroll(page);
  await expect(table.locator('table')).toBeVisible();

  await page.waitForTimeout(400);
  const state = await scrollState(page);
  expect(state.overflowing).toBe(false);
  expect(state.scrollLeft).toBe(0);
});

test('switching the period to YTD re-parks the scroll at the right', async ({ page }) => {
  await page.goto('/income?months=1');
  const table = scroll(page);
  await expect(table.locator('table')).toBeVisible();

  await page.getByRole('button', { name: 'YTD', exact: true }).click();

  await expect(page).toHaveURL(/months=0/);
  await expect
    .poll(async () => (await scrollState(page)).atEnd, { timeout: 5000 })
    .toBe(true);
});