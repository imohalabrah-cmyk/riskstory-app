import { NextResponse } from "next/server";
import { deactivateTrackedSymbol, listTrackedSymbols, upsertTrackedSymbol } from "../../../lib/open-interest/store";
import type { TrackedSymbol } from "../../../lib/open-interest/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ symbols: listTrackedSymbols() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json() as Partial<TrackedSymbol>;
  const symbol = String(body.symbol || "").trim().toUpperCase();
  const assetType = body.assetType || "stock";
  if (!/^[A-Z0-9.]{1,12}$/.test(symbol) || !["index", "etf", "stock"].includes(assetType)) {
    return NextResponse.json({ error: "Invalid symbol or asset type" }, { status: 400 });
  }
  const occQueryType = body.occQueryType === "U" ? "U" : "O";
  upsertTrackedSymbol({
    symbol,
    displayName: String(body.displayName || symbol),
    assetType,
    active: body.active !== false,
    sortOrder: Number(body.sortOrder || 100),
    occQueryType,
    occQuerySymbol: String(body.occQuerySymbol || symbol).trim().toUpperCase(),
    occProductSymbol: String(body.occProductSymbol || symbol).trim().toUpperCase(),
  });
  return NextResponse.json({ symbols: listTrackedSymbols() });
}

export async function DELETE(request: Request) {
  const symbol = String(new URL(request.url).searchParams.get("symbol") || "").trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  deactivateTrackedSymbol(symbol);
  return NextResponse.json({ symbols: listTrackedSymbols() });
}
