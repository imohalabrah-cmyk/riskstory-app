"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CandleRead, FlowRead, MarketRead } from "../../lib/market/types";
import type { OpenInterestDashboard } from "../../lib/open-interest/types";
import type { AppData } from "../types";

async function request<T>(path: string) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export function useRiskStoryData(symbol: string, range: string, frame: string) {
  const [data, setData] = useState<AppData>({ market: null, trinity: { SPX: null, SPY: null, QQQ: null }, candles: null, flow: null, openInterest: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef(data);
  const loadingOlderRef = useRef(false);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

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
      ...(["SPX", "SPY", "QQQ"] as const).map((trinitySymbol) => request<MarketRead>(`/api/market?${new URLSearchParams({ symbol: trinitySymbol, range })}`)),
    ]);
    const value = <T,>(index: number) => results[index].status === "fulfilled" ? results[index].value as T : null;
    setData({
      market: value<MarketRead>(0),
      candles: value<CandleRead>(1),
      flow: value<FlowRead>(2),
      openInterest: value<OpenInterestDashboard>(3),
      trinity: { SPX: value<MarketRead>(4), SPY: value<MarketRead>(5), QQQ: value<MarketRead>(6) },
    });
    const failed = results.filter((result) => result.status === "rejected");
    setError(failed.length ? "Some provider reads are unavailable." : null);
    setLoading(false);
  }, [frame, range, symbol]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  const loadOlderCandles = useCallback(async (before: number) => {
    const current = dataRef.current.candles;
    if (loadingOlderRef.current || !current?.candles.length || current.pagination?.hasMore === false) return;

    loadingOlderRef.current = true;
    try {
      const query = new URLSearchParams({ symbol, frame, before: String(before) });
      const older = await request<CandleRead>(`/api/candles?${query}`);
      if (older.provenance.mode === "unavailable" || !older.candles.length) {
        setData((existing) => existing.candles && existing.candles.symbol === symbol && existing.candles.frame === frame ? {
          ...existing,
          candles: { ...existing.candles, pagination: { hasMore: false, oldestTime: existing.candles.candles[0]?.time ?? null } },
        } : existing);
        return;
      }

      setData((existing) => {
        const active = existing.candles;
        if (!active || active.symbol !== symbol || active.frame !== frame) return existing;
        const knownTimes = new Set(active.candles.map((candle) => candle.time));
        const historical = older.candles.filter((candle) => !knownTimes.has(candle.time));
        if (!historical.length) {
          return {
            ...existing,
            candles: { ...active, pagination: { hasMore: false, oldestTime: active.candles[0]?.time ?? null } },
          };
        }
        const candles = [...historical, ...active.candles];
        return {
          ...existing,
          candles: {
            ...active,
            candles,
            pagination: {
              hasMore: older.pagination?.hasMore ?? true,
              oldestTime: candles[0]?.time ?? null,
            },
          },
        };
      });
    } finally {
      loadingOlderRef.current = false;
    }
  }, [frame, symbol]);

  return { data, loading, error, refresh, loadOlderCandles };
}
