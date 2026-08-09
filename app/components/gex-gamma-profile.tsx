"use client";

import { useState } from "react";
import type { ExposureStrike } from "../lib/market/types";
import { buildGexProfileRows, curveMeasure, type CurveLayer, type CurveSide, type GexProfileRow } from "../lib/gex-curve/curve-data";
import { money, price } from "./utils";

type Props = {
  rows: ExposureStrike[];
  layer: CurveLayer;
  side: CurveSide;
  spot: number;
  selectedStrike: number | null;
  onSelectStrike: (strike: number) => void;
};

const CHART_WIDTH = 1000;
const ROW_HEIGHT = 24;
const PADDING = { top: 40, right: 48, bottom: 30, left: 104 };

function displayValue(value: number, unit: "gex" | "contracts") {
  return unit === "contracts" ? Math.round(value).toLocaleString() : money(value);
}

function profileHeight(rows: GexProfileRow[]) {
  return Math.max(430, PADDING.top + PADDING.bottom + rows.length * ROW_HEIGHT);
}

export function GexGammaProfile({ rows, layer, side, spot, selectedStrike, onSelectStrike }: Props) {
  const [hoveredStrike, setHoveredStrike] = useState<number | null>(null);
  const points = buildGexProfileRows(rows, layer, side);
  const measure = curveMeasure(layer, side);
  const maxMagnitude = Math.max(...points.map((point) => Math.abs(point.value)), 1);
  const height = profileHeight(points);
  const plotLeft = PADDING.left;
  const plotRight = CHART_WIDTH - PADDING.right;
  const baselineX = plotLeft + (plotRight - plotLeft) / 2;
  const barLimit = (plotRight - plotLeft) / 2 - 18;
  const yForIndex = (index: number) => PADDING.top + index * ROW_HEIGHT + ROW_HEIGHT / 2;
  const spotIndex = points.length && Number.isFinite(spot) && spot > 0
    ? points.reduce((closest, point, index) => Math.abs(point.strike - spot) < Math.abs(points[closest].strike - spot) ? index : closest, 0)
    : null;
  const hovered = points.find((point) => point.strike === hoveredStrike) ?? null;

  if (!points.length) {
    return <div className="gexCurveEmpty"><strong>No supported {measure.label.toLowerCase()} rows are available.</strong><span>The provider returned no finite strike values for the selected lens.</span></div>;
  }

  return <div className="gexProfile" aria-label={`${measure.label} profile by strike`}>
    <div className="gexCurveMeta">
      <span>{measure.label} profile</span>
      <small>{hovered ? `${price(hovered.strike)} · ${displayValue(hovered.value, measure.unit)}${hovered.totalOpenInterest === null ? "" : ` · OI ${hovered.totalOpenInterest.toLocaleString()}`}` : "Current chain snapshot"}</small>
    </div>
    <div className="gexProfileCanvas">
      <svg viewBox={`0 0 ${CHART_WIDTH} ${height}`} role="img" aria-label={`${measure.label} horizontal profile across ${points.length} provider-backed strikes`}>
        <line className="gexProfileBaseline" x1={baselineX} x2={baselineX} y1={PADDING.top - 16} y2={height - PADDING.bottom} />
        <text className="gexProfileBaselineLabel" x={baselineX} y={PADDING.top - 22} textAnchor="middle">0</text>
        {spotIndex !== null && <g className="gexProfileSpot"><line x1={plotLeft} x2={plotRight} y1={yForIndex(spotIndex)} y2={yForIndex(spotIndex)} /><text x={plotRight} y={yForIndex(spotIndex) - 5} textAnchor="end">Spot {price(spot)}</text></g>}
        {points.map((point, index) => {
          const selected = point.strike === selectedStrike;
          const negative = point.value < 0;
          const width = Math.max(point.value === 0 ? 1 : 3, Math.abs(point.value) / maxMagnitude * barLimit);
          const x = negative ? baselineX - width : baselineX;
          const y = yForIndex(index) - 7;
          const title = `Strike ${price(point.strike)} · ${measure.label}: ${displayValue(point.value, measure.unit)}${point.totalOpenInterest === null ? "" : ` · Open interest: ${point.totalOpenInterest.toLocaleString()}`}`;
          return <g key={point.strike} className={selected ? "selected" : undefined} onMouseEnter={() => setHoveredStrike(point.strike)} onMouseLeave={() => setHoveredStrike(null)}>
            <line className="gexProfileRowGuide" x1={plotLeft} x2={plotRight} y1={yForIndex(index) + ROW_HEIGHT / 2} y2={yForIndex(index) + ROW_HEIGHT / 2} />
            <text className="gexProfileStrike" x={plotLeft - 14} y={yForIndex(index) + 4} textAnchor="end">{price(point.strike)}</text>
            <rect className={negative ? "gexProfileBar negative" : "gexProfileBar"} x={x} y={y} width={width} height={14} rx={4} tabIndex={0} role="button" aria-label={title} onClick={() => onSelectStrike(point.strike)} onFocus={() => setHoveredStrike(point.strike)} onBlur={() => setHoveredStrike(null)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelectStrike(point.strike); }}><title>{title}</title></rect>
          </g>;
        })}
        <text className="gexProfileAxisLabel" x={plotLeft} y={height - 8} textAnchor="start">Negative</text>
        <text className="gexProfileAxisLabel" x={plotRight} y={height - 8} textAnchor="end">Positive</text>
      </svg>
    </div>
    <p>Each bar represents one returned strike from the current provider-backed chain. No strikes, exposure values, or historical timestamps are generated.</p>
  </div>;
}
