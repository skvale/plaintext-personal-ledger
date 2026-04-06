// ─── Core Types ────────────────────────────────────────────────────────────────

export interface Transaction {
  index: number;
  tindex?: number;
  txid?: string;
  date: string;
  description: string;
  postings: { account: string; amount: number; commodity: string }[];
  account?: string; // display account for the register
  amount?: number; // sum of positive non-equity postings
  commodity?: string;
  balance?: number; // running balance (when filtered by account)
  isBill?: boolean;
  billPaid?: boolean;
}

export interface AccountBalance {
  name: string;
  amount: number;
  commodity: string;
  depth: number;
}

export interface MonthlyData {
  month: string;
  income: number;
  expenses: number;
}

// ─── Triage ────────────────────────────────────────────────────────────────────

export interface UncategorizedTxn {
  tindex: number;
  txid?: string;
  date: string;
  description: string;
  amount: number;
  commodity: string;
  otherAccount: string;
}

// ─── Import ────────────────────────────────────────────────────────────────────

export interface RulesItem {
  type: "rule" | "include" | "section" | "raw";
  id: string;
  patterns?: string;
  account?: string;
  assignments?: { key: string; value: string }[];
  path?: string;
  label?: string;
  content?: string;
}

export interface ParsedRulesFile {
  header: string;
  items: RulesItem[];
}

export interface CsvDetectionResult {
  skip: string;
  fields: string;
  dateFormat: string;
  currency: string;
  account2: string;
  descriptions: string[];
}

// ─── Forecast ──────────────────────────────────────────────────────────────────

export interface ForecastPosting {
  account: string;
  amount: number;
  auto: boolean;
}

export interface ForecastTransaction {
  date: string;
  description: string;
  postings: ForecastPosting[];
}

// ─── Documents ────────────────────────────────────────────────────────────────

export interface DocFile {
  name: string;
  relPath: string;
  ext: string;
  size: number;
  latestImport?: string;
}

export interface DocFolder {
  name: string;
  files: DocFile[];
}

export interface TransactionDoc {
  tindex: number;
  txid?: string;
  date: string;
  description: string;
  docPath: string;
  unpaid: boolean;
  amount: number;
  vendor: string;
}

// ─── Expense Categories ────────────────────────────────────────────────────────

export interface ExpenseCategory {
  name: string;
  shortName: string;
  amount: number;
}

// ─── Editable Transaction ───────────────────────────────────────────────────────

export interface EditableTransaction {
  tindex: number;
  txid?: string;
  date: string;
  description: string;
  postings: { account: string; amount: string }[];
  docPath?: string;
  rawText: string;
}

// ─── Settings ──────────────────────────────────────────────────────────────────

export interface Settings {
  display?: {
    roundAmounts?: boolean;
    showCurrencySymbol?: boolean;
  };
  accounts?: {
    default?: string;
    drop?: number;
  };
  categories?: {
    default?: string;
  };
}
