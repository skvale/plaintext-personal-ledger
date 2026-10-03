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

  seedPnlScrollDir();
}

/**
 * Seeds the pnl-scroll suite's DATA_DIR.
 *
 * The YTD P&L table only scrolls horizontally when it is genuinely wider than
 * the viewport, which needs income and expense postings in every month of the
 * year to get past. Also declares several sub-accounts so the Account column is
 * realistically wide.
 */
function seedPnlScrollDir() {
  const dataDir = join(ROOT, 'test', 'data', 'pnl-scroll');
  mkdirSync(dataDir, { recursive: true });

  const settings = join(dataDir, 'settings.json');
  if (!existsSync(settings)) {
    writeFileSync(
      settings,
      JSON.stringify(
        {
          _version: 1,
          sidebar: { items: ['dashboard', 'income'] },
          learning: { enabled: false, level: 'beginner', completedTours: [], dismissedTips: [] },
          welcome: { enabled: false },
          import: { suggestions: false },
          keywords: [],
        },
        null,
        2
      )
    );
  }

  const main = join(dataDir, 'main.journal');
  if (!existsSync(main)) {
    writeFileSync(
      main,
      `; hledger journal file

D $1,000.00

account assets
account assets:bank:checking
account equity
account equity:opening-balances
account expenses
account expenses:housing
account expenses:housing:rent
account expenses:utilities
account expenses:utilities:electricity
account expenses:food
account expenses:food:groceries
account income
account income:salary
account income:interest

include 2026.journal
`
    );
  }

  const year = join(dataDir, '2026.journal');
  if (!existsSync(year)) {
    const lines: string[] = [
      '2026-01-01 opening balances',
      '    assets:bank:checking                       $20,000.00',
      '    equity:opening-balances',
      '',
    ];

    // Every month of the year, so the YTD view (Jan..now) has a column each.
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      const day = (d: number) => `2026-${mm}-${String(d).padStart(2, '0')}`;
      lines.push(
        `${day(1)} salary`,
        '    assets:bank:checking                       $5,000.00',
        '    income:salary',
        '',
        `${day(3)} rent`,
        '    expenses:housing:rent                     $1,850.00',
        '    assets:bank:checking',
        '',
        `${day(8)} groceries`,
        '    expenses:food:groceries                      $412.37',
        '    assets:bank:checking',
        '',
        `${day(15)} electricity`,
        '    expenses:utilities:electricity                $96.18',
        '    assets:bank:checking',
        '',
        `${day(20)} interest`,
        '    assets:bank:checking                          $3.21',
        '    income:interest',
        ''
      );
    }

    writeFileSync(year, lines.join('\n'));
  }
}
