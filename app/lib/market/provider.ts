import { marketDataProvider } from "./marketdata-provider";
import { unavailableProvider } from "./unavailable-provider";
import { UnusualWhalesProvider } from "./unusual-whales-provider";

export type MarketProviderSelection = "marketdata" | "unusual-whales" | "unavailable";

type ServerEnvironment = Record<string, string | undefined>;

/**
 * UW is intentionally not selected by its token alone. Capability and
 * semantics verification must be recorded server-side before a later phase
 * can attach it to the live MarketDataProvider boundary.
 */
export function resolveMarketProviderSelection(environment: ServerEnvironment = process.env): MarketProviderSelection {
  if (
    environment.RISK_STORY_MARKET_PROVIDER === "unusual-whales"
    && environment.RISK_STORY_UW_CAPABILITIES === "verified"
    && environment.UNUSUAL_WHALES_TOKEN
  ) return "unusual-whales";
  return environment.MARKETDATA_TOKEN ? "marketdata" : "unavailable";
}

export function getMarketProvider() {
  // UW remains dormant in Phase 16C. This explicit branch makes the future
  // activation gate observable without changing today's production provider.
  return resolveMarketProviderSelection() === "marketdata" ? marketDataProvider : unavailableProvider;
}

/** Server-only factory for an explicit future UW capability probe/integration. */
export function getUnusualWhalesProvider(environment: ServerEnvironment = process.env) {
  const token = environment.UNUSUAL_WHALES_TOKEN;
  return token ? new UnusualWhalesProvider(token) : null;
}
