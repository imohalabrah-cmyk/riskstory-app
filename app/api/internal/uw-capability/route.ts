import { NextResponse } from "next/server";
import { getUnusualWhalesCapabilityProbeResponse, isUnusualWhalesCapabilityProbeEnabled } from "../../../lib/market/unusual-whales-capability-endpoint";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isUnusualWhalesCapabilityProbeEnabled()) {
    return NextResponse.json({ status: "disabled" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const mode = new URL(request.url).searchParams.get("mode") === "closure" ? "closure" : "full";
  return NextResponse.json(await getUnusualWhalesCapabilityProbeResponse(process.env, fetch, mode), {
    headers: { "Cache-Control": "no-store" },
  });
}
