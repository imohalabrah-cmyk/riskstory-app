import { NextResponse } from "next/server";
import { readOpenInterestDashboard } from "../../lib/open-interest/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") || undefined;
  return NextResponse.json(readOpenInterestDashboard(date), { headers: { "Cache-Control": "no-store" } });
}
