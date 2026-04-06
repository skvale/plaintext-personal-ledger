JOURNAL := data/main.journal
HLEDGER := hledger -f $(JOURNAL)

# === Import ===

import-checking: ## Import checking account CSV
	$(HLEDGER) import checking.csv

import-creditcard: ## Import credit card CSV
	$(HLEDGER) import credit-card.csv

import-vanguard: ## Import Vanguard CSV
	$(HLEDGER) import vanguard.csv

import-all: import-checking import-creditcard import-vanguard ## Import all CSVs

# === Import (dry run) ===

preview-checking: ## Preview checking import (no changes)
	$(HLEDGER) import --dry-run checking.csv

preview-creditcard: ## Preview credit card import (no changes)
	$(HLEDGER) import --dry-run credit-card.csv

preview-vanguard: ## Preview Vanguard import (no changes)
	$(HLEDGER) import --dry-run vanguard.csv

# === Reports ===

balance: ## Show all account balances
	$(HLEDGER) bal

balancesheet: ## Show assets and liabilities (net worth)
	$(HLEDGER) balancesheet

income: ## Show income and expenses
	$(HLEDGER) incomestatement

register: ## Show all transactions
	$(HLEDGER) reg

# === Filtered reports ===

expenses: ## Show expenses by category
	$(HLEDGER) bal expenses --tree

monthly: ## Show monthly income statement
	$(HLEDGER) incomestatement --monthly

creditcard: ## Show credit card transactions
	$(HLEDGER) reg "liabilities:credit-card"

investments: ## Show investment account balances
	$(HLEDGER) bal assets:investments --tree

dividends: ## Show dividend income
	$(HLEDGER) reg income:dividends

checking: ## Show checking account transactions
	$(HLEDGER) reg assets:bank:checking

# === Graphs ===

bar-expenses: ## ASCII bar chart of monthly expenses
	LEDGER_FILE=$(JOURNAL) hledger-bar -v expenses cur:\\$$

bar-income: ## ASCII bar chart of monthly income
	LEDGER_FILE=$(JOURNAL) hledger-bar -v --invert income cur:\\$$

# === UI ===

web: ## Open web UI in browser (http://localhost:5000)
	hledger-web -f $(JOURNAL) --serve

dev: ## Start the new Svelte UI (http://localhost:5173)
	pnpm dev

# === Add transactions ===

add: ## Add a transaction interactively
	$(HLEDGER) add

# === Categorization ===

uncategorized: ## Show uncategorized transactions
	$(HLEDGER) reg expenses:unknown

# === Utilities ===

accounts: ## List all accounts
	$(HLEDGER) accounts

stats: ## Show journal statistics
	$(HLEDGER) stats

check: ## Validate the journal file
	$(HLEDGER) check

check-strict: ## Validate journal (strict: all accounts/commodities must be declared)
	$(HLEDGER) check --strict

# === Help ===

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.PHONY: help
.DEFAULT_GOAL := help
