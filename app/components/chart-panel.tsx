"use client";

import { useCallback, useState } from "react";
import type { CandleRead, MarketRead } from "../lib/market/types";
import { InteractiveChart } from "./interactive-chart";
import { Panel } from "./panel";
import { classNames, price } from "./utils";

type Props = {
  title?: string;
  market: MarketRead | null;
  candles: CandleRead | null;
  range: string;
  onRange: (range: string) => void;
  frame: string;
  onFrame: (frame: string) => void;
  onExpand?: () => void;
};

export function ChartPanel({ title = "Chart With Levels", market, candles, range, onRange, frame, onFrame, onExpand }: Props) {
  const availableMarket = market?.provenance.mode === "unavailable" ? null : market;
  const [drawMode, setDrawMode] = useState(false);
  const [drawings, setDrawings] = useState<number[]>([]);
  const addDrawing = useCallback((value: number) => setDrawings((current) => [...current, Math.round(value * 100) / 100]), []);
  const levels = availableMarket ? [
    ["Call wall", availableMarket.snapshot.callWall, "call"], ["Zero gamma", availableMarket.snapshot.zeroGamma, "zero"], ["Spot", availableMarket.snapshot.spot, "spot"], ["Put wall", availableMarket.snapshot.putWall, "put"],
  ] as const : [];
  const canUndo = drawings.length > 0;

  return <Panel title={title} onExpand={onExpand} actions={<div className="chips">{["0DTE", "Daily", "Weekly", "Custom"].map((item) => <button type="button" key={item} className={classNames("chip", range === item && "active")} onClick={() => onRange(item)}>{item}</button>)}<button type="button" className={classNames("chip", drawMode && "active")} onClick={() => setDrawMode((value) => !value)}>Draw</button><button type="button" className="chip" onClick={() => setDrawings((current) => current.slice(0, -1))} disabled={!canUndo}>Undo</button><button type="button" className="chip" onClick={() => setDrawings([])} disabled={!canUndo}>Clear</button></div>} className="chartPanel">
    <div className="chartStage">
      <div className="chartCanvas">
        {!availableMarket || !candles?.candles.length ? <div className="surfaceEmpty"><strong>Chart data unavailable</strong><span>Sync the market feed to load provider-backed candles.</span></div> : <InteractiveChart market={availableMarket} candles={candles.candles} drawMode={drawMode} drawings={drawings} onAddDrawing={addDrawing} />}
      </div>
      <aside className="levels"><label>Level Intelligence</label>{levels.map(([name, value, kind]) => <div className={`level ${kind}`} key={name}><i /><div><b>{price(value)}</b><small>{name}</small></div></div>)}<div className="chartFrames">{["1m", "5m", "10m", "1h", "1D"].map((item) => <button type="button" className={classNames("chip", frame === item && "active")} key={item} onClick={() => onFrame(item)}>{item}</button>)}</div></aside>
    </div>
  </Panel>;
}
