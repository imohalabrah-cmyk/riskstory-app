"use client";

import { useMemo, useState } from "react";
import type { ExposureStrike, MarketRead } from "../lib/market/types";
import { Panel } from "./panel";
import { classNames, money, price } from "./utils";

type Props = { market: MarketRead | null; title?: string; onExpand?: () => void };

export function HeatmapPanel({ market, title = "GEX Heatmap by Expiration", onExpand }: Props) {
  const availableMarket = market?.provenance.mode === "unavailable" ? null : market;
  const [mode, setMode] = useState<"GEX" | "Call / Put" | "DEX" | "Vanna" | "Charm" | "Volume" | "OI">("GEX");
  const [range, setRange] = useState("Near");
  const expirations = availableMarket?.exposure?.expirations ?? [];
  const rows = useMemo(() => availableMarket?.exposure?.rows ?? [], [availableMarket]);
  const visibleRows = useMemo(() => {
    if (!availableMarket) return [];
    const spot = availableMarket.snapshot.spot;
    const ordered = [...rows].sort((left, right) => Math.abs(left.strike - spot) - Math.abs(right.strike - spot));
    if (range === "All") return [...rows].sort((left, right) => right.strike - left.strike);
    if (range === "Near") return ordered.slice(0, 21).sort((left, right) => right.strike - left.strike);
    const distance = range === "+/-5" ? 5 : 10;
    return rows.filter((row) => Math.abs(row.strike - spot) <= distance).sort((left, right) => right.strike - left.strike);
  }, [availableMarket, range, rows]);
  const values = (row: ExposureStrike) => mode === "Call / Put" ? row.callGex - row.putGex : mode === "DEX" ? row.netDex : mode === "Vanna" ? row.netVanna : mode === "Charm" ? row.netCharm : mode === "Volume" ? row.callVolume - row.putVolume : mode === "OI" ? row.callOpenInterest - row.putOpenInterest : row.netGex;
  const maximum = Math.max(1, ...visibleRows.map((row) => Math.abs(values(row))));
  return <Panel title={title} onExpand={onExpand} actions={<div className="chips">{["GEX", "Call / Put", "DEX", "Vanna", "Charm", "Volume", "OI"].map((item) => <button key={item} type="button" className={classNames("chip", mode === item && "active")} onClick={() => setMode(item as typeof mode)}>{item}</button>)}</div>} className="heatPanel">
    <div className="heatToolbar"><span><b>{availableMarket?.symbol ?? "--"}</b> {availableMarket ? price(availableMarket.snapshot.spot) : "--"}</span><div className="chips">{["Near", "+/-5", "+/-10", "All"].map((item) => <button type="button" key={item} onClick={() => setRange(item)} className={classNames("chip", range === item && "active")}>{item}</button>)}</div></div>
    {!availableMarket || !rows.length ? <div className="surfaceEmpty"><strong>Heatmap unavailable</strong><span>Provider-backed option-chain rows are not available for this symbol.</span></div> : !visibleRows.length ? <div className="surfaceEmpty"><strong>No strikes in selected range</strong><span>The provider returned no strikes within {range} of spot.</span></div> : <div className="matrixScroller" tabIndex={0}><table className="matrixTable"><thead><tr><th>Strike</th>{expirations.slice(0, 8).map((expiry) => <th key={expiry.expiration}>{expiry.expiration}</th>)}<th>Net GEX</th></tr></thead><tbody>{visibleRows.map((row) => { const intensity = Math.max(0.08, Math.abs(values(row)) / maximum); const positive = values(row) >= 0; return <tr key={row.strike} className={Math.abs(row.strike - availableMarket.snapshot.spot) < 0.01 ? "spotRow" : undefined}><th>{price(row.strike)}</th>{expirations.slice(0, 8).map((expiry) => { const target = expiry.rows.find((item) => item.strike === row.strike); const value = target ? values(target) : 0; return <td key={expiry.expiration} className={value >= 0 ? "positive" : "negative"} style={{ "--cell-alpha": Math.max(0.06, Math.abs(value) / maximum) } as React.CSSProperties}>{money(value)}</td>; })}<td className={positive ? "positive net" : "negative net"} style={{ "--cell-alpha": intensity } as React.CSSProperties}>{money(values(row))}</td></tr>; })}</tbody></table></div>}
  </Panel>;
}
