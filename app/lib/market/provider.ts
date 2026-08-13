import { marketDataProvider } from "./marketdata-provider";
import { unavailableProvider } from "./unavailable-provider";
import { UnusualWhalesProvider } from "./unusual-whales-provider";
import { UnusualWhalesMarketProvider } from "./unusual-whales-market-provider";

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
  const selection = resolveMarketProviderSelection();
  if (selection === "marketdata") return marketDataProvider;
  if (selection === "unusual-whales") {
    const provider = getUnusualWhalesProvider();
    return provider ? new UnusualWhalesMarketProvider(provider) : unavailableProvider;
  }
  return unavailableProvider;
}

/** Server-only factory for an explicit future UW capability probe/integration. */
export function getUnusualWhalesProvider(environment: ServerEnvironment = process.env) {
  const token = environment.UNUSUAL_WHALES_TOKEN;
  return token ? new UnusualWhalesProvider(token) : null;
}
