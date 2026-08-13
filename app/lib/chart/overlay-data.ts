import { combineReportedValues } from "../market/reported-values";
import type { ExposureStrike, FlowRead, MarketRead } from "../market/types";
import { describeExposureHorizon, type ExposureHorizon } from "./exposure-horizon";

export type GexZone = {
  strike: number;
  netGex: number;
  callOpenInterest: number | null;
  putOpenInterest: number | null;
  callVolume: number | null;
  putVolume: number | null;
  score: number;
  bubbleCount: number;
  intensity: number;
  horizon: ExposureHorizon;
};

export type DarkPoolZone = {
  price: number;
  darkPoolVolume: number;
  regularVolume: number | null;
};

export type FlowOverlayEvent = {
  strike: number;
  side: "call" | "put" | null;
  premium: number;
  size: number | null;
  tags: string[];
  executedAt: string | null;
};

function normalized(value: number, maximum: number) {
  return maximum > 0 ? Math.min(1, Math.max(0, value / maximum)) : 0;
}

function isIndex(symbol: string) {
  return ["SPY", "SPX", "QQQ"].includes(symbol.toUpperCase());
}

/**
 * A presentation-only ranking: current absolute native GEX is primary, with
 * reported OI and distance from spot as deterministic secondary tie-breakers.
 * It never modifies provider values or tries to infer dealer positioning.
 */
export function selectGexZones(market: MarketRead, limitPerSide = 3): GexZone[] {
  const spot = market.snapshot.spot;
  if (!(Number.isFinite(spot) && spot > 0)) return [];
  const horizon = isIndex(market.symbol) ? spot * .14 : spot * .28;
  const candidates = (market.exposure?.rows ?? [])
    .filter((row): row is ExposureStrike => Number.isFinite(row.strike) && Number.isFinite(row.netGex) && Math.abs(row.netGex) > 0 && Math.abs(row.strike - spot) <= horizon);
  const maximumGex = Math.max(...candidates.map((row) => Math.abs(row.netGex)), 1);
  const maximumOi = Math.max(...candidates.map((row) => combineReportedValues(row.callOpenInterest, row.putOpenInterest) ?? 0), 1);
  const horizonMetadata = describeExposureHorizon(market);
  const ranked = candidates.map((row) => {
    const magnitude = normalized(Math.abs(row.netGex), maximumGex);
    const interest = normalized(combineReportedValues(row.callOpenInterest, row.putOpenInterest) ?? 0, maximumOi);
    const proximity = 1 - Math.min(1, Math.abs(row.strike - spot) / horizon);
    const score = .72 * magnitude + .18 * interest + .1 * proximity;
    return { row, score, magnitude };
  }).sort((left, right) => right.score - left.score || Math.abs(right.row.netGex) - Math.abs(left.row.netGex) || Math.abs(left.row.strike - spot) - Math.abs(right.row.strike - spot) || right.row.strike - left.row.strike);
  const above = ranked.filter((item) => item.row.strike >= spot).slice(0, limitPerSide);
  const below = ranked.filter((item) => item.row.strike < spot).slice(0, limitPerSide);
  return [...above, ...below]
    .sort((left, right) => right.score - left.score || right.row.strike - left.row.strike)
    .map(({ row, score, magnitude }) => ({
      strike: row.strike,
      netGex: row.netGex,
      callOpenInterest: row.callOpenInterest,
      putOpenInterest: row.putOpenInterest,
      callVolume: row.callVolume,
      putVolume: row.putVolume,
      score,
      intensity: magnitude,
      bubbleCount: Math.max(2, Math.min(8, Math.round(2 + magnitude * 6))),
      horizon: horizonMetadata,
    }));
}

/** Provider raw dark-pool levels, ranked only by reported dark-pool volume. */
export function selectDarkPoolZones(flow: FlowRead | null, limit = 3): DarkPoolZone[] {
  return (flow?.raw?.darkPoolPriceLevels ?? [])
    .flatMap((level) => level.price !== null && level.price > 0 && level.darkPoolVolume !== null ? [{ price: level.price, darkPoolVolume: level.darkPoolVolume, regularVolume: level.regularVolume }] : [])
    .sort((left, right) => right.darkPoolVolume - left.darkPoolVolume || right.price - left.price)
    .slice(0, limit);
}

/**
 * Flow remains neutral unless UW supplied a tag. The selection is limited to
 * the largest provider-reported premiums; it assigns no whale, sweep, or
 * directional label of its own.
 */
export function selectFlowOverlayEvents(flow: FlowRead | null, spot: number, limit = 3): FlowOverlayEvent[] {
  const horizon = spot > 0 ? spot * .3 : Number.POSITIVE_INFINITY;
  return (flow?.raw?.optionTrades ?? [])
    .flatMap((trade) => trade.strike !== null && trade.premium !== null && Math.abs(trade.strike - spot) <= horizon ? [{ strike: trade.strike, side: trade.side, premium: trade.premium, size: trade.size, tags: trade.tags, executedAt: trade.executedAt }] : [])
    .sort((left, right) => right.premium - left.premium || (right.size ?? 0) - (left.size ?? 0) || right.strike - left.strike)
    .slice(0, limit);
}
