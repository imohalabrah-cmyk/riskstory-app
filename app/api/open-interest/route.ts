import { NextResponse } from "next/server";
import { readOpenInterestDashboard } from "../../lib/open-interest/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") || undefined;
  try {
    return NextResponse.json(await readOpenInterestDashboard(date), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Open-interest storage is unavailable",
      summaries: [],
      availableDates: [],
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
