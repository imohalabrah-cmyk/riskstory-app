import assert from "node:assert/strict";
import test from "node:test";
import { analyzeGexIntelligence } from "../app/lib/gex-intelligence";
import type { ExposureStrike, MarketLevel, MarketRead } from "../app/lib/market/types";

function row(strike: number, concentration: number): ExposureStrike {
  return {
    strike,
    callOpenInterest: concentration,
    putOpenInterest: 0,
    callVolume: 0,
    putVolume: 0,
    callGex: concentration,
    putGex: 0,
    netGex: concentration,
    callDex: 0,
    putDex: 0,
    netDex: 0,
    callVanna: 0,
    putVanna: 0,
    netVanna: 0,
    callCharm: 0,
    putCharm: 0,
    netCharm: 0,
    combined: 0,
  };
}

function market(rows: ExposureStrike[], levels: MarketLevel[] = []): MarketRead {
  const metric = { value: 0, method: "derived" as const, source: "option-chain" as const, label: "test" };
  return {
    schemaVersion: "1.0",
    provider: "test-provider",
    symbol: "TEST",
    range: "0DTE",
    updatedAt: "2026-08-08T00:00:00.000Z",
    provenance: {
      provider: "test-provider",
      mode: "delayed",
      label: "Test fixture",
      asOf: "2026-08-08T00:00:00.000Z",
      receivedAt: "2026-08-08T00:00:00.000Z",
      delayMinutes: 15,
      note: "Provider-backed test fixture.",
    },
    metrics: { spot: metric, netGex: metric, callGex: metric, putGex: metric, zeroGamma: metric, callWall: metric, putWall: metric },
    quality: { completeness: 100, warnings: [] },
    snapshot: { spot: 100, zeroGamma: 0, callWall: 0, putWall: 0, netGex: 0, callGex: 0, putGex: 0 },
    levels,
    exposure: {
      method: "chain-greeks-v1",
      assumption: "Test fixture",
      deltaCoverage: 100,
      ivCoverage: 100,
      rows,
      expirations: [],
    },
  };
}

function levelAt(read: ReturnType<typeof analyzeGexIntelligence>, strike: number) {
  const level = read.levels.find((item) => item.strike === strike);
  assert.ok(level, `Expected a level at ${strike}`);
  return level;
}

function assertScore(score: number | null) {
  assert.ok(score === null || (score >= 0 && score <= 100), `Expected a 0-100 score, received ${score}`);
}

test("a strong level surrounded by weaker levels receives high isolation", () => {
  const read = analyzeGexIntelligence(market([
    row(90, 10), row(95, 20), row(99, 25), row(100, 95), row(101, 18), row(105, 15), row(110, 10),
  ]));
  assert.ok((levelAt(read, 100).levelIsolation.score || 0) >= 75);
});

test("a weak level surrounded by even weaker levels is not misleadingly isolated", () => {
  const read = analyzeGexIntelligence(market([
    row(96, 100), row(97, 10), row(98, 15), row(100, 20), row(102, 10), row(103, 15), row(104, 10),
  ]));
  assert.ok((levelAt(read, 100).levelIsolation.score || 0) <= 45);
});

test("a consecutive weak segment bounded by two strong levels is reported as a low-exposure interval", () => {
  const read = analyzeGexIntelligence(market([
    row(700, 90), row(701, 10), row(702, 20), row(703, 15), row(704, 95),
  ]));
  assert.ok(read.liquidityVacuum.intervals.some((interval) => interval.lowStrike === 700 && interval.highStrike === 704));
});

test("weak strikes without strong boundaries are not reported as a low-exposure interval", () => {
  const read = analyzeGexIntelligence(market([
    row(700, 90), row(701, 10), row(702, 20), row(703, 15),
  ]));
  assert.equal(read.liquidityVacuum.intervals.length, 0);
});

test("missing usable GEX/OI returns unavailable rather than manufactured scores", () => {
  const read = analyzeGexIntelligence(market([row(100, 0)]));
  assert.equal(read.availability, "unavailable");
  assert.equal(read.confluence.availability, "unavailable");
  assert.equal(read.liquidityVacuum.score, null);
});

test("confluence is independent from MarketRead.levels", () => {
  const rows = [row(98, 15), row(99, 20), row(100, 90), row(101, 20), row(102, 15)];
  const withoutNamedLevels = analyzeGexIntelligence(market(rows));
  const withNamedLevels = analyzeGexIntelligence(market(rows, [{
    type: "call_wall",
    price: 100,
    strength: 100,
    reason: "Same-chain derived fixture",
  }]));
  assert.equal(levelAt(withoutNamedLevels, 100).confluence.score, levelAt(withNamedLevels, 100).confluence.score);
  assert.equal(withoutNamedLevels.confluence.score, withNamedLevels.confluence.score);
});

test("all available scores remain inside the 0-100 range", () => {
  const read = analyzeGexIntelligence(market([
    row(90, 5), row(95, 80), row(99, 10), row(100, 95), row(101, 8), row(105, 70), row(110, 4),
  ]));
  assertScore(read.liquidityVacuum.score);
  assertScore(read.marketClarity.score);
  assertScore(read.confluence.score);
  read.levels.forEach((level) => {
    assertScore(level.levelStrength.score);
    assertScore(level.levelIsolation.score);
    assertScore(level.confluence.score);
  });
  read.liquidityVacuum.intervals.forEach((interval) => assertScore(interval.score));
});
