"use client";

import { RefreshCw } from "lucide-react";
import type { ViewId } from "./types";

const titles: Record<ViewId, [string, string]> = {
  command: ["Command Center", "Unified market intelligence across gamma, flow, heatmap, and Trinity."],
  gamma: ["Gamma Center", "Gamma structure, positioning levels, expiry profiles, and regime signals."],
  gex: ["GEX Intelligence", "Provider-backed GEX structure, scored levels, and exposure context."],
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
  const commitSymbol = (value: string) => onSymbol(value.toUpperCase().replace(/[^A-Z0-9.]/g, "") || "SPY");
  return <header className="top">
    <div className="title"><div className="logo">ϟ</div><div><h1>{title}</h1><p>{subtitle}</p></div></div>
    <div className="actions">
      <input key={symbol} className="control search" defaultValue={symbol} onKeyDown={(event) => { if (event.key === "Enter") commitSymbol(event.currentTarget.value); }} onBlur={(event) => commitSymbol(event.currentTarget.value)} aria-label="Ticker symbol" placeholder="SPY" />
      <button className="btn good" type="button" onClick={onRefresh} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : undefined} /> Sync Feed</button>
    </div>
  </header>;
}
