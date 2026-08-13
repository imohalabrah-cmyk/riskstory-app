import { runUnusualWhalesCapabilitySummary, type UnusualWhalesCapabilitySummary } from "./unusual-whales-capability-probe";
import { UnusualWhalesProvider, type UnusualWhalesFetch } from "./unusual-whales-provider";

type ServerEnvironment = Record<string, string | undefined>;

export type UnusualWhalesCapabilityProbeResponse = {
  status: "disabled" | "token-missing" | "completed";
  authentication: "not-attempted" | "pass" | "fail";
  results: UnusualWhalesCapabilitySummary[];
};

export function isUnusualWhalesCapabilityProbeEnabled(environment: ServerEnvironment = process.env) {
  return environment.UW_CAPABILITY_PROBE_ENABLED === "true";
}

export async function getUnusualWhalesCapabilityProbeResponse(
  environment: ServerEnvironment = process.env,
  request: UnusualWhalesFetch = fetch,
): Promise<UnusualWhalesCapabilityProbeResponse> {
  if (!isUnusualWhalesCapabilityProbeEnabled(environment)) {
    return { status: "disabled", authentication: "not-attempted", results: [] };
  }

  const token = environment.UNUSUAL_WHALES_TOKEN;
  if (!token) {
    return { status: "token-missing", authentication: "not-attempted", results: [] };
  }

  const results = await runUnusualWhalesCapabilitySummary(new UnusualWhalesProvider(token, request));
  const first = results[0];
  const authentication = first?.status === "available" ? "pass" : "fail";
  return { status: "completed", authentication, results };
}
