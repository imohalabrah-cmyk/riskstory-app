"use client";

import { useState } from "react";
import type { FlowRead } from "../lib/market/types";
import { Panel } from "./panel";
import { classNames, money, price } from "./utils";

type Props = { flow: FlowRead | null; compact?: boolean };

export function FlowPanel({ flow, compact = false }: Props) {
  const [kind, setKind] = useState("All");
  const rows = (flow?.rows ?? []).filter((row) => kind === "All" || row.assetType === kind.toLowerCase().slice(0, -1));
  return <Panel title="Options Flow | تدفق العقود" actions={<div className="chips">{["All", "Stocks", "Indexes", "ETFs"].map((item) => <button key={item} type="button" className={classNames("chip", kind === item && "active")} onClick={() => setKind(item)}>{item}</button>)}</div>}>
    {!rows.length ? <div className="surfaceEmpty"><strong>Options flow unavailable</strong><span>{flow?.provenance.note ?? "A dedicated options-flow provider is not connected."}</span></div> : <div className="tablewrap"><table className="dataTable"><thead><tr><th>Time</th><th>Ticker</th><th>Side</th><th>Type</th><th>Strike</th><th>Expiry</th><th>Premium</th>{!compact && <th>Volume</th>}</tr></thead><tbody>{rows.slice(0, compact ? 6 : 50).map((row, index) => <tr key={`${row.symbol}-${row.time}-${index}`}><td>{row.time}</td><th>{row.symbol}</th><td><span className={row.side === "Call" ? "tag callTag" : "tag putTag"}>{row.side}</span></td><td>{row.type}</td><td>{price(row.strike)}</td><td>{row.expiry}</td><td className={row.side === "Call" ? "green" : "red"}>{money(row.premium)}</td>{!compact && <td>{row.volume.toLocaleString()}</td>}</tr>)}</tbody></table></div>}
  </Panel>;
}
