"use client";

import { RefreshCw } from "lucide-react";
import type { ViewId } from "./types";

const titles: Record<ViewId, [string, string]> = {
  command: ["Command Center", "Unified market intelligence across gamma, flow, heatmap, and Trinity."],
  gamma: ["Gamma Center", "Gamma structure, positioning levels, expiry profiles, and regime signals."],
  heatmap: ["Heatmap Matrix", "Expiration-by-strike pressure with institutional GEX context."],
  trinity: ["Trinity View", "Linked SPX, SPY, and QQQ positioning with independent expiry control."],
  flow: ["Options Flow", "Filter notable options activity by asset, structure, premium, and direction."],
  chart: ["Chart Lab", "Interactive price action with gamma levels and positioning intelligence."],
  openInterest: ["Open Interest", "Daily positioning map and morning scenario brief."],
  alerts: ["Alerts", "Build precise rules for levels, flow events, and Trinity alignment."],
};

type Props = { view: ViewId; symbol: string; onSymbol: (symbol: string) => void; onRefresh: () => void; loading: boolean };

export function Header({ view, symbol, onSymbol, onRefresh, loading }: Props) {
  const [title, subtitle] = titles[view];
  return <header className="top">
    <div className="title"><div className="logo">ϟ</div><div><h1>{title}</h1><p>{subtitle}</p></div></div>
    <div className="actions">
      <select className="control" aria-label="Asset type" defaultValue="all"><option value="all">All Assets</option><option value="index">Indexes</option><option value="etf">ETFs</option><option value="stock">Stocks</option></select>
      <input className="control search" value={symbol} onChange={(event) => onSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9.]/g, ""))} onBlur={(event) => onSymbol(event.target.value || "SPY")} aria-label="Ticker symbol" placeholder="SPY" />
      <button className="btn" type="button">AR / EN</button>
      <button className="btn good" type="button" onClick={onRefresh} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : undefined} /> Sync Feed</button>
    </div>
  </header>;
}
