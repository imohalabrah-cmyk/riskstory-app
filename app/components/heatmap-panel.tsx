"use client";

import { useMemo, useRef, useState } from "react";
import { Minus, Plus, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import type { ExposureStrike, MarketRead } from "../lib/market/types";
import { combineReportedValues } from "../lib/market/reported-values";
import { useIntelligenceSelection } from "../lib/intelligence/selection-context";
import { resolveLinkedStrike, selectionMatchesSymbol } from "../lib/intelligence/selection-linking";
import { Panel } from "./panel";
import { classNames, price } from "./utils";

type Side = "combined" | "calls" | "puts";
type ScaleMode = "per-expiration" | "global";
type Props = { market: MarketRead | null; title?: string; onExpand?: () => void; onSymbol?: (symbol: string) => void; compact?: boolean };
const LAYERS = ["Open Interest", "Net GEX", "Delta", "Gamma", "Vanna", "Charm", "Vega"] as const;
const ROW_HEIGHT = 42;
const OVERSCAN = 7;

function readableOi(value: number | null) { return value === null ? "N/A" : value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}K` : String(Math.round(value)); }
function sideValue(row: ExposureStrike, side: Side) { return side === "calls" ? row.callOpenInterest : side === "puts" ? row.putOpenInterest : combineReportedValues(row.callOpenInterest, row.putOpenInterest); }

export function HeatmapPanel({ market, title = "GEX Heatmap by Expiration", onExpand, onSymbol, compact = false }: Props) {
  const [side, setSide] = useState<Side>("combined");
  const [expiry, setExpiry] = useState("all");
  const [query, setQuery] = useState("");
  const [scaleMode, setScaleMode] = useState<ScaleMode>("per-expiration");
  const [density, setDensity] = useState(1);
  const [scrollTop, setScrollTop] = useState(0);
  const [hovered, setHovered] = useState<{ strike: number; expiration: string; value: number } | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const { selection } = useIntelligenceSelection();
  const available = market?.provenance.mode !== "unavailable" ? market : null;
  const expirations = useMemo(() => (available?.exposure?.expirations ?? []).filter((item) => expiry === "all" || item.expiration === expiry), [available, expiry]);
  const rows = useMemo(() => {
    if (!available) return [];
    const needle = Number(query);
    const byStrike = new Map<number, ExposureStrike>();
    expirations.forEach((item) => item.rows.forEach((row) => byStrike.set(row.strike, row)));
    const candidates = [...byStrike.values()].sort((a, b) => b.strike - a.strike);
    if (!query || !Number.isFinite(needle)) return candidates;
    const exact = candidates.filter((row) => Math.abs(row.strike - needle) < 0.01);
    if (exact.length) return exact;
    return candidates.length ? [candidates.reduce((closest, row) => Math.abs(row.strike - needle) < Math.abs(closest.strike - needle) ? row : closest)] : [];
  }, [available, expirations, query]);
  const globalMax = useMemo(() => Math.max(1, ...expirations.flatMap((item) => item.rows.flatMap((row) => { const value = sideValue(row, side); return typeof value === "number" ? [value] : []; }))), [expirations, side]);
  const expirationRows = useMemo(() => new Map(expirations.map((item) => [item.expiration, new Map(item.rows.map((row) => [row.strike, row]))])), [expirations]);
  const expirationMax = useMemo(() => new Map(expirations.map((item) => [item.expiration, Math.max(1, ...item.rows.flatMap((row) => { const value = sideValue(row, side); return typeof value === "number" ? [value] : []; }))])), [expirations, side]);
  const symbolOptions = useMemo(() => Array.from(new Set([available?.symbol, "SPY", "SPX", "QQQ"].filter(Boolean))) as string[], [available?.symbol]);
  const nearestStrike = useMemo(() => {
    const requested = Number(query);
    return query && Number.isFinite(requested) && rows.length === 1 && Math.abs(rows[0].strike - requested) >= .01 ? rows[0].strike : null;
  }, [query, rows]);
  const linkedStrike = useMemo(() => resolveLinkedStrike(selection, { symbol: available?.symbol, strikes: rows.map((row) => row.strike) }), [available?.symbol, rows, selection]);
  const hasMatchingLinkedSymbol = selectionMatchesSymbol(selection, available?.symbol);
  const rowHeight = Math.round(ROW_HEIGHT * density);
  const columnWidth = Math.round(122 * density);
  const strikeWidth = Math.round(96 * density);
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const end = Math.min(rows.length, start + Math.ceil(560 / rowHeight) + OVERSCAN * 2);
  const visibleRows = rows.slice(start, end);
  const reset = () => { setSide("combined"); setExpiry("all"); setQuery(""); setScaleMode("per-expiration"); setDensity(1); setScrollTop(0); if (scrollerRef.current) scrollerRef.current.scrollTo({ top: 0, left: 0, behavior: "smooth" }); };
  const onDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current; const node = scrollerRef.current;
    if (!drag || !node) return;
    node.scrollLeft = drag.left - (event.clientX - drag.x); node.scrollTop = drag.top - (event.clientY - drag.y);
  };
  const cell = (row: ExposureStrike, item: { expiration: string; rows: ExposureStrike[] }) => {
    const target = expirationRows.get(item.expiration)?.get(row.strike);
    const value = target ? sideValue(target, side) : null;
    const max = scaleMode === "global" ? globalMax : expirationMax.get(item.expiration) ?? 1;
    const intensity = value === null ? .025 : Math.max(.025, Math.min(1, value / max));
    const active = hovered?.strike === row.strike && hovered.expiration === item.expiration;
    const linked = linkedStrike === row.strike && (selection.expiration === null || selection.expiration === item.expiration);
    return <button key={item.expiration} type="button" className={classNames("heatCell", side, active && "hovered", linked && "selected")} style={{ "--heat-intensity": intensity } as React.CSSProperties} onMouseEnter={() => value !== null && setHovered({ strike: row.strike, expiration: item.expiration, value })} onFocus={() => value !== null && setHovered({ strike: row.strike, expiration: item.expiration, value })} onMouseLeave={() => setHovered(null)} aria-label={`${item.expiration}, strike ${price(row.strike)}, ${readableOi(value)} open interest`}><span>{readableOi(value)}</span></button>;
  };

  return <Panel title={title} onExpand={onExpand} className={classNames("heatPanel", "heatmapIntelligence", compact && "heatCompact")}>
    <div className="heatControls">
      <label className="heatControl"><span>Symbol</span><select value={available?.symbol ?? ""} onChange={(event) => onSymbol?.(event.target.value)} disabled={!onSymbol || !available}>{symbolOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="heatControl"><span>Expiration</span><select value={expiry} onChange={(event) => setExpiry(event.target.value)} disabled={!expirations.length && !available?.exposure?.expirations.length}><option value="all">All expirations</option>{(available?.exposure?.expirations ?? []).map((item) => <option key={item.expiration} value={item.expiration}>{item.expiration}</option>)}</select></label>
      <div className="heatSegment" role="group" aria-label="Open interest side">{(["combined", "calls", "puts"] as Side[]).map((item) => <button key={item} type="button" className={classNames(side === item && "active")} onClick={() => setSide(item)}>{item === "combined" ? "Combined" : item === "calls" ? "Calls" : "Puts"}</button>)}</div>
      <label className="heatControl layer"><span>Layer</span><select value="Open Interest" aria-label="Heatmap layer">{LAYERS.map((item) => <option key={item} value={item} disabled={item !== "Open Interest"}>{item}{item !== "Open Interest" ? " (unavailable)" : ""}</option>)}</select></label>
      <label className="heatControl scale"><span><SlidersHorizontal size={12} />Color scale</span><select value={scaleMode} onChange={(event) => setScaleMode(event.target.value as ScaleMode)}><option value="per-expiration">Per expiration</option><option value="global">Global scale</option></select></label>
      <button type="button" className="heatReset" onClick={reset}><RotateCcw size={14} />Reset view</button>
    </div>
    {!available || !rows.length || !expirations.length ? <div className="surfaceEmpty heatUnavailable"><strong>Heatmap unavailable</strong><span>Provider-backed option-chain rows are not available for this symbol.</span></div> : <>
      <div className="heatSummary"><span><b>{available.symbol}</b> spot {price(available.snapshot.spot)}</span><span>{side === "combined" ? "Call + put open interest" : `${side === "calls" ? "Call" : "Put"} open interest`}</span><span>{expirations.length} actual expiration{expirations.length === 1 ? "" : "s"}</span></div>
      <div className="heatUtility"><label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} inputMode="decimal" placeholder="Search strike" aria-label="Search strike" /></label>{nearestStrike && <span className="heatNearest">Nearest {price(nearestStrike)}</span>}<div><button type="button" onClick={() => setDensity((value) => Math.max(.7, Number((value - .1).toFixed(1))))} aria-label="Decrease heatmap density"><Minus size={14} /></button><span>Density {Math.round(density * 100)}%</span><button type="button" onClick={() => setDensity((value) => Math.min(1.6, Number((value + .1).toFixed(1))))} aria-label="Increase heatmap density"><Plus size={14} /></button></div></div>
      <div ref={scrollerRef} className="heatViewport" tabIndex={0} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} onPointerDown={(event) => { const node = scrollerRef.current; if (!node || (event.target as HTMLElement).closest("button")) return; dragRef.current = { x: event.clientX, y: event.clientY, left: node.scrollLeft, top: node.scrollTop }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={onDragMove} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>
        <div className="heatMatrix" style={{ "--heat-columns": expirations.length, "--heat-row-height": `${rowHeight}px`, "--heat-strike-width": `${strikeWidth}px`, "--heat-column-width": `${columnWidth}px`, "--heat-width": `${strikeWidth + expirations.length * columnWidth}px` } as React.CSSProperties}>
          <div className="heatHeader"><div>Strike</div>{expirations.map((item) => <div key={item.expiration}>{item.expiration}</div>)}</div>
          <div className="heatSpacer" style={{ height: `${start * rowHeight}px` }} />
          {visibleRows.map((row) => <div key={row.strike} className={classNames("heatRow", Math.abs(row.strike - available.snapshot.spot) < .01 && "spotRow", hasMatchingLinkedSymbol && linkedStrike === row.strike && "selectedRow")}><strong>{price(row.strike)}</strong>{expirations.map((item) => cell(row, item))}</div>)}
          <div className="heatSpacer" style={{ height: `${Math.max(0, rows.length - end) * rowHeight}px` }} />
        </div>
      </div>
      <div className="heatFooter"><span>Drag to pan</span><span>Use Density to resize rows and columns</span><span>Hover a cell for its exact open interest</span>{hovered && <strong>{hovered.expiration} · {price(hovered.strike)} · {hovered.value.toLocaleString()} OI</strong>}</div>
    </>}
  </Panel>;
}
