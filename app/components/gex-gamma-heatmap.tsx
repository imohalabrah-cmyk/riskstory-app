"use client";

import { useMemo, useState } from "react";
import type { ExposureStrike } from "../lib/market/types";
import { buildGexHeatmapRows, type CurveLayer, type CurveSide, type GexHeatmapCell } from "../lib/gex-curve/curve-data";
import { money, price } from "./utils";

type Props = {
  rows: ExposureStrike[];
  layer: CurveLayer;
  side: CurveSide;
  spot: number;
  selectedStrike: number | null;
  onSelectStrike: (strike: number) => void;
};

function activeCellId(layer: CurveLayer, side: CurveSide) {
  if (layer === "netGex") return "netGex";
  if (layer === "openInterest") return side === "calls" ? "callOpenInterest" : side === "puts" ? "putOpenInterest" : "combinedOpenInterest";
  return side === "calls" ? "callGex" : side === "puts" ? "putGex" : "grossGex";
}

function displayValue(cell: GexHeatmapCell) {
  if (cell.value === null) return "N/A";
  return cell.unit === "contracts" ? Math.round(cell.value).toLocaleString() : money(cell.value);
}

export function GexGammaHeatmap({ rows, layer, side, spot, selectedStrike, onSelectStrike }: Props) {
  const [hovered, setHovered] = useState<{ strike: number; cell: GexHeatmapCell } | null>(null);
  const matrix = useMemo(() => buildGexHeatmapRows(rows, layer), [rows, layer]);
  const maximum = Math.max(...matrix.flatMap((row) => row.cells.map((cell) => Math.abs(cell.value ?? 0))), 1);
  const activeId = activeCellId(layer, side);
  const closestSpotStrike = matrix.length && Number.isFinite(spot) && spot > 0 ? matrix.reduce((closest, row) => Math.abs(row.strike - spot) < Math.abs(closest.strike - spot) ? row : closest).strike : null;
  const columns = matrix[0]?.cells ?? [];

  if (!matrix.length || !columns.length) {
    return <div className="gexCurveEmpty"><strong>No supported exposure matrix rows are available.</strong><span>The provider returned no finite strike values for the selected lens.</span></div>;
  }

  return <div className="gexHeatmap" aria-label={`${layer} strike exposure matrix`}>
    <div className="gexCurveMeta"><span>Strike exposure matrix</span><small>{hovered ? `${price(hovered.strike)} · ${hovered.cell.label}: ${displayValue(hovered.cell)}` : "Current chain snapshot"}</small></div>
    <div className="gexHeatmapLegend"><span><i className="negative" />Negative signed exposure</span><span><i className="neutral" />Low magnitude</span><span><i className="positive" />Positive or higher magnitude</span></div>
    <div className="gexHeatmapGrid" style={{ "--gex-heatmap-columns": columns.length } as React.CSSProperties}>
      <div className="gexHeatmapHead">Strike</div>{columns.map((cell) => <div key={cell.id} className={cell.id === activeId ? "gexHeatmapHead active" : "gexHeatmapHead"}>{cell.label}</div>)}
      {matrix.map((row) => <div className={row.strike === closestSpotStrike ? "gexHeatmapRow spot" : "gexHeatmapRow"} key={row.strike}><button type="button" className={row.strike === selectedStrike ? "gexHeatmapStrike selected" : "gexHeatmapStrike"} onClick={() => onSelectStrike(row.strike)}>{price(row.strike)}{row.strike === closestSpotStrike && <small>near spot</small>}</button>{row.cells.map((cell) => {
        const magnitude = Math.min(1, Math.abs(cell.value ?? 0) / maximum);
        const tone = cell.value === null ? "missing" : cell.signed && cell.value < 0 ? "negative" : "positive";
        const title = `Strike ${price(row.strike)} · ${cell.label}: ${displayValue(cell)}${row.totalOpenInterest === null ? "" : ` · Open interest: ${row.totalOpenInterest.toLocaleString()}`}`;
        return <button key={cell.id} type="button" className={`gexHeatmapCell ${tone}${cell.id === activeId ? " active" : ""}`} style={{ "--gex-cell-strength": magnitude } as React.CSSProperties} aria-label={title} onClick={() => onSelectStrike(row.strike)} onMouseEnter={() => setHovered({ strike: row.strike, cell })} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered({ strike: row.strike, cell })} onBlur={() => setHovered(null)}><span>{displayValue(cell)}</span><i /><title>{title}</title></button>;
      })}</div>)}
    </div>
    <p>Rows are returned provider strikes. Columns are actual current-chain exposure dimensions, not expirations or time periods.</p>
  </div>;
}
