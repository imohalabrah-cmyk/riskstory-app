import assert from "node:assert/strict";
import test from "node:test";
import { runUnusualWhalesCapabilityProbe, unusualWhalesProbePlan } from "../app/lib/market/unusual-whales-capability-probe";
import { mapCandles, mapDarkPoolPriceLevels, mapDarkPoolTrades, mapGexLevels, mapGreekExposure, mapOptionChain, mapOptionTrades, mapStockState, UnusualWhalesClient } from "../app/lib/market/unusual-whales-provider";
import { getUnusualWhalesProvider, resolveMarketProviderSelection } from "../app/lib/market/provider";

test("UW raw mappings preserve provider values without deriving net GEX", () => {
  const contracts = mapOptionChain({ data: [{ option_symbol: "SPY260101C00600000", strike: "600", expiry: "2026-01-01", type: "call", nbbo_bid: "4.1", nbbo_ask: "4.3", open_interest: 0, volume: null, implied_volatility: "0.2", delta: "0.5", gamma: "0.01" }] });
  assert.deepEqual(contracts[0], { contract: "SPY260101C00600000", strike: 600, expiry: "2026-01-01", side: "call", bid: 4.1, ask: 4.3, lastPrice: null, openInterest: 0, volume: null, impliedVolatility: 0.2, delta: 0.5, gamma: 0.01, theta: null, vega: null, rho: null, lastTapeTime: null });
  const exposure = mapGreekExposure({ data: [{ strike: "600", call_gex: 0, call_gamma: "99", put_gex: "-7", call_vanna: "4", put_charm: "-2" }] });
  assert.equal(exposure[0].callGex, 0);
  assert.equal(exposure[0].putGex, -7);
  assert.equal("netGex" in exposure[0], false);
  assert.deepEqual(mapDarkPoolPriceLevels({ data: [{ price: "600", dark_pool_volume: 0, regular_volume: "50" }] }), [{ price: 600, darkPoolVolume: 0, regularVolume: 50 }]);
  assert.deepEqual(mapStockState({ data: { close: "601.25", volume: 0, tape_time: "2026-08-12T14:30:00Z" } }), { close: 601.25, high: null, low: null, open: null, previousClose: null, volume: 0, totalVolume: null, tapeTime: "2026-08-12T14:30:00Z", marketTime: null });
  assert.deepEqual(mapCandles({ data: [{ open: "600", high: "602", low: "599", close: "601", volume: 0, start_time: "2026-08-12T14:30:00Z" }] }), [{ open: 600, high: 602, low: 599, close: 601, volume: 0, totalVolume: null, startTime: "2026-08-12T14:30:00Z", endTime: null, marketTime: null }]);
  assert.deepEqual(mapGexLevels({ data: { call_wall: "605", put_wall: "595", gamma_flip: "600", gamma_magnet: "602" } }), { callWall: 605, putWall: 595, gammaFlip: 600, gammaMagnet: 602 });
  assert.deepEqual(mapOptionTrades({ data: [{ underlying_symbol: "SPY", option_chain_id: "SPY260101C00600000", option_type: "call", strike: "600", price: "4", size: 20, premium: "8000", tags: ["sweep"], report_flags: ["flag"] }] })[0], { executedAt: null, ticker: "SPY", contract: "SPY260101C00600000", strike: 600, expiry: null, side: "call", price: 4, size: 20, premium: 8000, openInterest: null, volume: null, nbboBid: null, nbboAsk: null, impliedVolatility: null, delta: null, gamma: null, tags: ["sweep"], reportFlags: ["flag"], exchange: null });
  assert.deepEqual(mapDarkPoolTrades({ data: [{ ticker: "SPY", price: "600", size: 0, premium: "0", sale_cond_codes: ["T"] }] })[0], { executedAt: null, trfExecutedAt: null, ticker: "SPY", price: 600, size: 0, premium: 0, volume: null, marketCenter: null, tradeCode: null, saleConditionCodes: ["T"], tradeSettlement: null });
});

test("UW capability probe is ordered, bounded, and records entitlement failures without token leakage", async () => {
  const calls: string[] = [];
  const client = new UnusualWhalesClient("uw-secret-never-log", async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("greek-exposure/strike")) return new Response(JSON.stringify({ code: "forbidden", message: "Bearer uw-secret-never-log not entitled" }), { status: 403 });
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  });
  const plan = unusualWhalesProbePlan(client);
  assert.equal(plan.length, 10);
  assert.equal(plan[2].capability, "option-chain");
  const results = await runUnusualWhalesCapabilityProbe(client);
  assert.equal(results.length, 10);
  assert.deepEqual(results.map((result) => result.capability), plan.map((step) => step.capability));
  const failed = results.find((result) => result.capability === "gex-by-strike");
  assert.equal(failed?.status, "unavailable");
  assert.equal(failed?.upstreamStatus, 403);
  assert.match(failed?.message || "", /Bearer \[REDACTED\]/);
  assert.doesNotMatch(failed?.message || "", /uw-secret-never-log/);
  assert.equal(calls.filter((url) => url.includes("option-chains")).length, 1);
  assert.ok(calls.some((url) => url.endsWith("/stock/SPX/stock-state")));
  assert.ok(calls.some((url) => url.endsWith("/stock/QQQ/stock-state")));
});

test("UW activation requires explicit server-side provider and verified-capability gates", () => {
  assert.equal(resolveMarketProviderSelection({ MARKETDATA_TOKEN: "marketdata-token", UNUSUAL_WHALES_TOKEN: "uw-token" }), "marketdata");
  assert.equal(resolveMarketProviderSelection({ UNUSUAL_WHALES_TOKEN: "uw-token", RISK_STORY_MARKET_PROVIDER: "unusual-whales" }), "unavailable");
  assert.equal(resolveMarketProviderSelection({ UNUSUAL_WHALES_TOKEN: "uw-token", RISK_STORY_MARKET_PROVIDER: "unusual-whales", RISK_STORY_UW_CAPABILITIES: "verified" }), "unusual-whales");
  assert.equal(getUnusualWhalesProvider({}), null);
  assert.equal(getUnusualWhalesProvider({ UNUSUAL_WHALES_TOKEN: "uw-token" })?.constructor.name, "UnusualWhalesProvider");
});
