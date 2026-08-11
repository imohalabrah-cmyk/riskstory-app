"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CandleRead, FlowRead, MarketRead } from "../../lib/market/types";
import { planTrinityReads, TRINITY_SYMBOLS } from "../../lib/market/trinity-read-plan";
import type { AppData } from "../types";

const CANDLE_POLL_INTERVAL_MS = 15 * 60 * 1000;
const POST_CANDLE_POLL_GRACE_MS = 30 * 60 * 1000;

async function request<T>(path: string) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

function sameCandleContext(current: CandleRead | null, symbol: string, frame: string) {
  return current?.symbol === symbol && current.frame === frame;
}

function sameMarketContext(current: MarketRead | null, symbol: string, range: string) {
  return current?.symbol === symbol.toUpperCase() && current.range === range;
}

function isAvailable(read: CandleRead | null): read is CandleRead {
  return Boolean(read && read.provenance.mode !== "unavailable" && read.candles.length);
}

function mergeLatestCandles(current: CandleRead, latest: CandleRead): CandleRead {
  const candlesByTime = new Map(current.candles.map((candle) => [candle.time, candle]));
  latest.candles.forEach((candle) => candlesByTime.set(candle.time, candle));
  return {
    ...latest,
    candles: [...candlesByTime.values()].sort((a, b) => a.time - b.time),
    pagination: current.pagination,
  };
}

function reconnectingRead(current: CandleRead): CandleRead {
  return {
    ...current,
    connection: {
      state: current.connection?.state === "stale" ? "stale" : "reconnecting",
      lastSuccessfulAt: current.connection?.lastSuccessfulAt ?? current.updatedAt,
      pollIntervalSeconds: CANDLE_POLL_INTERVAL_MS / 1000,
    },
  };
}

function frameWindowMs(frame: string) {
  switch (frame.toLowerCase()) {
    case "1m": return 60_000;
    case "5m": return 5 * 60_000;
    case "10m": return 10 * 60_000;
    case "15m": return 15 * 60_000;
    case "1h": return 60 * 60_000;
    case "1d": return 24 * 60 * 60_000;
    default: return null;
  }
}

function canPoll(read: CandleRead | null) {
  if (!isAvailable(read) || read.provider !== "marketdata" || read.connection?.state === "unavailable") return false;
  const asOf = read.provenance.asOf ? new Date(read.provenance.asOf).getTime() : Number.NaN;
  const windowMs = frameWindowMs(read.frame);
  if (!Number.isFinite(asOf) || !windowMs) return false;
  return Date.now() <= asOf + windowMs + POST_CANDLE_POLL_GRACE_MS;
}

export function useRiskStoryData(symbol: string, range: string, frame: string, trinityRequested = false) {
  const [data, setData] = useState<AppData>({ market: null, trinity: { SPX: null, SPY: null, QQQ: null }, candles: null, flow: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef(data);
  const loadingOlderRef = useRef(false);
  const pollingRef = useRef(false);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ symbol, range });
    const candleQuery = new URLSearchParams({ symbol, frame });
    const marketRead = request<MarketRead>(`/api/market?${query}`);
    const results = await Promise.allSettled([
      marketRead,
      request<CandleRead>(`/api/candles?${candleQuery}`),
      request<FlowRead>(`/api/flow?${query}`),
    ]);
    const value = <T,>(index: number) => results[index].status === "fulfilled" ? results[index].value as T : null;
    const incomingCandles = value<CandleRead>(1);

    setData((current) => ({
      market: value<MarketRead>(0),
      candles: !isAvailable(incomingCandles) && sameCandleContext(current.candles, symbol, frame)
        ? reconnectingRead(current.candles!)
        : incomingCandles,
      flow: value<FlowRead>(2),
      trinity: current.trinity,
    }));

    const failed = results.filter((result) => result.status === "rejected");
    setError(failed.length ? "Some provider reads are unavailable." : null);
    setLoading(false);
  }, [frame, range, symbol]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  const loadTrinity = useCallback(async () => {
    const currentMarket = dataRef.current.market;
    const selectedRead = sameMarketContext(currentMarket, symbol, range)
      ? Promise.resolve(currentMarket)
      : request<MarketRead>(`/api/market?${new URLSearchParams({ symbol, range })}`);
    const plan = planTrinityReads(symbol, true);
    const reads = await Promise.allSettled(plan.map(({ symbol: trinitySymbol, reuseSelectedRead }) => reuseSelectedRead
      ? selectedRead
      : request<MarketRead>(`/api/market?${new URLSearchParams({ symbol: trinitySymbol, range })}`)));
    const readFor = (trinitySymbol: typeof TRINITY_SYMBOLS[number]) => {
      const index = plan.findIndex((item) => item.symbol === trinitySymbol);
      const result = reads[index];
      return result?.status === "fulfilled" ? result.value : null;
    };

    setData((current) => ({
      ...current,
      trinity: { SPX: readFor("SPX"), SPY: readFor("SPY"), QQQ: readFor("QQQ") },
    }));
  }, [range, symbol]);

  useEffect(() => {
    if (!trinityRequested) return;
    void loadTrinity();
  }, [loadTrinity, trinityRequested]);

  const refreshLatestCandles = useCallback(async () => {
    if (pollingRef.current) return;
    const current = dataRef.current.candles;
    if (!sameCandleContext(current, symbol, frame) || !canPoll(current)) return;

    pollingRef.current = true;
    try {
      const query = new URLSearchParams({ symbol, frame, latest: "1" });
      const latest = await request<CandleRead>(`/api/candles?${query}`);
      setData((existing) => {
        const active = existing.candles;
        if (!sameCandleContext(active, symbol, frame)) return existing;
        return isAvailable(latest)
          ? { ...existing, candles: mergeLatestCandles(active!, latest) }
          : { ...existing, candles: reconnectingRead(active!) };
      });
    } catch {
      setData((existing) => sameCandleContext(existing.candles, symbol, frame) && existing.candles
        ? { ...existing, candles: reconnectingRead(existing.candles) }
        : existing);
    } finally {
      pollingRef.current = false;
    }
  }, [frame, symbol]);

  const pollingEligible = canPoll(data.candles);
  useEffect(() => {
    if (!pollingEligible) return;
    const refreshOnVisibility = () => {
      if (document.visibilityState === "visible") void refreshLatestCandles();
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshLatestCandles();
    }, CANDLE_POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshOnVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [pollingEligible, refreshLatestCandles]);

  const loadOlderCandles = useCallback(async (before: number) => {
    const current = dataRef.current.candles;
    if (loadingOlderRef.current || !current?.candles.length || current.pagination?.hasMore === false) return;

    loadingOlderRef.current = true;
    try {
      const query = new URLSearchParams({ symbol, frame, before: String(before) });
      const older = await request<CandleRead>(`/api/candles?${query}`);
      if (older.provenance.mode === "unavailable" || !older.candles.length) {
        setData((existing) => sameCandleContext(existing.candles, symbol, frame) ? {
          ...existing,
          candles: { ...existing.candles!, pagination: { hasMore: false, oldestTime: existing.candles!.candles[0]?.time ?? null } },
        } : existing);
        return;
      }

      setData((existing) => {
        const active = existing.candles;
        if (!sameCandleContext(active, symbol, frame)) return existing;
        const knownTimes = new Set(active!.candles.map((candle) => candle.time));
        const historical = older.candles.filter((candle) => !knownTimes.has(candle.time));
        if (!historical.length) {
          return {
            ...existing,
            candles: { ...active!, pagination: { hasMore: false, oldestTime: active!.candles[0]?.time ?? null } },
          };
        }
        const candles = [...historical, ...active!.candles].sort((left, right) => left.time - right.time);
        return {
          ...existing,
          candles: {
            ...active!,
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
