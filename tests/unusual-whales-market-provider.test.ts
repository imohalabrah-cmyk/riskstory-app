import assert from "node:assert/strict";
import test from "node:test";
import { UnusualWhalesMarketProvider } from "../app/lib/market/unusual-whales-market-provider";
import { UnusualWhalesProvider } from "../app/lib/market/unusual-whales-provider";
import { getMarketProvider, resolveMarketProviderSelection } from "../app/lib/market/provider";

function response(data: unknown) {
  return new Response(JSON.stringify({ data }));
}

function client() {
  let calls = 0;
  const provider = new UnusualWhalesProvider("uw-secret-never-log", async (input) => {
    calls += 1;
    const path = String(input);
    if (path.includes("stock-state")) return response({ close: 600, tape_time: "2026-08-13T14:30:00Z" });
    if (path.includes("option-chains")) return response([
      { strike: 600, expiry: "2026-08-14", type: "call", open_interest: 0, volume: 10, implied_volatility: .2, delta: .5, gamma: .01, nbbo_bid: 4, nbbo_ask: 4.2 },
      { strike: 600, expiry: "2026-08-14", type: "put", open_interest: 25, volume: null, implied_volatility: .22, delta: -.5, gamma: .01, nbbo_bid: 3.8, nbbo_ask: 4 },
    ]);
    if (path.includes("greek-exposure/strike")) return response([{ strike: 600, call_gex: 12, put_gex: -8, call_delta: 4, put_delta: -3 }]);
    if (path.includes("greek-exposure/expiry")) return response([{ expiry: "2026-08-14", call_gex: 12, put_gex: -8 }]);
    if (path.includes("gex-levels")) return response({ call_wall: 605, put_wall: 595, gamma_flip: 600, gamma_magnet: 602 });
    if (path.includes("ohlc")) return response([{ open: 599, high: 601, low: 598, close: 600, volume: 0, start_time: "2026-08-13T14:30:00Z" }]);
    if (path.includes("option-trades")) return response([{ executed_at: "2026-08-13T14:30:00Z", ticker: "SPY", strike: 600, expiry: "2026-08-14", option_type: "call", premium: 12000, size: 20, open_interest: 0, tags: ["sweep"] }]);
    if (path.includes("price-levels")) return response([{ price: 600, dark_pool_volume: 0, regular_volume: 30 }]);
    if (path.includes("darkpool")) return response([{ ticker: "SPY", price: 600, size: 0, premium: 0 }]);
    throw new Error(`Unexpected endpoint ${path}`);
  });
  return { provider, calls: () => calls };
}

test("UW SPY market read preserves native GEX signs, reported zero, and expiration OI rows", async () => {
  const fixture = client();
  const provider = new UnusualWhalesMarketProvider(fixture.provider);
  const read = await provider.getMarketRead({ symbol: "SPY", range: "0DTE" });
  assert.equal(read.provenance.mode, "delayed");
  assert.equal(read.snapshot.spot, 600);
  assert.equal(read.exposure?.rows[0].callGex, 12);
  assert.equal(read.exposure?.rows[0].putGex, -8);
  assert.equal(read.exposure?.rows[0].netGex, 4);
  assert.equal(read.exposure?.rows[0].callOpenInterest, 0);
  assert.equal(read.exposure?.rows[0].putVolume, null);
  assert.deepEqual(read.exposure?.expirations[0].rows[0], { strike: 600, callOpenInterest: 0, putOpenInterest: 25, callVolume: 10, putVolume: null });
  assert.deepEqual(read.exposure?.providerNativeGexByExpiration, [{ expiration: "2026-08-14", callGex: 12, putGex: -8 }]);
  assert.deepEqual(read.optionChain?.contracts[0], { contract: null, strike: 600, expiration: "2026-08-14", side: "call", bid: 4, ask: 4.2, lastPrice: null, openInterest: 0, volume: 10, impliedVolatility: .2, delta: .5, gamma: .01 });
  assert.equal(fixture.calls(), 5);
});

test("UW production adapter keeps non-SPY symbols explicitly unavailable", async () => {
  const fixture = client();
  const provider = new UnusualWhalesMarketProvider(fixture.provider);
  const read = await provider.getMarketRead({ symbol: "SPX", range: "0DTE" });
  assert.equal(read.provenance.mode, "unavailable");
  assert.match(read.provenance.note, /SPX spot/i);
  assert.equal(fixture.calls(), 0);
});

test("UW candles and raw flow retain provider-backed true zeros without implicit MarketData fallback", async () => {
  const fixture = client();
  const provider = new UnusualWhalesMarketProvider(fixture.provider);
  const candles = await provider.getCandles({ symbol: "SPY", frame: "1m" });
  assert.equal(candles.provider, "unusual-whales");
  assert.equal(candles.candles[0].volume, 0);
  const flow = await provider.getFlowRead({ symbol: "SPY" });
  assert.equal(flow.provider, "unusual-whales");
  assert.equal(flow.rows[0].openInterest, 0);
  assert.equal(flow.raw?.darkPoolPrints[0].size, 0);
  assert.equal(flow.raw?.darkPoolPriceLevels[0].darkPoolVolume, 0);
});

test("UW still requires explicit provider and verified capability gates", () => {
  assert.equal(resolveMarketProviderSelection({ UNUSUAL_WHALES_TOKEN: "token" }), "unavailable");
  assert.equal(resolveMarketProviderSelection({ UNUSUAL_WHALES_TOKEN: "token", RISK_STORY_MARKET_PROVIDER: "unusual-whales", RISK_STORY_UW_CAPABILITIES: "verified" }), "unusual-whales");
  assert.equal(getMarketProvider().name, "unavailable");
});
