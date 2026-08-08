import type { MarketRead } from "../lib/market/types";
import { Panel } from "./panel";
import { price } from "./utils";

type Props = { reads: Record<"SPX" | "SPY" | "QQQ", MarketRead | null>; onExpand?: () => void };

export function TrinityPanel({ reads, onExpand }: Props) {
  const symbols = ["SPX", "SPY", "QQQ"];
  const usable = (symbol: string) => {
    const read = reads[symbol as keyof typeof reads];
    return read?.provenance.mode === "unavailable" ? null : read;
  };
  const available = symbols.filter((symbol) => usable(symbol)).length;
  return <Panel title="Trinity View | SPX + SPY + QQQ" onExpand={onExpand} className="trinityPanel">
    <div className="trinitySummary"><span>TRINITY MATRIX</span><strong>{available === 3 ? "Provider-backed" : "Partial / unavailable"}</strong><small>{available}/3 independent provider reads available.</small></div>
    <div className="trinityGrid">{symbols.map((symbol) => { const read = usable(symbol); return <article className="trinityCard" key={symbol}><header><b>{symbol}</b><span>{read?.provenance.mode ?? "unavailable"}</span></header><strong>{read ? price(read.snapshot.spot) : "--"}</strong><p>Control node {read ? price(read.snapshot.zeroGamma) : "--"}</p>{read ? <div className="miniBars"><i style={{ width: `${Math.max(12, Math.min(100, read.quality.completeness))}%` }} /></div> : <small className="unavailable">Provider read unavailable</small>}</article>; })}</div>
  </Panel>;
}
