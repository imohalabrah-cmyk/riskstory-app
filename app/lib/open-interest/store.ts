import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { DailyOpenInterestSummary, OpenInterestLevel, OpenInterestReactionZone, TrackedSymbol } from "./types";

let database: DatabaseSync | null = null;

function databasePath() {
  return process.env.OI_DB_PATH || path.join(process.cwd(), "data", "risk-story.sqlite");
}

function asString(value: unknown) {
  return value == null ? "" : String(value);
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function ensureSymbolColumns(db: DatabaseSync) {
  const columns = new Set(db.prepare("PRAGMA table_info(oi_symbols)").all().map((row) => asString(row.name)));
  if (!columns.has("occ_query_type")) db.exec("ALTER TABLE oi_symbols ADD COLUMN occ_query_type TEXT NOT NULL DEFAULT 'O'");
  if (!columns.has("occ_query_symbol")) db.exec("ALTER TABLE oi_symbols ADD COLUMN occ_query_symbol TEXT NOT NULL DEFAULT ''");
  if (!columns.has("occ_product_symbol")) db.exec("ALTER TABLE oi_symbols ADD COLUMN occ_product_symbol TEXT NOT NULL DEFAULT ''");
}

function ensureSnapshotColumns(db: DatabaseSync) {
  const columns = new Set(db.prepare("PRAGMA table_info(occ_contract_snapshots)").all().map((row) => asString(row.name)));
  if (!columns.has("reference_price")) db.exec("ALTER TABLE occ_contract_snapshots ADD COLUMN reference_price REAL NOT NULL DEFAULT 0");
  if (!columns.has("reference_source")) db.exec("ALTER TABLE occ_contract_snapshots ADD COLUMN reference_source TEXT NOT NULL DEFAULT 'unavailable'");
  if (!columns.has("reference_as_of")) db.exec("ALTER TABLE occ_contract_snapshots ADD COLUMN reference_as_of TEXT NOT NULL DEFAULT ''");
  if (!columns.has("analysis_window_points")) db.exec("ALTER TABLE occ_contract_snapshots ADD COLUMN analysis_window_points REAL NOT NULL DEFAULT 0");
  if (!columns.has("threshold_watch")) db.exec("ALTER TABLE occ_contract_snapshots ADD COLUMN threshold_watch INTEGER NOT NULL DEFAULT 0");
  if (!columns.has("threshold_strong")) db.exec("ALTER TABLE occ_contract_snapshots ADD COLUMN threshold_strong INTEGER NOT NULL DEFAULT 0");
  if (!columns.has("threshold_major")) db.exec("ALTER TABLE occ_contract_snapshots ADD COLUMN threshold_major INTEGER NOT NULL DEFAULT 0");
  if (!columns.has("threshold_source")) db.exec("ALTER TABLE occ_contract_snapshots ADD COLUMN threshold_source TEXT NOT NULL DEFAULT 'baseline'");
  if (!columns.has("calibration_sessions")) db.exec("ALTER TABLE occ_contract_snapshots ADD COLUMN calibration_sessions INTEGER NOT NULL DEFAULT 0");
  if (!columns.has("levels_complete")) db.exec("ALTER TABLE occ_contract_snapshots ADD COLUMN levels_complete INTEGER NOT NULL DEFAULT 0");
}

function ensureZoneColumns(db: DatabaseSync, table: string) {
  const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => asString(row.name)));
  if (!columns.has("score")) db.exec(`ALTER TABLE ${table} ADD COLUMN score INTEGER NOT NULL DEFAULT 0`);
  if (!columns.has("historical_score")) db.exec(`ALTER TABLE ${table} ADD COLUMN historical_score INTEGER NOT NULL DEFAULT 0`);
  if (!columns.has("cluster_score")) db.exec(`ALTER TABLE ${table} ADD COLUMN cluster_score INTEGER NOT NULL DEFAULT 0`);
  if (!columns.has("proximity_score")) db.exec(`ALTER TABLE ${table} ADD COLUMN proximity_score INTEGER NOT NULL DEFAULT 0`);
  if (!columns.has("persistence_score")) db.exec(`ALTER TABLE ${table} ADD COLUMN persistence_score INTEGER NOT NULL DEFAULT 0`);
  if (!columns.has("dominance_score")) db.exec(`ALTER TABLE ${table} ADD COLUMN dominance_score INTEGER NOT NULL DEFAULT 0`);
  if (!columns.has("persistence_sessions")) db.exec(`ALTER TABLE ${table} ADD COLUMN persistence_sessions INTEGER NOT NULL DEFAULT 1`);
  if (!columns.has("distance_points")) db.exec(`ALTER TABLE ${table} ADD COLUMN distance_points REAL NOT NULL DEFAULT 0`);
  if (!columns.has("window_points")) db.exec(`ALTER TABLE ${table} ADD COLUMN window_points REAL NOT NULL DEFAULT 0`);
  if (!columns.has("is_extended")) db.exec(`ALTER TABLE ${table} ADD COLUMN is_extended INTEGER NOT NULL DEFAULT 0`);
}

function getDatabase() {
  if (database) return database;
  const file = databasePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  database = new DatabaseSync(file);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS oi_symbols (
      symbol TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      asset_type TEXT NOT NULL CHECK (asset_type IN ('index','etf','stock')),
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  ensureSymbolColumns(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS occ_contract_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      product_symbol TEXT NOT NULL,
      pivot REAL NOT NULL,
      upper_zone REAL NOT NULL,
      lower_zone REAL NOT NULL,
      total_call_oi INTEGER NOT NULL,
      total_put_oi INTEGER NOT NULL,
      scenario_ar TEXT NOT NULL,
      source_url TEXT NOT NULL,
      first_fetched_at TEXT NOT NULL,
      last_verified_at TEXT NOT NULL,
      UNIQUE(contract_date, symbol),
      FOREIGN KEY(symbol) REFERENCES oi_symbols(symbol)
    );
    CREATE TABLE IF NOT EXISTS occ_contract_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('call','put')),
      strike REAL NOT NULL,
      open_interest INTEGER NOT NULL,
      rank INTEGER NOT NULL,
      UNIQUE(snapshot_id, side, rank),
      FOREIGN KEY(snapshot_id) REFERENCES occ_contract_snapshots(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS occ_reaction_zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('call','put')),
      role TEXT NOT NULL CHECK (role IN ('support','resistance')),
      low_strike REAL NOT NULL,
      high_strike REAL NOT NULL,
      center_strike REAL NOT NULL,
      total_open_interest INTEGER NOT NULL,
      peak_open_interest INTEGER NOT NULL,
      strongest_strike REAL NOT NULL,
      level_count INTEGER NOT NULL,
      strength TEXT NOT NULL CHECK (strength IN ('watch','strong','major')),
      distance_percent REAL NOT NULL,
      rank INTEGER NOT NULL,
      UNIQUE(snapshot_id, side, rank),
      FOREIGN KEY(snapshot_id) REFERENCES occ_contract_snapshots(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS occ_attraction_zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('call','put')),
      role TEXT NOT NULL DEFAULT 'magnet',
      low_strike REAL NOT NULL,
      high_strike REAL NOT NULL,
      center_strike REAL NOT NULL,
      total_open_interest INTEGER NOT NULL,
      peak_open_interest INTEGER NOT NULL,
      strongest_strike REAL NOT NULL,
      level_count INTEGER NOT NULL,
      strength TEXT NOT NULL CHECK (strength IN ('watch','strong','major')),
      distance_percent REAL NOT NULL,
      rank INTEGER NOT NULL,
      UNIQUE(snapshot_id, side, rank),
      FOREIGN KEY(snapshot_id) REFERENCES occ_contract_snapshots(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS oi_sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      summary_date TEXT NOT NULL,
      status TEXT NOT NULL,
      symbols_requested INTEGER NOT NULL,
      symbols_saved INTEGER NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_occ_contract_date ON occ_contract_snapshots(contract_date DESC);
    CREATE INDEX IF NOT EXISTS idx_occ_contract_levels ON occ_contract_levels(snapshot_id, side, rank);
    CREATE INDEX IF NOT EXISTS idx_occ_reaction_zones ON occ_reaction_zones(snapshot_id, side, rank);
    CREATE INDEX IF NOT EXISTS idx_occ_attraction_zones ON occ_attraction_zones(snapshot_id, side, rank);
  `);
  ensureSnapshotColumns(database);
  ensureZoneColumns(database, "occ_reaction_zones");
  ensureZoneColumns(database, "occ_attraction_zones");

  const seed = database.prepare(`
    INSERT INTO oi_symbols(symbol,display_name,asset_type,active,sort_order,occ_query_type,occ_query_symbol,occ_product_symbol)
    VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(symbol) DO UPDATE SET
      display_name=excluded.display_name,
      asset_type=excluded.asset_type,
      occ_query_type=excluded.occ_query_type,
      occ_query_symbol=excluded.occ_query_symbol,
      occ_product_symbol=excluded.occ_product_symbol
  `);
  seed.run("SPY", "SPDR S&P 500 ETF", "etf", 1, 10, "O", "SPY", "SPY");
  seed.run("SPX", "S&P 500 Index", "index", 1, 20, "U", "SPX", "SPXW");
  seed.run("QQQ", "Invesco QQQ ETF", "etf", 1, 30, "O", "QQQ", "QQQ");
  return database;
}

export function listTrackedSymbols(): TrackedSymbol[] {
  return getDatabase().prepare(`
    SELECT symbol,display_name,asset_type,active,sort_order,occ_query_type,occ_query_symbol,occ_product_symbol
    FROM oi_symbols WHERE active=1 ORDER BY sort_order,symbol
  `).all().map((row) => ({
    symbol: asString(row.symbol),
    displayName: asString(row.display_name),
    assetType: asString(row.asset_type) as TrackedSymbol["assetType"],
    active: Boolean(row.active),
    sortOrder: asNumber(row.sort_order),
    occQueryType: asString(row.occ_query_type) as TrackedSymbol["occQueryType"],
    occQuerySymbol: asString(row.occ_query_symbol) || asString(row.symbol),
    occProductSymbol: asString(row.occ_product_symbol) || asString(row.symbol),
  }));
}

export function upsertTrackedSymbol(symbol: TrackedSymbol) {
  getDatabase().prepare(`
    INSERT INTO oi_symbols(symbol,display_name,asset_type,active,sort_order,occ_query_type,occ_query_symbol,occ_product_symbol)
    VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(symbol) DO UPDATE SET
      display_name=excluded.display_name,
      asset_type=excluded.asset_type,
      active=excluded.active,
      sort_order=excluded.sort_order,
      occ_query_type=excluded.occ_query_type,
      occ_query_symbol=excluded.occ_query_symbol,
      occ_product_symbol=excluded.occ_product_symbol
  `).run(
    symbol.symbol,
    symbol.displayName,
    symbol.assetType,
    symbol.active ? 1 : 0,
    symbol.sortOrder,
    symbol.occQueryType,
    symbol.occQuerySymbol,
    symbol.occProductSymbol,
  );
}

export function deactivateTrackedSymbol(symbol: string) {
  getDatabase().prepare("UPDATE oi_symbols SET active=0 WHERE symbol=?").run(symbol);
}

export function saveOccContractSummary(summary: DailyOpenInterestSummary, allLevels: OpenInterestLevel[]) {
  const db = getDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      INSERT INTO occ_contract_snapshots(
        contract_date,symbol,product_symbol,pivot,upper_zone,lower_zone,total_call_oi,total_put_oi,
        scenario_ar,source_url,first_fetched_at,last_verified_at,reference_price,reference_source,
        reference_as_of,analysis_window_points,threshold_watch,threshold_strong,threshold_major,
        threshold_source,calibration_sessions,levels_complete
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
      ON CONFLICT(contract_date,symbol) DO UPDATE SET
        product_symbol=excluded.product_symbol,
        pivot=excluded.pivot,
        upper_zone=excluded.upper_zone,
        lower_zone=excluded.lower_zone,
        total_call_oi=excluded.total_call_oi,
        total_put_oi=excluded.total_put_oi,
        scenario_ar=excluded.scenario_ar,
        source_url=excluded.source_url,
        last_verified_at=excluded.last_verified_at,
        reference_price=excluded.reference_price,
        reference_source=excluded.reference_source,
        reference_as_of=excluded.reference_as_of,
        analysis_window_points=excluded.analysis_window_points,
        threshold_watch=excluded.threshold_watch,
        threshold_strong=excluded.threshold_strong,
        threshold_major=excluded.threshold_major,
        threshold_source=excluded.threshold_source,
        calibration_sessions=excluded.calibration_sessions,
        levels_complete=1
    `).run(
      summary.contractDate,
      summary.symbol,
      summary.productSymbol,
      summary.pivot,
      summary.upperZone,
      summary.lowerZone,
      summary.totalCallOi,
      summary.totalPutOi,
      summary.scenarioAr,
      summary.sourceUrl,
      summary.firstFetchedAt,
      summary.lastVerifiedAt,
      summary.referencePrice,
      summary.referencePriceSource,
      summary.referencePriceAsOf,
      summary.analysisWindowPoints,
      summary.thresholds.watch,
      summary.thresholds.strong,
      summary.thresholds.major,
      summary.thresholds.source,
      summary.thresholds.sessionCount,
    );
    const row = db.prepare("SELECT id FROM occ_contract_snapshots WHERE contract_date=? AND symbol=?").get(summary.contractDate, summary.symbol);
    const snapshotId = asNumber(row?.id);
    db.prepare("DELETE FROM occ_contract_levels WHERE snapshot_id=?").run(snapshotId);
    const insertLevel = db.prepare("INSERT INTO occ_contract_levels(snapshot_id,side,strike,open_interest,rank) VALUES(?,?,?,?,?)");
    allLevels.forEach((level) => {
      insertLevel.run(snapshotId, level.side, level.strike, level.openInterest, level.rank);
    });
    const saveZones = (table: "occ_reaction_zones" | "occ_attraction_zones", zones: OpenInterestReactionZone[]) => {
      db.prepare(`DELETE FROM ${table} WHERE snapshot_id=?`).run(snapshotId);
      const insertZone = db.prepare(`
        INSERT INTO ${table}(
          snapshot_id,side,role,low_strike,high_strike,center_strike,total_open_interest,
          peak_open_interest,strongest_strike,level_count,strength,distance_percent,rank,
          score,historical_score,cluster_score,proximity_score,persistence_score,dominance_score,
          persistence_sessions,distance_points,window_points,is_extended
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      zones.forEach((zone) => {
        insertZone.run(
          snapshotId,
          zone.side,
          zone.role,
          zone.lowStrike,
          zone.highStrike,
          zone.centerStrike,
          zone.totalOpenInterest,
          zone.peakOpenInterest,
          zone.strongestStrike,
          zone.levelCount,
          zone.strength,
          zone.distancePercent,
          zone.rank,
          zone.score,
          zone.scoreBreakdown.historical,
          zone.scoreBreakdown.cluster,
          zone.scoreBreakdown.proximity,
          zone.scoreBreakdown.persistence,
          zone.scoreBreakdown.dominance,
          zone.persistenceSessions,
          zone.distancePoints,
          zone.windowPoints,
          zone.isExtended ? 1 : 0,
        );
      });
    };
    saveZones("occ_reaction_zones", summary.reactionZones);
    saveZones("occ_attraction_zones", summary.attractionZones);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function recordSyncRun(summaryDate: string, status: string, requested: number, saved: number, details: string) {
  getDatabase().prepare("INSERT INTO oi_sync_runs(summary_date,status,symbols_requested,symbols_saved,details,created_at) VALUES(?,?,?,?,?,?)")
    .run(summaryDate, status, requested, saved, details, new Date().toISOString());
}

export function listSummaryDates(limit = 90) {
  return getDatabase().prepare("SELECT DISTINCT contract_date FROM occ_contract_snapshots ORDER BY contract_date DESC LIMIT ?")
    .all(limit).map((row) => asString(row.contract_date));
}

export function getStoredReference(symbol: string, contractDate: string) {
  const row = getDatabase().prepare(`
    SELECT reference_price,reference_source,reference_as_of,last_verified_at
    FROM occ_contract_snapshots WHERE symbol=? AND contract_date=?
  `).get(symbol, contractDate);
  return {
    price: asNumber(row?.reference_price),
    source: asString(row?.reference_source) || "unavailable",
    asOf: asString(row?.reference_as_of) || asString(row?.last_verified_at),
  };
}

export function getOpenInterestCalibration(symbol: string, beforeDate: string, limit = 19) {
  const db = getDatabase();
  const snapshots = db.prepare(`
    SELECT id,contract_date FROM occ_contract_snapshots
    WHERE symbol=? AND contract_date<? AND levels_complete=1
    ORDER BY contract_date DESC LIMIT ?
  `).all(symbol, beforeDate, limit);
  const ids = snapshots.map((row) => asNumber(row.id)).filter(Boolean);
  if (!ids.length) return { sessionCount: 0, openInterestValues: [] as number[], sessions: [] };
  const placeholders = ids.map(() => "?").join(",");
  const levelRows = db.prepare(`
    SELECT snapshot_id,side,strike,open_interest,rank FROM occ_contract_levels
    WHERE snapshot_id IN (${placeholders}) AND open_interest>0
  `).all(...ids);
  const openInterestValues = levelRows.map((row) => asNumber(row.open_interest)).filter((value) => value > 0);
  const sessions = snapshots.map((snapshot) => ({
    contractDate: asString(snapshot.contract_date),
    levels: levelRows.filter((row) => asNumber(row.snapshot_id) === asNumber(snapshot.id)).map((row) => ({
      side: asString(row.side) as OpenInterestLevel["side"],
      strike: asNumber(row.strike),
      openInterest: asNumber(row.open_interest),
      rank: asNumber(row.rank),
    })),
  }));
  return { sessionCount: ids.length, openInterestValues, sessions };
}

export function getDailySummaries(requestedDate?: string) {
  const db = getDatabase();
  const summaryDate = requestedDate || asString(db.prepare("SELECT MAX(contract_date) AS date FROM occ_contract_snapshots").get()?.date);
  if (!summaryDate) return { summaryDate: null, summaries: [] as DailyOpenInterestSummary[] };

  const rows = db.prepare(`
    SELECT s.*,y.display_name,y.asset_type,y.sort_order
    FROM occ_contract_snapshots s JOIN oi_symbols y ON y.symbol=s.symbol
    WHERE s.contract_date=? ORDER BY y.sort_order,y.symbol
  `).all(summaryDate);
  const levelStatement = db.prepare("SELECT side,strike,open_interest,rank FROM occ_contract_levels WHERE snapshot_id=? ORDER BY side,rank");
  const zoneStatement = db.prepare(`
    SELECT side,role,low_strike,high_strike,center_strike,total_open_interest,peak_open_interest,
      strongest_strike,level_count,strength,distance_percent,rank,score,historical_score,cluster_score,
      proximity_score,persistence_score,dominance_score,persistence_sessions,distance_points,window_points,is_extended
    FROM occ_reaction_zones WHERE snapshot_id=? ORDER BY side,rank
  `);
  const attractionStatement = db.prepare(`
    SELECT side,role,low_strike,high_strike,center_strike,total_open_interest,peak_open_interest,
      strongest_strike,level_count,strength,distance_percent,rank,score,historical_score,cluster_score,
      proximity_score,persistence_score,dominance_score,persistence_sessions,distance_points,window_points,is_extended
    FROM occ_attraction_zones WHERE snapshot_id=? ORDER BY rank
  `);
  const mapZone = (
    zone: Record<string, unknown>,
    referencePrice: number,
    windowPoints: number,
  ): OpenInterestReactionZone => {
    const role = asString(zone.role) as OpenInterestReactionZone["role"];
    const side = asString(zone.side) as OpenInterestReactionZone["side"];
    const lowStrike = asNumber(zone.low_strike);
    const highStrike = asNumber(zone.high_strike);
    const boundary = role === "support" ? highStrike : role === "resistance" ? lowStrike : side === "call" ? highStrike : lowStrike;
    return ({
    side,
    role,
    lowStrike,
    highStrike,
    centerStrike: asNumber(zone.center_strike),
    totalOpenInterest: asNumber(zone.total_open_interest),
    peakOpenInterest: asNumber(zone.peak_open_interest),
    strongestStrike: asNumber(zone.strongest_strike),
    levelCount: asNumber(zone.level_count),
    strength: asString(zone.strength) as OpenInterestReactionZone["strength"],
    score: asNumber(zone.score),
    scoreBreakdown: {
      historical: asNumber(zone.historical_score),
      cluster: asNumber(zone.cluster_score),
      proximity: asNumber(zone.proximity_score),
      persistence: asNumber(zone.persistence_score),
      dominance: asNumber(zone.dominance_score),
    },
    persistenceSessions: asNumber(zone.persistence_sessions),
    distancePercent: asNumber(zone.distance_percent),
    distancePoints: asNumber(zone.distance_points) || Math.abs(referencePrice - boundary),
    windowPoints: asNumber(zone.window_points) || windowPoints,
    isExtended: Boolean(asNumber(zone.is_extended)),
    rank: asNumber(zone.rank),
  });
  };
  const summaries = rows.map((row) => {
    const referencePrice = asNumber(row.reference_price);
    const analysisWindowPoints = asNumber(row.analysis_window_points) || (asString(row.symbol) === "SPX" ? 100 : 10);
    const levels = levelStatement.all(row.id).map((level): OpenInterestLevel => ({
      side: asString(level.side) as OpenInterestLevel["side"],
      strike: asNumber(level.strike),
      openInterest: asNumber(level.open_interest),
      rank: asNumber(level.rank),
    }));
    const reactionZones = zoneStatement.all(row.id).map((zone) => mapZone(zone, referencePrice, analysisWindowPoints));
    const attractionZones = attractionStatement.all(row.id).map((zone) => mapZone(zone, referencePrice, analysisWindowPoints));
    return {
      summaryDate: asString(row.contract_date),
      contractDate: asString(row.contract_date),
      symbol: asString(row.symbol),
      displayName: asString(row.display_name),
      assetType: asString(row.asset_type),
      productSymbol: asString(row.product_symbol),
      referencePrice,
      referencePriceSource: asString(row.reference_source),
      referencePriceAsOf: asString(row.reference_as_of) || asString(row.last_verified_at),
      analysisWindowPoints,
      pivot: asNumber(row.pivot),
      upperZone: asNumber(row.upper_zone),
      lowerZone: asNumber(row.lower_zone),
      totalCallOi: asNumber(row.total_call_oi),
      totalPutOi: asNumber(row.total_put_oi),
      scenarioAr: asString(row.scenario_ar),
      sourceProvider: "OCC",
      sourceLabel: "OCC Series Search",
      sourceUrl: asString(row.source_url),
      firstFetchedAt: asString(row.first_fetched_at),
      lastVerifiedAt: asString(row.last_verified_at),
      calls: levels.filter((level) => level.side === "call").slice(0, 5),
      puts: levels.filter((level) => level.side === "put").slice(0, 5),
      reactionZones,
      attractionZones,
      thresholds: {
        watch: asNumber(row.threshold_watch),
        strong: asNumber(row.threshold_strong),
        major: asNumber(row.threshold_major),
        source: (asString(row.threshold_source) || "baseline") as DailyOpenInterestSummary["thresholds"]["source"],
        sessionCount: asNumber(row.calibration_sessions),
        targetSessions: 20,
      },
    } satisfies DailyOpenInterestSummary;
  });
  return { summaryDate, summaries };
}
