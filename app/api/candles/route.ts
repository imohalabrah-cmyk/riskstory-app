import { NextResponse } from "next/server";
import { getMarketProvider } from "../../lib/market/provider";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") || "SPY").toUpperCase();
  const frame = url.searchParams.get("frame") || "10m";
  const beforeValue = Number(url.searchParams.get("before"));
  const before = Number.isFinite(beforeValue) && beforeValue > 0 ? beforeValue : undefined;
  const provider = getMarketProvider();

  return NextResponse.json(await provider.getCandles({ symbol, frame, before }), {
    headers: { "Cache-Control": "no-store" },
  });
}
