import type { CandleRead, FlowRead, MarketDataProvider, MarketRead, MetricRead } from "./types";

function provenance(note: string) {
  const updatedAt = new Date().toISOString();
  return {
    provider: "unavailable",
    mode: "unavailable" as const,
    label: "Data unavailable",
    asOf: null,
    receivedAt: updatedAt,
    delayMinutes: null,
    note,
  };
}

function metric(label: string): MetricRead {
  return { value: 0, method: "unavailable", source: "unavailable", label };
}

export function unavailableMarketRead(symbol: string, range: string, note: string): MarketRead {
  const source = provenance(note);
  return {
    schemaVersion: "1.0",
    provider: "unavailable",
    symbol,
    range,
    updatedAt: source.receivedAt,
    provenance: source,
    metrics: {
      spot: metric("Spot unavailable"),
      netGex: metric("Net GEX unavailable"),
      callGex: metric("Call GEX unavailable"),
      putGex: metric("Put GEX unavailable"),
      zeroGamma: metric("Zero gamma unavailable"),
      callWall: metric("Call wall unavailable"),
      putWall: metric("Put wall unavailable"),
    },
    quality: { completeness: 0, warnings: [note] },
    snapshot: { spot: 0, zeroGamma: 0, callWall: 0, putWall: 0, netGex: 0, callGex: 0, putGex: 0 },
    levels: [],
    exposure: {
      method: "chain-greeks-v1",
      assumption: "No option-chain data was returned.",
      deltaCoverage: 0,
      ivCoverage: 0,
      rows: [],
      expirations: [],
    },
  };
}

export function unavailableFlowRead(note: string): FlowRead {
  const source = provenance(note);
  return {
    schemaVersion: "1.0",
    provider: "unavailable",
    updatedAt: source.receivedAt,
    provenance: source,
    quality: { completeness: 0, warnings: [note] },
    rows: [],
  };
}

export function unavailableCandleRead(symbol: string, frame: string, note: string): CandleRead {
  const source = provenance(note);
  return {
    schemaVersion: "1.0",
    provider: "unavailable",
    symbol,
    frame,
    updatedAt: source.receivedAt,
    delayed: false,
    provenance: source,
    quality: { completeness: 0, warnings: [note] },
    candles: [],
  };
}

export const unavailableProvider: MarketDataProvider = {
  name: "unavailable",
  async getMarketRead({ symbol, range }) {
    return unavailableMarketRead(symbol, range, "MARKETDATA_TOKEN is not configured.");
  },
  async getFlowRead() {
    return unavailableFlowRead("A dedicated options-flow provider is not connected.");
  },
  async getCandles({ symbol, frame }) {
    return unavailableCandleRead(symbol, frame, "MARKETDATA_TOKEN is not configured.");
  },
};
