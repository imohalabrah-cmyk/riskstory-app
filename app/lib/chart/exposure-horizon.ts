import type { ExposureProfile, MarketRead } from "../market/types";

export type ExposureHorizon = {
  kind: "short-dated-focus" | "multi-expiration-context" | "single-expiration-context" | "current-snapshot";
  label: string;
  detail: string;
};

const INDEX_AND_ETF_SYMBOLS = new Set(["SPX", "SPY", "QQQ"]);

/**
 * Presentation metadata only. It describes the scope of the current provider
 * snapshot and deliberately makes no claim about historical persistence.
 */
export function describeExposureHorizon(market: Pick<MarketRead, "symbol" | "range"> & { exposure?: Pick<ExposureProfile, "expirations"> }): ExposureHorizon {
  const expirationCount = market.exposure?.expirations.length ?? 0;
  if (INDEX_AND_ETF_SYMBOLS.has(market.symbol.toUpperCase())) {
    return {
      kind: "short-dated-focus",
      label: "Short-dated focus",
      detail: `${market.range} index/ETF snapshot; no historical persistence is inferred.`,
    };
  }
  if (expirationCount > 1) {
    return {
      kind: "multi-expiration-context",
      label: "Multi-expiration context",
      detail: `${expirationCount} provider-returned expirations in the current snapshot; not a historical persistence measure.`,
    };
  }
  if (expirationCount === 1) {
    return {
      kind: "single-expiration-context",
      label: "Single-expiration context",
      detail: "One provider-returned expiration in the current snapshot; not a historical persistence measure.",
    };
  }
  return {
    kind: "current-snapshot",
    label: "Current snapshot",
    detail: "No expiration horizon is available in this provider read.",
  };
}
