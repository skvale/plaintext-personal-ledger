// ─── hledger Version Constraints ────────────────────────────────────────────────

/** Minimum supported hledger version (inclusive) */
export const HLEDGER_MIN_VERSION = "1.40";

/** Maximum supported major version (exclusive) — 2.x would need testing */
export const HLEDGER_MAX_MAJOR = 2;

// ─── Cache ────────────────────────────────────────────────────────────────────

/** Cache TTL in milliseconds (5 minutes) — file-watch invalidation handles edits */
export const CACHE_TTL = 300_000;

// ─── Journal Formatting ────────────────────────────────────────────────────────

/** Target column for right edge of amount in posting lines */
export const AMOUNT_COL = 52;

/** Fixed width for the amount field in posting lines */
export const AMOUNT_WIDTH = 12;

// ─── CSV Import ────────────────────────────────────────────────────────────────

/** Pending CSV import TTL in milliseconds (10 minutes) */
export const PENDING_IMPORT_TTL = 10 * 60_000;

// ─── Register ─────────────────────────────────────────────────────────────────

/** Default page size for transaction register */
export const REGISTER_PAGE_SIZE = 100;

/** Debounce timer for search in milliseconds */
export const SEARCH_DEBOUNCE_MS = 400;
