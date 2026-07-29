import { NextResponse } from 'next/server';
import { getMarketProvider } from '../../lib/market/provider';

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get('symbol') || 'SPY').toUpperCase();
  const range = url.searchParams.get('range') || '0DTE';
  const provider = getMarketProvider();
  return NextResponse.json(await provider.getMarketRead({ symbol, range }), {
    headers: { "Cache-Control": "no-store" },
  });
}
