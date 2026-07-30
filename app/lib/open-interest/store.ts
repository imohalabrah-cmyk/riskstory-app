import { getCloudflareContext } from "@opennextjs/cloudflare";
import { OPEN_INTEREST_SCHEMA } from "../../../db/schema";
import type {
  DailyOpenInterestSummary,
  HistoricalOpenInterestSession,
  OpenInterestLevel,
  TrackedSymbol,
} from "./types";

type Row = Record<string, unknown>;

const DEFAULT_SYMBOLS: TrackedSymbol[] = [
  {
    symbol: "SPY",
    displayName: "SPDR S&P 500 ETF",
    assetType: "etf",
    active: true,
    sortOrder: 10,
    occQueryType: "O",
    occQuerySymbol: "SPY",
    occProductSymbol: "SPY",
  },
  {
    symbol: "SPX",
    displayName: "S&P 500 Index",
    assetType: "index",
    active: true,
    sortOrder: 20,
    occQueryType: "U",
    occQuerySymbol: "SPX",
    occProductSymbol: "SPXW",
  },
  {
    symbol: "QQQ",
    displayName: "Invesco QQQ ETF",
    assetType: "etf",
    active: true,
    sortOrder: 30,
    occQueryType: "O",
    occQuerySymbol: "QQQ",
    occProductSymbol: "QQQ",
  },
];

let initialized: Promise<D1Database> | null = null;

function asString(value: unknown) {
  return value == null ? "" : String(value);
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function database() {
  if (initialized) return initialized;
  initialized = (async () => {
    const { env } = await getCloudflareContext({ async: true });
    const db = env.DB as D1Database | undefined;
    if (!db) throw new Error("Open Interest database binding DB is unavailable");

    await db.batch(OPEN_INTEREST_SCHEMA.map((sql) => db.prepare(sql)));
    await db.batch(DEFAULT_SYMBOLS.map((item) => db.prepare(`
      INSERT INTO oi_symbols(
        symbol,display_name,asset_type,active,sort_order,occ_query_type,occ_query_symbol,occ_product_symbol
      ) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(symbol) DO UPDATE SET
        display_name=excluded.display_name,
        asset_type=excluded.asset_type,
        occ_query_type=excluded.occ_query_type,
        occ_query_symbol=excluded.occ_query_symbol,
        occ_product_symbol=excluded.occ_product_symbol
    `).bind(
      item.symbol,
      item.displayName,
      item.assetType,
      item.active ? 1 : 0,
      item.sortOrder,
      item.occQueryType,
      item.occQuerySymbol,
      item.occProductSymbol,
    )));
    return db;
  })();
  return initialized;
}

export async function listTrackedSymbols(): Promise<TrackedSymbol[]> {
  const db = await database();
  const result = await db.prepare(`
    SELECT symbol,display_name,asset_type,active,sort_order,occ_query_type,occ_query_symbol,occ_product_symbol
    FROM oi_symbols WHERE active=1 ORDER BY sort_order,symbol
  `).all<Row>();
  return result.results.map((row) => ({
    symbol: asString(row.symbol),
    displayName: asString(row.display_name),
    assetType: asString(row.asset_type) as TrackedSymbol["assetType"],
    active: Boolean(asNumber(row.active)),
    sortOrder: asNumber(row.sort_order),
    occQueryType: asString(row.occ_query_type) as TrackedSymbol["occQueryType"],
    occQuerySymbol: asString(row.occ_query_symbol),
    occProductSymbol: asString(row.occ_product_symbol),
  }));
}

export async function upsertTrackedSymbol(symbol: TrackedSymbol) {
  const db = await database();
  await db.prepare(`
    INSERT INTO oi_symbols(
      symbol,display_name,asset_type,active,sort_order,occ_query_type,occ_query_symbol,occ_product_symbol
    ) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(symbol) DO UPDATE SET
      display_name=excluded.display_name,
      asset_type=excluded.asset_type,
      active=excluded.active,
      sort_order=excluded.sort_order,
      occ_query_type=excluded.occ_query_type,
      occ_query_symbol=excluded.occ_query_symbol,
      occ_product_symbol=excluded.occ_product_symbol
  `).bind(
    symbol.symbol,
    symbol.displayName,
    symbol.assetType,
    symbol.active ? 1 : 0,
    symbol.sortOrder,
    symbol.occQueryType,
    symbol.occQuerySymbol,
    symbol.occProductSymbol,
  ).run();
}

export async function deactivateTrackedSymbol(symbol: string) {
  const db = await database();
  await db.prepare("UPDATE oi_symbols SET active=0 WHERE symbol=?").bind(symbol).run();
}

export async function saveOccContractSummary(
  summary: DailyOpenInterestSummary,
  allLevels: OpenInterestLevel[],
) {
  const db = await database();
  const payload = JSON.stringify(summary);
  const snapshot = db.prepare(`
    INSERT INTO occ_daily_summaries(contract_date,symbol,payload,first_fetched_at,last_verified_at)
    VALUES(?,?,?,?,?)
    ON CONFLICT(contract_date,symbol) DO UPDATE SET
      payload=excluded.payload,
      last_verified_at=excluded.last_verified_at
  `).bind(
    summary.contractDate,
    summary.symbol,
    payload,
    summary.firstFetchedAt,
    summary.lastVerifiedAt,
  );
  const clearLevels = db.prepare(
    "DELETE FROM occ_contract_levels WHERE contract_date=? AND symbol=?",
  ).bind(summary.contractDate, summary.symbol);
  const insertLevels = allLevels.map((level) => db.prepare(`
    INSERT INTO occ_contract_levels(contract_date,symbol,side,strike,open_interest,rank)
    VALUES(?,?,?,?,?,?)
  `).bind(
    summary.contractDate,
    summary.symbol,
    level.side,
    level.strike,
    level.openInterest,
    level.rank,
  ));
  await db.batch([snapshot, clearLevels, ...insertLevels]);
}

export async function recordSyncRun(
  summaryDate: string,
  status: string,
  requested: number,
  saved: number,
  details: string,
) {
  const db = await database();
  await db.prepare(`
    INSERT INTO oi_sync_runs(summary_date,status,symbols_requested,symbols_saved,details,created_at)
    VALUES(?,?,?,?,?,?)
  `).bind(summaryDate, status, requested, saved, details, new Date().toISOString()).run();
}

export async function listSummaryDates(limit = 90) {
  const db = await database();
  const result = await db.prepare(`
    SELECT DISTINCT contract_date FROM occ_daily_summaries
    ORDER BY contract_date DESC LIMIT ?
  `).bind(limit).all<Row>();
  return result.results.map((row) => asString(row.contract_date));
}

export async function getStoredReference(symbol: string, contractDate: string) {
  const db = await database();
  const row = await db.prepare(`
    SELECT payload,last_verified_at FROM occ_daily_summaries
    WHERE symbol=? AND contract_date=?
  `).bind(symbol, contractDate).first<Row>();
  if (!row) return { price: 0, source: "unavailable", asOf: "" };
  const summary = JSON.parse(asString(row.payload)) as DailyOpenInterestSummary;
  return {
    price: asNumber(summary.referencePrice),
    source: summary.referencePriceSource || "unavailable",
    asOf: summary.referencePriceAsOf || asString(row.last_verified_at),
  };
}

export async function getOpenInterestCalibration(
  symbol: string,
  beforeDate: string,
  limit = 19,
) {
  const db = await database();
  const dates = await db.prepare(`
    SELECT DISTINCT contract_date FROM occ_contract_levels
    WHERE symbol=? AND contract_date<?
    ORDER BY contract_date DESC LIMIT ?
  `).bind(symbol, beforeDate, limit).all<Row>();
  const contractDates = dates.results.map((row) => asString(row.contract_date));
  if (!contractDates.length) {
    return { sessionCount: 0, openInterestValues: [] as number[], sessions: [] as HistoricalOpenInterestSession[] };
  }

  const placeholders = contractDates.map(() => "?").join(",");
  const levels = await db.prepare(`
    SELECT contract_date,side,strike,open_interest,rank FROM occ_contract_levels
    WHERE symbol=? AND contract_date IN (${placeholders}) AND open_interest>0
    ORDER BY contract_date DESC,side,rank
  `).bind(symbol, ...contractDates).all<Row>();
  const sessions = contractDates.map((contractDate) => ({
    contractDate,
    levels: levels.results
      .filter((row) => asString(row.contract_date) === contractDate)
      .map((row): OpenInterestLevel => ({
        side: asString(row.side) as OpenInterestLevel["side"],
        strike: asNumber(row.strike),
        openInterest: asNumber(row.open_interest),
        rank: asNumber(row.rank),
      })),
  }));
  return {
    sessionCount: contractDates.length,
    openInterestValues: levels.results.map((row) => asNumber(row.open_interest)).filter(Boolean),
    sessions,
  };
}

export async function getDailySummaries(requestedDate?: string) {
  const db = await database();
  const latest = requestedDate || asString((await db.prepare(
    "SELECT MAX(contract_date) AS date FROM occ_daily_summaries",
  ).first<Row>())?.date);
  if (!latest) return { summaryDate: null, summaries: [] as DailyOpenInterestSummary[] };

  const result = await db.prepare(`
    SELECT s.payload FROM occ_daily_summaries s
    JOIN oi_symbols y ON y.symbol=s.symbol
    WHERE s.contract_date=?
    ORDER BY y.sort_order,y.symbol
  `).bind(latest).all<Row>();
  return {
    summaryDate: latest,
    summaries: result.results.map((row) => JSON.parse(asString(row.payload)) as DailyOpenInterestSummary),
  };
}
