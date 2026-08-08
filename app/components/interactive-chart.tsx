"use client";

import { useEffect, useRef } from "react";
import type { IChartApi } from "lightweight-charts";
import type { Candle, MarketRead } from "../lib/market/types";

type Props = {
  candles: Candle[];
  market: MarketRead;
  drawMode: boolean;
  drawings: number[];
  onAddDrawing: (price: number) => void;
};

export function InteractiveChart({ candles, market, drawMode, drawings, onAddDrawing }: Props) {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mount.current;
    if (!container || !candles.length) return;
    let disposed = false;
    let chart: IChartApi | undefined;
    let observer: ResizeObserver | undefined;

    void import("lightweight-charts").then(({ createChart, CrosshairMode, LineStyle }) => {
      if (disposed) return;
      chart = createChart(container, {
        autoSize: true,
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
      series.setData(candles.map((candle) => ({ ...candle, time: candle.time as never })));
      const levelLines = [
        [market.snapshot.callWall, "Call wall", "#20d7ff"],
        [market.snapshot.zeroGamma, "Zero gamma", "#e6e12b"],
        [market.snapshot.spot, "Spot", "#b5c0d2"],
        [market.snapshot.putWall, "Put wall", "#ff456b"],
      ] as const;
      levelLines.filter(([value]) => Number.isFinite(value) && value > 0).forEach(([price, title, color]) => series.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title }));
      drawings.forEach((price) => series.createPriceLine({ price, color: "#18c8e8", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "User level" }));
      chart.timeScale().fitContent();
      chart.subscribeClick((param) => {
        if (!drawMode || !param.point) return;
        const price = series.coordinateToPrice(param.point.y);
        if (price !== null && Number.isFinite(price)) onAddDrawing(Number(price));
      });
      observer = new ResizeObserver(() => chart?.applyOptions({ width: container.clientWidth }));
      observer.observe(container);
    });

    return () => { disposed = true; observer?.disconnect(); chart?.remove(); };
  }, [candles, drawMode, drawings, market, onAddDrawing]);

  return <div ref={mount} className={drawMode ? "interactiveChart drawMode" : "interactiveChart"} aria-label={`${market.symbol} interactive price chart`} />;
}
