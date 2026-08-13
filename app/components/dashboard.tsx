import type { MarketRead } from "../lib/market/types";
import { money, price } from "./utils";

type Props = { market: MarketRead | null; loading: boolean };

export function Dashboard({ market, loading }: Props) {
  const available = market?.provenance.mode !== "unavailable";
  const metrics = available ? market?.metrics : undefined;
  const gexSource = metrics?.netGex.method === "reported" ? "Provider-native" : metrics?.netGex.method === "derived" ? "Chain-derived" : "Unavailable";
  const values = [
    ["Spot", metrics?.spot.value ?? null, "green", available ? market?.symbol ?? "--" : "Unavailable", price],
    ["Net GEX", metrics?.netGex.value ?? null, "green", gexSource, money],
    ["Call GEX", metrics?.callGex.value ?? null, "green", gexSource, money],
    ["Put GEX", metrics?.putGex.value ?? null, "red", gexSource, money],
    ["Zero Gamma", metrics?.zeroGamma.value ?? null, "yellow", available ? market?.range ?? "0DTE" : "Unavailable", price],
    ["Call Wall", metrics?.callWall.value ?? null, "cyan", available ? "Provider level" : "Unavailable", price],
    ["Put Wall", metrics?.putWall.value ?? null, "red", available ? "Provider level" : "Unavailable", price],
  ] as const;
  return <section className="commandBrief" aria-label="Command Center market brief">
    <header>
      <div><span>COMMAND CENTER</span><h2>{available ? `${market?.symbol} market brief` : "Market brief"}</h2><p>Current provider-backed state, organized for a fast read before deeper workspaces.</p></div>
      <div className="commandBriefStatus"><small>DATA STATUS</small><strong>{available ? market?.provenance.label ?? "Available" : "Unavailable"}</strong></div>
    </header>
    <div className="stats" aria-busy={loading}>
      {values.map(([label, value, tone, detail, format]) => <article key={label} className="stat"><label>{label}</label><strong className={tone}>{loading || value === null ? "--" : format(value)}</strong><small>{detail}</small></article>)}
    </div>
  </section>;
}
