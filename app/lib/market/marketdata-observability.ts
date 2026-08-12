export type MarketDataRequestStage = "option-chain" | "expirations" | "quote" | "candles" | "unknown";

type SafeRateLimitHeaders = Record<string, string>;

const SAFE_RATE_LIMIT_HEADERS = [
  "ratelimit-limit",
  "ratelimit-remaining",
  "ratelimit-reset",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "x-rate-limit-limit",
  "x-rate-limit-remaining",
  "x-rate-limit-reset",
] as const;

function compactMessage(value: unknown) {
  return String(value || "MarketData request failed")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/MARKETDATA_TOKEN\s*=\s*[^\s]+/gi, "MARKETDATA_TOKEN=[REDACTED]")
    .slice(0, 320);
}

function safeRateLimitHeaders(headers: Headers): SafeRateLimitHeaders {
  return SAFE_RATE_LIMIT_HEADERS.reduce<SafeRateLimitHeaders>((result, key) => {
    const value = headers.get(key);
    if (value) result[key] = value;
    return result;
  }, {});
}

export class MarketDataUpstreamError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly stage: MarketDataRequestStage;
  readonly rateLimitHeaders: SafeRateLimitHeaders;

  constructor(options: {
    status?: number | null;
    code?: unknown;
    message?: unknown;
    stage: MarketDataRequestStage;
    headers?: Headers;
  }) {
    super(compactMessage(options.message));
    this.name = "MarketDataUpstreamError";
    this.status = options.status ?? null;
    this.code = options.code ? compactMessage(options.code) : null;
    this.stage = options.stage;
    this.rateLimitHeaders = options.headers ? safeRateLimitHeaders(options.headers) : {};
  }
}

export function stageForMarketDataPath(path: string): MarketDataRequestStage {
  if (path.startsWith("/options/chain/")) return "option-chain";
  if (path.startsWith("/options/expirations/")) return "expirations";
  if (path.startsWith("/stocks/quotes/")) return "quote";
  if (path.startsWith("/stocks/candles/")) return "candles";
  return "unknown";
}

export function logMarketDataFailure(symbol: string, error: unknown) {
  const diagnostic = error instanceof MarketDataUpstreamError
    ? {
        provider: "marketdata",
        symbol,
        stage: error.stage,
        upstreamStatus: error.status,
        providerCode: error.code,
        message: error.message,
        rateLimit: error.rateLimitHeaders,
      }
    : {
        provider: "marketdata",
        symbol,
        stage: "unknown",
        upstreamStatus: null,
        providerCode: null,
        message: compactMessage(error instanceof Error ? error.message : error),
        rateLimit: {},
      };

  // This intentionally contains no request URL or request headers.
  console.error("[marketdata-provider]", JSON.stringify(diagnostic));
}
