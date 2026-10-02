import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

/**
 * Seeds the dedicated add-return suite's DATA_DIR.
 *
 * That suite gets its own server + journal (see playwright.config.ts) because
 * declaring a new account rewrites main.journal, which is unavailable on a
 * journal that has never been created — and the welcome suite drives the real
 * journal-creation flow against its own DATA_DIR.
 */
const MAIN_JOURNAL = `; hledger journal file
; https://hledger.org/hledger.html

D $1,000.00

account assets
account assets:bank:checking
account assets:cash
account equity
account equity:opening-balances
account expenses
account expenses:food
account expenses:food:groceries
account income
account income:salary
account liabilities
account liabilities:credit-card

include 2026.journal
`;

const OPENING_BALANCES = `2026-01-01 opening balances
    assets:bank:checking                       $1,000.00
    equity:opening-balances
`;

const SETTINGS = JSON.stringify(
  {
    _version: 1,
    sidebar: { items: ['dashboard', 'register', 'balancesheet'] },
    learning: { enabled: false, level: 'beginner', completedTours: [], dismissedTips: [] },
    welcome: { enabled: false },
    import: { suggestions: false },
    keywords: [],
  },
  null,
  2
);

export default function globalSetup() {
  const dataDir = join(ROOT, 'test', 'data', 'add-return');
  mkdirSync(dataDir, { recursive: true });

  const settings = join(dataDir, 'settings.json');
  if (!existsSync(settings)) writeFileSync(settings, SETTINGS);

  const main = join(dataDir, 'main.journal');
  if (!existsSync(main)) writeFileSync(main, MAIN_JOURNAL);

  const year = join(dataDir, '2026.journal');
  if (!existsSync(year)) writeFileSync(year, OPENING_BALANCES);
}
