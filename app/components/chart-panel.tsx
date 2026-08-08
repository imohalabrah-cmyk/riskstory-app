"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode, RefObject } from "react";
import {
  CandlestickChart,
  Crosshair,
  Eye,
  EyeOff,
  Grid3X3,
  Layers3,
  Maximize2,
  Minimize2,
  PencilLine,
  RotateCcw,
  Settings2,
  Trash2,
  Undo2,
  Volume2,
  X,
} from "lucide-react";
import type { Candle, CandleRead, MarketRead } from "../lib/market/types";
import { InteractiveChart } from "./interactive-chart";
import { Panel } from "./panel";
import { classNames, price } from "./utils";

type GexMode = "off" | "bubbles" | "levels" | "both";

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

const frames = ["1m", "5m", "10m", "1h", "1D"];

export function ChartPanel({ title = "Chart With Levels", market, candles, range, onRange, frame, onFrame, onExpand }: Props) {
  const availableMarket = market?.provenance.mode === "unavailable" ? null : market;
  const [drawMode, setDrawMode] = useState(false);
  const [drawings, setDrawings] = useState<number[]>([]);
  const [gexMode, setGexMode] = useState<GexMode>("bubbles");
  const [showLevels, setShowLevels] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [showDrawingTools, setShowDrawingTools] = useState(true);
  const [dataOpen, setDataOpen] = useState(false);
  const [dataPosition, setDataPosition] = useState<{ left: number; top: number; transform?: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fitNonce, setFitNonce] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedCandle, setSelectedCandle] = useState<Candle | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dataButtonRef = useRef<HTMLButtonElement>(null);
  const dataPopoverRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsCloseButtonRef = useRef<HTMLButtonElement>(null);
  const wasSettingsOpenRef = useRef(false);

  const addDrawing = useCallback((value: number) => setDrawings((current) => [...current, Math.round(value * 100) / 100]), []);
  const toggleFullscreen = useCallback(async () => {
    const element = stageRef.current;
    if (!element) return;
    if (document.fullscreenElement === element) await document.exitFullscreen();
    else await element.requestFullscreen();
  }, []);

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDataOpen(false);
      setSettingsOpen(false);
    };
    document.addEventListener("fullscreenchange", updateFullscreen);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreen);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    const closeOnOutsidePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dataButtonRef.current?.contains(target) || dataPopoverRef.current?.contains(target)) return;
      setDataOpen(false);
    };
    if (dataOpen) document.addEventListener("mousedown", closeOnOutsidePointer);
    return () => document.removeEventListener("mousedown", closeOnOutsidePointer);
  }, [dataOpen]);

  useLayoutEffect(() => {
    if (!dataOpen) return;
    const updatePosition = () => {
      const rect = dataButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 250;
      const height = 210;
      const openAbove = rect.bottom + 8 + height > window.innerHeight && rect.top > height;
      setDataPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: openAbove ? rect.top - 8 : rect.bottom + 8,
        transform: openAbove ? "translateY(-100%)" : undefined,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [dataOpen]);

  useEffect(() => {
    if (settingsOpen) settingsCloseButtonRef.current?.focus();
    else if (wasSettingsOpenRef.current) settingsButtonRef.current?.focus();
    wasSettingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  const levels = availableMarket ? [
    ["Call wall", availableMarket.snapshot.callWall, "call"], ["Zero gamma", availableMarket.snapshot.zeroGamma, "zero"], ["Spot", availableMarket.snapshot.spot, "spot"], ["Put wall", availableMarket.snapshot.putWall, "put"],
  ] as const : [["Call wall", null, "call"], ["Zero gamma", null, "zero"], ["Spot", null, "spot"], ["Put wall", null, "put"]] as const;
  const hasGex = Boolean(availableMarket?.exposure?.rows.length);
  const canUndo = drawings.length > 0;
  const activeCandle = selectedCandle ?? candles?.candles.at(-1) ?? null;

  return <>
  <Panel title={title} onExpand={onExpand} className="chartPanel">
    <div className="chartTerminal" ref={stageRef}>
      <div className="chartToolbar" aria-label="Chart controls">
        <div className="chartToolbarGroup chartIdentity"><CandlestickChart size={15} aria-hidden="true" /><strong>{availableMarket?.symbol ?? "--"}</strong><span>{frame}</span></div>
        <div className="chartToolbarGroup chartTimeframes" aria-label="Timeframe">
          {frames.map((item) => <button type="button" className={classNames("toolButton", frame === item && "active")} key={item} onClick={() => onFrame(item)}>{item}</button>)}
        </div>
        <label className="chartSelectLabel rangeControl">Range<select className="chartSelect" value={range} onChange={(event) => onRange(event.target.value)} aria-label="Expiration range"><option>0DTE</option><option>Daily</option><option>Weekly</option><option>Custom</option></select></label>
        <label className="chartSelectLabel gexControl">GEX<select className="chartSelect" value={gexMode} onChange={(event) => setGexMode(event.target.value as GexMode)} disabled={!hasGex} aria-label="GEX overlay"><option value="off">Off</option><option value="bubbles">Bubbles</option><option value="levels">Levels</option><option value="both">Both</option></select></label>
        <div className="chartSettings">
          <button ref={dataButtonRef} type="button" className={classNames("toolButton", "dataStatusControl", dataOpen && "active")} onClick={() => setDataOpen((current) => !current)} aria-expanded={dataOpen} aria-label="Data overlay status"><Layers3 size={14} /><span>Data</span></button>
        </div>
        <div className="chartToolbarSpacer" />
        <div className="chartToolbarGroup chartActions">
          <button type="button" className={classNames("iconTool", drawMode && "active")} onClick={() => setDrawMode((value) => !value)} aria-label="Toggle horizontal-line drawing" title="Draw horizontal level"><PencilLine size={15} /></button>
          <button type="button" className="iconTool" onClick={() => setDrawings((current) => current.slice(0, -1))} disabled={!canUndo} aria-label="Undo last drawing" title="Undo"><Undo2 size={15} /></button>
          <button type="button" className="iconTool" onClick={() => setDrawings([])} disabled={!canUndo} aria-label="Clear drawings" title="Clear drawings"><Trash2 size={15} /></button>
          <button type="button" className="iconTool" onClick={() => setFitNonce((value) => value + 1)} aria-label="Fit chart content" title="Fit chart"><RotateCcw size={15} /></button>
          <button ref={settingsButtonRef} type="button" className={classNames("iconTool", settingsOpen && "active")} onClick={() => { setDataOpen(false); setSettingsOpen(true); }} aria-label="Chart settings" aria-expanded={settingsOpen} title="Chart settings"><Settings2 size={15} /></button>
          <button type="button" className="iconTool" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? "Exit fullscreen chart" : "Enter fullscreen chart"} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>{isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
        </div>
      </div>
      {activeCandle && <div className="chartOhlc" aria-live="polite"><span>O {price(activeCandle.open)}</span><span>H {price(activeCandle.high)}</span><span>L {price(activeCandle.low)}</span><span>C {price(activeCandle.close)}</span><span>V {activeCandle.volume.toLocaleString()}</span></div>}
      <div className="chartStage">
        <div className="chartCanvas">
          {showDrawingTools && <div className="drawingToolbar" aria-label="Drawing tools"><button type="button" className={classNames("iconTool", drawMode && "active")} onClick={() => setDrawMode((value) => !value)} aria-label="Draw horizontal line" title="Horizontal line"><PencilLine size={16} /></button><button type="button" className="iconTool" onClick={() => setDrawings((current) => current.slice(0, -1))} disabled={!canUndo} aria-label="Undo drawing" title="Undo"><Undo2 size={16} /></button><button type="button" className="iconTool" onClick={() => setDrawings([])} disabled={!canUndo} aria-label="Clear drawings" title="Clear"><Trash2 size={16} /></button></div>}
          {!availableMarket || !candles?.candles.length ? <div className="surfaceEmpty"><strong>Chart data unavailable</strong><span>Sync the market feed to load provider-backed candles.</span></div> : <InteractiveChart market={availableMarket} candles={candles.candles} drawMode={drawMode} drawings={drawings} onAddDrawing={addDrawing} gexMode={gexMode} showLevels={showLevels} showVolume={showVolume} showGrid={showGrid} showCrosshair={showCrosshair} fitNonce={fitNonce} onCrosshairCandle={setSelectedCandle} />}
        </div>
        <aside className="levels"><label>Market levels</label>{levels.map(([name, value, kind]) => <div className={`level ${kind}`} key={name}><i /><div><b>{value === null ? "N/A" : price(value)}</b><small>{name}</small></div></div>)}<p className="levelSource">GEX overlay uses model-calculated chain exposure when available.</p></aside>
      </div>
    </div>
  </Panel>
  {dataOpen && dataPosition && createPortal(<div ref={dataPopoverRef} className="chartPopover dataPopover chartFloatingPopover" style={dataPosition} role="dialog" aria-label="Data overlay status"><strong>Data overlays</strong><DataStatus label="Dark Pool" reason="No dark-pool levels are supplied by the connected provider." /><DataStatus label="Flow" reason="Flow rows do not include chart-safe event timestamps." /><DataStatus label="Whales" reason="Whale classifications are not supplied by the connected provider." /></div>, document.body)}
  {settingsOpen && createPortal(<ChartSettingsModal closeButtonRef={settingsCloseButtonRef} onClose={() => setSettingsOpen(false)} showLevels={showLevels} setShowLevels={setShowLevels} showVolume={showVolume} setShowVolume={setShowVolume} showGrid={showGrid} setShowGrid={setShowGrid} showCrosshair={showCrosshair} setShowCrosshair={setShowCrosshair} showDrawingTools={showDrawingTools} setShowDrawingTools={setShowDrawingTools} />, document.body)}
  </>;
}

function Toggle({ label, checked, onChange, icon }: { label: string; checked: boolean; onChange: (checked: boolean) => void; icon: ReactNode }) {
  return <label className="settingToggle"><span>{icon}{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function DataStatus({ label, reason }: { label: string; reason: string }) {
  return <div className="dataStatus"><span>{label}</span><small>Unavailable - {reason}</small></div>;
}

type ChartSettingsModalProps = {
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  showLevels: boolean;
  setShowLevels: (checked: boolean) => void;
  showVolume: boolean;
  setShowVolume: (checked: boolean) => void;
  showGrid: boolean;
  setShowGrid: (checked: boolean) => void;
  showCrosshair: boolean;
  setShowCrosshair: (checked: boolean) => void;
  showDrawingTools: boolean;
  setShowDrawingTools: (checked: boolean) => void;
};

function ChartSettingsModal({ closeButtonRef, onClose, showLevels, setShowLevels, showVolume, setShowVolume, showGrid, setShowGrid, showCrosshair, setShowCrosshair, showDrawingTools, setShowDrawingTools }: ChartSettingsModalProps) {
  return <div className="chartSettingsModalBackdrop" role="presentation" onMouseDown={onClose}>
    <section className="chartSettingsModal" role="dialog" aria-modal="true" aria-labelledby="chart-settings-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span>CHART SETTINGS</span><h2 id="chart-settings-title">Display and behavior</h2></div><button ref={closeButtonRef} type="button" className="iconTool" onClick={onClose} aria-label="Close chart settings"><X size={17} /></button></header>
      <div className="chartSettingsGrid">
        <section><h3>Market Levels</h3><Toggle label="Show Spot, Call Wall, Put Wall, and Zero Gamma" checked={showLevels} onChange={setShowLevels} icon={showLevels ? <Eye size={15} /> : <EyeOff size={15} />} /></section>
        <section><h3>GEX</h3><p>Use the toolbar control for Bubbles, Levels, Both, or Off. It stays disabled until provider-backed exposure is available.</p></section>
        <section><h3>Dark Pool</h3><p>Unavailable until the connected provider returns dark-pool levels.</p></section>
        <section><h3>Flow and Whales</h3><p>Unavailable until the provider returns chart-safe timestamps and classifications.</p></section>
        <section><h3>Appearance</h3><Toggle label="Volume histogram" checked={showVolume} onChange={setShowVolume} icon={<Volume2 size={15} />} /><Toggle label="Grid lines" checked={showGrid} onChange={setShowGrid} icon={<Grid3X3 size={15} />} /></section>
        <section><h3>Chart Behavior</h3><Toggle label="Crosshair" checked={showCrosshair} onChange={setShowCrosshair} icon={<Crosshair size={15} />} /><Toggle label="Drawing toolbar" checked={showDrawingTools} onChange={setShowDrawingTools} icon={<PencilLine size={15} />} /></section>
      </div>
    </section>
  </div>;
}
