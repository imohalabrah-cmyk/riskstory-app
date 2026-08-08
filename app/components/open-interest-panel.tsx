"use client";

import { useMemo, useState } from "react";
import type { OpenInterestDashboard } from "../lib/open-interest/types";
import { price } from "./utils";

type Props = { data: OpenInterestDashboard | null };

export function OpenInterestPanel({ data }: Props) {
  const [date, setDate] = useState("");
  const summaries = useMemo(() => data?.summaries ?? [], [data]);
  return <section className="oiView"><header className="oiHeroBand"><div><span>OCC OPEN INTEREST / MORNING BRIEF</span><h2>تمركزات العقد اليومية من OCC</h2><p>Daily call and put open interest, preserved by OCC contract date.</p></div><label>Contract date <input className="control" type="date" value={date || data?.summaryDate || ""} onChange={(event) => setDate(event.target.value)} /></label></header>
    {!data ? <div className="surfaceEmpty"><strong>Open-interest data unavailable</strong><span>Sync a verified OCC daily contract to populate this view.</span></div> : <div className="oiCards">{summaries.map((summary) => <article className="oiCard" key={summary.symbol}><header><div><span>{summary.displayName}</span><b>{summary.symbol}</b></div><small>{summary.contractDate}</small></header><div className="oiMetrics"><div className="put"><small>Put wall</small><strong>{price(summary.lowerZone)}</strong></div><div><small>Daily pivot</small><strong>{price(summary.pivot)}</strong></div><div className="call"><small>Call wall</small><strong>{price(summary.upperZone)}</strong></div></div><div className="oiLevels"><section><h3>Put concentrations</h3>{summary.puts.map((level) => <div key={level.strike}><b>{price(level.strike)}</b><i style={{ width: `${Math.min(100, level.openInterest / Math.max(...summary.puts.map((row) => row.openInterest)) * 100)}%` }} /><span>{level.openInterest.toLocaleString()}</span></div>)}</section><section><h3>Call concentrations</h3>{summary.calls.map((level) => <div key={level.strike}><b>{price(level.strike)}</b><i style={{ width: `${Math.min(100, level.openInterest / Math.max(...summary.calls.map((row) => row.openInterest)) * 100)}%` }} /><span>{level.openInterest.toLocaleString()}</span></div>)}</section></div><p className="oiScenario">{summary.scenarioAr}</p></article>)}</div>}</section>;
}
