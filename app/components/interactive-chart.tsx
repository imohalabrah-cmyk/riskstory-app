"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { CandlestickData, IChartApi, IPriceLine, ISeriesApi, Time } from "lightweight-charts";
import type { Candle, MarketRead } from "../lib/market/types";

type Props = {
  candles: Candle[];
  market: MarketRead;
  drawMode: boolean;
  drawings: number[];
  onAddDrawing: (price: number) => void;
};

type CandleSeries = ISeriesApi<"Candlestick">;

function chartCandles(candles: Candle[]): CandlestickData<Time>[] {
  return candles.map((candle) => ({ ...candle, time: candle.time as Time }));
}

export function InteractiveChart({ candles, market, drawMode, drawings, onAddDrawing }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<CandleSeries | null>(null);
  const levelLinesRef = useRef<IPriceLine[]>([]);
  const drawingLinesRef = useRef<IPriceLine[]>([]);
  const drawModeRef = useRef(drawMode);
  const onAddDrawingRef = useRef(onAddDrawing);
  const latestCandlesRef = useRef(candles);
  const latestMarketRef = useRef(market);
  const latestDrawingsRef = useRef(drawings);

  const clearLines = useCallback((lines: MutableRefObject<IPriceLine[]>) => {
    const series = seriesRef.current;
    if (!series) return;
    lines.current.forEach((line) => series.removePriceLine(line));
    lines.current = [];
  }, []);

  const syncCandles = useCallback((nextCandles: Candle[]) => {
    seriesRef.current?.setData(chartCandles(nextCandles));
  }, []);

  const syncLevels = useCallback((nextMarket: MarketRead) => {
    const series = seriesRef.current;
    if (!series) return;
    clearLines(levelLinesRef);
    const levels = [
      [nextMarket.snapshot.callWall, "Call wall", "#20d7ff"],
      [nextMarket.snapshot.zeroGamma, "Zero gamma", "#e6e12b"],
      [nextMarket.snapshot.spot, "Spot", "#b5c0d2"],
      [nextMarket.snapshot.putWall, "Put wall", "#ff456b"],
    ] as const;
    levelLinesRef.current = levels
      .filter(([value]) => Number.isFinite(value) && value > 0)
      .map(([price, title, color]) => series.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title }));
  }, [clearLines]);

  const syncDrawings = useCallback((nextDrawings: number[]) => {
    const series = seriesRef.current;
    if (!series) return;
    clearLines(drawingLinesRef);
    drawingLinesRef.current = nextDrawings.map((price) => series.createPriceLine({ price, color: "#18c8e8", lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: "User level" }));
  }, [clearLines]);

  useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);
  useEffect(() => { onAddDrawingRef.current = onAddDrawing; }, [onAddDrawing]);
  useEffect(() => {
    latestCandlesRef.current = candles;
    syncCandles(candles);
  }, [candles, syncCandles]);
  useEffect(() => {
    latestMarketRef.current = market;
    syncLevels(market);
  }, [market, syncLevels]);
  useEffect(() => {
    latestDrawingsRef.current = drawings;
    syncDrawings(drawings);
  }, [drawings, syncDrawings]);

  useEffect(() => {
    const container = mount.current;
    if (!container) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;

    void import("lightweight-charts").then(({ createChart, CrosshairMode }) => {
      if (disposed || chartRef.current) return;
      const chart = createChart(container, {
        width: container.clientWidth,
        height: 470,
        layout: { background: { color: "#09111e" }, textColor: "#9eb1ca" },
        grid: { vertLines: { color: "rgba(154,181,223,.10)" }, horzLines: { color: "rgba(154,181,223,.10)" } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: "rgba(154,181,223,.18)" },
        timeScale: { borderColor: "rgba(154,181,223,.18)", timeVisible: true, secondsVisible: false },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      });
      const series = chart.addCandlestickSeries({
        upColor: "#20e27b", downColor: "#ff456b", borderUpColor: "#20e27b", borderDownColor: "#ff456b", wickUpColor: "#20e27b", wickDownColor: "#ff456b",
      });
      chartRef.current = chart;
      seriesRef.current = series;
      syncCandles(latestCandlesRef.current);
      syncLevels(latestMarketRef.current);
      syncDrawings(latestDrawingsRef.current);
      chart.timeScale().fitContent();
      chart.subscribeClick((param) => {
        if (!drawModeRef.current || !param.point) return;
        const price = series.coordinateToPrice(param.point.y);
        if (price !== null && Number.isFinite(price)) onAddDrawingRef.current(Number(price));
      });
      observer = new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth }));
      observer.observe(container);
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      levelLinesRef.current = [];
      drawingLinesRef.current = [];
    };
  }, [syncCandles, syncDrawings, syncLevels]);

  return <div ref={mount} className={drawMode ? "interactiveChart drawMode" : "interactiveChart"} aria-label={`${market.symbol} interactive price chart`} />;
}
