import { addReportedValues, reportedNonNegative } from "./reported-values";
import type { Candle, CandleRead, ExposureProfile, ExposureStrike, FlowRead, MarketDataProvider, MarketLevel, MarketRead, MarketSnapshot, MetricRead } from "./types";
import { unavailableCandleRead, unavailableFlowRead, unavailableMarketRead } from "./unavailable-provider";
import { UnusualWhalesProvider } from "./unusual-whales-provider";
import type { UnusualWhalesGreekExposure, UnusualWhalesOptionContract } from "./unusual-whales-types";

const ACTIVE_SYMBOL = "SPY";
const CANDLE_BATCH_SIZE = 320;

function timestamp(value: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOnly(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function elapsedMinutes(asOf: string | null, updatedAt: string) {
  if (!asOf) return null;
  const elapsed = new Date(updatedAt).getTime() - new Date(asOf).getTime();
  return Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed / 60_000)) : null;
}

function nativeMetric(value: number, label: string): MetricRead {
  return { value, method: "reported", source: "option-chain", label };
}

function unavailableMetric(label: string): MetricRead {
  return { value: 0, method: "unavailable", source: "unavailable", label };
}

function supportedSymbol(symbol: string) {
  return symbol.toUpperCase() === ACTIVE_SYMBOL;
}

type OptionBuckets = {
  all: Map<number, { callOpenInterest: number | null; putOpenInterest: number | null; callVolume: number | null; putVolume: number | null }>;
  expirations: Map<string, Map<number, { callOpenInterest: number | null; putOpenInterest: number | null; callVolume: number | null; putVolume: number | null }>>;
  contractRows: number;
  deltaRows: number;
  ivRows: number;
};

function emptyBucket() {
  return { callOpenInterest: undefined as number | null | undefined, putOpenInterest: undefined as number | null | undefined, callVolume: undefined as number | null | undefined, putVolume: undefined as number | null | undefined };
}

function finalBucket(bucket: ReturnType<typeof emptyBucket>) {
  return {
    callOpenInterest: bucket.callOpenInterest ?? null,
    putOpenInterest: bucket.putOpenInterest ?? null,
    callVolume: bucket.callVolume ?? null,
    putVolume: bucket.putVolume ?? null,
  };
}

function addContract(bucket: ReturnType<typeof emptyBucket>, contract: UnusualWhalesOptionContract) {
  const openInterest = contract.openInterest === null ? null : reportedNonNegative(contract.openInterest);
  const volume = contract.volume === null ? null : reportedNonNegative(contract.volume);
  if (contract.side === "call") {
    bucket.callOpenInterest = addReportedValues(bucket.callOpenInterest, openInterest);
    bucket.callVolume = addReportedValues(bucket.callVolume, volume);
  } else if (contract.side === "put") {
    bucket.putOpenInterest = addReportedValues(bucket.putOpenInterest, openInterest);
    bucket.putVolume = addReportedValues(bucket.putVolume, volume);
  }
}

function bucketOptionChain(contracts: UnusualWhalesOptionContract[]): OptionBuckets {
  const allMutable = new Map<number, ReturnType<typeof emptyBucket>>();
  const expiryMutable = new Map<string, Map<number, ReturnType<typeof emptyBucket>>>();
  let contractRows = 0;
  let deltaRows = 0;
  let ivRows = 0;

  for (const contract of contracts) {
    if (contract.strike === null || contract.strike <= 0 || contract.side === null) continue;
    contractRows += 1;
    if (contract.delta !== null) deltaRows += 1;
    if (contract.impliedVolatility !== null) ivRows += 1;
    const allBucket = allMutable.get(contract.strike) ?? emptyBucket();
    addContract(allBucket, contract);
    allMutable.set(contract.strike, allBucket);

    const expiry = dateOnly(contract.expiry);
    if (!expiry) continue;
    const byStrike = expiryMutable.get(expiry) ?? new Map<number, ReturnType<typeof emptyBucket>>();
    const expiryBucket = byStrike.get(contract.strike) ?? emptyBucket();
    addContract(expiryBucket, contract);
    byStrike.set(contract.strike, expiryBucket);
    expiryMutable.set(expiry, byStrike);
  }

  return {
    all: new Map([...allMutable.entries()].map(([strike, bucket]) => [strike, finalBucket(bucket)])),
    expirations: new Map([...expiryMutable.entries()].map(([expiry, rows]) => [expiry, new Map([...rows.entries()].map(([strike, bucket]) => [strike, finalBucket(bucket)]))])),
    contractRows,
    deltaRows,
    ivRows,
  };
}

function nativeExposureRows(exposure: UnusualWhalesGreekExposure[], optionBuckets: OptionBuckets) {
  const rows: ExposureStrike[] = [];
  for (const entry of exposure) {
    if (entry.strike === null || entry.strike <= 0 || entry.callGex === null || entry.putGex === null) continue;
    const option = optionBuckets.all.get(entry.strike);
    const callDex = entry.callDelta ?? 0;
    const putDex = entry.putDelta ?? 0;
    const callVanna = entry.callVanna ?? 0;
    const putVanna = entry.putVanna ?? 0;
    const callCharm = entry.callCharm ?? 0;
    const putCharm = entry.putCharm ?? 0;
    rows.push({
      strike: entry.strike,
      callOpenInterest: option?.callOpenInterest ?? null,
      putOpenInterest: option?.putOpenInterest ?? null,
      callVolume: option?.callVolume ?? null,
      putVolume: option?.putVolume ?? null,
      // UW signs are kept exactly as reported. This is a provider-native sum,
      // not a dealer-position or gamma-flip calculation.
      callGex: entry.callGex,
      putGex: entry.putGex,
      netGex: entry.callGex + entry.putGex,
      callDex,
      putDex,
      netDex: callDex + putDex,
      callVanna,
      putVanna,
      netVanna: callVanna + putVanna,
      callCharm,
      putCharm,
      netCharm: callCharm + putCharm,
      combined: 0,
    });
  }
  return rows.sort((left, right) => right.strike - left.strike);
}

function buildExposureProfile(optionBuckets: OptionBuckets, byStrike: UnusualWhalesGreekExposure[], byExpiry: UnusualWhalesGreekExposure[]): ExposureProfile {
  const rows = nativeExposureRows(byStrike, optionBuckets);
  const expirations = [...optionBuckets.expirations.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([expiration, strikes]) => ({
      expiration,
      rows: [...strikes.entries()]
        .map(([strike, values]) => ({ strike, ...values }))
        .sort((left, right) => right.strike - left.strike),
    }));

  const nativeGexByExpiration = byExpiry
    .flatMap((entry) => {
      const expiration = dateOnly(entry.expiry);
      return expiration ? [{ expiration, callGex: entry.callGex, putGex: entry.putGex }] : [];
    })
    .sort((left, right) => left.expiration.localeCompare(right.expiration));

  return {
    method: "chain-greeks-v1",
    assumption: "Open interest and volume are provider-backed per expiration. GEX rows preserve Unusual Whales provider-native strike signs; UW does not provide a strike-by-expiration GEX matrix in this read.",
    deltaCoverage: optionBuckets.contractRows ? Math.round(optionBuckets.deltaRows / optionBuckets.contractRows * 100) : 0,
    ivCoverage: optionBuckets.contractRows ? Math.round(optionBuckets.ivRows / optionBuckets.contractRows * 100) : 0,
    rows,
    expirations,
    providerNativeGexByExpiration: nativeGexByExpiration,
  };
}

function validLevel(value: number | null, spot: number) {
  return value !== null && value > 0 && Math.abs(value - spot) / Math.max(spot, 1) < 0.35;
}

function mapLevels(spot: number, levels: { callWall: number | null; putWall: number | null; gammaFlip: number | null; gammaMagnet: number | null }): MarketLevel[] {
  const result: MarketLevel[] = [];
  if (validLevel(levels.callWall, spot)) result.push({ type: "call_wall", price: levels.callWall!, strength: 80, reason: "Provider-native Unusual Whales call wall." });
  if (validLevel(levels.putWall, spot)) result.push({ type: "put_wall", price: levels.putWall!, strength: 80, reason: "Provider-native Unusual Whales put wall." });
  if (validLevel(levels.gammaFlip, spot)) result.push({ type: "zero_gamma", price: levels.gammaFlip!, strength: 80, reason: "Provider-native Unusual Whales gamma flip." });
  if (validLevel(levels.gammaMagnet, spot)) result.push({ type: "magnet", price: levels.gammaMagnet!, strength: 70, reason: "Provider-native Unusual Whales gamma magnet." });
  return result;
}

function mapFlowType(tags: string[]) {
  const normalized = tags.map((tag) => tag.toLowerCase());
  if (normalized.some((tag) => tag.includes("sweep"))) return "SWEEP" as const;
  if (normalized.some((tag) => tag.includes("block"))) return "BLOCK" as const;
  if (normalized.some((tag) => tag.includes("split"))) return "SPLIT" as const;
  return null;
}

export class UnusualWhalesMarketProvider implements MarketDataProvider {
  readonly name = "unusual-whales";

  constructor(private readonly client: UnusualWhalesProvider) {}

  async getMarketRead({ symbol, range }: { symbol: string; range: string }): Promise<MarketRead> {
    const normalized = symbol.toUpperCase();
    if (!supportedSymbol(normalized)) {
      return unavailableMarketRead(normalized, range, "Unusual Whales production activation currently supports SPY only. SPX options normalization is capability-gated and no SPX spot is inferred.");
    }
    try {
      const snapshot = await this.client.currentSnapshot(normalized);
      const spot = snapshot.stockState.close;
      if (spot === null || spot <= 0) throw new Error("Unusual Whales did not return a provider-backed SPY spot.");
      const updatedAt = new Date().toISOString();
      const exposure = buildExposureProfile(bucketOptionChain(snapshot.optionChain), snapshot.gexByStrike, snapshot.gexByExpiry);
      if (!exposure.rows.length) throw new Error("Unusual Whales did not return usable provider-native GEX strikes.");
      const callGex = exposure.rows.reduce((total, row) => total + row.callGex, 0);
      const putGex = exposure.rows.reduce((total, row) => total + row.putGex, 0);
      const netGex = callGex + putGex;
      const levels = mapLevels(spot, snapshot.gexLevels);
      const currentAsOf = snapshot.stockState.marketTime ?? snapshot.stockState.tapeTime;
      const marketSnapshot: MarketSnapshot = {
        spot,
        callWall: validLevel(snapshot.gexLevels.callWall, spot) ? snapshot.gexLevels.callWall! : 0,
        putWall: validLevel(snapshot.gexLevels.putWall, spot) ? snapshot.gexLevels.putWall! : 0,
        zeroGamma: validLevel(snapshot.gexLevels.gammaFlip, spot) ? snapshot.gexLevels.gammaFlip! : 0,
        callGex,
        putGex,
        netGex,
      };
      return {
        schemaVersion: "1.0",
        provider: this.name,
        symbol: normalized,
        range,
        updatedAt,
        provenance: {
          provider: this.name,
          mode: "delayed",
          label: "Unusual Whales provider data",
          asOf: currentAsOf,
          receivedAt: updatedAt,
          delayMinutes: elapsedMinutes(currentAsOf, updatedAt),
          note: "SPY spot, option chain, and GEX values are provider-backed. GEX signs are preserved from Unusual Whales; strike-by-expiration GEX is not inferred.",
        },
        metrics: {
          spot: { value: spot, method: "reported", source: "quote", label: "Unusual Whales stock state" },
          callGex: nativeMetric(callGex, "Provider-native call GEX sum"),
          putGex: nativeMetric(putGex, "Provider-native put GEX sum"),
          netGex: nativeMetric(netGex, "Signed sum of provider-native call and put GEX"),
          zeroGamma: marketSnapshot.zeroGamma ? nativeMetric(marketSnapshot.zeroGamma, "Provider-native gamma flip") : unavailableMetric("Provider-native gamma flip unavailable"),
          callWall: marketSnapshot.callWall ? nativeMetric(marketSnapshot.callWall, "Provider-native call wall") : unavailableMetric("Provider-native call wall unavailable"),
          putWall: marketSnapshot.putWall ? nativeMetric(marketSnapshot.putWall, "Provider-native put wall") : unavailableMetric("Provider-native put wall unavailable"),
        },
        quality: {
          completeness: Math.round((exposure.deltaCoverage + exposure.ivCoverage + 100) / 3),
          warnings: ["GEX by expiration is provider-native aggregate data. The option-chain expiration matrix represents only provider-reported OI and volume."],
        },
        snapshot: marketSnapshot,
        levels,
        exposure,
        optionChain: {
          contracts: snapshot.optionChain.map(({ contract, strike, expiry, side, bid, ask, lastPrice, openInterest, volume, impliedVolatility, delta, gamma }) => ({
            contract,
            strike,
            expiration: dateOnly(expiry),
            side,
            bid,
            ask,
            lastPrice,
            openInterest,
            volume,
            impliedVolatility,
            delta,
            gamma,
          })),
        },
      };
    } catch (error) {
      return unavailableMarketRead(normalized, range, error instanceof Error ? error.message : "Unusual Whales market read failed.");
    }
  }

  async getCandles({ symbol, frame, before, latest }: { symbol: string; frame: string; before?: number; latest?: boolean }): Promise<CandleRead> {
    const normalized = symbol.toUpperCase();
    if (!supportedSymbol(normalized)) return unavailableCandleRead(normalized, frame, "Unusual Whales production activation currently supports SPY candles only.");
    const normalizedFrame = frame.toLowerCase() === "1d" ? "1d" : frame.toLowerCase();
    if (!(["1m", "5m", "10m", "15m", "1h", "1d"] as const).includes(normalizedFrame as "1m")) return unavailableCandleRead(normalized, frame, "Unsupported Unusual Whales candle timeframe.");
    try {
      const rows = await this.client.candles(normalized, normalizedFrame as "1m" | "5m" | "10m" | "15m" | "1h" | "1d", latest ? 2 : CANDLE_BATCH_SIZE);
      const candles: Candle[] = rows
        .flatMap((row) => {
          const value = timestamp(row.startTime ?? row.marketTime ?? row.endTime);
          return value === null || row.volume === null ? [] : [{ time: Math.floor(value / 1000), open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume }];
        })
        .filter((row) => !before || row.time < before)
        .sort((left, right) => left.time - right.time);
      const updatedAt = new Date().toISOString();
      if (!candles.length) {
        if (before) return { schemaVersion: "1.0", provider: this.name, symbol: normalized, frame, updatedAt, delayed: true, provenance: { provider: this.name, mode: "delayed", label: "Unusual Whales candles", asOf: null, receivedAt: updatedAt, delayMinutes: null, note: "No provider-backed candles were returned before the requested boundary." }, quality: { completeness: 100, warnings: [] }, candles: [], connection: { state: "stale", lastSuccessfulAt: null, pollIntervalSeconds: null }, pagination: { hasMore: false, oldestTime: null } };
        throw new Error("Unusual Whales returned no usable candles.");
      }
      const asOf = new Date(candles[candles.length - 1].time * 1000).toISOString();
      return { schemaVersion: "1.0", provider: this.name, symbol: normalized, frame, updatedAt, delayed: true, provenance: { provider: this.name, mode: "delayed", label: "Unusual Whales candles", asOf, receivedAt: updatedAt, delayMinutes: elapsedMinutes(asOf, updatedAt), note: "Candles are provider-backed. Historical pagination ends when the upstream response has no older timestamps." }, quality: { completeness: 100, warnings: [] }, candles, connection: { state: "delayed", lastSuccessfulAt: updatedAt, pollIntervalSeconds: 900 }, pagination: { hasMore: !latest, oldestTime: candles[0]?.time ?? null } };
    } catch (error) {
      return unavailableCandleRead(normalized, frame, error instanceof Error ? error.message : "Unusual Whales candle read failed.");
    }
  }

  async getFlowRead({ symbol }: { symbol?: string } = {}): Promise<FlowRead> {
    const normalized = (symbol ?? ACTIVE_SYMBOL).toUpperCase();
    if (!supportedSymbol(normalized)) return unavailableFlowRead("Unusual Whales production activation currently supports SPY raw flow only.");
    try {
      const [flow, darkPool] = await Promise.all([this.client.rawFlow(normalized), this.client.rawDarkPool(normalized)]);
      const rows = flow.trades.flatMap((trade) => {
        const type = mapFlowType(trade.tags);
        if (!type || trade.executedAt === null || trade.side === null || trade.strike === null || trade.expiry === null || trade.premium === null || trade.size === null || trade.openInterest === null) return [];
        return [{ time: trade.executedAt, symbol: trade.ticker ?? normalized, assetType: "etf" as const, side: trade.side === "call" ? "Call" as const : "Put" as const, type, strike: trade.strike, expiry: trade.expiry, premium: trade.premium, volume: trade.size, openInterest: trade.openInterest }];
      });
      const updatedAt = new Date().toISOString();
      return { schemaVersion: "1.0", provider: this.name, updatedAt, provenance: { provider: this.name, mode: "delayed", label: "Unusual Whales raw flow and dark pool", asOf: null, receivedAt: updatedAt, delayMinutes: null, note: "Only provider-tagged, complete flow records enter the legacy table. Raw provider records remain available without inferred classifications." }, quality: { completeness: 100, warnings: [] }, rows, raw: { optionTrades: flow.trades.map(({ executedAt, ticker, strike, expiry, side, price, size, premium, openInterest, volume, nbboBid, nbboAsk, tags }) => ({ executedAt, ticker, strike, expiry, side, price, size, premium, openInterest, volume, nbboBid, nbboAsk, tags })), darkPoolPrints: darkPool.prints.map(({ executedAt, ticker, price, size, premium, marketCenter }) => ({ executedAt, ticker, price, size, premium, marketCenter })), darkPoolPriceLevels: darkPool.priceLevels } };
    } catch (error) {
      return unavailableFlowRead(error instanceof Error ? error.message : "Unusual Whales flow read failed.");
    }
  }
}
