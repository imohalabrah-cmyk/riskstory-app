"use client";

import { useMemo, useState } from "react";
import { Focus, Info, Search, Sparkles } from "lucide-react";
import { analyzeGexIntelligence } from "../lib/gex-intelligence";
import type { GexLevelAssessment, IntelligenceScore } from "../lib/gex-intelligence";
import type { MarketRead } from "../lib/market/types";
import { classNames, money, price } from "./utils";

type Layer = "gex" | "netGex" | "openInterest";
type Side = "combined" | "calls" | "puts";
type Filter = 0 | 60 | 70 | 80 | 90;

const layerOptions: Array<{ id: Layer; label: string; detail: string }> = [
  { id: "gex", label: "GEX", detail: "Call and put GEX magnitude" },
  { id: "netGex", label: "Net GEX", detail: "Net GEX by strike" },
  { id: "openInterest", label: "Open Interest", detail: "Call and put open interest" },
];

const unavailableLayers = ["Delta", "Gamma", "Vanna", "Charm", "Vega"];

function scoreText(score: IntelligenceScore) {
  return score.availability === "available" && score.score !== null ? `${score.score}/100` : "N/A";
}

function levelScore(level: GexLevelAssessment) {
  return level.confluence.score ?? level.levelStrength.score ?? 0;
}

function directionLabel(level: GexLevelAssessment) {
  return level.direction === "positive" ? "Positive exposure" : level.direction === "negative" ? "Negative exposure" : "Balanced exposure";
}

function displayValue(level: GexLevelAssessment, market: MarketRead, layer: Layer, side: Side) {
  const row = market.exposure?.rows.find((candidate) => candidate.strike === level.strike);
  if (!row) return null;
  if (layer === "openInterest") {
    if (side === "calls") return row.callOpenInterest;
    if (side === "puts") return row.putOpenInterest;
    return row.callOpenInterest + row.putOpenInterest;
  }
  if (layer === "netGex") return row.netGex;
  if (side === "calls") return row.callGex;
  if (side === "puts") return row.putGex;
  return Math.abs(row.callGex) + Math.abs(row.putGex);
}

function scoreTone(score: number | null) {
  if (score === null) return "unknown";
  if (score >= 85) return "strong";
  if (score >= 70) return "high";
  return "quiet";
}

type Props = { market: MarketRead | null };

export function GexIntelligencePanel({ market }: Props) {
  const [layer, setLayer] = useState<Layer>("gex");
  const [side, setSide] = useState<Side>("combined");
  const [filter, setFilter] = useState<Filter>(0);
  const [search, setSearch] = useState("");
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const [mapScale, setMapScale] = useState(1);
  const availableMarket = market?.provenance.mode !== "unavailable" && market?.exposure?.rows?.length ? market : null;
  const intelligence = useMemo(() => availableMarket ? analyzeGexIntelligence(availableMarket) : null, [availableMarket]);
  const levels = useMemo(() => intelligence?.levels ?? [], [intelligence]);
  const visibleLevels = useMemo(() => levels.filter((item) => levelScore(item) >= filter), [filter, levels]);
  const selected = useMemo(() => levels.find((item) => item.strike === selectedStrike) ?? visibleLevels[0] ?? levels[0] ?? null, [levels, selectedStrike, visibleLevels]);
  const maximumValue = useMemo(() => Math.max(...visibleLevels.map((item) => Math.abs(displayValue(item, availableMarket!, layer, side) ?? 0)), 1), [availableMarket, layer, side, visibleLevels]);
  const nearest = useMemo(() => {
    const requested = Number(search);
    if (!Number.isFinite(requested) || !levels.length) return null;
    return levels.reduce((closest, candidate) => Math.abs(candidate.strike - requested) < Math.abs(closest.strike - requested) ? candidate : closest);
  }, [levels, search]);

  const focusSearch = () => {
    if (!nearest) return;
    setSelectedStrike(nearest.strike);
    document.getElementById(`gex-level-${nearest.strike}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const reset = () => {
    setLayer("gex");
    setSide("combined");
    setFilter(0);
    setSearch("");
    setSelectedStrike(levels[0]?.strike ?? null);
    setMapScale(1);
  };

  if (!availableMarket || !intelligence || intelligence.availability === "unavailable") {
    return <section className="gexIntelligence gexUnavailable"><header className="gexTitleBar"><div><span>GEX Intelligence</span><h2>Exposure structure unavailable</h2></div></header><div className="surfaceEmpty"><strong>GEX intelligence unavailable</strong><span>{intelligence?.warnings[0] ?? "Provider-backed option-chain exposure is required before this analysis can be displayed."}</span></div></section>;
  }

  return <section className="gexIntelligence" aria-label="GEX intelligence">
    <header className="gexTitleBar">
      <div><span>GEX INTELLIGENCE</span><h2>{availableMarket.symbol} exposure structure</h2><p>Provider-backed chain snapshot. Scores describe current exposure structure, not a trade recommendation.</p></div>
      <div className="gexHeaderStats"><div><small>Market clarity</small><strong>{scoreText(intelligence.marketClarity)}</strong><span>{intelligence.marketClarity.direction}</span></div><div><small>Confluence</small><strong>{scoreText(intelligence.confluence)}</strong><span>Current snapshot</span></div></div>
    </header>

    <div className="gexToolbar" aria-label="GEX controls">
      <div className="gexControlGroup"><span className="gexControlLabel">Layer</span><div className="gexSegments">{layerOptions.map((item) => <button key={item.id} type="button" className={classNames(layer === item.id && "active")} onClick={() => setLayer(item.id)} title={item.detail}>{item.label}</button>)}{unavailableLayers.map((item) => <button key={item} type="button" className="layerUnavailable" disabled title={`${item} requires a provider-backed metric not present in this read`} aria-label={`${item} unavailable`}>{item}</button>)}</div></div>
      <div className="gexControlGroup"><span className="gexControlLabel">Exposure</span><div className="gexSegments">{(["combined", "calls", "puts"] as Side[]).map((item) => <button key={item} type="button" className={classNames(side === item && "active")} onClick={() => setSide(item)}>{item === "combined" ? "Net" : item === "calls" ? "Calls" : "Puts"}</button>)}</div></div>
      <div className="gexControlGroup gexNoise"><span className="gexControlLabel">Noise filter</span><div className="gexSegments">{([0, 60, 70, 80, 90] as Filter[]).map((item) => <button key={item} type="button" className={classNames(filter === item && "active")} onClick={() => setFilter(item)}>{item ? `${item}+` : "All"}</button>)}</div></div>
      <label className="gexSearch"><Search size={15} /><input value={search} inputMode="decimal" onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") focusSearch(); }} placeholder="Find strike" aria-label="Find nearest strike" /><button type="button" onClick={focusSearch} disabled={!nearest}>Go</button></label>
      <div className="gexMapScale" aria-label="Map density"><button type="button" aria-label="Decrease map density" onClick={() => setMapScale((value) => Math.max(.8, Number((value - .1).toFixed(1))))}>-</button><span>{Math.round(mapScale * 100)}%</span><button type="button" aria-label="Increase map density" onClick={() => setMapScale((value) => Math.min(1.2, Number((value + .1).toFixed(1))))}>+</button></div>
      <button type="button" className="gexReset" onClick={reset}><Focus size={14} /> Reset view</button>
    </div>

    <div className="gexScope"><Info size={14} /><span>Layer values use the current provider-backed chain. {unavailableLayers.join(", ")} remain unavailable because this read does not expose them as supported GEX Intelligence layers.</span></div>

    <div className="gexLayout">
      <section className="gexMapPanel" aria-label="GEX map">
        <header><div><span>GEX MAP</span><h3>{layerOptions.find((item) => item.id === layer)?.label} by strike</h3></div><div className="gexMapLegend"><span className="positive">Positive</span><span className="negative">Negative</span><span className="spot">Spot {price(availableMarket.snapshot.spot)}</span></div></header>
        <div className="gexMapCanvas" style={{ "--gex-map-scale": mapScale } as React.CSSProperties}>
          {visibleLevels.length ? visibleLevels.map((level) => {
            const value = displayValue(level, availableMarket, layer, side);
            const width = Math.max(6, Math.abs(value ?? 0) / maximumValue * 100);
            const isSelected = selected?.strike === level.strike;
            const isSpot = Math.abs(level.strike - availableMarket.snapshot.spot) < 0.01;
            return <button id={`gex-level-${level.strike}`} key={level.strike} type="button" onClick={() => setSelectedStrike(level.strike)} className={classNames("gexMapRow", level.direction, isSelected && "selected", isSpot && "spotRow")} aria-pressed={isSelected}><span className="gexStrike">{price(level.strike)}</span><span className="gexBarTrack"><i style={{ width: `${width}%` }} /></span><span className="gexMapValue">{value === null ? "N/A" : layer === "openInterest" ? value.toLocaleString() : money(value)}</span><span className={classNames("gexScore", scoreTone(levelScore(level)))}>{levelScore(level)}</span>{level.levelIsolation.score !== null && level.levelIsolation.score >= 70 && <em>Isolated</em>}</button>;
          }) : <div className="gexMapEmpty"><strong>No levels meet the {filter}+ filter</strong><button type="button" onClick={() => setFilter(0)}>Show all scored levels</button></div>}
          {intelligence.liquidityVacuum.intervals.map((interval) => <div key={`${interval.lowStrike}-${interval.highStrike}`} className="gexLowExposure" title={interval.explanation}><span>Low exposure</span><b>{price(interval.lowStrike)} - {price(interval.highStrike)}</b><small>{interval.score}/100</small></div>)}
        </div>
      </section>

      <aside className="gexSidePanel" aria-label="GEX intelligence details">
        <section className="gexClarityCard"><span>Market clarity</span><strong>{scoreText(intelligence.marketClarity)}</strong><b>{intelligence.marketClarity.direction}</b><p>{intelligence.marketClarity.explanation}</p></section>
        <section className="gexStrongest"><header><div><Sparkles size={15} /><span>Strongest levels</span></div><small>Top {Math.min(5, levels.length)}</small></header>{levels.slice(0, 5).map((level) => <button type="button" key={level.strike} className={classNames(selected?.strike === level.strike && "selected")} onClick={() => setSelectedStrike(level.strike)}><b>{price(level.strike)}</b><span>{levelScore(level)}</span><small>{directionLabel(level)}</small></button>)}</section>
      </aside>
    </div>

    <section className="gexDetailPanel" aria-live="polite">
      {selected ? <><header><div><span>Selected level</span><h3>{price(selected.strike)}</h3></div><span className={classNames("gexDirection", selected.direction)}>{directionLabel(selected)}</span></header><div className="gexDetailScores"><div><small>Confluence</small><strong>{scoreText(selected.confluence)}</strong></div><div><small>Level strength</small><strong>{scoreText(selected.levelStrength)}</strong></div><div><small>Isolation</small><strong>{scoreText(selected.levelIsolation)}</strong></div><div><small>Open interest</small><strong>{selected.totalOpenInterest.toLocaleString()}</strong></div><div><small>Net GEX</small><strong className={selected.netGex >= 0 ? "green" : "red"}>{money(selected.netGex)}</strong></div></div><div className="gexExplanation"><h4>Engine context</h4><p>{selected.confluence.explanation}</p><ul>{selected.confluence.inputs.map((item) => <li key={item}>{item}</li>)}</ul></div></> : <div className="surfaceEmpty"><strong>No level selected</strong><span>Select a visible scored level to inspect its engine context.</span></div>}
    </section>
  </section>;
}
