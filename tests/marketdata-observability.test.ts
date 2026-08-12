import assert from "node:assert/strict";
import test from "node:test";
import { logMarketDataFailure, MarketDataUpstreamError } from "../app/lib/market/marketdata-observability";
import { requestMarketDataJson, type MarketDataFetch } from "../app/lib/market/marketdata-provider";

const originalToken = process.env.MARKETDATA_TOKEN;

function mockResponse(status: number, body: Record<string, unknown>, headers?: Record<string, string>) {
  return async () => new Response(JSON.stringify(body), { status, headers });
}

test("MarketData request diagnostics retain safe 401 entitlement details without a token", async () => {
  process.env.MARKETDATA_TOKEN = "test-token-never-log";
  await assert.rejects(
    requestMarketDataJson("/options/chain/SPY/?dte=0&strikeLimit=20", mockResponse(401, { code: "unauthorized", errmsg: "Invalid API key" }) as MarketDataFetch),
    (error: unknown) => error instanceof MarketDataUpstreamError
      && error.status === 401
      && error.stage === "option-chain"
      && error.code === "unauthorized"
      && !error.message.includes("test-token-never-log"),
  );
});

test("MarketData request diagnostics retain safe 429 rate-limit headers", async () => {
  process.env.MARKETDATA_TOKEN = "test-token-never-log";
  await assert.rejects(
    requestMarketDataJson("/stocks/quotes/SPY/", mockResponse(429, { code: "rate_limited", errmsg: "Daily credit limit reached" }, { "x-ratelimit-remaining": "0" }) as MarketDataFetch),
    (error: unknown) => error instanceof MarketDataUpstreamError
      && error.status === 429
      && error.stage === "quote"
      && error.rateLimitHeaders["x-ratelimit-remaining"] === "0",
  );
});

test("MarketData request diagnostics preserve generic upstream failures and successful reads", async () => {
  process.env.MARKETDATA_TOKEN = "test-token-never-log";
  await assert.rejects(
    requestMarketDataJson("/stocks/candles/10/SPY/?countback=2", mockResponse(503, { errmsg: "Service unavailable" }) as MarketDataFetch),
    (error: unknown) => error instanceof MarketDataUpstreamError && error.status === 503 && error.stage === "candles",
  );
  const data = await requestMarketDataJson("/stocks/quotes/SPY/", mockResponse(200, { s: "ok", last: [630] }) as MarketDataFetch);
  assert.deepEqual(data, { s: "ok", last: [630] });
});

test("server diagnostic log redacts tokens and authorization text", () => {
  const messages: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => messages.push(args.join(" "));
  try {
    logMarketDataFailure("SPY", new MarketDataUpstreamError({
      stage: "quote",
      status: 401,
      message: "Bearer secret-token MARKETDATA_TOKEN=another-secret",
    }));
  } finally {
    console.error = originalError;
  }
  assert.equal(messages.length, 1);
  assert.match(messages[0], /\[REDACTED\]/);
  assert.doesNotMatch(messages[0], /secret-token|another-secret/);
});

test.after(() => {
  if (originalToken === undefined) delete process.env.MARKETDATA_TOKEN;
  else process.env.MARKETDATA_TOKEN = originalToken;
});
