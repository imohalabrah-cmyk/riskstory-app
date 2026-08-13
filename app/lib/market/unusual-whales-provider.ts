import type {
  UnusualWhalesCandle,
  UnusualWhalesCurrentSnapshot,
  UnusualWhalesDarkPoolPriceLevel,
  UnusualWhalesDarkPoolTrade,
  UnusualWhalesGexLevels,
  UnusualWhalesGreekExposure,
  UnusualWhalesOptionContract,
  UnusualWhalesOptionTrade,
  UnusualWhalesRawDarkPoolRead,
  UnusualWhalesRawFlowRead,
  UnusualWhalesStockState,
} from "./unusual-whales-types";

const BASE_URL = "https://api.unusualwhales.com/api";

export type UnusualWhalesFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type JsonRecord = Record<string, unknown>;

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.length ? value : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function firstPresent(...values: unknown[]) {
  return values.find((value) => value !== null && value !== undefined && value !== "") ?? null;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function records(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

function compactMessage(value: unknown) {
  return String(value || "Unusual Whales request failed")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/(token|authorization)\s*[=:]\s*[^\s,]+/gi, "$1=[REDACTED]")
    .slice(0, 320);
}

export class UnusualWhalesUpstreamError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly endpoint: string;

  constructor(options: { endpoint: string; status?: number | null; code?: unknown; message?: unknown }) {
    super(compactMessage(options.message));
    this.name = "UnusualWhalesUpstreamError";
    this.endpoint = options.endpoint;
    this.status = options.status ?? null;
    this.code = options.code ? compactMessage(options.code) : null;
  }
}

export class UnusualWhalesProvider {
  lastUpstreamStatus: number | null = null;

  constructor(private readonly token: string, private readonly request: UnusualWhalesFetch = fetch) {}

  private async get(path: string): Promise<JsonRecord> {
    const response = await this.request(`${BASE_URL}${path}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${this.token}` },
      cache: "no-store",
    });
    this.lastUpstreamStatus = response.status;
    const body = await response.text();
    let data: JsonRecord = {};
    try {
      data = body ? record(JSON.parse(body)) : {};
    } catch {
      throw new UnusualWhalesUpstreamError({ endpoint: path, status: response.status, message: "Unusual Whales returned a non-JSON response" });
    }
    if (!response.ok) {
      throw new UnusualWhalesUpstreamError({
        endpoint: path,
        status: response.status,
        code: data.code || data.error_code,
        message: data.message || data.error || data.detail || `Unusual Whales request failed with ${response.status}`,
      });
    }
    return data;
  }

  stockState(ticker: string) {
    return this.get(`/stock/${encodeURIComponent(ticker)}/stock-state`).then(mapStockState);
  }

  candles(ticker: string, candleSize: "1m" | "5m" | "10m" | "15m" | "1h" | "1d", limit = 1) {
    return this.get(`/stock/${encodeURIComponent(ticker)}/ohlc/${candleSize}?limit=${limit}`).then(mapCandles);
  }

  optionChain(ticker: string) {
    return this.get(`/stock/${encodeURIComponent(ticker)}/option-chains?greeks=true`).then(mapOptionChain);
  }

  greekExposureByStrike(ticker: string) {
    return this.get(`/stock/${encodeURIComponent(ticker)}/greek-exposure/strike`).then(mapGreekExposure);
  }

  greekExposureByExpiry(ticker: string) {
    return this.get(`/stock/${encodeURIComponent(ticker)}/greek-exposure/expiry`).then(mapGreekExposure);
  }

  gexLevels(ticker: string) {
    return this.get(`/stock/${encodeURIComponent(ticker)}/gex-levels`).then(mapGexLevels);
  }

  optionTrades(ticker: string, limit = 1) {
    return this.get(`/option-trades?ticker_symbol=${encodeURIComponent(ticker)}&limit=${limit}`).then(mapOptionTrades);
  }

  darkPoolTrades(ticker: string, limit = 1) {
    return this.get(`/darkpool/${encodeURIComponent(ticker)}?limit=${limit}`).then(mapDarkPoolTrades);
  }

  darkPoolPriceLevels(ticker: string) {
    return this.get(`/darkpool/${encodeURIComponent(ticker)}/price-levels`).then(mapDarkPoolPriceLevels);
  }

  async currentSnapshot(symbol: string): Promise<UnusualWhalesCurrentSnapshot> {
    const normalized = symbol.toUpperCase();
    const [stockState, optionChain, gexByStrike, gexByExpiry, gexLevels] = await Promise.all([
      this.stockState(normalized),
      this.optionChain(normalized),
      this.greekExposureByStrike(normalized),
      this.greekExposureByExpiry(normalized),
      this.gexLevels(normalized),
    ]);
    return { symbol: normalized, stockState, optionChain, gexByStrike, gexByExpiry, gexLevels };
  }

  async rawFlow(symbol: string): Promise<UnusualWhalesRawFlowRead> {
    const normalized = symbol.toUpperCase();
    return { symbol: normalized, trades: await this.optionTrades(normalized) };
  }

  async rawDarkPool(symbol: string): Promise<UnusualWhalesRawDarkPoolRead> {
    const normalized = symbol.toUpperCase();
    const [prints, priceLevels] = await Promise.all([this.darkPoolTrades(normalized), this.darkPoolPriceLevels(normalized)]);
    return { symbol: normalized, prints, priceLevels };
  }
}

// Naming this boundary separately from MarketDataProvider avoids claiming that
// unverified UW GEX signs already satisfy Risk Story's derived MarketRead model.
// Compatibility name for the capability-probe boundary.
export { UnusualWhalesProvider as UnusualWhalesClient };

export function mapStockState(payload: JsonRecord): UnusualWhalesStockState {
  const value = record(payload.data);
  return { close: numberOrNull(value.close), high: numberOrNull(value.high), low: numberOrNull(value.low), open: numberOrNull(value.open), previousClose: numberOrNull(value.prev_close), volume: numberOrNull(value.volume), totalVolume: numberOrNull(value.total_volume), tapeTime: stringOrNull(value.tape_time), marketTime: stringOrNull(value.market_time) };
}

export function mapCandles(payload: JsonRecord): UnusualWhalesCandle[] {
  return records(payload.data).map((row) => ({ open: numberOrNull(row.open) ?? Number.NaN, high: numberOrNull(row.high) ?? Number.NaN, low: numberOrNull(row.low) ?? Number.NaN, close: numberOrNull(row.close) ?? Number.NaN, volume: numberOrNull(row.volume), totalVolume: numberOrNull(row.total_volume), startTime: stringOrNull(row.start_time), endTime: stringOrNull(row.end_time), marketTime: stringOrNull(row.market_time) })).filter((row) => Number.isFinite(row.open) && Number.isFinite(row.high) && Number.isFinite(row.low) && Number.isFinite(row.close));
}

export function mapOptionChain(payload: JsonRecord): UnusualWhalesOptionContract[] {
  return records(payload.data).map((row) => ({ contract: stringOrNull(firstPresent(row.option_symbol, row.option_chain_id, row.contract)), strike: numberOrNull(row.strike), expiry: stringOrNull(firstPresent(row.expiry, row.expires)), side: String(firstPresent(row.type, row.option_type) || "").toLowerCase() === "call" ? "call" : String(firstPresent(row.type, row.option_type) || "").toLowerCase() === "put" ? "put" : null, bid: numberOrNull(firstPresent(row.nbbo_bid, row.bid)), ask: numberOrNull(firstPresent(row.nbbo_ask, row.ask)), lastPrice: numberOrNull(firstPresent(row.last_price, row.last)), openInterest: numberOrNull(row.open_interest), volume: numberOrNull(row.volume), impliedVolatility: numberOrNull(row.implied_volatility), delta: numberOrNull(row.delta), gamma: numberOrNull(row.gamma), theta: numberOrNull(row.theta), vega: numberOrNull(row.vega), rho: numberOrNull(row.rho), lastTapeTime: stringOrNull(row.last_tape_time) }));
}

export function mapGreekExposure(payload: JsonRecord): UnusualWhalesGreekExposure[] {
  return records(payload.data).map((row) => ({ strike: numberOrNull(row.strike), expiry: stringOrNull(row.expiry), callGex: numberOrNull(firstPresent(row.call_gex, row.call_gamma)), putGex: numberOrNull(firstPresent(row.put_gex, row.put_gamma)), callDelta: numberOrNull(row.call_delta), putDelta: numberOrNull(row.put_delta), callVanna: numberOrNull(row.call_vanna), putVanna: numberOrNull(row.put_vanna), callCharm: numberOrNull(row.call_charm), putCharm: numberOrNull(row.put_charm) }));
}

export function mapGexLevels(payload: JsonRecord): UnusualWhalesGexLevels {
  const value = record(payload.data);
  return { callWall: numberOrNull(value.call_wall), putWall: numberOrNull(value.put_wall), gammaFlip: numberOrNull(value.gamma_flip), gammaMagnet: numberOrNull(value.gamma_magnet) };
}

export function mapOptionTrades(payload: JsonRecord): UnusualWhalesOptionTrade[] {
  return records(payload.data).map((row) => ({ executedAt: stringOrNull(row.executed_at), ticker: stringOrNull(firstPresent(row.ticker, row.underlying_symbol)), contract: stringOrNull(firstPresent(row.option_chain_id, row.option_symbol)), strike: numberOrNull(row.strike), expiry: stringOrNull(row.expiry), side: String(firstPresent(row.option_type, row.type) || "").toLowerCase() === "call" ? "call" : String(firstPresent(row.option_type, row.type) || "").toLowerCase() === "put" ? "put" : null, price: numberOrNull(row.price), size: numberOrNull(row.size), premium: numberOrNull(row.premium), openInterest: numberOrNull(row.open_interest), volume: numberOrNull(row.volume), nbboBid: numberOrNull(row.nbbo_bid), nbboAsk: numberOrNull(row.nbbo_ask), impliedVolatility: numberOrNull(row.implied_volatility), delta: numberOrNull(row.delta), gamma: numberOrNull(row.gamma), tags: stringArray(row.tags), reportFlags: stringArray(row.report_flags), exchange: stringOrNull(row.exchange) }));
}

export function mapDarkPoolTrades(payload: JsonRecord): UnusualWhalesDarkPoolTrade[] {
  return records(payload.data).map((row) => ({ executedAt: stringOrNull(row.executed_at), trfExecutedAt: stringOrNull(row.trf_executed_at), ticker: stringOrNull(row.ticker), price: numberOrNull(row.price), size: numberOrNull(row.size), premium: numberOrNull(row.premium), volume: numberOrNull(row.volume), marketCenter: stringOrNull(row.market_center), tradeCode: stringOrNull(row.trade_code), saleConditionCodes: stringArray(row.sale_cond_codes), tradeSettlement: stringOrNull(row.trade_settlement) }));
}

export function mapDarkPoolPriceLevels(payload: JsonRecord): UnusualWhalesDarkPoolPriceLevel[] {
  return records(payload.data).map((row) => ({ price: numberOrNull(row.price), darkPoolVolume: numberOrNull(row.dark_pool_volume), regularVolume: numberOrNull(row.regular_volume) }));
}
