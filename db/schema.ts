export const OPEN_INTEREST_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS oi_symbols (
    symbol TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 100,
    occ_query_type TEXT NOT NULL,
    occ_query_symbol TEXT NOT NULL,
    occ_product_symbol TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS occ_daily_summaries (
    contract_date TEXT NOT NULL,
    symbol TEXT NOT NULL,
    payload TEXT NOT NULL,
    first_fetched_at TEXT NOT NULL,
    last_verified_at TEXT NOT NULL,
    PRIMARY KEY(contract_date,symbol)
  )`,
  `CREATE TABLE IF NOT EXISTS occ_contract_levels (
    contract_date TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    strike REAL NOT NULL,
    open_interest INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    PRIMARY KEY(contract_date,symbol,side,rank)
  )`,
  `CREATE TABLE IF NOT EXISTS oi_sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    summary_date TEXT NOT NULL,
    status TEXT NOT NULL,
    symbols_requested INTEGER NOT NULL,
    symbols_saved INTEGER NOT NULL,
    details TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_oi_summary_date ON occ_daily_summaries(contract_date DESC)",
  "CREATE INDEX IF NOT EXISTS idx_oi_levels_history ON occ_contract_levels(symbol,contract_date DESC)",
] as const;
