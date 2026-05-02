// ─── Constants ─────────────────────────────────────────────────────────────────

export {
  HLEDGER_MIN_VERSION,
  HLEDGER_MAX_MAJOR,
  CACHE_TTL,
  AMOUNT_COL,
  AMOUNT_WIDTH,
  PENDING_IMPORT_TTL,
  REGISTER_PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
} from "./constants.js";

// ─── Journal Configuration ─────────────────────────────────────────────────────

export {
  JOURNAL,
  RECURRING_JOURNAL,
  STATEMENTS_DIR,
  SETTINGS_FILE,
  JOURNAL_DIR,
  BUDGET_JOURNAL,
  MAIN_JOURNAL,
} from "./journal.js";

// ─── Runner ───────────────────────────────────────────────────────────────────

export { isHledgerAvailable, getHledgerVersion } from "./runner.js";
export { run, runJson, invalidateCache, watchJournal } from "./cache.js";

// ─── Parsing Helpers ──────────────────────────────────────────────────────────

export {
  pickAmount,
  pickCommodity,
  periodStart,
  lastNMonths,
  generateMonthRange,
  findSubreport,
  extractTag,
  fmtPosting,
  fmtAmount,
  normaliseAmount,
} from "./parsing.js";

export type { CbrSubreport } from "./parsing.js";

// ─── Transactions ──────────────────────────────────────────────────────────────

export {
  getRecentTransactions,
  getTransactions,
  getAccountNames,
  getDeclaredAccounts,
  getAccountDescriptions,
  addAccountDeclaration,
  deleteAccountDeclaration,
  appendTransaction,
  checkJournal,
  getUncategorizedCount,
  getUsedAccountNames,
} from "./transactions.js";

// ─── Journal Maintenance ──────────────────────────────────────────────────────

export { sortJournal, sortJournalByDate } from "./journal-maintenance.js";

// ─── Reports ──────────────────────────────────────────────────────────────────

export {
  getNetWorth,
  getMonthSummary,
  getExpenseCategories,
  getBalanceSheet,
  getBalanceSheetMultiMonth,
  getMonthlyIncome,
  getMultiMonthPnL,
  getIncomeStatementDetail,
  getCashFlow,
  getAccountBalances,
  getNetWorthHistory,
  getPortfolioData,
  getUnrealizedGains,
  getVendors,
  getVendorsMultiMonth,
} from "./reports.js";

export type {
  BalanceSheetData,
  MultiMonthBalanceSheet,
  MultiMonthPnL,
  IncomeStatementDetail,
  PnLLine,
  CashFlowMonth,
  MultiMonthCashFlow,
  UnrealizedGains,
  MultiMonthVendors,
} from "./reports.js";

// ─── Recurring Rules & Forecast ───────────────────────────────────────────────

export {
  getRecurringRules,
  saveRecurringRules,
  appendRecurringRule,
  getPastDueForecast,
  materializePastDue,
  getForecast,
} from "./recurring.js";

export type {
  RecurringRule,
  ForecastTransaction,
  ForecastPosting,
} from "./recurring.js";

// ─── CSV Import ───────────────────────────────────────────────────────────────

export {
  getRulesFiles,
  getRulePatternsByFile,
  getRulesContent,
  detectCsvFromPath,
  detectCsvDefaults,
  generateRulesFromCsv,
  generateRulesFromCsvContent,
  parseRulesFile,
  serializeRulesFile,
  appendRule,
  saveRulesFile,
  renameRulesFile,
  rulesFileExists,
  importCsvPreview,
  importCsvConfirm,
  importCsvPreviewPath,
} from "./import.js";

export type { CsvDetectionResult } from "./import.js";
export type { ParsedRulesFile, RulesItem } from "./types.js";

// ─── Reconciliation ───────────────────────────────────────────────────────────

export {
  getAccountsWithUncleared,
  getReconcileData,
  setTransactionCleared,
} from "./reconcile.js";

export type { ReconcileTx } from "./reconcile.js";

// ─── Git ─────────────────────────────────────────────────────────────────────

export {
  getGitStatus,
  getGitDiff,
  getGitLog,
  getCommitDiff,
  gitCommit,
} from "./git.js";

export type { GitStatus, GitCommit } from "./git.js";

// ─── Budget ───────────────────────────────────────────────────────────────────

export {
  getBudgetEntries,
  saveBudgetEntries,
  getBudgetStatus,
} from "./budget.js";

export type { BudgetEntry } from "./budget.js";

// ─── Documents ────────────────────────────────────────────────────────────────

export {
  getDocuments,
  getTransactionDocs,
  attachDocToTransaction,
  addTransactionTag,
  uploadDocument,
  removeTransactionTag,
  resolveTransactionBlock,
  getTransactionForEdit,
  getRelatedPayable,
  updateTransaction,
  updateTransactionRaw,
  deleteTransaction,
  deleteDocument,
} from "./documents.js";

export type {
  DocFile,
  DocFolder,
  TransactionDoc,
  EditableTransaction,
} from "./documents.js";

// ─── Triage ────────────────────────────────────────────────────────────────────

export {
  getUncategorizedTransactions,
  getTxnSuggestions,
  recategorizeMany,
  recategorize,
} from "./triage.js";

export type { UncategorizedTxn } from "./triage.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  Transaction,
  AccountBalance,
  MonthlyData,
  ExpenseCategory,
} from "./types.js";
