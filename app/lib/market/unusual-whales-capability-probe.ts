import { UnusualWhalesClient, UnusualWhalesUpstreamError } from "./unusual-whales-provider";
import type { UnusualWhalesCapability, UnusualWhalesCapabilityResult } from "./unusual-whales-types";

type ProbeStep = { capability: UnusualWhalesCapability; endpoint: string; run: () => Promise<unknown> };

export type UnusualWhalesCapabilitySummary = UnusualWhalesCapabilityResult & {
  availableFields: string[];
};

type ProbeOptions = {
  stopOnAuthenticationFailure?: boolean;
  includeAvailableFields?: boolean;
};

function availableFields(payload: unknown) {
  const value = Array.isArray(payload)
    ? payload.find((row) => row && typeof row === "object" && !Array.isArray(row))
    : payload;

  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  return Object.entries(value as Record<string, unknown>)
    .filter(([, fieldValue]) => fieldValue !== null && fieldValue !== undefined)
    .map(([field]) => field)
    .sort();
}

export function unusualWhalesProbePlan(client: UnusualWhalesClient): ProbeStep[] {
  // The chain response is the OI capability probe. No redundant OI endpoint is called.
  return [
    { capability: "stock-state", endpoint: "/stock/SPY/stock-state", run: () => client.stockState("SPY") },
    { capability: "candles", endpoint: "/stock/SPY/ohlc/1m?limit=1", run: () => client.candles("SPY", "1m", 1) },
    { capability: "option-chain", endpoint: "/stock/SPY/option-chains?greeks=true", run: () => client.optionChain("SPY") },
    { capability: "gex-by-strike", endpoint: "/stock/SPY/greek-exposure/strike", run: () => client.greekExposureByStrike("SPY") },
    { capability: "gex-by-expiry", endpoint: "/stock/SPY/greek-exposure/expiry", run: () => client.greekExposureByExpiry("SPY") },
    { capability: "gex-levels", endpoint: "/stock/SPY/gex-levels", run: () => client.gexLevels("SPY") },
    { capability: "options-flow", endpoint: "/option-trades?ticker_symbol=SPY&limit=1", run: () => client.optionTrades("SPY", 1) },
    { capability: "dark-pool", endpoint: "/darkpool/SPY?limit=1", run: () => client.darkPoolTrades("SPY", 1) },
    // This is deliberately a direct SPX probe. It does not assume SPXW is an alias.
    { capability: "spx-normalization", endpoint: "/stock/SPX/stock-state", run: () => client.stockState("SPX") },
    { capability: "qqq-stock-state", endpoint: "/stock/QQQ/stock-state", run: () => client.stockState("QQQ") },
  ];
}

export async function runUnusualWhalesCapabilityProbe(
  client: UnusualWhalesClient,
  options: ProbeOptions = {},
): Promise<UnusualWhalesCapabilityResult[] | UnusualWhalesCapabilitySummary[]> {
  const results: (UnusualWhalesCapabilityResult | UnusualWhalesCapabilitySummary)[] = [];
  for (const step of unusualWhalesProbePlan(client)) {
    try {
      const payload = await step.run();
      const result = { capability: step.capability, status: "available" as const, endpoint: step.endpoint, upstreamStatus: null, code: null, message: null };
      results.push(options.includeAvailableFields ? { ...result, availableFields: availableFields(payload) } : result);
    } catch (error) {
      const upstream = error instanceof UnusualWhalesUpstreamError ? error : null;
      const result = {
        capability: step.capability,
        status: "unavailable" as const,
        endpoint: step.endpoint,
        upstreamStatus: upstream?.status ?? null,
        code: upstream?.code ?? null,
        message: upstream?.message ?? "Unusual Whales capability request failed",
      };
      results.push(options.includeAvailableFields ? { ...result, availableFields: [] } : result);

      if (options.stopOnAuthenticationFailure && (upstream?.status === 401 || upstream?.status === 403)) break;
    }
  }
  return results as UnusualWhalesCapabilityResult[] | UnusualWhalesCapabilitySummary[];
}

export async function runUnusualWhalesCapabilitySummary(client: UnusualWhalesClient) {
  return runUnusualWhalesCapabilityProbe(client, {
    stopOnAuthenticationFailure: true,
    includeAvailableFields: true,
  }) as Promise<UnusualWhalesCapabilitySummary[]>;
}
