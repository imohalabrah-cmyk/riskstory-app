"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, List, MapPin } from "lucide-react";
import { useIntelligenceSelection } from "../lib/intelligence/selection-context";
import { buildOpenInterestStudioRead, closestOpenInterestStrike, findOpenInterestRow, openInterestRowsForExpiration, type OpenInterestStudioRow } from "../lib/open-interest-studio/data";
import type { MarketRead } from "../lib/market/types";
import { classNames, price } from "./utils";

type View = "profile" | "ladder";
type Props = { market: MarketRead | null };

function contracts(value: number | null) {
  return value === null ? "N/A" : value.toLocaleString();
}

function distanceFromSpot(strike: number, spot: number | null) {
  if (spot === null) return "N/A";
  const distance = strike - spot;
  return `${distance >= 0 ? "+" : ""}${distance.toFixed(2)} pts`;
}

function maximumReported(rows: OpenInterestStudioRow[]) {
  return Math.max(1, ...rows.flatMap((row) => [row.callOpenInterest, row.putOpenInterest].filter((value): value is number => value !== null)));
}

function OpenInterestProfile({ rows, spot, selectedStrike, onSelect }: { rows: OpenInterestStudioRow[]; spot: number | null; selectedStrike: number | null; onSelect: (strike: number) => void }) {
  const maximum = useMemo(() => maximumReported(rows), [rows]);
  const spotStrike = useMemo(() => closestOpenInterestStrike(rows, spot), [rows, spot]);
  return <div className="oiProfile" role="list" aria-label="Call and put open interest profile by strike">
    <div className="oiProfileHead"><span>Call OI</span><span>Strike</span><span>Put OI</span></div>
    {rows.map((row) => {
      const selected = row.strike === selectedStrike;
      const nearSpot = row.strike === spotStrike;
      const callWidth = row.callOpenInterest === null ? 0 : row.callOpenInterest / maximum * 100;
      const putWidth = row.putOpenInterest === null ? 0 : row.putOpenInterest / maximum * 100;
      return <button key={row.strike} type="button" className={classNames("oiProfileRow", selected && "selected", nearSpot && "nearSpot")} onClick={() => onSelect(row.strike)} aria-pressed={selected}>
        <span className="oiProfileMeasure calls"><i style={{ width: `${callWidth}%` }} /><b>{contracts(row.callOpenInterest)}</b></span>
        <strong>{price(row.strike)}{nearSpot && <small>near spot</small>}</strong>
        <span className="oiProfileMeasure puts"><b>{contracts(row.putOpenInterest)}</b><i style={{ width: `${putWidth}%` }} /></span>
      </button>;
    })}
  </div>;
}

function OpenInterestLadder({ rows, spot, selectedStrike, onSelect }: { rows: OpenInterestStudioRow[]; spot: number | null; selectedStrike: number | null; onSelect: (strike: number) => void }) {
  return <div className="oiLadderWrap"><table className="oiLadder"><thead><tr><th>Strike</th><th>Call OI</th><th>Put OI</th><th>Combined OI</th><th>Call volume</th><th>Put volume</th><th>Combined volume</th></tr></thead><tbody>{rows.map((row) => <tr key={row.strike} className={classNames(row.strike === selectedStrike && "selected", spot !== null && Math.abs(row.strike - spot) < .01 && "spot")}><th><button type="button" onClick={() => onSelect(row.strike)}>{price(row.strike)}</button></th><td>{contracts(row.callOpenInterest)}</td><td>{contracts(row.putOpenInterest)}</td><td>{contracts(row.combinedOpenInterest)}</td><td>{contracts(row.callVolume)}</td><td>{contracts(row.putVolume)}</td><td>{contracts(row.combinedVolume)}</td></tr>)}</tbody></table></div>;
}

export function OpenInterestPanel({ market }: Props) {
  const [view, setView] = useState<View>("profile");
  const [expiration, setExpiration] = useState("");
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const { selection, setSelection } = useIntelligenceSelection();
  const read = useMemo(() => buildOpenInterestStudioRead(market), [market]);
  const activeExpiration = read?.expirations.includes(expiration) ? expiration : read?.expirations[0] ?? "";
  const rows = useMemo(() => read ? openInterestRowsForExpiration(read, activeExpiration) : [], [activeExpiration, read]);
  const selectedRow = useMemo(() => findOpenInterestRow(rows, selectedStrike) ?? rows[0] ?? null, [rows, selectedStrike]);

  useEffect(() => {
    if (!selectedRow) return;
    setSelection({ symbol: read?.symbol ?? selection.symbol, strike: selectedRow.strike, expiration: activeExpiration, level: { id: `oi:${activeExpiration}:${selectedRow.strike}`, label: "Open interest strike" } });
  }, [activeExpiration, read?.symbol, selectedRow, selection.symbol, setSelection]);

  const selectStrike = (strike: number) => setSelectedStrike(strike);
  const unavailable = !read || !rows.length;

  return <section className="oiStudio" aria-label="Open Interest Studio">
    <header className="oiStudioHero"><div><span>OPEN INTEREST STUDIO</span><h2>{read?.symbol ?? market?.symbol ?? "Symbol"} option-chain positioning</h2><p>Current provider-backed call and put open interest at actual strikes. Open interest alone does not imply a price outcome.</p></div><div className="oiStudioSpot"><MapPin size={15} /><span>Spot</span><strong>{read?.spot === null || read?.spot === undefined ? "N/A" : price(read.spot)}</strong></div></header>

    <div className="oiStudioLayout">
      <aside className="oiToolbox" aria-label="Open interest workspace controls"><span>VIEW</span><button type="button" className={classNames(view === "profile" && "active")} onClick={() => setView("profile")}><BarChart3 size={15} />Profile</button><button type="button" className={classNames(view === "ladder" && "active")} onClick={() => setView("ladder")}><List size={15} />Ladder</button><label><span>EXPIRATION</span><select value={activeExpiration} onChange={(event) => { setExpiration(event.target.value); setSelectedStrike(null); }} disabled={!read}>{read?.expirations.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><small>One provider-returned expiration at a time. No cross-expiration aggregation is shown.</small></aside>

      <div className="oiWorkspace" id="open-interest-workspace">
        <section className="oiWorkspaceSurface"><header><div><span>{view === "profile" ? "PROFILE" : "LADDER"}</span><h3>{view === "profile" ? "Call and put open interest by strike" : "Actual option-chain open interest"}</h3></div><div className="oiWorkspaceMeta"><span>Expiration</span><strong>{activeExpiration || "N/A"}</strong></div></header>{unavailable ? <div className="surfaceEmpty oiUnavailable"><strong>Open-interest data unavailable</strong><span>A provider-backed option-chain expiration is required to populate this workspace.</span></div> : view === "profile" ? <OpenInterestProfile rows={rows} spot={read!.spot} selectedStrike={selectedRow?.strike ?? null} onSelect={selectStrike} /> : <OpenInterestLadder rows={rows} spot={read!.spot} selectedStrike={selectedRow?.strike ?? null} onSelect={selectStrike} />}</section>
        <section className="oiDetails"><span>Details</span><p>Click a real strike to inspect its reported open interest and volume. `N/A` means the provider did not report that field.</p></section>
      </div>

      <aside className="oiInspector" aria-live="polite"><header><span>Selected level</span><h3>{selectedRow ? price(selectedRow.strike) : "Unavailable"}</h3><small>{selectedRow ? distanceFromSpot(selectedRow.strike, read?.spot ?? null) : "Provider-backed strike required"}</small></header>{selectedRow ? <dl><div><dt>Expiration</dt><dd>{selectedRow.expiration}</dd></div><div><dt>Call OI</dt><dd>{contracts(selectedRow.callOpenInterest)}</dd></div><div><dt>Put OI</dt><dd>{contracts(selectedRow.putOpenInterest)}</dd></div><div><dt>Combined OI</dt><dd>{contracts(selectedRow.combinedOpenInterest)}</dd></div><div><dt>Call volume</dt><dd>{contracts(selectedRow.callVolume)}</dd></div><div><dt>Put volume</dt><dd>{contracts(selectedRow.putVolume)}</dd></div><div><dt>Combined volume</dt><dd>{contracts(selectedRow.combinedVolume)}</dd></div></dl> : <div className="oiInspectorEmpty">No provider-backed strike is available to inspect.</div>}</aside>
    </div>
  </section>;
}
