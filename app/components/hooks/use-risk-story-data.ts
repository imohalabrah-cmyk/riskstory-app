"use client";

import { useCallback, useEffect, useState } from "react";
import type { CandleRead, FlowRead, MarketRead } from "../../lib/market/types";
import type { OpenInterestDashboard } from "../../lib/open-interest/types";
import type { AppData } from "../types";

async function request<T>(path: string) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export function useRiskStoryData(symbol: string, range: string, frame: string) {
  const [data, setData] = useState<AppData>({ market: null, candles: null, flow: null, openInterest: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ symbol, range });
    const candleQuery = new URLSearchParams({ symbol, frame });
    const results = await Promise.allSettled([
      request<MarketRead>(`/api/market?${query}`),
      request<CandleRead>(`/api/candles?${candleQuery}`),
      request<FlowRead>(`/api/flow?${query}`),
      request<OpenInterestDashboard>("/api/open-interest"),
    ]);
    const value = <T,>(index: number) => results[index].status === "fulfilled" ? results[index].value as T : null;
    setData({ market: value<MarketRead>(0), candles: value<CandleRead>(1), flow: value<FlowRead>(2), openInterest: value<OpenInterestDashboard>(3) });
    const failed = results.filter((result) => result.status === "rejected");
    setError(failed.length ? "Some provider reads are unavailable." : null);
    setLoading(false);
  }, [frame, range, symbol]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);
  return { data, loading, error, refresh };
}
