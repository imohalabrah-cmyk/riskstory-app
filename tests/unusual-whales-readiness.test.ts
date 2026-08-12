import assert from "node:assert/strict";
import test from "node:test";
import { runUnusualWhalesCapabilityProbe, unusualWhalesProbePlan } from "../app/lib/market/unusual-whales-capability-probe";
import { mapDarkPoolPriceLevels, mapGreekExposure, mapOptionChain, UnusualWhalesClient } from "../app/lib/market/unusual-whales-provider";

test("UW raw mappings preserve provider values without deriving net GEX", () => {
  const contracts = mapOptionChain({ data: [{ option_symbol: "SPY260101C00600000", strike: "600", expiry: "2026-01-01", type: "call", nbbo_bid: "4.1", nbbo_ask: "4.3", open_interest: 0, volume: null, implied_volatility: "0.2", delta: "0.5", gamma: "0.01" }] });
  assert.deepEqual(contracts[0], { contract: "SPY260101C00600000", strike: 600, expiry: "2026-01-01", side: "call", bid: 4.1, ask: 4.3, lastPrice: null, openInterest: 0, volume: null, impliedVolatility: 0.2, delta: 0.5, gamma: 0.01, theta: null, vega: null, rho: null, lastTapeTime: null });
  const exposure = mapGreekExposure({ data: [{ strike: "600", call_gex: "10", put_gex: "-7", call_vanna: "4", put_charm: "-2" }] });
  assert.equal(exposure[0].callGex, 10);
  assert.equal(exposure[0].putGex, -7);
  assert.equal("netGex" in exposure[0], false);
  assert.deepEqual(mapDarkPoolPriceLevels({ data: [{ price: "600", dark_pool_volume: 0, regular_volume: "50" }] }), [{ price: 600, darkPoolVolume: 0, regularVolume: 50 }]);
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
