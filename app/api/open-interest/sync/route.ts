import { NextResponse } from "next/server";
import { syncOpenInterest } from "../../../lib/open-interest/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return !secret || request.headers.get("authorization") === `Bearer ${secret}`;
}

async function synchronize(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const date = new URL(request.url).searchParams.get("date") || undefined;
    return NextResponse.json(await syncOpenInterest(date), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Open-interest sync failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return synchronize(request);
}

export async function POST(request: Request) {
  return synchronize(request);
}
