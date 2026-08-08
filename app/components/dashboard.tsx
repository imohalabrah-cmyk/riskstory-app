import type { MarketRead } from "../lib/market/types";
import { money, price } from "./utils";

type Props = { market: MarketRead | null; loading: boolean };

export function Dashboard({ market, loading }: Props) {
  const available = market?.provenance.mode !== "unavailable";
  const metrics = available ? market?.metrics : undefined;
  const values = [
    ["Spot", metrics?.spot.value ?? null, "green", available ? market?.symbol ?? "--" : "Unavailable", price],
    ["Net GEX", metrics?.netGex.value ?? 0, "green", "Chain-derived", money],
    ["Call GEX", metrics?.callGex.value ?? 0, "green", "Chain-derived", money],
    ["Put GEX", metrics?.putGex.value ?? 0, "red", "Chain-derived", money],
    ["Zero Gamma", metrics?.zeroGamma.value ?? null, "yellow", available ? market?.range ?? "0DTE" : "Unavailable", price],
    ["Call Wall", metrics?.callWall.value ?? 0, "cyan", "Resistance", price],
    ["Put Wall", metrics?.putWall.value ?? 0, "red", "Support", price],
  ] as const;
  return <div className="stats" aria-busy={loading}>
    {values.map(([label, value, tone, detail, format]) => <article key={label} className="stat"><label>{label}</label><strong className={tone}>{loading || value === null ? "--" : format(value)}</strong><small>{detail}</small></article>)}
  </div>;
}
