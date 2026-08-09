import assert from "node:assert/strict";
import test from "node:test";
import { buildOpenInterestStudioRead, closestOpenInterestStrike, findOpenInterestRow, openInterestRowsForExpiration } from "../app/lib/open-interest-studio/data";
import type { ExposureStrike, MarketRead } from "../app/lib/market/types";

function row(strike: number, callOpenInterest: number | null, putOpenInterest: number | null, callVolume: number | null, putVolume: number | null): ExposureStrike {
  return { strike, callOpenInterest, putOpenInterest, callVolume, putVolume, callGex: 0, putGex: 0, netGex: 0, callDex: 0, putDex: 0, netDex: 0, callVanna: 0, putVanna: 0, netVanna: 0, callCharm: 0, putCharm: 0, netCharm: 0, combined: 0 };
}

function market(): MarketRead {
  const metric = { value: 0, method: "reported" as const, source: "option-chain" as const, label: "test" };
  return {
    schemaVersion: "1.0", provider: "test-provider", symbol: "TEST", range: "0DTE", updatedAt: "2026-08-09T00:00:00.000Z",
    provenance: { provider: "test-provider", mode: "delayed", label: "Test", asOf: "2026-08-09T00:00:00.000Z", receivedAt: "2026-08-09T00:00:00.000Z", delayMinutes: 15, note: "Provider-backed fixture." },
    metrics: { spot: metric, netGex: metric, callGex: metric, putGex: metric, zeroGamma: metric, callWall: metric, putWall: metric },
    quality: { completeness: 100, warnings: [] }, snapshot: { spot: 100, zeroGamma: 0, callWall: 0, putWall: 0, netGex: 0, callGex: 0, putGex: 0 }, levels: [],
    exposure: { method: "chain-greeks-v1", assumption: "Test", deltaCoverage: 100, ivCoverage: 100, rows: [], expirations: [
      { expiration: "2026-08-14", rows: [row(105, 0, 12, 0, 4), row(95, null, 8, null, 0)] },
      { expiration: "2026-08-21", rows: [row(110, 4, 6, 2, 3)] },
    ] },
  };
}

test("OI Studio preserves actual strikes and their source expiration", () => {
  const read = buildOpenInterestStudioRead(market());
  assert.ok(read);
  assert.deepEqual(read.expirations, ["2026-08-14", "2026-08-21"]);
  assert.deepEqual(openInterestRowsForExpiration(read, "2026-08-14").map((item) => [item.strike, item.expiration]), [[105, "2026-08-14"], [95, "2026-08-14"]]);
});

test("OI Studio preserves zero and marks missing OI and volume as unavailable", () => {
  const read = buildOpenInterestStudioRead(market());
  assert.ok(read);
  const rows = openInterestRowsForExpiration(read, "2026-08-14");
  const zero = findOpenInterestRow(rows, 105);
  const missing = findOpenInterestRow(rows, 95);
  assert.equal(zero?.callOpenInterest, 0);
  assert.equal(zero?.callVolume, 0);
  assert.equal(missing?.callOpenInterest, null);
  assert.equal(missing?.callVolume, null);
});

test("OI Studio combines only complete call and put pairs", () => {
  const read = buildOpenInterestStudioRead(market());
  assert.ok(read);
  const rows = openInterestRowsForExpiration(read, "2026-08-14");
  assert.equal(findOpenInterestRow(rows, 105)?.combinedOpenInterest, 12);
  assert.equal(findOpenInterestRow(rows, 105)?.combinedVolume, 4);
  assert.equal(findOpenInterestRow(rows, 95)?.combinedOpenInterest, null);
  assert.equal(findOpenInterestRow(rows, 95)?.combinedVolume, null);
});

test("OI Studio selection resolves only provider-backed strike rows", () => {
  const read = buildOpenInterestStudioRead(market());
  assert.ok(read);
  const rows = openInterestRowsForExpiration(read, "2026-08-14");
  assert.equal(findOpenInterestRow(rows, 105)?.strike, 105);
  assert.equal(findOpenInterestRow(rows, 101), null);
  assert.equal(closestOpenInterestStrike(rows, 100), 105);
});
