export interface TxPosting {
  account: string;
  amount: number;
  commodity: string;
}

export interface Transaction {
  index: number;
  tindex?: number; // hledger 1-based transaction index (from print JSON)
  txid?: string; // stable unique ID from ; txid: <id> tag
  date: string;
  description: string;
  postings: TxPosting[];
  // When filtered to a single account: the running balance for that account
  balance?: number;
  // Flat posting fields returned by getRecentTransactions (register command)
  account?: string;
  amount?: number;
  commodity?: string;
  isBill?: boolean;
  billPaid?: boolean;
}

export interface EditableTransaction {
  tindex: number;
  txid?: string; // stable unique ID from ; txid: <id> tag
  date: string;
  description: string;
  postings: { account: string; amount: string }[];
  docPath?: string;
  rawText?: string;
}

export interface AccountBalance {
  name: string;
  amount: number;
  commodity: string;
  depth: number;
}

export interface MonthlyData {
  month: string; // "YYYY-MM"
  income: number;
  expenses: number;
  netWorth?: number;
}

export interface ExpenseCategory {
  name: string;
  shortName: string;
  amount: number;
}

export type RulesItem =
  | {
      type: "rule";
      id: string;
      patterns: string;
      account: string;
      assignments: { key: string; value: string }[];
    }
  | { type: "include"; id: string; path: string }
  | { type: "section"; id: string; label: string }
  | { type: "raw"; id: string; content: string };

export interface ParsedRulesFile {
  header: string;
  items: RulesItem[];
}

export interface UncategorizedTxn {
  tindex: number;
  txid?: string;
  date: string;
  description: string;
  amount: number;
  commodity: string;
  otherAccount: string;
}
