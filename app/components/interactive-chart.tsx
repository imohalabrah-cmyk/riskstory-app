"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { CandlestickData, HistogramData, IChartApi, IPriceLine, ISeriesApi, Time } from "lightweight-charts";
import type { Candle, FlowRead, MarketRead } from "../lib/market/types";
import { selectDarkPoolZones, selectFlowOverlayEvents, selectGexZones } from "../lib/chart/overlay-data";
import { CHART_COLORS } from "./chart-tokens";

type GexMode = "off" | "bubbles" | "levels" | "both";

type Props = {
  candles: Candle[];
  hasMoreCandles: boolean;
  onLoadOlderCandles?: (before: number) => Promise<void>;
  market: MarketRead;
  flow: FlowRead | null;
  drawMode: boolean;
  drawings: number[];
  onAddDrawing: (price: number) => void;
  gexMode: GexMode;
  showDarkPool: boolean;
  showFlow: boolean;
  showLevels: boolean;
  showVolume: boolean;
  showGrid: boolean;
  showCrosshair: boolean;
  selectedStrike: number | null;
  fitNonce: number;
  onCrosshairCandle: (candle: Candle | null) => void;
};

type CandleSeries = ISeriesApi<"Candlestick">;
type VolumeSeries = ISeriesApi<"Histogram">;
type BubbleZone = { key: string; left: number; top: number; count: number; size: number; color: string; label: string };
type FlowMarker = { key: string; left: number; top: number; color: string; label: string };

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

function equivalentTimeline(previous: Candle[], next: Candle[]) {
  if (previous.length !== next.length) return false;
  return previous.slice(0, -1).every((candle, index) => candle.time === next[index]?.time);
}

function sameBubbleLayout(current: BubbleZone[], next: BubbleZone[]) {
  return current.length === next.length && current.every((bubble, index) => {
    const candidate = next[index];
    return bubble.key === candidate?.key && Math.abs(bubble.left - candidate.left) < .5 && Math.abs(bubble.top - candidate.top) < .5 && bubble.size === candidate.size && bubble.count === candidate.count;
  });
}

export function InteractiveChart({ candles, hasMoreCandles, onLoadOlderCandles, market, flow, drawMode, drawings, onAddDrawing, gexMode, showDarkPool, showFlow, showLevels, showVolume, showGrid, showCrosshair, selectedStrike, fitNonce, onCrosshairCandle }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<CandleSeries | null>(null);
  const volumeRef = useRef<VolumeSeries | null>(null);
  const levelLinesRef = useRef<IPriceLine[]>([]);
  const gexLinesRef = useRef<IPriceLine[]>([]);
  const darkPoolLinesRef = useRef<IPriceLine[]>([]);
  const drawingLinesRef = useRef<IPriceLine[]>([]);
  const selectedLineRef = useRef<IPriceLine | null>(null);
  const previousCandlesRef = useRef<Candle[]>([]);
  const drawModeRef = useRef(drawMode);
  const onAddDrawingRef = useRef(onAddDrawing);
  const onCrosshairCandleRef = useRef(onCrosshairCandle);
  const latestCandlesRef = useRef(candles);
  const latestMarketRef = useRef(market);
  const latestFlowRef = useRef(flow);
  const latestDrawingsRef = useRef(drawings);
  const selectedStrikeRef = useRef(selectedStrike);
  const gexModeRef = useRef<GexMode>(gexMode);
  const showDarkPoolRef = useRef(showDarkPool);
  const showFlowRef = useRef(showFlow);
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
  const [bubbles, setBubbles] = useState<BubbleZone[]>([]);
  const [flowMarkers, setFlowMarkers] = useState<FlowMarker[]>([]);

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
      const rows = selectGexZones(latestMarketRef.current);
      const chartCandles = latestCandlesRef.current;
      if (!rows.length || !chartCandles.length) {
        setBubbles([]);
        return;
      }
      const currentCandle = chartCandles.at(-1);
      if (!currentCandle) {
        setBubbles([]);
        return;
      }
      const left = chart.timeScale().timeToCoordinate(currentCandle.time as Time);
      if (left === null) {
        setBubbles([]);
        return;
      }
      const next = rows.flatMap((row) => {
        const top = series.priceToCoordinate(row.strike);
        if (top === null || top < 0 || top > container.clientHeight) return [];
        const size = Math.round(5 + Math.sqrt(row.intensity) * 3);
        return [{
          key: `current-${row.strike}-${row.netGex}`,
          left: left + 12,
          top,
          size,
          count: row.bubbleCount,
          color: row.netGex >= 0 ? (row.intensity > .75 ? CHART_COLORS.gexStrong : CHART_COLORS.gexPositive) : CHART_COLORS.gexNegative,
          label: `Current GEX zone. Strike ${row.strike.toLocaleString("en-US")}. GEX ${row.netGex.toLocaleString("en-US")}. Call OI ${row.callOpenInterest ?? "N/A"}. Put OI ${row.putOpenInterest ?? "N/A"}. Call volume ${row.callVolume ?? "N/A"}. Put volume ${row.putVolume ?? "N/A"}.`,
        }];
      });
      setBubbles((current) => sameBubbleLayout(current, next) ? current : next);
      if (!showFlowRef.current) {
        setFlowMarkers((current) => current.length ? [] : current);
        return;
      }
      const events = selectFlowOverlayEvents(latestFlowRef.current, latestMarketRef.current.snapshot.spot);
      const nextEvents = events.flatMap((event, index) => {
        const top = series.priceToCoordinate(event.strike);
        if (top === null || top < 0 || top > container.clientHeight) return [];
        return [{ key: `${event.strike}-${event.premium}-${event.executedAt ?? index}`, left: Math.max(42, left - 82 - index * 14), top, color: event.side === "put" ? CHART_COLORS.gexNegative : CHART_COLORS.gexStrong, label: `Flow event. Strike ${event.strike.toLocaleString("en-US")}. Premium ${event.premium.toLocaleString("en-US")}. ${event.tags.length ? `Provider tags: ${event.tags.join(", ")}.` : "No provider classification."}` }];
      });
      setFlowMarkers(nextEvents);
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
    gexLinesRef.current = selectGexZones(nextMarket).map((row) => series.createPriceLine({
      price: row.strike,
      color: row.netGex >= 0 ? CHART_COLORS.gexPositiveLine : CHART_COLORS.gexNegativeLine,
      lineWidth: 1,
      lineStyle: 1 as never,
      axisLabelVisible: false,
      title: "GEX zone",
    }));
  }, [clearLines]);

  const syncDarkPoolLevels = useCallback((nextFlow: FlowRead | null, visible: boolean) => {
    const series = seriesRef.current;
    if (!series) return;
    clearLines(darkPoolLinesRef);
    if (!visible) return;
    darkPoolLinesRef.current = selectDarkPoolZones(nextFlow).map((zone) => series.createPriceLine({
      price: zone.price,
      color: CHART_COLORS.darkPool,
      lineWidth: 1,
      lineStyle: 2 as never,
      axisLabelVisible: true,
      title: `DP ${zone.darkPoolVolume.toLocaleString("en-US")}`,
    }));
  }, [clearLines]);

  const syncDrawings = useCallback((nextDrawings: number[]) => {
    const series = seriesRef.current;
    if (!series) return;
    clearLines(drawingLinesRef);
    drawingLinesRef.current = nextDrawings.map((price) => series.createPriceLine({ price, color: CHART_COLORS.drawing, lineWidth: 1, lineStyle: 1 as never, axisLabelVisible: true, title: "User level" }));
  }, [clearLines]);

  const syncSelectedStrike = useCallback((strike: number | null) => {
    const series = seriesRef.current;
    if (!series) return;
    if (selectedLineRef.current) series.removePriceLine(selectedLineRef.current);
    selectedLineRef.current = null;
    if (strike === null || !Number.isFinite(strike)) return;
    selectedLineRef.current = series.createPriceLine({ price: strike, color: CHART_COLORS.selectedReference, lineWidth: 1, lineStyle: 2 as never, axisLabelVisible: true, title: `Selected ${strike.toLocaleString("en-US")}` });
  }, []);

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
    latestFlowRef.current = flow;
    syncDarkPoolLevels(flow, showDarkPoolRef.current);
    scheduleBubbleSync();
  }, [flow, scheduleBubbleSync, syncDarkPoolLevels]);
  useEffect(() => {
    latestDrawingsRef.current = drawings;
    syncDrawings(drawings);
  }, [drawings, syncDrawings]);
  useEffect(() => {
    selectedStrikeRef.current = selectedStrike;
    syncSelectedStrike(selectedStrike);
  }, [selectedStrike, syncSelectedStrike]);
  useEffect(() => {
    gexModeRef.current = gexMode;
    syncGexLevels(latestMarketRef.current, gexMode);
    scheduleBubbleSync();
  }, [gexMode, scheduleBubbleSync, syncGexLevels]);
  useEffect(() => {
    showDarkPoolRef.current = showDarkPool;
    syncDarkPoolLevels(latestFlowRef.current, showDarkPool);
  }, [showDarkPool, syncDarkPoolLevels]);
  useEffect(() => {
    showFlowRef.current = showFlow;
    scheduleBubbleSync();
  }, [showFlow, scheduleBubbleSync]);
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
      syncDarkPoolLevels(latestFlowRef.current, showDarkPoolRef.current);
      syncDrawings(latestDrawingsRef.current);
      syncSelectedStrike(selectedStrikeRef.current);
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
      darkPoolLinesRef.current = [];
      drawingLinesRef.current = [];
      selectedLineRef.current = null;
    };
  }, [scheduleBubbleSync, syncCandles, syncDarkPoolLevels, syncDrawings, syncGexLevels, syncMarketLevels, syncSelectedStrike]);

  return <div ref={mount} className={drawMode ? "interactiveChart drawMode" : "interactiveChart"} aria-label={`${market.symbol} interactive price chart`}>
    <div className="gexBubbleLayer" aria-label="GEX bubbles">
      {bubbles.map((bubble) => <span key={bubble.key} className="gexBubbleZone" title={bubble.label} aria-label={bubble.label} style={{ left: bubble.left, top: bubble.top, "--bubble-color": bubble.color } as React.CSSProperties}>{Array.from({ length: bubble.count }, (_, index) => <i key={index} className="gexBubble" style={{ width: bubble.size, height: bubble.size }} />)}</span>)}
      {flowMarkers.map((marker) => <span key={marker.key} className="flowMarker" title={marker.label} style={{ left: marker.left, top: marker.top, "--flow-color": marker.color } as React.CSSProperties}>Flow</span>)}
    </div>
  </div>;
}
