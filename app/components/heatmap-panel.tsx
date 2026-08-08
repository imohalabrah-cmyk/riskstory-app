"use client";

import { useMemo, useState } from "react";
import type { ExposureStrike, MarketRead } from "../lib/market/types";
import { Panel } from "./panel";
import { classNames, money, price } from "./utils";

type Props = { market: MarketRead | null; title?: string; onExpand?: () => void };

export function HeatmapPanel({ market, title = "GEX Heatmap by Expiration", onExpand }: Props) {
  const [mode, setMode] = useState<"GEX" | "Call / Put" | "DEX" | "Vanna" | "Charm" | "Volume" | "OI">("GEX");
  const [range, setRange] = useState("Near");
  const expirations = market?.exposure?.expirations ?? [];
  const rows = useMemo(() => market?.exposure?.rows?.slice(0, 28) ?? [], [market]);
  const values = (row: ExposureStrike) => mode === "Call / Put" ? row.callGex - row.putGex : mode === "DEX" ? row.netDex : mode === "Vanna" ? row.netVanna : mode === "Charm" ? row.netCharm : mode === "Volume" ? row.callVolume - row.putVolume : mode === "OI" ? row.callOpenInterest - row.putOpenInterest : row.netGex;
  const maximum = Math.max(1, ...rows.map((row) => Math.abs(values(row))));
  return <Panel title={title} onExpand={onExpand} actions={<div className="chips">{["GEX", "Call / Put", "DEX", "Vanna", "Charm", "Volume", "OI"].map((item) => <button key={item} type="button" className={classNames("chip", mode === item && "active")} onClick={() => setMode(item as typeof mode)}>{item}</button>)}</div>} className="heatPanel">
    <div className="heatToolbar"><span><b>{market?.symbol ?? "--"}</b> {market ? price(market.snapshot.spot) : "--"}</span><div className="chips">{["Near", "+/-5", "+/-10", "All"].map((item) => <button type="button" key={item} onClick={() => setRange(item)} className={classNames("chip", range === item && "active")}>{item}</button>)}</div></div>
    {!market || !rows.length ? <div className="surfaceEmpty"><strong>Heatmap unavailable</strong><span>Provider-backed option-chain rows are not available for this symbol.</span></div> : <div className="matrixScroller" tabIndex={0}><table className="matrixTable"><thead><tr><th>Strike</th>{expirations.slice(0, 8).map((expiry) => <th key={expiry.expiration}>{expiry.expiration}</th>)}<th>Net GEX</th></tr></thead><tbody>{rows.map((row) => { const intensity = Math.max(0.08, Math.abs(values(row)) / maximum); const positive = values(row) >= 0; return <tr key={row.strike} className={Math.abs(row.strike - market.snapshot.spot) < 0.01 ? "spotRow" : undefined}><th>{price(row.strike)}</th>{expirations.slice(0, 8).map((expiry) => { const target = expiry.rows.find((item) => item.strike === row.strike); const value = target ? values(target) : 0; return <td key={expiry.expiration} className={value >= 0 ? "positive" : "negative"} style={{ "--cell-alpha": Math.max(0.06, Math.abs(value) / maximum) } as React.CSSProperties}>{money(value)}</td>; })}<td className={positive ? "positive net" : "negative net"} style={{ "--cell-alpha": intensity } as React.CSSProperties}>{money(values(row))}</td></tr>; })}</tbody></table></div>}
  </Panel>;
}
