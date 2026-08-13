import assert from "node:assert/strict";
import test from "node:test";
import { selectDarkPoolZones, selectFlowOverlayEvents, selectGexZones } from "../app/lib/chart/overlay-data";
import { describeExposureHorizon } from "../app/lib/chart/exposure-horizon";
import type { FlowRead, MarketRead } from "../app/lib/market/types";

function market(rows: Array<{ strike: number; netGex: number; oi?: number | null }>): MarketRead {
  return { schemaVersion: "1.0", provider: "unusual-whales", symbol: "SPY", range: "0DTE", updatedAt: "2026-08-13T00:00:00Z", provenance: { provider: "unusual-whales", mode: "delayed", label: "UW", asOf: null, receivedAt: "2026-08-13T00:00:00Z", delayMinutes: null, note: "" }, metrics: {} as MarketRead["metrics"], quality: { completeness: 100, warnings: [] }, snapshot: { spot: 100, zeroGamma: 0, callWall: 0, putWall: 0, netGex: 0, callGex: 0, putGex: 0 }, levels: [], exposure: { method: "chain-greeks-v1", assumption: "", deltaCoverage: 0, ivCoverage: 0, expirations: [], rows: rows.map((row) => ({ strike: row.strike, netGex: row.netGex, callOpenInterest: row.oi ?? null, putOpenInterest: row.oi ?? null, callVolume: null, putVolume: null, callGex: row.netGex, putGex: 0, callDex: 0, putDex: 0, netDex: 0, callVanna: 0, putVanna: 0, netVanna: 0, callCharm: 0, putCharm: 0, netCharm: 0, combined: 0 })) } };
}

test("GEX zones are deterministic, suppress noise, and retain native signs", () => {
  const result = selectGexZones(market([{ strike: 101, netGex: 90, oi: 10 }, { strike: 99, netGex: -85, oi: 10 }, { strike: 104, netGex: 5, oi: 1000 }, { strike: 96, netGex: -4, oi: 1000 }, { strike: 102, netGex: 40, oi: 20 }, { strike: 98, netGex: -30, oi: 20 }, { strike: 103, netGex: 10, oi: 0 }]));
  assert.equal(result.length, 6);
  assert.equal(result[0].strike, 101);
  assert.equal(result.find((zone) => zone.strike === 99)?.netGex, -85);
  assert.ok(result.every((zone) => zone.bubbleCount >= 2 && zone.bubbleCount <= 8));
  assert.equal(result[0].horizon.kind, "short-dated-focus");
});

test("exposure horizon describes current provider scope without inventing persistence", () => {
  assert.equal(describeExposureHorizon({ symbol: "AAPL", range: "Weekly", exposure: { expirations: [{ expiration: "2026-08-21", rows: [] }, { expiration: "2026-08-28", rows: [] }] } }).kind, "multi-expiration-context");
  assert.match(describeExposureHorizon({ symbol: "AAPL", range: "Weekly", exposure: { expirations: [{ expiration: "2026-08-21", rows: [] }] } }).detail, /not a historical persistence measure/);
});

test("dark-pool and flow overlay policies do not fabricate direction or missing values", () => {
  const flow = { raw: { darkPoolPriceLevels: [{ price: 101, darkPoolVolume: 20, regularVolume: null }, { price: 99, darkPoolVolume: 50, regularVolume: 0 }, { price: null, darkPoolVolume: 900, regularVolume: 1 }], optionTrades: [{ strike: 101, premium: 30, side: "call", size: null, tags: [], executedAt: null }, { strike: 99, premium: 60, side: "put", size: 2, tags: ["sweep"], executedAt: "2026-08-13T00:00:00Z" }] } } as unknown as FlowRead;
  assert.deepEqual(selectDarkPoolZones(flow), [{ price: 99, darkPoolVolume: 50, regularVolume: 0 }, { price: 101, darkPoolVolume: 20, regularVolume: null }]);
  assert.deepEqual(selectFlowOverlayEvents(flow, 100), [{ strike: 99, side: "put", premium: 60, size: 2, tags: ["sweep"], executedAt: "2026-08-13T00:00:00Z" }, { strike: 101, side: "call", premium: 30, size: null, tags: [], executedAt: null }]);
});
