"use client";

import { useState } from "react";
import { Panel } from "./panel";

export function AlertsPanel() {
  const [alerts, setAlerts] = useState<Array<{ symbol: string; condition: string; value: string }>>([]);
  const [symbol, setSymbol] = useState("SPY"); const [condition, setCondition] = useState("Gamma level touched"); const [value, setValue] = useState("740");
  return <div className="alertsView"><Panel title="Create alert"><form className="alertForm" onSubmit={(event) => { event.preventDefault(); setAlerts((current) => [{ symbol, condition, value }, ...current]); }}><label>Symbol<input className="control" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} /></label><label>Condition<select className="control" value={condition} onChange={(event) => setCondition(event.target.value)}><option>Gamma level touched</option><option>Put wall break</option><option>Sweep premium above</option></select></label><label>Value<input className="control" value={value} onChange={(event) => setValue(event.target.value)} /></label><button className="btn primary">Add alert</button></form></Panel><Panel title="Alert rules"><div className="alertList">{alerts.length ? alerts.map((alert, index) => <article key={`${alert.symbol}-${index}`}><b>{alert.symbol} · {alert.condition}</b><span>Trigger: {alert.value} · Armed</span></article>) : <div className="surfaceEmpty"><strong>No alerts yet</strong><span>Create a rule to monitor a price or positioning level.</span></div>}</div></Panel></div>;
}
