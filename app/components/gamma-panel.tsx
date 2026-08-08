"use client";

import { useState } from "react";
import type { MarketRead } from "../lib/market/types";
import { Panel } from "./panel";
import { classNames, money, price } from "./utils";

type Props = { market: MarketRead | null; onExpand?: () => void };

export function GammaPanel({ market, onExpand }: Props) {
  const [tab, setTab] = useState("Net GEX");
  const rows = market?.exposure?.rows?.slice(0, 25) ?? [];
  return <Panel title="Strike Profile | Gamma Exposure" onExpand={onExpand} actions={<div className="chips">{["Net GEX", "Call / Put", "Table"].map((item) => <button type="button" key={item} className={classNames("chip", tab === item && "active")} onClick={() => setTab(item)}>{item}</button>)}</div>}>
    {!market || !rows.length ? <div className="surfaceEmpty"><strong>Gamma profile unavailable</strong><span>No provider-backed option-chain rows were returned.</span></div> : tab === "Table" ? <div className="tablewrap"><table className="dataTable"><thead><tr><th>Strike</th><th>Call GEX</th><th>Put GEX</th><th>Net GEX</th><th>Call OI</th><th>Put OI</th></tr></thead><tbody>{rows.map((row) => <tr key={row.strike}><th>{price(row.strike)}</th><td className="green">{money(row.callGex)}</td><td className="red">{money(row.putGex)}</td><td className={row.netGex >= 0 ? "green" : "red"}>{money(row.netGex)}</td><td>{row.callOpenInterest.toLocaleString()}</td><td>{row.putOpenInterest.toLocaleString()}</td></tr>)}</tbody></table></div> : <div className="gammaBars">{rows.map((row) => { const maximum = Math.max(...rows.map((item) => Math.max(Math.abs(item.callGex), Math.abs(item.putGex))), 1); return <div className="gammaBar" key={row.strike}><div className="call" style={{ height: `${Math.max(4, Math.abs(row.callGex) / maximum * 100)}%` }} /><div className="put" style={{ height: `${Math.max(4, Math.abs(row.putGex) / maximum * 100)}%` }} /><span>{price(row.strike)}</span></div>; })}</div>}
  </Panel>;
}
