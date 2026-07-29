import { getMarketProvider } from "../market/provider";
import { fetchOccSeries } from "./occ-client";
import {
  getDailySummaries,
  getOpenInterestCalibration,
  getStoredReference,
  listSummaryDates,
  listTrackedSymbols,
  recordSyncRun,
  saveOccContractSummary,
} from "./store";
import { buildReactionMap } from "./reaction-engine";
import type {
  DailyOpenInterestSummary,
  OpenInterestDashboard,
  OpenInterestLevel,
  OpenInterestReactionZone,
  OpenInterestSide,
  OpenInterestThresholds,
  OccSeriesRow,
  TrackedSymbol,
} from "./types";

const CALIBRATION_TARGET = 20;

const BASELINES: Record<string, { watch: number; strong: number; major: number }> = {
  SPX: { watch: 5_000, strong: 8_000, major: 12_000 },
  SPY: { watch: 7_000, strong: 12_000, major: 18_000 },
  QQQ: { watch: 10_000, strong: 12_000, major: 16_000 },
};

function riyadhDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function rankedLevels(rows: OccSeriesRow[], side: OpenInterestSide): OpenInterestLevel[] {
  return rows
    .map((row) => ({
      side,
      strike: row.strike,
      openInterest: side === "call" ? row.callOpenInterest : row.putOpenInterest,
      rank: 0,
    }))
    .filter((level) => level.strike > 0 && level.openInterest > 0)
    .sort((left, right) => right.openInterest - left.openInterest || left.strike - right.strike)
    .map((level, index) => ({ ...level, rank: index + 1 }));
}

function weightedCenter(levels: OpenInterestLevel[]) {
  const weight = levels.reduce((total, level) => total + level.openInterest, 0);
  if (!weight) return 0;
  return levels.reduce((total, level) => total + level.strike * level.openInterest, 0) / weight;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function thresholdProfile(
  symbol: string,
  currentLevels: OpenInterestLevel[],
  history: ReturnType<typeof getOpenInterestCalibration>,
): OpenInterestThresholds {
  const baseline = BASELINES[symbol] || BASELINES.SPY;
  const sessionCount = Math.min(CALIBRATION_TARGET, history.sessionCount + 1);
  if (sessionCount < CALIBRATION_TARGET) {
    return { ...baseline, source: "baseline", sessionCount, targetSessions: CALIBRATION_TARGET };
  }

  const values = [...history.openInterestValues, ...currentLevels.map((level) => level.openInterest)].filter((value) => value > 0);
  return {
    watch: Math.round(Math.max(baseline.watch, percentile(values, 0.9))),
    strong: Math.round(Math.max(baseline.strong, percentile(values, 0.95))),
    major: Math.round(Math.max(baseline.major, percentile(values, 0.99))),
    source: "calibrated",
    sessionCount,
    targetSessions: CALIBRATION_TARGET,
  };
}

async function referenceRead(symbol: string, contractDate: string) {
  const stored = getStoredReference(symbol, contractDate);
  if (contractDate !== riyadhDate()) {
    return stored.price > 0
      ? stored
      : { price: 0, source: "unavailable for historical sync", asOf: "" };
  }
  try {
    const read = await getMarketProvider().getMarketRead({ symbol, range: "0DTE" });
    const price = Number(read.metrics.spot.value || 0);
    if (!(price > 0) || read.metrics.spot.method === "unavailable") {
      return stored.price > 0 ? stored : { price: 0, source: "unavailable", asOf: "" };
    }
    return { price, source: `${read.provider} ${read.provenance.mode}`, asOf: read.provenance.asOf || "" };
  } catch {
    return stored.price > 0 ? stored : { price: 0, source: "unavailable", asOf: "" };
  }
}

function price(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: value >= 1000 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function zoneLabel(zone?: OpenInterestReactionZone) {
  if (!zone) return "غير متاحة";
  return zone.lowStrike === zone.highStrike ? price(zone.lowStrike) : `${price(zone.lowStrike)}–${price(zone.highStrike)}`;
}

function scenario(
  symbol: string,
  calls: OpenInterestLevel[],
  puts: OpenInterestLevel[],
  zones: OpenInterestReactionZone[],
  attractions: OpenInterestReactionZone[],
  referencePrice: number,
  windowPoints: number,
) {
  const primaryCall = calls[0];
  const primaryPut = puts[0];
  const support = zones.find((zone) => zone.role === "support");
  const resistance = zones.find((zone) => zone.role === "resistance");
  const nextSupport = zones.filter((zone) => zone.role === "support")[1];
  const nextResistance = zones.filter((zone) => zone.role === "resistance")[1];
  const magnet = attractions[0];

  if (!primaryCall || !primaryPut) return `بيانات OCC لعقد ${symbol} لا تكفي لبناء سيناريو تمركز موثوق لهذا التاريخ.`;
  if (!(referencePrice > 0)) {
    return `السعر المرجعي غير متاح، لذلك تُعرض الجدران الهيكلية فقط: أكبر Put OI عند ${price(primaryPut.strike)} وأكبر Call OI عند ${price(primaryCall.strike)}. لا تُصنّف هذه المستويات كارتداد قريب حتى يتوفر سعر مرجعي. هذه قراءة احتمالية وليست توصية تداول.`;
  }

  const supportText = support
    ? support.isExtended
      ? `لا يوجد دعم مؤهل داخل ${windowPoints} نقاط؛ أقرب هدف Put ممتد في ${zoneLabel(support)} بدرجة ${support.score}/100`
      : `أقوى دعم Put داخل النطاق في ${zoneLabel(support)} بدرجة ${support.score}/100؛ الثبات أو استعادة المنطقة يدعم مراقبة الارتداد${nextSupport ? `، وكسرها ينقل التركيز إلى ${zoneLabel(nextSupport)}` : ""}`
    : `لا يوجد Put OI تجاوز حد المراقبة، والجدار الهيكلي البعيد عند ${price(primaryPut.strike)}`;
  const resistanceText = resistance
    ? resistance.isExtended
      ? `لا توجد مقاومة مؤهلة داخل ${windowPoints} نقاط؛ أقرب هدف Call ممتد في ${zoneLabel(resistance)} بدرجة ${resistance.score}/100`
      : `أقوى مقاومة Call داخل النطاق في ${zoneLabel(resistance)} بدرجة ${resistance.score}/100؛ اختراقها والثبات فوقها${nextResistance ? ` يفتح الطريق نحو ${zoneLabel(nextResistance)}` : " يخفف ضغط التمركز القريب"}`
    : `لا يوجد Call OI تجاوز حد المراقبة، والجدار الهيكلي البعيد عند ${price(primaryCall.strike)}`;
  const magnetText = magnet
    ? `وتظهر منطقة جذب أو تثبيت في ${zoneLabel(magnet)} بدرجة ${magnet.score}/100`
    : "ولا توجد منطقة جذب مؤهلة داخل النافذة";
  return `السعر المرجعي ${price(referencePrice)} ونافذة التحليل ±${windowPoints} نقطة. ${supportText}. ${resistanceText}. ${magnetText}. يلزم تأكيد من حركة السعر؛ OI وحده لا يحدد اتجاه المراكز، وهذه القراءة ليست توصية تداول.`;
}

function buildSummary(
  contractDate: string,
  symbol: TrackedSymbol,
  rows: OccSeriesRow[],
  sourceUrl: string,
  verifiedAt: string,
  reference: { price: number; source: string; asOf: string },
) {
  const exactRows = rows.filter((row) => row.contractDate === contractDate && row.productSymbol === symbol.occProductSymbol);
  if (!exactRows.length) throw new Error(`OCC has no ${symbol.occProductSymbol} contract rows for ${contractDate}`);

  const allCalls = rankedLevels(exactRows, "call");
  const allPuts = rankedLevels(exactRows, "put");
  if (!allCalls.length || !allPuts.length) throw new Error(`OCC rows for ${symbol.symbol} do not contain both Call and Put OI`);
  const allLevels = [...allCalls, ...allPuts];
  const history = getOpenInterestCalibration(symbol.symbol, contractDate, CALIBRATION_TARGET - 1);
  const thresholds = thresholdProfile(symbol.symbol, allLevels, history);
  const reactionMap = buildReactionMap({
    symbol: symbol.symbol,
    levels: allLevels,
    referencePrice: reference.price,
    thresholds,
    history: history.sessions,
  });
  const zones = reactionMap.reactionZones;
  const localLevels = reactionMap.localLevels;
  const calls = allCalls.slice(0, 5);
  const puts = allPuts.slice(0, 5);
  const pivot = weightedCenter(localLevels.length ? localLevels : [...calls, ...puts]);

  const summary: DailyOpenInterestSummary = {
    summaryDate: contractDate,
    contractDate,
    symbol: symbol.symbol,
    displayName: symbol.displayName,
    assetType: symbol.assetType,
    productSymbol: symbol.occProductSymbol,
    referencePrice: reference.price,
    referencePriceSource: reference.source,
    referencePriceAsOf: reference.asOf,
    analysisWindowPoints: reactionMap.analysisWindowPoints,
    pivot,
    upperZone: calls[0].strike,
    lowerZone: puts[0].strike,
    totalCallOi: exactRows.reduce((total, row) => total + row.callOpenInterest, 0),
    totalPutOi: exactRows.reduce((total, row) => total + row.putOpenInterest, 0),
    scenarioAr: scenario(
      symbol.symbol,
      calls,
      puts,
      zones,
      reactionMap.attractionZones,
      reference.price,
      reactionMap.analysisWindowPoints,
    ),
    sourceProvider: "OCC",
    sourceLabel: "OCC Series Search",
    sourceUrl,
    firstFetchedAt: verifiedAt,
    lastVerifiedAt: verifiedAt,
    calls,
    puts,
    reactionZones: zones,
    attractionZones: reactionMap.attractionZones,
    thresholds,
  };
  return { summary, allLevels };
}

export async function syncOpenInterest(requestedDate?: string) {
  const contractDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : riyadhDate();
  const symbols = listTrackedSymbols();
  const verifiedAt = new Date().toISOString();
  const saved: DailyOpenInterestSummary[] = [];
  const errors: string[] = [];

  const results = await Promise.allSettled(symbols.map(async (symbol) => {
    const [occ, reference] = await Promise.all([
      fetchOccSeries(symbol.occQueryType, symbol.occQuerySymbol),
      referenceRead(symbol.symbol, contractDate),
    ]);
    return buildSummary(contractDate, symbol, occ.rows, occ.sourceUrl, verifiedAt, reference);
  }));

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      saveOccContractSummary(result.value.summary, result.value.allLevels);
      saved.push(result.value.summary);
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`${symbols[index].symbol}: ${reason}`);
    }
  });

  const status = saved.length === symbols.length ? "complete" : saved.length ? "partial" : "pending";
  recordSyncRun(contractDate, status, symbols.length, saved.length, errors.join(" | ") || "OCC contract synchronization completed");
  return {
    summaryDate: contractDate,
    status,
    requested: symbols.length,
    saved: saved.map((item) => ({ symbol: item.symbol, productSymbol: item.productSymbol, contractDate: item.contractDate })),
    errors,
  };
}

export function readOpenInterestDashboard(date?: string): OpenInterestDashboard {
  const result = getDailySummaries(date);
  return {
    schemaVersion: "2.2",
    summaryDate: result.summaryDate,
    availableDates: listSummaryDates(),
    summaries: result.summaries,
    generatedAt: new Date().toISOString(),
    source: "OCC Series Search",
  };
}
