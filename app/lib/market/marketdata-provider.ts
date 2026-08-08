import type { Candle, ExposureProfile, ExposureStrike, FlowRead, MarketDataProvider, MarketLevel, MarketRead, MarketSnapshot } from "./types";
import { unavailableCandleRead, unavailableFlowRead, unavailableMarketRead } from "./unavailable-provider";

const BASE_URL = "https://api.marketdata.app/v1";

type MarketDataJson = Record<string, unknown>;

async function requestJson(path: string): Promise<MarketDataJson> {
  const token = process.env.MARKETDATA_TOKEN;

  if (!token) {
    throw new Error("MARKETDATA_TOKEN is not configured");
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    next: { revalidate: 60 },
  });

  const body = await response.text();
  const data = (body ? JSON.parse(body) : {}) as MarketDataJson;

  if (response.status !== 200 && response.status !== 203) {
    throw new Error(String(data.errmsg || `MarketData request failed with ${response.status}`));
  }

  if (data.s && data.s !== "ok") {
    throw new Error(String(data.errmsg || data.s));
  }

  return data;
}

const HEATMAP_EXPIRATION_COUNT = 8;
const HEATMAP_STRIKE_LIMIT = 60;

function isHeatmapRange(range: string) {
  const normalized = range.toLowerCase();
  return normalized.includes("all expirations") || normalized.includes("heatmap matrix");
}

function previousMarketSessionDates(limit = 5) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - 1);
  const dates: string[] = [];

  while (dates.length < limit) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) {
      dates.push(date.toISOString().slice(0, 10));
    }
    date.setUTCDate(date.getUTCDate() - 1);
  }

  return dates;
}

function currentExpirationWindow(expirations: string[]) {
  const today = new Date().toISOString().slice(0, 10);
  return [...new Set(expirations)]
    .filter((expiration) => /^\d{4}-\d{2}-\d{2}$/.test(expiration) && expiration >= today)
    .sort()
    .slice(0, HEATMAP_EXPIRATION_COUNT);
}

async function requestHeatmapChain(symbol: string) {
  const expirationRead = await requestJson(`/options/expirations/${encodeURIComponent(symbol)}/`);
  const expirationValues = stringArray(expirationRead, "expirations").length
    ? stringArray(expirationRead, "expirations")
    : stringArray(expirationRead, "expiration");
  const expirations = currentExpirationWindow(expirationValues);

  if (expirations.length < 2) {
    throw new Error("MarketData returned fewer than two current expirations for the heatmap");
  }

  const from = expirations[0];
  const to = expirations[expirations.length - 1];
  const basePath = `/options/chain/${encodeURIComponent(symbol)}/?from=${from}&to=${to}&strikeLimit=${HEATMAP_STRIKE_LIMIT}`;

  try {
    const chain = await requestJson(`${basePath}&mode=cached`);
    chain._riskStoryHeatmapScope = "cached-current";
    return chain;
  } catch {
    let latestError: unknown = new Error("No accessible historical heatmap session was returned");
    for (const sessionDate of previousMarketSessionDates()) {
      try {
        const chain = await requestJson(`${basePath}&date=${sessionDate}`);
        chain._riskStoryHeatmapScope = "previous-session";
        chain._riskStorySessionDate = sessionDate;
        return chain;
      } catch (error) {
        latestError = error;
      }
    }
    throw latestError;
  }
}

function numberArray(data: MarketDataJson, key: string): number[] {
  const value = data[key];
  if (!Array.isArray(value)) return [];
  return value.map((item) => Number(item)).filter(Number.isFinite);
}

function nullableNumberArray(data: MarketDataJson, key: string): number[] {
  const value = data[key];
  if (!Array.isArray(value)) return [];
  return value.map((item) => item === null || item === undefined || item === "" ? Number.NaN : Number(item));
}

function stringArray(data: MarketDataJson, key: string): string[] {
  const value = data[key];
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function candleResolution(frame: string) {
  const normalized = frame.toLowerCase();
  if (normalized.includes("1h") || normalized.includes("60")) return "60";
  if (normalized.includes("1d") || normalized.includes("daily")) return "D";
  if (normalized.includes("5m")) return "5";
  if (normalized.includes("15m")) return "15";
  return "10";
}

const CANDLE_BATCH_SIZE = 320;

function candleBatchLookbackDays(frame: string) {
  const normalized = frame.toLowerCase();
  if (normalized.includes("1d") || normalized.includes("daily")) return 380;
  if (normalized.includes("1h") || normalized.includes("60")) return 70;
  if (normalized.includes("5m")) return 5;
  if (normalized.includes("15m")) return 12;
  return 8;
}

function isoDateDaysBefore(reference: Date, days: number) {
  const date = new Date(reference);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function parseCandles(data: MarketDataJson): Candle[] {
  const times = numberArray(data, "t");
  const opens = numberArray(data, "o");
  const highs = numberArray(data, "h");
  const lows = numberArray(data, "l");
  const closes = numberArray(data, "c");
  const volumes = numberArray(data, "v");
  const rows = Math.min(times.length, opens.length, highs.length, lows.length, closes.length);

  return Array.from({ length: rows }, (_, index) => ({
    time: times[index],
    open: opens[index],
    high: highs[index],
    low: lows[index],
    close: closes[index],
    volume: volumes[index] || 0,
  }))
    .filter((row) => Number.isFinite(row.time) && Number.isFinite(row.open) && Number.isFinite(row.high) && Number.isFinite(row.low) && Number.isFinite(row.close))
    .sort((a, b) => a.time - b.time);
}

function firstNumber(data: MarketDataJson, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value) && Number.isFinite(Number(value[0]))) return Number(value[0]);
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return fallback;
}

function providerTimestamp(...payloads: MarketDataJson[]) {
  const keys = ["updated", "timestamp", "t"];
  for (const payload of payloads) {
    for (const key of keys) {
      const raw = Array.isArray(payload[key]) ? payload[key]?.[0] : payload[key];
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) continue;
      const milliseconds = value > 10_000_000_000 ? value : value * 1000;
      const date = new Date(milliseconds);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
  }
  return null;
}

function elapsedMinutes(asOf: string | null, receivedAt: string) {
  if (!asOf) return null;
  const elapsed = (new Date(receivedAt).getTime() - new Date(asOf).getTime()) / 60_000;
  return Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : null;
}

function rangeToDte(range: string) {
  const normalized = range.toLowerCase();
  if (normalized.includes("0dte")) return 0;
  if (normalized.includes("1d") || normalized.includes("daily")) return 1;
  if (normalized.includes("weekly")) return 7;
  return 30;
}

function rangeTargetDays(range: string) {
  const normalized = range.toLowerCase();
  if (normalized.includes("weekly")) return 7;
  if (normalized.includes("monthly") || normalized.includes("custom")) return 30;
  return 0;
}

function pickExpiration(expirations: string[], range: string) {
  const target = new Date();
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + rangeTargetDays(range));

  return (
    expirations
      .filter((expiration) => /^\d{4}-\d{2}-\d{2}$/.test(expiration))
      .find((expiration) => {
        const date = new Date(`${expiration}T00:00:00`);
        return date >= target;
      }) || expirations[0]
  );
}

async function requestOptionChain(symbol: string, range: string) {
  if (isHeatmapRange(range)) {
    return requestHeatmapChain(symbol);
  }

  const dte = rangeToDte(range);

  try {
    return await requestJson(`/options/chain/${encodeURIComponent(symbol)}/?dte=${dte}&strikeLimit=20`);
  } catch (error) {
    const expirations = await requestJson(`/options/expirations/${encodeURIComponent(symbol)}/`);
    const candidates = stringArray(expirations, "expirations").length
      ? stringArray(expirations, "expirations")
      : stringArray(expirations, "expiration");
    const expiration = pickExpiration(candidates, range);

    if (!expiration) {
      throw error;
    }

    return requestJson(`/options/chain/${encodeURIComponent(symbol)}/?expiration=${expiration}&strikeLimit=20`);
  }
}

type StrikeGroup = {
  call: number;
  put: number;
  callVolume: number;
  putVolume: number;
  callGamma: number;
  putGamma: number;
  callDex: number;
  putDex: number;
  callVanna: number;
  putVanna: number;
  callCharm: number;
  putCharm: number;
};

function normalCdf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function modelDelta(spot: number, strike: number, years: number, volatility: number, side: string) {
  const sigma = volatility > 3 ? volatility / 100 : volatility;
  if (!(spot > 0 && strike > 0 && years > 0 && sigma > 0)) return Number.NaN;
  const d1 = (Math.log(spot / strike) + (0.04 + 0.5 * sigma * sigma) * years) / (sigma * Math.sqrt(years));
  const callDelta = normalCdf(d1);
  return side.startsWith("p") ? callDelta - 1 : callDelta;
}

function modelOptionPrice(spot: number, strike: number, years: number, volatility: number, side: string) {
  if (!(spot > 0 && strike > 0 && years > 0 && volatility > 0)) return Number.NaN;
  const rate = 0.04;
  const rootTime = Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + 0.5 * volatility * volatility) * years) / (volatility * rootTime);
  const d2 = d1 - volatility * rootTime;
  const discountedStrike = strike * Math.exp(-rate * years);
  return side.startsWith("p")
    ? discountedStrike * normalCdf(-d2) - spot * normalCdf(-d1)
    : spot * normalCdf(d1) - discountedStrike * normalCdf(d2);
}

function impliedVolatility(price: number, spot: number, strike: number, years: number, side: string) {
  if (!(price > 0 && spot > 0 && strike > 0 && years > 0)) return Number.NaN;
  const intrinsic = side.startsWith("p") ? Math.max(strike - spot, 0) : Math.max(spot - strike, 0);
  if (price <= intrinsic + 0.001) return Number.NaN;
  let low = 0.01;
  let high = 5;
  for (let iteration = 0; iteration < 48; iteration += 1) {
    const middle = (low + high) / 2;
    const modeled = modelOptionPrice(spot, strike, years, middle, side);
    if (!Number.isFinite(modeled)) return Number.NaN;
    if (modeled < price) low = middle;
    else high = middle;
  }
  const result = (low + high) / 2;
  return result >= 0.01 && result <= 5 ? result : Number.NaN;
}

function modelGamma(spot: number, strike: number, years: number, volatility: number) {
  if (!(spot > 0 && strike > 0 && years > 0 && volatility > 0)) return Number.NaN;
  const rootTime = Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (0.04 + 0.5 * volatility * volatility) * years) / (volatility * rootTime);
  const density = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  return density / (spot * volatility * rootTime);
}

function optionYears(rawDte: number, expiration: string) {
  if (Number.isFinite(rawDte)) return Math.max(rawDte, 0.5) / 365;
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiration)) {
    const remaining = (new Date(`${expiration}T21:00:00Z`).getTime() - Date.now()) / 86_400_000;
    return Math.max(remaining, 0.5) / 365;
  }
  return Number.NaN;
}

function normalizeExpiration(raw: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return "";
  const milliseconds = value > 10_000_000_000 ? value : value * 1000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function emptyStrikeGroup(): StrikeGroup {
  return {
    call: 0,
    put: 0,
    callVolume: 0,
    putVolume: 0,
    callGamma: 0,
    putGamma: 0,
    callDex: 0,
    putDex: 0,
    callVanna: 0,
    putVanna: 0,
    callCharm: 0,
    putCharm: 0,
  };
}

function gammaFromDeltaCurve(
  index: number,
  strikes: number[],
  sides: string[],
  deltas: number[],
  expirations: string[],
  spot: number,
) {
  const strike = strikes[index];
  const delta = deltas[index];
  const side = (sides[index] || "").toLowerCase().slice(0, 1);
  const expiration = normalizeExpiration(expirations[index] || "");
  if (!(Number.isFinite(strike) && Number.isFinite(delta) && spot > 0 && side && expiration)) return 0;

  let lowerIndex = -1;
  let upperIndex = -1;
  for (let candidate = 0; candidate < strikes.length; candidate += 1) {
    if (candidate === index || !Number.isFinite(strikes[candidate]) || !Number.isFinite(deltas[candidate])) continue;
    if ((sides[candidate] || "").toLowerCase().slice(0, 1) !== side) continue;
    if (normalizeExpiration(expirations[candidate] || "") !== expiration) continue;
    if (strikes[candidate] < strike && (lowerIndex < 0 || strikes[candidate] > strikes[lowerIndex])) lowerIndex = candidate;
    if (strikes[candidate] > strike && (upperIndex < 0 || strikes[candidate] < strikes[upperIndex])) upperIndex = candidate;
  }

  let deltaSlope = Number.NaN;
  if (lowerIndex >= 0 && upperIndex >= 0) {
    deltaSlope = (deltas[upperIndex] - deltas[lowerIndex]) / (strikes[upperIndex] - strikes[lowerIndex]);
  } else if (lowerIndex >= 0) {
    deltaSlope = (delta - deltas[lowerIndex]) / (strike - strikes[lowerIndex]);
  } else if (upperIndex >= 0) {
    deltaSlope = (deltas[upperIndex] - delta) / (strikes[upperIndex] - strike);
  }

  const estimatedGamma = Math.abs(strike / spot * deltaSlope);
  return Number.isFinite(estimatedGamma) && estimatedGamma <= 1 ? estimatedGamma : 0;
}

function buildExposureProfile(groups: Map<number, StrikeGroup>, deltaRows: number, ivRows: number, optionRows: number): ExposureProfile {
  const rows: ExposureStrike[] = [...groups.entries()].map(([strike, row]) => ({
    strike,
    callOpenInterest: row.call,
    putOpenInterest: row.put,
    callVolume: row.callVolume,
    putVolume: row.putVolume,
    callGex: row.callGamma,
    putGex: -row.putGamma,
    netGex: row.callGamma - row.putGamma,
    callDex: row.callDex,
    putDex: row.putDex,
    netDex: row.callDex + row.putDex,
    callVanna: row.callVanna,
    putVanna: row.putVanna,
    netVanna: row.callVanna + row.putVanna,
    callCharm: row.callCharm,
    putCharm: row.putCharm,
    netCharm: row.callCharm + row.putCharm,
    combined: 0,
  }));

  const maxima = {
    gex: Math.max(1, ...rows.map((row) => Math.abs(row.netGex))),
    dex: Math.max(1, ...rows.map((row) => Math.abs(row.netDex))),
    vanna: Math.max(1, ...rows.map((row) => Math.abs(row.netVanna))),
    charm: Math.max(1, ...rows.map((row) => Math.abs(row.netCharm))),
  };

  rows.forEach((row) => {
    row.combined = 100 * (
      0.45 * row.netGex / maxima.gex
      + 0.25 * row.netDex / maxima.dex
      + 0.18 * row.netVanna / maxima.vanna
      + 0.12 * row.netCharm / maxima.charm
    );
  });

  return {
    method: "chain-greeks-v1",
    assumption: "OI-weighted chain Greeks. GEX uses provider gamma or a finite-difference gamma derived from the provider delta curve when gamma is absent. Dealer side is estimated.",
    deltaCoverage: optionRows ? Math.round(deltaRows / optionRows * 100) : 0,
    ivCoverage: optionRows ? Math.round(ivRows / optionRows * 100) : 0,
    rows: rows.sort((a, b) => b.strike - a.strike),
    expirations: [],
  };
}

function groupByStrike(chain: MarketDataJson, spot: number) {
  const strikes = nullableNumberArray(chain, "strike");
  const sides = stringArray(chain, "side");
  const openInterest = nullableNumberArray(chain, "openInterest");
  const volume = nullableNumberArray(chain, "volume");
  const gamma = nullableNumberArray(chain, "gamma");
  const delta = nullableNumberArray(chain, "delta");
  const iv = nullableNumberArray(chain, "iv");
  const bid = nullableNumberArray(chain, "bid");
  const ask = nullableNumberArray(chain, "ask");
  const mid = nullableNumberArray(chain, "mid");
  const last = nullableNumberArray(chain, "last");
  const dte = nullableNumberArray(chain, "dte");
  const expiration = stringArray(chain, "expiration");
  const rows = Math.max(strikes.length, sides.length, openInterest.length, volume.length, gamma.length, delta.length, iv.length, bid.length, ask.length, mid.length, last.length, dte.length);
  const groups = new Map<number, StrikeGroup>();
  const expirationGroups = new Map<string, Map<number, StrikeGroup>>();
  let optionRows = 0;
  let deltaRows = 0;
  let ivRows = 0;

  for (let index = 0; index < rows; index += 1) {
    const strike = strikes[index];
    if (!Number.isFinite(strike)) continue;

    const side = (sides[index] || "").toLowerCase();
    if (!(side.startsWith("c") || side.startsWith("p"))) continue;
    optionRows += 1;
    const oi = Number.isFinite(openInterest[index]) ? Math.max(0, openInterest[index]) : 0;
    const rowVolume = Number.isFinite(volume[index]) ? Math.max(0, volume[index]) : 0;
    const notional = oi * 100 * spot;
    const expirationDate = normalizeExpiration(expiration[index] || "");
    const years = optionYears(dte[index], expirationDate);
    const mark = Number.isFinite(mid[index]) && mid[index] > 0
      ? mid[index]
      : Number.isFinite(bid[index]) && Number.isFinite(ask[index]) && ask[index] > 0
        ? (Math.max(0, bid[index]) + ask[index]) / 2
        : Number.isFinite(last[index]) && last[index] > 0 ? last[index] : Number.NaN;
    const providerIv = Number.isFinite(iv[index]) && iv[index] > 0 ? (iv[index] > 3 ? iv[index] / 100 : iv[index]) : Number.NaN;
    const rowIv = Number.isFinite(providerIv) ? providerIv : impliedVolatility(mark, spot, strike, years, side);
    const modeledGamma = modelGamma(spot, strike, years, rowIv);
    const effectiveGamma = Number.isFinite(gamma[index]) && Math.abs(gamma[index]) > 0
      ? Math.abs(gamma[index])
      : Number.isFinite(modeledGamma) && modeledGamma > 0
        ? modeledGamma
        : gammaFromDeltaCurve(index, strikes, sides, delta, expiration, spot);
    const rowGamma = effectiveGamma * notional;
    const rowDelta = Number.isFinite(delta[index]) ? delta[index] : modelDelta(spot, strike, years, rowIv, side);
    const current = groups.get(strike) || emptyStrikeGroup();

    let dex = 0;
    if (Number.isFinite(rowDelta)) {
      dex = rowDelta * notional;
      deltaRows += 1;
    }

    let vanna = 0;
    let charm = 0;
    if (Number.isFinite(rowIv) && Number.isFinite(years)) {
      const baseDelta = modelDelta(spot, strike, years, rowIv, side);
      const higherVolDelta = modelDelta(spot, strike, years, (rowIv > 3 ? rowIv / 100 : rowIv) + 0.01, side);
      const shorterDelta = modelDelta(spot, strike, Math.max(years - 1 / 365, 1 / (365 * 24)), rowIv, side);
      if (Number.isFinite(baseDelta) && Number.isFinite(higherVolDelta) && Number.isFinite(shorterDelta)) {
        vanna = (higherVolDelta - baseDelta) * notional;
        charm = (shorterDelta - baseDelta) * notional;
        ivRows += 1;
      }
    }

    if (side.startsWith("c")) {
      current.call += oi;
      current.callVolume += rowVolume;
      current.callGamma += rowGamma;
      current.callDex += dex;
      current.callVanna += vanna;
      current.callCharm += charm;
    } else if (side.startsWith("p")) {
      current.put += oi;
      current.putVolume += rowVolume;
      current.putGamma += rowGamma;
      current.putDex += dex;
      current.putVanna += vanna;
      current.putCharm += charm;
    }

    groups.set(strike, current);

    if (expirationDate) {
      const byStrike = expirationGroups.get(expirationDate) || new Map<number, StrikeGroup>();
      const expiryRow = byStrike.get(strike) || emptyStrikeGroup();
      if (side.startsWith("c")) {
        expiryRow.call += oi;
        expiryRow.callVolume += rowVolume;
        expiryRow.callGamma += rowGamma;
        expiryRow.callDex += dex;
        expiryRow.callVanna += vanna;
        expiryRow.callCharm += charm;
      } else {
        expiryRow.put += oi;
        expiryRow.putVolume += rowVolume;
        expiryRow.putGamma += rowGamma;
        expiryRow.putDex += dex;
        expiryRow.putVanna += vanna;
        expiryRow.putCharm += charm;
      }
      byStrike.set(strike, expiryRow);
      expirationGroups.set(expirationDate, byStrike);
    }
  }

  const exposure = buildExposureProfile(groups, deltaRows, ivRows, optionRows);
  exposure.expirations = [...expirationGroups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([expirationDate, rowsByStrike]) => ({
      expiration: expirationDate,
      rows: buildExposureProfile(rowsByStrike, deltaRows, ivRows, optionRows).rows,
    }));
  return { groups, exposure };
}

function strongest(groups: Map<number, StrikeGroup>, key: "call" | "put") {
  return [...groups.entries()].reduce(
    (winner, [price, row]) => (row[key] > winner.value ? { price, value: row[key] } : winner),
    { price: 0, value: 0 },
  );
}

function nearestZeroGamma(groups: Map<number, { callGamma: number; putGamma: number }>, spot: number) {
  const rows = [...groups.entries()]
    .map(([price, row]) => ({ price, net: row.callGamma - row.putGamma }))
    .sort((a, b) => a.price - b.price);

  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if ((previous.net <= 0 && current.net >= 0) || (previous.net >= 0 && current.net <= 0)) {
      return Math.abs(previous.price - spot) < Math.abs(current.price - spot) ? previous.price : current.price;
    }
  }

  return rows.reduce((nearest, row) => (Math.abs(row.price - spot) < Math.abs(nearest - spot) ? row.price : nearest), spot);
}

function buildMarketRead(symbol: string, range: string, quote: MarketDataJson, chain: MarketDataJson): MarketRead {
  const heatmapScope = String(chain._riskStoryHeatmapScope || "");
  const sessionDate = String(chain._riskStorySessionDate || "");
  const isPreviousSessionHeatmap = heatmapScope === "previous-session";
  const isCachedHeatmap = heatmapScope === "cached-current";
  const quoteSpot = firstNumber(quote, ["last", "mid", "ask", "bid"], Number.NaN);
  const chainSpot = firstNumber(chain, ["underlyingPrice"], Number.NaN);
  const spot = isPreviousSessionHeatmap && Number.isFinite(chainSpot)
    ? chainSpot
    : Number.isFinite(quoteSpot) ? quoteSpot : chainSpot;
  if (!Number.isFinite(spot) || spot <= 0) {
    throw new Error("No provider-backed underlying price was returned");
  }
  const grouped = groupByStrike(chain, spot);
  const groups = grouped.groups;

  if (!groups.size) {
    throw new Error("No usable option chain rows returned");
  }

  const callWall = strongest(groups, "call");
  const putWall = strongest(groups, "put");
  const zeroGamma = nearestZeroGamma(groups, spot);
  const callGex = [...groups.values()].reduce((total, row) => total + row.callGamma, 0);
  const putGex = -[...groups.values()].reduce((total, row) => total + row.putGamma, 0);
  const netGex = callGex + putGex;

  const levelIsUsable = (level: number) => Number.isFinite(level) && level > 0 && Math.abs(level - spot) / Math.max(spot, 1) < 0.35;
  const snapshot: MarketSnapshot = {
    spot,
    zeroGamma: levelIsUsable(zeroGamma) ? zeroGamma : 0,
    callWall: callWall.value > 0 && levelIsUsable(callWall.price) ? callWall.price : 0,
    putWall: putWall.value > 0 && levelIsUsable(putWall.price) ? putWall.price : 0,
    netGex,
    callGex,
    putGex,
  };

  const levels: MarketLevel[] = [];
  if (snapshot.callWall > 0) levels.push({
      type: "call_wall",
      price: snapshot.callWall,
      strength: Math.min(96, 55 + Math.round(callWall.value / 25000)),
      reason: "Largest call open interest cluster from MarketData option chain.",
    });
  if (snapshot.zeroGamma > 0) levels.push({
      type: "zero_gamma",
      price: snapshot.zeroGamma,
      strength: 80,
      reason: "Estimated gamma flip from call and put gamma balance.",
    });
  if (snapshot.putWall > 0) levels.push({
      type: "put_wall",
      price: snapshot.putWall,
      strength: Math.min(94, 55 + Math.round(putWall.value / 25000)),
      reason: "Largest put open interest cluster from MarketData option chain.",
    });

  const updatedAt = new Date().toISOString();
  const metric = (value: number, method: "reported" | "derived" | "estimated", source: "quote" | "option-chain" | "model", label: string) => ({ value, method, source, label });
  const warnings = [isPreviousSessionHeatmap
    ? `Multi-expiration heatmap uses actual MarketData option-chain data from the ${sessionDate} market session.`
    : isCachedHeatmap
      ? "Multi-expiration heatmap uses actual cached MarketData option-chain data."
      : "MarketData entitlement controls the exact delay; this adapter treats the feed as delayed until a realtime entitlement is verified.",
  ];
  if (!Number.isFinite(quoteSpot)) warnings.push("Spot was read from the option chain because a quote was unavailable.");
  if (!snapshot.callWall) warnings.push("No usable call-wall level was returned by the selected chain.");
  if (!snapshot.putWall) warnings.push("No usable put-wall level was returned by the selected chain.");
  if (grouped.exposure.deltaCoverage < 70) warnings.push(`Delta coverage is ${grouped.exposure.deltaCoverage}%.`);
  if (grouped.exposure.ivCoverage < 70) warnings.push(`IV coverage is ${grouped.exposure.ivCoverage}%.`);

  const asOf = isPreviousSessionHeatmap ? providerTimestamp(chain) : providerTimestamp(quote, chain);

  return {
    schemaVersion: "1.0",
    provider: "marketdata",
    symbol,
    range,
    updatedAt,
    provenance: {
      provider: "marketdata",
      mode: "delayed",
      label: isPreviousSessionHeatmap
        ? `MarketData actual chain - session ${sessionDate}`
        : isCachedHeatmap
          ? "MarketData actual cached chain"
          : "Provider data - delay entitlement not verified",
      asOf,
      receivedAt: updatedAt,
      delayMinutes: elapsedMinutes(asOf, updatedAt),
      note: isPreviousSessionHeatmap
        ? `Heatmap dates and values are provider-backed from the ${sessionDate} session; no expiration or cell is fabricated.`
        : isCachedHeatmap
          ? "Heatmap dates and values are provider-backed cached MarketData reads; no expiration or cell is fabricated."
          : "Quote and option-chain data are provider-backed. Gamma levels are derived from the returned chain.",
    },
    metrics: {
      spot: metric(spot, "reported", Number.isFinite(quoteSpot) ? "quote" : "option-chain", Number.isFinite(quoteSpot) ? "Provider quote" : "Chain underlying price"),
      netGex: metric(netGex, "derived", "option-chain", "OI-weighted chain gamma"),
      callGex: metric(callGex, "derived", "option-chain", "OI-weighted call gamma"),
      putGex: metric(putGex, "derived", "option-chain", "OI-weighted put gamma"),
      zeroGamma: metric(snapshot.zeroGamma, "derived", "model", "Estimated gamma flip"),
      callWall: metric(snapshot.callWall, "derived", "option-chain", "Largest call OI cluster"),
      putWall: metric(snapshot.putWall, "derived", "option-chain", "Largest put OI cluster"),
    },
    quality: {
      completeness: Math.round((grouped.exposure.deltaCoverage + grouped.exposure.ivCoverage + 100) / 3),
      warnings,
    },
    snapshot,
    levels,
    exposure: grouped.exposure,
  };
}

export const marketDataProvider: MarketDataProvider = {
  name: "marketdata",

  async getMarketRead({ symbol, range }) {
    try {
      const chain = await requestOptionChain(symbol, range);
      const quote = await requestJson(`/stocks/quotes/${encodeURIComponent(symbol)}/`).catch(() => ({}));

      return buildMarketRead(symbol, range, quote, chain);
    } catch (error) {
      return unavailableMarketRead(symbol, range, error instanceof Error ? error.message : "MarketData request failed.");
    }
  },

  async getFlowRead(): Promise<FlowRead> {
    return unavailableFlowRead("MarketData does not provide sweep, split, block, or dark-pool flow through this adapter.");
  },

  async getCandles({ symbol, frame, before }) {
    try {
      const resolution = candleResolution(frame);
      const end = Number.isFinite(before) && before && before > 0 ? new Date(before * 1000) : new Date();
      const to = end.toISOString().slice(0, 10);
      const from = isoDateDaysBefore(end, candleBatchLookbackDays(frame));
      const data = await requestJson(`/stocks/candles/${resolution}/${encodeURIComponent(symbol)}/?from=${from}&to=${to}`);
      const parsed = parseCandles(data).filter((candle) => !before || candle.time < before);
      const candles = parsed.slice(-CANDLE_BATCH_SIZE);

      if (!candles.length) {
        if (before) {
          const updatedAt = new Date().toISOString();
          return {
            schemaVersion: "1.0",
            provider: "marketdata",
            symbol,
            frame,
            updatedAt,
            delayed: true,
            provenance: {
              provider: "marketdata",
              mode: "delayed",
              label: "Provider candles - delayed",
              asOf: null,
              receivedAt: updatedAt,
              delayMinutes: null,
              note: "No provider-backed candles were returned before the requested historical boundary.",
            },
            quality: { completeness: 100, warnings: [] },
            candles: [],
            pagination: { hasMore: false, oldestTime: null },
          };
        }
        throw new Error("No candle rows returned");
      }

      const updatedAt = new Date().toISOString();
      const latestCandle = candles[candles.length - 1];
      const asOf = latestCandle ? new Date(latestCandle.time * 1000).toISOString() : providerTimestamp(data);

      return {
        schemaVersion: "1.0",
        provider: "marketdata",
        symbol,
        frame,
        updatedAt,
        delayed: true,
        provenance: {
          provider: "marketdata",
          mode: "delayed",
          label: "Provider candles - delayed",
          asOf,
          receivedAt: updatedAt,
          delayMinutes: elapsedMinutes(asOf, updatedAt),
          note: "Candle delay depends on the MarketData account entitlement.",
        },
        quality: {
          completeness: 100,
          warnings: ["Realtime entitlement has not been verified; candles are labeled delayed."],
        },
        candles,
        pagination: {
          hasMore: true,
          oldestTime: candles[0]?.time ?? null,
        },
      };
    } catch (error) {
      return unavailableCandleRead(symbol, frame, error instanceof Error ? error.message : "MarketData candle request failed.");
    }
  },
};
