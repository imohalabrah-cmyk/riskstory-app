"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, ChartCandlestick, CircleAlert, Compass, Info, Network, TableProperties } from "lucide-react";
import { analyzeGexIntelligence } from "../lib/gex-intelligence";
import type { GexLevelAssessment, IntelligenceScore, LiquidityVacuumInterval } from "../lib/gex-intelligence";
import type { FlowRead, MarketRead } from "../lib/market/types";
import type { ViewId } from "./types";
import { classNames, money, price } from "./utils";

type FocusItem =
  | { id: string; kind: "level"; label: string; level: GexLevelAssessment; score: number | null; reason: string }
  | { id: string; kind: "interval"; label: string; interval: LiquidityVacuumInterval; score: number; reason: string };

type Props = { market: MarketRead | null; flow: FlowRead | null; onNavigate: (view: ViewId) => void };

function scoreValue(read: IntelligenceScore) {
  return read.availability === "available" ? read.score : null;
}

function labelForLevel(level: GexLevelAssessment) {
  if ((level.confluence.score ?? 0) >= 70) return "High Confluence";
  if ((level.levelIsolation.score ?? 0) >= 70) return "Isolated Level";
  return "Strong Level";
}

function reasonForLevel(level: GexLevelAssessment) {
  const label = labelForLevel(level);
  if (label === "High Confluence") return level.confluence.explanation;
  if (label === "Isolated Level") return level.levelIsolation.explanation;
  return level.levelStrength.explanation;
}

function makeFocus(levels: GexLevelAssessment[], intervals: LiquidityVacuumInterval[]) {
  const items: FocusItem[] = levels.slice(0, 2).map((level) => ({
    id: `level-${level.strike}`,
    kind: "level",
    label: labelForLevel(level),
    level,
    score: scoreValue(level.confluence),
    reason: reasonForLevel(level),
  }));

  const interval = intervals[0];
  if (interval && items.length < 3) {
    items.push({
      id: `interval-${interval.lowStrike}-${interval.highStrike}`,
      kind: "interval",
      label: "Low Exposure Interval",
      interval,
      score: interval.score,
      reason: interval.explanation,
    });
  }

  return items.slice(0, 3);
}

function focusRange(item: FocusItem) {
  return item.kind === "level" ? price(item.level.strike) : `${price(item.interval.lowStrike)} - ${price(item.interval.highStrike)}`;
}

function detailInputs(item: FocusItem) {
  if (item.kind === "interval") return ["Neighboring exposure strength", "Current GEX/OI concentration"];
  const source = item.label === "High Confluence" ? item.level.confluence : item.label === "Isolated Level" ? item.level.levelIsolation : item.level.levelStrength;
  return source.inputs;
}

function SkeletonLine({ short = false }: { short?: boolean }) {
  return <i className={classNames("storySkeletonLine", short && "short")} />;
}

function StoryUnavailable({ onNavigate }: Pick<Props, "onNavigate">) {
  return <section className="marketStory marketStoryUnavailable" aria-label="Market Story awaiting provider data">
    <section className="storyHero">
      <header className="storyIntro">
        <div><span>MARKET STORY</span><h2>Today&apos;s focus</h2><p>Where should attention go today, and why?</p></div>
        <div className="storyAvailability"><CircleAlert size={15} /><span>Provider data unavailable</span></div>
      </header>
      <div className="storyNotice"><Info size={15} /><span>The workspace is ready. Focus items and evidence appear only after a supported provider-backed exposure read is available.</span></div>

      <section className="storyFocus storySkeletonFocus" aria-busy="true">
        <header><div><span>01</span><div><small>Today&apos;s Focus</small><h3>Attention first</h3></div></div><p>Awaiting provider-backed exposure</p></header>
        <div className="storyFocusGrid">{Array.from({ length: 3 }, (_, index) => <article key={index}><SkeletonLine short /><SkeletonLine /><SkeletonLine short /></article>)}</div>
      </section>
    </section>

    <section className="storyEvidence storyUnavailableGrid" aria-busy="true">
      <article><header><span>02</span><div><small>Why It Matters</small><h3>Selected context</h3></div></header><div className="storyPlaceholder"><SkeletonLine /><SkeletonLine /><SkeletonLine short /></div></article>
      <article><header><span>03</span><div><small>Market Context</small><h3>Current structure</h3></div></header><div className="storyContextSkeleton">{Array.from({ length: 4 }, (_, index) => <SkeletonLine key={index} />)}</div></article>
    </section>

    <section className="storyWatch storySkeletonWatch" aria-busy="true"><header><span>04</span><div><small>Watch</small><h3>Provider context</h3></div></header><div><SkeletonLine /><SkeletonLine short /></div></section>
    <section className="storyLevels storySkeletonLevels" aria-busy="true"><header><div><span>05</span><div><small>Key Levels</small><h3>Engine-ranked structure</h3></div></div><p>No level values are shown without provider data.</p></header>{Array.from({ length: 4 }, (_, index) => <div key={index}><SkeletonLine short /><SkeletonLine /><SkeletonLine short /></div>)}</section>

    <StoryExplore onNavigate={onNavigate} />
  </section>;
}

function StoryExplore({ onNavigate }: Pick<Props, "onNavigate">) {
  const destinations: Array<{ view: ViewId; title: string; detail: string; icon: typeof ChartCandlestick }> = [
    { view: "chart", title: "Chart", detail: "Inspect price action", icon: ChartCandlestick },
    { view: "heatmap", title: "Heatmap", detail: "Inspect concentration", icon: TableProperties },
    { view: "gex", title: "GEX Intelligence", detail: "Inspect scored structure", icon: Network },
  ];
  return <section className="storyExplore">
    <header><span>05</span><div><small>Explore</small><h3>Inspect the evidence</h3></div></header>
    <div>{destinations.map(({ view, title, detail, icon: Icon }) => <button key={view} type="button" onClick={() => onNavigate(view)}><Icon size={17} /><span><b>{title}</b><small>{detail}</small></span><ArrowUpRight size={16} /></button>)}</div>
  </section>;
}

export function MarketStoryPanel({ market, flow, onNavigate }: Props) {
  const availableMarket = market && market.provenance.mode !== "unavailable" && market.exposure?.rows.length ? market : null;
  const intelligence = useMemo(() => availableMarket ? analyzeGexIntelligence(availableMarket) : null, [availableMarket]);
  const focus = useMemo(() => intelligence?.availability === "available" ? makeFocus(intelligence.levels, intelligence.liquidityVacuum.intervals) : [], [intelligence]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = focus.find((item) => item.id === selectedId) ?? focus[0] ?? null;
  const watch = useMemo(() => {
    const darkPoolLevels = (flow?.raw?.darkPoolPriceLevels ?? []).flatMap((item) => item.price !== null && item.darkPoolVolume !== null ? [{ price: item.price, volume: item.darkPoolVolume }] : []).sort((left, right) => right.volume - left.volume);
    const flowTrades = (flow?.raw?.optionTrades ?? []).flatMap((item) => item.strike !== null && item.premium !== null ? [{ strike: item.strike, premium: item.premium, side: item.side }] : []).sort((left, right) => right.premium - left.premium);
    const topDarkPool = darkPoolLevels[0] ?? null;
    const topFlow = flowTrades[0] ?? null;
    return [
      topDarkPool ? { label: "Dark Pool", value: price(topDarkPool.price), detail: `${topDarkPool.volume.toLocaleString()} reported dark-pool volume` } : null,
      topFlow ? { label: "Options Flow", value: money(topFlow.premium), detail: `${topFlow.side ? `${topFlow.side} ` : ""}trade at ${price(topFlow.strike)}` } : null,
    ].filter((item): item is { label: string; value: string; detail: string } => item !== null);
  }, [flow]);

  if (!availableMarket || !intelligence || intelligence.availability === "unavailable" || !focus.length) {
    return <StoryUnavailable onNavigate={onNavigate} />;
  }

  const context = [
    { label: "Market Clarity", value: scoreValue(intelligence.marketClarity), detail: intelligence.marketClarity.direction, available: intelligence.marketClarity.availability === "available" },
    { label: "Call Wall", value: availableMarket.metrics.callWall.method === "unavailable" || availableMarket.snapshot.callWall <= 0 ? null : price(availableMarket.snapshot.callWall), detail: availableMarket.metrics.callWall.label, available: availableMarket.metrics.callWall.method !== "unavailable" && availableMarket.snapshot.callWall > 0 },
    { label: "Put Wall", value: availableMarket.metrics.putWall.method === "unavailable" || availableMarket.snapshot.putWall <= 0 ? null : price(availableMarket.snapshot.putWall), detail: availableMarket.metrics.putWall.label, available: availableMarket.metrics.putWall.method !== "unavailable" && availableMarket.snapshot.putWall > 0 },
    { label: "Zero Gamma", value: availableMarket.metrics.zeroGamma.method === "unavailable" || availableMarket.snapshot.zeroGamma <= 0 ? null : price(availableMarket.snapshot.zeroGamma), detail: availableMarket.metrics.zeroGamma.label, available: availableMarket.metrics.zeroGamma.method !== "unavailable" && availableMarket.snapshot.zeroGamma > 0 },
  ];

  return <section className="marketStory" aria-label="Market Story">
    <section className="storyHero">
      <header className="storyIntro">
        <div><span>MARKET STORY</span><h2>Today&apos;s focus</h2><p>Where should attention go today, and why?</p></div>
        <div className="storySymbol"><Compass size={16} /><b>{availableMarket.symbol}</b><small>{availableMarket.provenance.label}</small></div>
      </header>

      <section className="storyFocus" aria-label="Today's Focus">
        <header><div><span>01</span><div><small>Today&apos;s Focus</small><h3>Start here</h3></div></div><p>Up to three current engine-ranked focus items.</p></header>
        <div className="storyFocusGrid">{focus.map((item, index) => <button type="button" key={item.id} className={classNames(selected?.id === item.id && "selected")} onClick={() => setSelectedId(item.id)} aria-pressed={selected?.id === item.id}><span className="storyFocusIndex">0{index + 1}</span><small>{item.label}</small><strong>{focusRange(item)}</strong><p>{item.kind === "level" ? item.level.direction === "positive" ? "Positive exposure" : item.level.direction === "negative" ? "Negative exposure" : "Balanced exposure" : item.interval.location.replace("_", " ")}</p>{item.score !== null && <em>{item.score}/100</em>}</button>)}</div>
      </section>
    </section>

    <section className="storyEvidence">
      <article className="storyWhy"><header><span>02</span><div><small>Why It Matters</small><h3>{selected ? focusRange(selected) : "Unavailable"}</h3></div></header>{selected ? <><p>{selected.reason}</p><ul>{detailInputs(selected).map((input) => <li key={input}>{input}</li>)}</ul></> : <p>Unavailable</p>}</article>
      <article className="storyContext"><header><span>03</span><div><small>Market Context</small><h3>Evidence, not the headline</h3></div></header><div>{context.map((item) => <section key={item.label}><small>{item.label}</small><strong>{item.available ? typeof item.value === "number" ? `${item.value}/100` : item.value : "N/A"}</strong><span>{item.available ? item.detail : "Unavailable"}</span></section>)}</div></article>
    </section>

    <section className="storyWatch" aria-label="Current provider context">
      <header><span>04</span><div><small>Watch</small><h3>Reported market context</h3></div><p>Raw provider context only. It is not a directional signal.</p></header>
      <div>{watch.length ? watch.map((item) => <article key={item.label}><small>{item.label}</small><strong>{item.value}</strong><span>{item.detail}</span></article>) : <article className="unavailable"><small>Context</small><strong>N/A</strong><span>No provider-backed Flow or Dark Pool item is currently available.</span></article>}</div>
    </section>

    <section className="storyLevels" aria-label="Key Levels">
      <header><div><span>05</span><div><small>Key Levels</small><h3>Engine-ranked structure</h3></div></div><p>Top current levels from GEX Intelligence. No additional UI ranking is applied.</p></header>
      <div className="storyLevelRows">{intelligence.levels.slice(0, 5).map((level, index) => <button type="button" key={level.strike} className={classNames(selected?.kind === "level" && selected.level.strike === level.strike && "selected")} onClick={() => setSelectedId(`level-${level.strike}`)}><span>0{index + 1}</span><strong>{price(level.strike)}</strong><small>{labelForLevel(level)}</small><b>{scoreValue(level.levelStrength) ?? "N/A"}</b><em>{scoreValue(level.confluence) ?? "N/A"}</em></button>)}</div>
    </section>

    <StoryExplore onNavigate={onNavigate} />
  </section>;
}
