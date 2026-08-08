"use client";

import { useMemo, useState } from "react";
import type { CandleRead, MarketRead } from "../lib/market/types";
import { Panel } from "./panel";
import { classNames, price } from "./utils";

type Props = { title?: string; market: MarketRead | null; candles: CandleRead | null; frame: string; onFrame: (frame: string) => void; onExpand?: () => void };

function pathFor(values: number[], min: number, max: number, width: number, height: number) {
  return values.map((value, index) => `${index ? "L" : "M"}${(index / Math.max(values.length - 1, 1)) * width} ${height - ((value - min) / Math.max(max - min, 0.001)) * height}`).join(" ");
}

export function ChartPanel({ title = "Chart With Levels", market, candles, frame, onFrame, onExpand }: Props) {
  const [range, setRange] = useState("0DTE");
  const items = useMemo(() => (candles?.candles ?? []).slice(-90), [candles]);
  const priceRange = useMemo(() => {
    const prices = items.flatMap((item) => [item.high, item.low]);
    return { min: Math.min(...prices, market?.snapshot.putWall ?? 0) || 0, max: Math.max(...prices, market?.snapshot.callWall ?? 0) || 1 };
  }, [items, market]);
  const width = 920; const height = 430;
  const levels = market ? [
    ["Call wall", market.snapshot.callWall, "call"], ["Zero gamma", market.snapshot.zeroGamma, "zero"], ["Spot", market.snapshot.spot, "spot"], ["Put wall", market.snapshot.putWall, "put"],
  ] as const : [];
  return <Panel title={title} onExpand={onExpand} actions={<div className="chips">{["0DTE", "Daily", "Weekly", "Custom"].map((item) => <button type="button" key={item} className={classNames("chip", range === item && "active")} onClick={() => setRange(item)}>{item}</button>)}</div>} className="chartPanel">
    <div className="chartStage">
      <div className="chartCanvas" role="img" aria-label={`${market?.symbol ?? "Market"} price chart`}>
        {!items.length ? <div className="surfaceEmpty"><strong>Chart data unavailable</strong><span>Sync the market feed to load provider-backed candles.</span></div> : <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
          <g className="chartGrid">{Array.from({ length: 6 }, (_, index) => <line key={`h-${index}`} x1="0" y1={(height / 5) * index} x2={width} y2={(height / 5) * index} />)}{Array.from({ length: 10 }, (_, index) => <line key={`v-${index}`} x1={(width / 9) * index} y1="0" x2={(width / 9) * index} y2={height} />)}</g>
          {levels.map(([name, value, kind]) => { const y = height - ((value - priceRange.min) / Math.max(priceRange.max - priceRange.min, 0.01)) * height; return <g key={name} className={`chartLevel ${kind}`}><line x1="0" y1={y} x2={width} y2={y} /><text x={width - 8} y={y - 6}>{`${price(value)} ${name}`}</text></g>; })}
          {items.map((item, index) => { const x = (index / Math.max(items.length - 1, 1)) * width; const scale = (value: number) => height - ((value - priceRange.min) / Math.max(priceRange.max - priceRange.min, 0.01)) * height; const up = item.close >= item.open; return <g key={item.time} className={up ? "candleUp" : "candleDown"}><line x1={x} y1={scale(item.high)} x2={x} y2={scale(item.low)} /><rect x={x - 3} y={Math.min(scale(item.open), scale(item.close))} width="6" height={Math.max(Math.abs(scale(item.open) - scale(item.close)), 2)} /></g>; })}
          <path className="chartAverage" d={pathFor(items.map((item) => item.close), priceRange.min, priceRange.max, width, height)} />
        </svg>}
      </div>
      <aside className="levels"><label>Level Intelligence</label>{levels.map(([name, value, kind]) => <div className={`level ${kind}`} key={name}><i /><div><b>{price(value)}</b><small>{name}</small></div></div>)}<div className="chartFrames">{["1m", "5m", "10m", "1h", "1D"].map((item) => <button type="button" className={classNames("chip", frame === item && "active")} key={item} onClick={() => onFrame(item)}>{item}</button>)}</div></aside>
    </div>
  </Panel>;
}
