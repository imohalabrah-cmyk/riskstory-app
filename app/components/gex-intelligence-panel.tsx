"use client";

import { Fragment, useMemo, useState } from "react";
import { BarChart3, CircleDot, Focus, Info, Network, Search, Sparkles, Timer } from "lucide-react";
import { analyzeGexIntelligence } from "../lib/gex-intelligence";
import type { GexLevelAssessment, IntelligenceScore } from "../lib/gex-intelligence";
import type { ExposureStrike, MarketRead } from "../lib/market/types";
import { classNames, money, price } from "./utils";

type Layer = "gex" | "netGex" | "openInterest";
type Side = "combined" | "calls" | "puts";
type Filter = 0 | 60 | 70 | 80 | 90;

const layerOptions: Array<{ id: Layer; label: string; detail: string }> = [
  { id: "gex", label: "Combined GEX", detail: "Gross call and put GEX magnitude" },
  { id: "netGex", label: "Net GEX", detail: "Net GEX by strike" },
  { id: "openInterest", label: "Open Interest", detail: "Call and put open interest" },
];

const unavailableLayers = ["Delta", "Gamma", "Vanna", "Charm", "Vega"];

const visualizations = [
  { id: "ladder", label: "Ladder", description: "Current provider-backed exposure by strike.", icon: Network, available: true },
  { id: "curve", label: "Curve", description: "Inspect exposure as a strike curve.", icon: BarChart3, available: false },
  { id: "histogram", label: "Histogram", description: "Compare exposure distribution by strike.", icon: CircleDot, available: false },
  { id: "heatmap", label: "Heatmap", description: "Compare exposure across grouped dimensions.", icon: Sparkles, available: false },
  { id: "profile", label: "Profile", description: "Read the exposure profile around spot.", icon: Network, available: false },
  { id: "surface", label: "Surface", description: "Inspect a multi-dimensional exposure surface.", icon: Timer, available: false },
] as const;

function GexVisualizationSelector() {
  return <aside className="gexStudioSelector" aria-label="GEX visualization selector">
    <header className="gexToolboxHeader">
      <span>Visualization</span>
    </header>
    <div className="gexVisualizationList">
      {visualizations.map((view) => {
        const Icon = view.icon;
        return <button key={view.id} type="button" aria-pressed={view.available} aria-controls={view.available ? "gex-studio-workspace" : undefined} disabled={!view.available} className={classNames(view.available && "active", !view.available && "planned")} title={view.available ? view.description : `${view.label} is planned`}>
          <Icon size={15} aria-hidden="true" />
          <span><b>{view.label}</b><small>{view.available ? "Available now" : "Coming Later"}</small></span>
        </button>;
      })}
    </div>
    <footer><a href="#gex-studio-workspace"><Info size={13} /> Studio guide</a></footer>
  </aside>;
}

function scoreText(score: IntelligenceScore) {
  return score.availability === "available" && score.score !== null ? `${score.score}/100` : "N/A";
}

function levelScore(level: GexLevelAssessment | undefined) {
  return level?.confluence.score ?? level?.levelStrength.score ?? null;
}

function directionLabel(direction: GexLevelAssessment["direction"]) {
  return direction === "positive" ? "Positive exposure" : direction === "negative" ? "Negative exposure" : "Balanced exposure";
}

function rawDirection(value: number): GexLevelAssessment["direction"] {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "balanced";
}

function displayValue(row: ExposureStrike, layer: Layer, side: Side) {
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

function GexUnavailableState({ reason }: { reason: string }) {
  return <section className="gexIntelligence gexUnavailable" aria-label="GEX Studio unavailable">
    <header className="gexTitleBar gexUnavailableTitle">
      <div><span>GEX STUDIO</span><h2>Exposure structure unavailable</h2><p>{reason}</p></div>
      <span className="gexUnavailableStatus">Provider data unavailable</span>
    </header>

    <div className="gexStudioLayout">
      <GexVisualizationSelector />
      <div className="gexStudioWorkspace" id="gex-studio-workspace">
        <div className="gexToolbar gexToolbarDisabled" aria-label="Unavailable GEX controls" aria-disabled="true">
      <div className="gexControlGroup"><span className="gexControlLabel">Layer</span><div className="gexSegments">{layerOptions.map((item) => <button key={item.id} type="button" disabled>{item.label}</button>)}</div></div>
      <div className="gexControlGroup"><span className="gexControlLabel">Exposure</span><div className="gexSegments"><button type="button" disabled>Gross</button><button type="button" disabled>Calls</button><button type="button" disabled>Puts</button></div></div>
      <div className="gexControlGroup gexNoise"><span className="gexControlLabel">Noise filter</span><div className="gexSegments">{["All", "60+", "70+", "80+", "90+"].map((item) => <button key={item} type="button" disabled>{item}</button>)}</div></div>
      <label className="gexSearch"><Search size={15} /><input disabled placeholder="Find strike" aria-label="Find nearest strike unavailable" /><button type="button" disabled>Go</button></label>
      <div className="gexMapScale" aria-label="Map density unavailable"><button type="button" disabled>-</button><span>100%</span><button type="button" disabled>+</button></div>
      <button type="button" className="gexReset" disabled><Focus size={14} /> Reset view</button>
    </div>

    <div className="gexScope"><Info size={14} /><span>The page structure remains available. Scores and provider-backed exposure will appear after a supported option-chain read is available.</span></div>

    <div className="gexStudioMain" aria-busy="true">
      <div className="gexStudioCenter">
      <section className="gexMapPanel" aria-label="GEX map awaiting provider data">
        <header><div><span>GEX MAP</span><h3>Exposure by strike</h3></div><div className="gexMapLegend"><span className="pending">Awaiting provider data</span></div></header>
        <div className="gexMapCanvas gexSkeletonMap">{Array.from({ length: 9 }, (_, index) => <div className="gexSkeletonRow" key={index}><i /><span /><b /></div>)}<div className="gexSkeletonMessage"><strong>Provider-backed exposure required</strong><span>No strike values, bars, or scores are shown until data is available.</span></div></div>
      </section>

      <section className="gexDetailPanel gexSkeletonDetail"><header><div><span>Selected level</span><h3>Unavailable</h3></div></header><div className="gexDetailScores">{["Confluence", "Level strength", "Isolation", "Open interest", "Net GEX"].map((item) => <div key={item}><small>{item}</small><i /></div>)}</div><div className="gexExplanation"><h4>Engine context</h4><p>Level-specific analysis becomes available only when the provider returns a supported option-chain exposure snapshot.</p></div></section>
      </div>

      <aside className="gexSidePanel" aria-label="GEX intelligence panels awaiting provider data">
        <section className="gexAnalysisSummary gexSkeletonCard"><span>Analysis</span><strong>Current view: Ladder</strong><p>Market context, level strength, confluence, and isolation require provider-backed exposure.</p><div><i /><i /><i /></div></section>
        <section className="gexClarityCard gexSkeletonCard"><span>Market clarity</span><i /><b>Unavailable</b><p>Requires current provider-backed exposure.</p></section>
        <section className="gexStrongest gexSkeletonStrongest"><header><div><Sparkles size={15} /><span>Strongest levels</span></div><small>Awaiting data</small></header>{Array.from({ length: 5 }, (_, index) => <div className="gexSkeletonLevel" key={index}><i /><span /></div>)}</section>
      </aside>
    </div>
      </div>
    </div>
  </section>;
}

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
  const assessmentByStrike = useMemo(() => new Map(levels.map((item) => [item.strike, item])), [levels]);
  const exposureRows = useMemo(() => (availableMarket?.exposure?.rows ?? [])
    .filter((row) => Number.isFinite(row.strike) && row.strike > 0 && Number.isFinite(row.netGex))
    .sort((left, right) => right.strike - left.strike), [availableMarket]);
  const visibleRows = useMemo(() => exposureRows.filter((row) => {
    if (!filter) return true;
    const score = levelScore(assessmentByStrike.get(row.strike));
    return score !== null && score >= filter;
  }), [assessmentByStrike, exposureRows, filter]);
  const selectedRow = useMemo(() => exposureRows.find((item) => item.strike === selectedStrike) ?? visibleRows[0] ?? exposureRows[0] ?? null, [exposureRows, selectedStrike, visibleRows]);
  const selectedAssessment = selectedRow ? assessmentByStrike.get(selectedRow.strike) : undefined;
  const maximumValue = useMemo(() => Math.max(...visibleRows.map((item) => Math.abs(displayValue(item, layer, side))), 1), [layer, side, visibleRows]);
  const nearest = useMemo(() => {
    const requested = Number(search);
    if (!Number.isFinite(requested) || !exposureRows.length) return null;
    return exposureRows.reduce((closest, candidate) => Math.abs(candidate.strike - requested) < Math.abs(closest.strike - requested) ? candidate : closest);
  }, [exposureRows, search]);
  const intervalsByHighStrike = useMemo(() => new Map(intelligence?.liquidityVacuum.intervals.map((interval) => [interval.highStrike, interval]) ?? []), [intelligence]);

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
    setSelectedStrike(exposureRows[0]?.strike ?? null);
    setMapScale(1);
  };

  if (!availableMarket || !intelligence || intelligence.availability === "unavailable") {
    return <GexUnavailableState reason={intelligence?.warnings[0] ?? "Provider-backed option-chain exposure is required before this analysis can be displayed."} />;
  }

  return <section className="gexIntelligence" aria-label="GEX Studio">
    <header className="gexTitleBar">
      <div><span>GEX STUDIO</span><h2>{availableMarket.symbol} exposure structure</h2><p>Provider-backed chain snapshot. Scores describe current exposure structure, not a trade recommendation.</p></div>
      <div className="gexHeaderStats"><div><small>Market clarity</small><strong>{scoreText(intelligence.marketClarity)}</strong><span>{intelligence.marketClarity.direction}</span></div><div><small>Confluence</small><strong>{scoreText(intelligence.confluence)}</strong><span>Current snapshot</span></div></div>
    </header>

    <div className="gexStudioLayout">
      <GexVisualizationSelector />
      <div className="gexStudioWorkspace" id="gex-studio-workspace">
        <div className="gexToolbar" aria-label="GEX controls">
      <div className="gexControlGroup"><span className="gexControlLabel">Layer</span><div className="gexSegments">{layerOptions.map((item) => <button key={item.id} type="button" className={classNames(layer === item.id && "active")} onClick={() => { setLayer(item.id); if (item.id === "netGex") setSide("combined"); }} title={item.detail}>{item.label}</button>)}{unavailableLayers.map((item) => <button key={item} type="button" className="layerUnavailable" disabled title={`${item} requires a provider-backed metric not present in this read`} aria-label={`${item} unavailable`}>{item}</button>)}</div></div>
      <div className="gexControlGroup"><span className="gexControlLabel">Exposure</span><div className="gexSegments">{(["combined", "calls", "puts"] as Side[]).map((item) => { const unavailable = layer === "netGex" && item !== "combined"; return <button key={item} type="button" className={classNames(side === item && "active")} disabled={unavailable} title={unavailable ? "Net GEX is already combined by strike" : undefined} onClick={() => setSide(item)}>{item === "combined" ? layer === "gex" ? "Gross" : layer === "netGex" ? "Net" : "Combined" : item === "calls" ? "Calls" : "Puts"}</button>; })}</div></div>
      <div className="gexControlGroup gexNoise"><span className="gexControlLabel">Noise filter</span><div className="gexSegments">{([0, 60, 70, 80, 90] as Filter[]).map((item) => <button key={item} type="button" className={classNames(filter === item && "active")} onClick={() => setFilter(item)}>{item ? `${item}+` : "All"}</button>)}</div></div>
      <label className="gexSearch"><Search size={15} /><input value={search} inputMode="decimal" onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") focusSearch(); }} placeholder="Find strike" aria-label="Find nearest strike" /><button type="button" onClick={focusSearch} disabled={!nearest}>Go</button></label>
      <div className="gexMapScale" aria-label="Map density"><button type="button" aria-label="Decrease map density" onClick={() => setMapScale((value) => Math.max(.8, Number((value - .1).toFixed(1))))}>-</button><span>{Math.round(mapScale * 100)}%</span><button type="button" aria-label="Increase map density" onClick={() => setMapScale((value) => Math.min(1.2, Number((value + .1).toFixed(1))))}>+</button></div>
      <button type="button" className="gexReset" onClick={reset}><Focus size={14} /> Reset view</button>
    </div>

    <div className="gexScope"><Info size={14} /><span>Layer values use the current provider-backed chain. {unavailableLayers.join(", ")} remain unavailable because this read does not expose them as supported GEX Intelligence layers.</span></div>

    <div className="gexStudioMain">
      <div className="gexStudioCenter">
      <section className="gexMapPanel" aria-label="GEX map">
        <header><div><span>GEX MAP</span><h3>{layerOptions.find((item) => item.id === layer)?.label} by strike</h3></div><div className="gexMapLegend"><span className="positive">Positive</span><span className="negative">Negative</span><span className="spot">Spot {price(availableMarket.snapshot.spot)}</span></div></header>
        <div className="gexMapCanvas" style={{ "--gex-map-scale": mapScale } as React.CSSProperties}>
          {visibleRows.length ? visibleRows.map((row) => {
            const assessment = assessmentByStrike.get(row.strike);
            const value = displayValue(row, layer, side);
            const width = Math.max(6, Math.abs(value ?? 0) / maximumValue * 100);
            const isSelected = selectedRow?.strike === row.strike;
            const isSpot = Math.abs(row.strike - availableMarket.snapshot.spot) < 0.01;
            const interval = intervalsByHighStrike.get(row.strike);
            const score = levelScore(assessment);
            const direction = assessment?.direction ?? rawDirection(row.netGex);
            return <Fragment key={row.strike}><button id={`gex-level-${row.strike}`} type="button" onClick={() => setSelectedStrike(row.strike)} className={classNames("gexMapRow", direction, isSelected && "selected", isSpot && "spotRow")} aria-pressed={isSelected}><span className="gexStrike">{price(row.strike)}</span><span className="gexBarTrack"><i style={{ width: `${width}%` }} /></span><span className="gexMapValue">{layer === "openInterest" ? value.toLocaleString() : money(value)}</span><span className={classNames("gexScore", scoreTone(score))}>{score ?? "N/A"}</span>{assessment?.levelIsolation.score !== null && (assessment?.levelIsolation.score ?? 0) >= 70 && <em>Isolated</em>}</button>{interval && <div className="gexLowExposure" title={interval.explanation}><span>Low exposure interval</span><b>{price(interval.lowStrike)} - {price(interval.highStrike)}</b><small>{interval.score}/100</small></div>}</Fragment>;
          }) : <div className="gexMapEmpty"><strong>No scored strikes meet the {filter}+ filter</strong><button type="button" onClick={() => setFilter(0)}>Show full provider structure</button></div>}
        </div>
      </section>

    <section className="gexDetailPanel" aria-live="polite">
      {selectedRow ? <><header><div><span>Selected level</span><h3>{price(selectedRow.strike)}</h3></div><span className={classNames("gexDirection", selectedAssessment?.direction ?? rawDirection(selectedRow.netGex))}>{directionLabel(selectedAssessment?.direction ?? rawDirection(selectedRow.netGex))}</span></header><div className="gexDetailScores"><div><small>Confluence</small><strong>{selectedAssessment ? scoreText(selectedAssessment.confluence) : "N/A"}</strong></div><div><small>Level strength</small><strong>{selectedAssessment ? scoreText(selectedAssessment.levelStrength) : "N/A"}</strong></div><div><small>Isolation</small><strong>{selectedAssessment ? scoreText(selectedAssessment.levelIsolation) : "N/A"}</strong></div><div><small>Open interest</small><strong>{(selectedRow.callOpenInterest + selectedRow.putOpenInterest).toLocaleString()}</strong></div><div><small>Net GEX</small><strong className={selectedRow.netGex >= 0 ? "green" : "red"}>{money(selectedRow.netGex)}</strong></div></div><div className="gexExplanation"><h4>Engine context</h4>{selectedAssessment ? <><p>{selectedAssessment.confluence.explanation}</p><ul>{selectedAssessment.confluence.inputs.map((item) => <li key={item}>{item}</li>)}</ul></> : <p>This provider-backed strike is displayed in the full exposure structure. It is not in the engine&apos;s ranked score set, so no intelligence score is inferred.</p>}</div></> : <div className="surfaceEmpty"><strong>No level selected</strong><span>Select a visible provider-backed strike to inspect its available context.</span></div>}
    </section>
      </div>

      <aside className="gexSidePanel" aria-label="GEX intelligence details">
        <section className="gexAnalysisSummary" aria-live="polite"><span>Analysis</span><strong>Current view: Ladder</strong><p>{selectedAssessment?.confluence.explanation ?? "Select a provider-backed strike to inspect its available analysis."}</p><dl><div><dt>Confluence</dt><dd>{selectedAssessment ? scoreText(selectedAssessment.confluence) : "N/A"}</dd></div><div><dt>Level strength</dt><dd>{selectedAssessment ? scoreText(selectedAssessment.levelStrength) : "N/A"}</dd></div><div><dt>Isolation</dt><dd>{selectedAssessment ? scoreText(selectedAssessment.levelIsolation) : "N/A"}</dd></div></dl></section>
        <section className="gexClarityCard"><span>Market clarity</span><strong>{scoreText(intelligence.marketClarity)}</strong><b>{intelligence.marketClarity.direction}</b><p>{intelligence.marketClarity.explanation}</p></section>
        <section className="gexStrongest"><header><div><Sparkles size={15} /><span>Strongest levels</span></div><small>Top {Math.min(5, levels.length)}</small></header>{levels.slice(0, 5).map((level) => <button type="button" key={level.strike} className={classNames(selectedRow?.strike === level.strike && "selected")} onClick={() => setSelectedStrike(level.strike)}><b>{price(level.strike)}</b><span>{levelScore(level)}</span><small>{directionLabel(level.direction)}</small></button>)}</section>
      </aside>
    </div>
      </div>
    </div>
  </section>;
}
