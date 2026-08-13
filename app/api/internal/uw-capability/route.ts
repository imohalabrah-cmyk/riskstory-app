import { NextResponse } from "next/server";
import { getUnusualWhalesCapabilityProbeResponse, isUnusualWhalesCapabilityProbeEnabled } from "../../../lib/market/unusual-whales-capability-endpoint";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isUnusualWhalesCapabilityProbeEnabled()) {
    return NextResponse.json({ status: "disabled" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(await getUnusualWhalesCapabilityProbeResponse(), {
    headers: { "Cache-Control": "no-store" },
  });
}
