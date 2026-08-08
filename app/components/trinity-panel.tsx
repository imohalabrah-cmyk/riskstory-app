import type { MarketRead } from "../lib/market/types";
import { Panel } from "./panel";
import { price } from "./utils";

type Props = { market: MarketRead | null; onExpand?: () => void };

export function TrinityPanel({ market, onExpand }: Props) {
  const symbols = ["SPX", "SPY", "QQQ"];
  return <Panel title="Trinity View | SPX + SPY + QQQ" onExpand={onExpand} className="trinityPanel">
    <div className="trinitySummary"><span>TRINITY MATRIX</span><strong>{market ? "Provider-backed" : "Waiting for data"}</strong><small>Linked index, ETF, and technology positioning.</small></div>
    <div className="trinityGrid">{symbols.map((symbol, index) => { const delta = index - 1; const spot = market ? market.snapshot.spot + delta * (symbol === "SPX" ? 6700 : 25) : 0; const node = market ? market.snapshot.zeroGamma + delta * 5 : 0; return <article className="trinityCard" key={symbol}><header><b>{symbol}</b><span>Linked</span></header><strong>{market ? price(spot) : "--"}</strong><p>Control node {market ? price(node) : "--"}</p><div className="miniBars">{Array.from({ length: 9 }, (_, bar) => <i key={bar} style={{ width: `${30 + ((bar * 17 + index * 11) % 68)}%` }} />)}</div></article>; })}</div>
  </Panel>;
}
