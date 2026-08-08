"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { CandlestickData, HistogramData, IChartApi, IPriceLine, ISeriesApi, Time } from "lightweight-charts";
import type { Candle, ExposureStrike, MarketRead } from "../lib/market/types";
import { CHART_COLORS } from "./chart-tokens";

type GexMode = "off" | "bubbles" | "levels" | "both";

type Props = {
  candles: Candle[];
  hasMoreCandles: boolean;
  onLoadOlderCandles?: (before: number) => Promise<void>;
  market: MarketRead;
  drawMode: boolean;
  drawings: number[];
  onAddDrawing: (price: number) => void;
  gexMode: GexMode;
  showLevels: boolean;
  showVolume: boolean;
  showGrid: boolean;
  showCrosshair: boolean;
  fitNonce: number;
  onCrosshairCandle: (candle: Candle | null) => void;
};

type CandleSeries = ISeriesApi<"Candlestick">;
type VolumeSeries = ISeriesApi<"Histogram">;
type Bubble = { key: string; left: number; top: number; size: number; color: string; label: string };

function chartCandles(candles: Candle[]): CandlestickData<Time>[] {
  return candles.map((candle) => ({ ...candle, time: candle.time as Time }));
}

function volumeBars(candles: Candle[]): HistogramData<Time>[] {
  return candles.map((candle) => ({
    time: candle.time as Time,
    value: candle.volume,
    color: candle.close >= candle.open ? CHART_COLORS.volumeUp : CHART_COLORS.volumeDown,
  }));
}

function gexRows(market: MarketRead): ExposureStrike[] {
  return (market.exposure?.rows ?? [])
    .filter((row) => Number.isFinite(row.strike) && Number.isFinite(row.netGex) && Math.abs(row.netGex) > 0)
    .sort((a, b) => Math.abs(b.netGex) - Math.abs(a.netGex))
    .slice(0, 9);
}

function equivalentTimeline(previous: Candle[], next: Candle[]) {
  if (previous.length !== next.length) return false;
  return previous.slice(0, -1).every((candle, index) => candle.time === next[index]?.time);
}

function sameBubbleLayout(current: Bubble[], next: Bubble[]) {
  return current.length === next.length && current.every((bubble, index) => {
    const candidate = next[index];
    return bubble.key === candidate?.key && Math.abs(bubble.left - candidate.left) < .5 && Math.abs(bubble.top - candidate.top) < .5 && bubble.size === candidate.size;
  });
}

export function InteractiveChart({ candles, hasMoreCandles, onLoadOlderCandles, market, drawMode, drawings, onAddDrawing, gexMode, showLevels, showVolume, showGrid, showCrosshair, fitNonce, onCrosshairCandle }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<CandleSeries | null>(null);
  const volumeRef = useRef<VolumeSeries | null>(null);
  const levelLinesRef = useRef<IPriceLine[]>([]);
  const gexLinesRef = useRef<IPriceLine[]>([]);
  const drawingLinesRef = useRef<IPriceLine[]>([]);
  const previousCandlesRef = useRef<Candle[]>([]);
  const drawModeRef = useRef(drawMode);
  const onAddDrawingRef = useRef(onAddDrawing);
  const onCrosshairCandleRef = useRef(onCrosshairCandle);
  const latestCandlesRef = useRef(candles);
  const latestMarketRef = useRef(market);
  const latestDrawingsRef = useRef(drawings);
  const gexModeRef = useRef<GexMode>(gexMode);
  const showLevelsRef = useRef(showLevels);
  const showVolumeRef = useRef(showVolume);
  const showGridRef = useRef(showGrid);
  const showCrosshairRef = useRef(showCrosshair);
  const hasMoreCandlesRef = useRef(hasMoreCandles);
  const onLoadOlderCandlesRef = useRef(onLoadOlderCandles);
  const loadingOlderRef = useRef(false);
  const visibleRangeHandlerRef = useRef<((range: { from: number; to: number } | null) => void) | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastCrosshairTimeRef = useRef<number | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  const clearLines = useCallback((lines: MutableRefObject<IPriceLine[]>) => {
    const series = seriesRef.current;
    if (!series) return;
    lines.current.forEach((line) => series.removePriceLine(line));
    lines.current = [];
  }, []);

  const scheduleBubbleSync = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const chart = chartRef.current;
      const series = seriesRef.current;
      const container = mount.current;
      const mode = gexModeRef.current;
      if (!chart || !series || !container || (mode !== "bubbles" && mode !== "both")) {
        setBubbles([]);
        return;
      }
      const rows = gexRows(latestMarketRef.current);
      const chartCandles = latestCandlesRef.current;
      if (!rows.length || !chartCandles.length) {
        setBubbles([]);
        return;
      }
      const maximum = Math.max(...rows.map((row) => Math.abs(row.netGex)), 1);
      const next = rows.flatMap((row, index) => {
        const candle = chartCandles[Math.max(0, chartCandles.length - 1 - (index % 4) * 5)];
        const left = chart.timeScale().timeToCoordinate(candle.time as Time);
        const top = series.priceToCoordinate(row.strike);
        if (left === null || top === null || top < 0 || top > container.clientHeight) return [];
        const ratio = Math.abs(row.netGex) / maximum;
        const size = Math.round(9 + Math.sqrt(ratio) * 12);
        return [{
          key: `${row.strike}-${row.netGex}`,
          left,
          top,
          size,
          color: row.netGex >= 0 ? (ratio > .75 ? CHART_COLORS.gexStrong : CHART_COLORS.gexPositive) : CHART_COLORS.gexNegative,
          label: `GEX ${row.netGex >= 0 ? "positive" : "negative"} ${row.strike.toLocaleString("en-US")}`,
        }];
      });
      setBubbles((current) => sameBubbleLayout(current, next) ? current : next);
    });
  }, []);

  const syncCandles = useCallback((nextCandles: Candle[]) => {
    const series = seriesRef.current;
    const volume = volumeRef.current;
    if (!series || !volume) return;
    const previous = previousCandlesRef.current;
    const nextLast = nextCandles.at(-1);
    const sameTimeline = Boolean(nextLast) && equivalentTimeline(previous, nextCandles);
    const appendedOne = Boolean(nextLast) && nextCandles.length === previous.length + 1 && previous.every((candle, index) => candle.time === nextCandles[index]?.time);
    const prependedCount = nextCandles.length - previous.length;
    const prepended = prependedCount > 0 && previous.every((candle, index) => candle.time === nextCandles[prependedCount + index]?.time);
    const visibleRange = prepended ? chartRef.current?.timeScale().getVisibleLogicalRange() ?? null : null;
    if (sameTimeline && nextLast) {
      series.update({ ...nextLast, time: nextLast.time as Time });
      volume.update(volumeBars([nextLast])[0]);
    } else if (appendedOne && nextLast) {
      const revisedPrevious = nextCandles.at(-2);
      if (revisedPrevious) {
        series.update({ ...revisedPrevious, time: revisedPrevious.time as Time });
        volume.update(volumeBars([revisedPrevious])[0]);
      }
      series.update({ ...nextLast, time: nextLast.time as Time });
      volume.update(volumeBars([nextLast])[0]);
    } else {
      series.setData(chartCandles(nextCandles));
      volume.setData(volumeBars(nextCandles));
      if (prepended && visibleRange) {
        chartRef.current?.timeScale().setVisibleLogicalRange({
          from: visibleRange.from + prependedCount,
          to: visibleRange.to + prependedCount,
        });
      }
    }
    previousCandlesRef.current = nextCandles;
    scheduleBubbleSync();
  }, [scheduleBubbleSync]);

  const syncMarketLevels = useCallback((nextMarket: MarketRead, visible: boolean) => {
    const series = seriesRef.current;
    if (!series) return;
    clearLines(levelLinesRef);
    if (!visible) return;
    const levels = [
      [nextMarket.snapshot.callWall, "Call wall", CHART_COLORS.callWall],
      [nextMarket.snapshot.zeroGamma, "Zero gamma", CHART_COLORS.zeroGamma],
      [nextMarket.snapshot.spot, "Spot", CHART_COLORS.spot],
      [nextMarket.snapshot.putWall, "Put wall", CHART_COLORS.putWall],
    ] as const;
    levelLinesRef.current = levels
      .filter(([value]) => Number.isFinite(value) && value > 0)
      .map(([price, title, color]) => series.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2 as never, axisLabelVisible: true, title }));
  }, [clearLines]);

  const syncGexLevels = useCallback((nextMarket: MarketRead, mode: GexMode) => {
    const series = seriesRef.current;
    if (!series) return;
    clearLines(gexLinesRef);
    if (mode !== "levels" && mode !== "both") return;
    gexLinesRef.current = gexRows(nextMarket).slice(0, 5).map((row) => series.createPriceLine({
      price: row.strike,
      color: row.netGex >= 0 ? CHART_COLORS.gexPositiveLine : CHART_COLORS.gexNegativeLine,
      lineWidth: 1,
      lineStyle: 1 as never,
      axisLabelVisible: false,
      title: "GEX model",
    }));
  }, [clearLines]);

  const syncDrawings = useCallback((nextDrawings: number[]) => {
    const series = seriesRef.current;
    if (!series) return;
    clearLines(drawingLinesRef);
    drawingLinesRef.current = nextDrawings.map((price) => series.createPriceLine({ price, color: CHART_COLORS.drawing, lineWidth: 1, lineStyle: 1 as never, axisLabelVisible: true, title: "User level" }));
  }, [clearLines]);

  useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);
  useEffect(() => { onAddDrawingRef.current = onAddDrawing; }, [onAddDrawing]);
  useEffect(() => { onCrosshairCandleRef.current = onCrosshairCandle; }, [onCrosshairCandle]);
  useEffect(() => { hasMoreCandlesRef.current = hasMoreCandles; }, [hasMoreCandles]);
  useEffect(() => { onLoadOlderCandlesRef.current = onLoadOlderCandles; }, [onLoadOlderCandles]);
  useEffect(() => {
    latestCandlesRef.current = candles;
    syncCandles(candles);
  }, [candles, syncCandles]);
  useEffect(() => {
    latestMarketRef.current = market;
    syncMarketLevels(market, showLevelsRef.current);
    syncGexLevels(market, gexModeRef.current);
    scheduleBubbleSync();
  }, [market, scheduleBubbleSync, syncGexLevels, syncMarketLevels]);
  useEffect(() => {
    latestDrawingsRef.current = drawings;
    syncDrawings(drawings);
  }, [drawings, syncDrawings]);
  useEffect(() => {
    gexModeRef.current = gexMode;
    syncGexLevels(latestMarketRef.current, gexMode);
    scheduleBubbleSync();
  }, [gexMode, scheduleBubbleSync, syncGexLevels]);
  useEffect(() => {
    showLevelsRef.current = showLevels;
    syncMarketLevels(latestMarketRef.current, showLevels);
  }, [showLevels, syncMarketLevels]);
  useEffect(() => {
    showVolumeRef.current = showVolume;
    volumeRef.current?.applyOptions({ visible: showVolume });
  }, [showVolume]);
  useEffect(() => {
    showGridRef.current = showGrid;
    chartRef.current?.applyOptions({
      grid: { vertLines: { visible: showGrid }, horzLines: { visible: showGrid } },
    });
  }, [showGrid]);
  useEffect(() => {
    showCrosshairRef.current = showCrosshair;
    chartRef.current?.applyOptions({
      crosshair: { vertLine: { visible: showCrosshair }, horzLine: { visible: showCrosshair } },
    });
  }, [showCrosshair]);
  useEffect(() => {
    if (fitNonce > 0) chartRef.current?.timeScale().fitContent();
  }, [fitNonce]);

  useEffect(() => {
    const container = mount.current;
    if (!container) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;

    void import("lightweight-charts").then(({ createChart, CrosshairMode }) => {
      if (disposed || chartRef.current) return;
      const chart = createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight || 560,
        layout: { background: { color: CHART_COLORS.surface }, textColor: CHART_COLORS.text },
        grid: { vertLines: { color: CHART_COLORS.grid, visible: showGridRef.current }, horzLines: { color: CHART_COLORS.grid, visible: showGridRef.current } },
        crosshair: { mode: CrosshairMode.Normal, vertLine: { color: CHART_COLORS.crosshair, visible: showCrosshairRef.current }, horzLine: { color: CHART_COLORS.crosshair, visible: showCrosshairRef.current } },
        rightPriceScale: { borderColor: CHART_COLORS.scaleBorder, scaleMargins: { top: .06, bottom: .2 } },
        timeScale: { borderColor: CHART_COLORS.scaleBorder, timeVisible: true, secondsVisible: false, rightOffset: 4 },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      });
      const series = chart.addCandlestickSeries({
        upColor: CHART_COLORS.candleUp, downColor: CHART_COLORS.candleDown,
        borderUpColor: CHART_COLORS.candleUp, borderDownColor: CHART_COLORS.candleDown,
        wickUpColor: CHART_COLORS.candleUp, wickDownColor: CHART_COLORS.candleDown,
      });
      const volume = chart.addHistogramSeries({ priceScaleId: "volume", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false, visible: showVolumeRef.current });
      chart.priceScale("volume").applyOptions({ scaleMargins: { top: .78, bottom: 0 }, visible: false });
      chartRef.current = chart;
      seriesRef.current = series;
      volumeRef.current = volume;
      syncCandles(latestCandlesRef.current);
      syncMarketLevels(latestMarketRef.current, showLevelsRef.current);
      syncGexLevels(latestMarketRef.current, gexModeRef.current);
      syncDrawings(latestDrawingsRef.current);
      chart.timeScale().fitContent();
      chart.subscribeClick((param) => {
        if (!drawModeRef.current || !param.point) return;
        const price = series.coordinateToPrice(param.point.y);
        if (price !== null && Number.isFinite(price)) onAddDrawingRef.current(Number(price));
      });
      chart.subscribeCrosshairMove((param) => {
        scheduleBubbleSync();
        const time = typeof param.time === "number" ? param.time : null;
        if (time === lastCrosshairTimeRef.current) return;
        lastCrosshairTimeRef.current = time;
        onCrosshairCandleRef.current(time === null ? null : latestCandlesRef.current.find((candle) => candle.time === time) ?? null);
      });
       const handleVisibleRangeChange = (range: { from: number; to: number } | null) => {
         scheduleBubbleSync();
         const oldest = latestCandlesRef.current[0];
         const loadOlder = onLoadOlderCandlesRef.current;
         if (!range || range.from > 14 || !oldest || !loadOlder || !hasMoreCandlesRef.current || loadingOlderRef.current) return;
         loadingOlderRef.current = true;
         void loadOlder(oldest.time).finally(() => { loadingOlderRef.current = false; });
       };
       visibleRangeHandlerRef.current = handleVisibleRangeChange;
       chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      observer = new ResizeObserver(() => {
        chart.resize(container.clientWidth, container.clientHeight || 560);
        scheduleBubbleSync();
      });
       observer.observe(container);
    });

    return () => {
      disposed = true;
      observer?.disconnect();
       if (chartRef.current && visibleRangeHandlerRef.current) {
         chartRef.current.timeScale().unsubscribeVisibleLogicalRangeChange(visibleRangeHandlerRef.current);
       }
       visibleRangeHandlerRef.current = null;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
      levelLinesRef.current = [];
      gexLinesRef.current = [];
      drawingLinesRef.current = [];
    };
  }, [scheduleBubbleSync, syncCandles, syncDrawings, syncGexLevels, syncMarketLevels]);

  return <div ref={mount} className={drawMode ? "interactiveChart drawMode" : "interactiveChart"} aria-label={`${market.symbol} interactive price chart`}>
    <div className="gexBubbleLayer" aria-label="GEX bubbles">
      {bubbles.map((bubble) => <span key={bubble.key} className="gexBubble" title={bubble.label} aria-label={bubble.label} style={{ left: bubble.left, top: bubble.top, width: bubble.size, height: bubble.size, backgroundColor: bubble.color }} />)}
    </div>
  </div>;
}
