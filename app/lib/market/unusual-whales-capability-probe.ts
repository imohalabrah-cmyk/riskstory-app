import { UnusualWhalesClient, UnusualWhalesUpstreamError } from "./unusual-whales-provider";
import type { UnusualWhalesCapability, UnusualWhalesCapabilityResult, UnusualWhalesGreekExposure, UnusualWhalesOptionContract } from "./unusual-whales-types";

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

export type UnusualWhalesClosureResult = Omit<UnusualWhalesCapabilitySummary, "capability"> & {
  capability: UnusualWhalesCapability | "spxw-stock-state" | "spxw-option-chain" | "spy-option-chain-detailed" | "spy-gex-native-sample";
  fieldPresence?: Record<string, boolean>;
  gexSamples?: Array<Pick<UnusualWhalesGreekExposure, "strike" | "callGex" | "putGex">>;
};

const CHAIN_FIELDS = ["bid", "ask", "impliedVolatility", "delta", "gamma", "openInterest", "volume", "strike", "expiry", "side"] as const;

function chainFieldPresence(rows: UnusualWhalesOptionContract[]) {
  return Object.fromEntries(CHAIN_FIELDS.map((field) => [field, rows.some((row) => row[field] !== null)])) as Record<(typeof CHAIN_FIELDS)[number], boolean>;
}

function closureFailure(capability: string, endpoint: string, error: unknown): UnusualWhalesClosureResult {
  const upstream = error instanceof UnusualWhalesUpstreamError ? error : null;
  return {
    capability: capability as UnusualWhalesClosureResult["capability"],
    status: "unavailable",
    endpoint,
    upstreamStatus: upstream?.status ?? null,
    code: upstream?.code ?? null,
    message: upstream?.message ?? "Unusual Whales capability request failed",
    availableFields: [],
  };
}

async function closureStep<T>(
  client: UnusualWhalesClient,
  capability: string,
  endpoint: string,
  run: () => Promise<T>,
  summarize: (value: T) => Pick<UnusualWhalesClosureResult, "availableFields" | "fieldPresence" | "gexSamples">,
) {
  try {
    const value = await run();
    return {
      capability: capability as UnusualWhalesClosureResult["capability"],
      status: "available" as const,
      endpoint,
      upstreamStatus: client.lastUpstreamStatus,
      code: null,
      message: null,
      ...summarize(value),
    } satisfies UnusualWhalesClosureResult;
  } catch (error) {
    return closureFailure(capability, endpoint, error);
  }
}

/**
 * A one-time follow-up for the Phase 16F gaps. It deliberately avoids every
 * already-verified feed and makes exactly four sequential provider requests.
 */
export async function runUnusualWhalesClosureProbe(client: UnusualWhalesClient) {
  const results: UnusualWhalesClosureResult[] = [];
  const steps = [
    () => closureStep(client, "spxw-stock-state", "/stock/SPXW/stock-state", () => client.stockState("SPXW"), (value) => ({ availableFields: availableFields(value) })),
    () => closureStep(client, "spxw-option-chain", "/stock/SPXW/option-chains?greeks=true", () => client.optionChain("SPXW"), (value) => ({ availableFields: availableFields(value), fieldPresence: chainFieldPresence(value) })),
    () => closureStep(client, "spy-option-chain-detailed", "/stock/SPY/option-chains?greeks=true", () => client.optionChain("SPY"), (value) => ({ availableFields: availableFields(value), fieldPresence: chainFieldPresence(value) })),
    () => closureStep(client, "spy-gex-native-sample", "/stock/SPY/greek-exposure/strike", () => client.greekExposureByStrike("SPY"), (value) => ({
      availableFields: availableFields(value),
      gexSamples: value
        .filter((row) => row.strike !== null && (row.callGex !== null || row.putGex !== null))
        .slice(0, 3)
        .map(({ strike, callGex, putGex }) => ({ strike, callGex, putGex })),
    })),
  ];

  for (const step of steps) {
    const result = await step();
    results.push(result);
    if (result.upstreamStatus === 401 || result.upstreamStatus === 403) break;
  }
  return results;
}
