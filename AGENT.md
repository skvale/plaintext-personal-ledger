# Plaintext Personal Ledger Agent Context

## Project Overview

A web dashboard for [hledger](https://hledger.org/) personal finance. Built on the plain-text journal — hledger stays the source of truth, the UI makes it usable.

## Stack

| Layer      | Choice                                                         |
| ---------- | -------------------------------------------------------------- |
| Framework  | SvelteKit 2 (node adapter)                                     |
| Styling    | Tailwind CSS v4                                                |
| Charts     | Chart.js                                                       |
| Components | bits-ui, dnd-kit-svelte                                        |
| Real-time  | Server-Sent Events + chokidar (auto-refresh on journal change) |
| Data       | Shell out to hledger CLI + in-memory cache                     |

## hledger Reference

- `~/agent-vault/hledger/How hledger works.md` - Notes on hledger concepts, CSV import rules, and syntax gotchas

## Key Files

- `src/lib/hledger.server.ts` - Core hledger CLI wrapper, caching, journal writes
- `src/lib/watcher.server.ts` - File watching + SSE broadcast for auto-refresh
- `src/lib/types.ts` - Shared TypeScript types
- `src/lib/settings.ts` - Settings types and defaults

## Core Modules (`src/lib/hledger/`)

| Module                   | Purpose                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `exec.ts`                | Low-level hledger CLI execution                                   |
| `cache.ts`               | Caching layer, exports `run()`, `runJson()`, `invalidateCache()`  |
| `runner.ts`              | CLI command builder, argument parsing                             |
| `parsing.ts`             | hledger output parsing, data transformation                       |
| `constants.ts`           | Constants (account types, date ranges)                            |
| `types.ts`               | TypeScript types for hledger data                                 |
| `index.ts`              | Re-exports all modules                                            |
| `transactions.ts`        | Transaction CRUD, account declarations, recent txns               |
| `reports.ts`             | Financial reports (net worth, P&L, cash flow, vendors, portfolio) |
| `import.ts`              | CSV import, rules file parsing/editing                            |
| `reconcile.ts`           | Bank reconciliation                                               |
| `recurring.ts`           | Recurring rules, forecasting                                      |
| `budget.ts`              | Budget tracking                                                   |
| `documents.ts`           | Document uploads, transaction tags, bill/payment linking          |
| `triage.ts`              | Uncategorized transaction handling                                |
| `git.ts`                 | Journal version control (diff, log, commit)                       |
| `journal.ts`             | Journal file operations, parsing, writing                          |
| `journal-maintenance.ts` | Journal sorting                                                   |

## Important Conventions

1. **Server-side hledger**: All hledger CLI calls go through `src/lib/hledger/` modules. Never call `hledger` directly from client components.

2. **CLI calls**: Use `run(args)` or `runJson(args)` from `cache.ts` - handles caching automatically.

3. **Auto-refresh system**: The server watches journal files with chokidar and broadcasts changes via Server-Sent Events (SSE). Routes receive a `invalidate` callback to trigger reloading when journal changes are detected.

4. **Route structure**: Each route has `+page.svelte` (UI) and `+page.server.ts` (data loading). Use the server file for any hledger CLI calls.

5. **Settings**: User preferences are stored in `data/settings.json`. The schema is in `data/settings.schema.json`.

6. **Account types**: Accounts are typed (Asset, Liability, Equity, Income, Expense). Use proper types from `src/lib/types.ts`.

## Running

```bash
pnpm install
pnpm dev
```

## Routes

```
src/routes/
├── +layout.server.ts         # shared layout data (accounts, settings)
├── +layout.svelte            # app shell (sidebar, header)
├── +page.svelte              # redirects to dashboard
├── dashboard/                # net worth, MTD summary, recent txns
├── register/                 # transaction list with search/filter
├── accounts/                 # account tree grouped by type
├── balancesheet/             # assets vs liabilities, net worth trend
├── income/                   # P&L monthly breakdown (3/6/12mo)
├── cashflow/                 # money in/out by account
├── budget/                   # spending targets vs actuals
├── portfolio/                # investment accounts with values
├── vendors/                  # spending by vendor with trends
├── forecast/                # balance projections
├── reconcile/               # match against bank statements
├── triage/                  # categorize uncategorized transactions
├── docs/                     # statement management
│   └── csv/                  # CSV import with preview
├── mappings/                 # visual .rules file editor
├── git/                      # journal diff viewer
├── check/                    # validation errors
├── journal/                  # raw journal view
├── add/                      # new transaction form
├── edit/[tindex]/            # edit existing transaction
├── tx/[id]/                  # transaction detail view
│   └── edit/                 # edit from detail page
├── settings/                 # UI preferences, sidebar customization
├── welcome/                  # onboarding tour
├── events/                   # SSE endpoint for auto-refresh
└── api/                      # backend endpoints
    ├── accounts/             # account autocomplete
    ├── dismiss-tour/         # tour state
    ├── extract-pdf/          # PDF text extraction
    ├── flush-cache/          # cache invalidation
    └── settings/             # settings CRUD
```

## Adding a New Feature

1. Create route in `src/routes/<feature>/+page.svelte` and `+page.server.ts`
2. Add navigation link in `src/routes/+layout.svelte`
3. For hledger data, import from `src/lib/hledger/` (index.ts re-exports everything)
4. Test with `pnpm check` for TypeScript errors
