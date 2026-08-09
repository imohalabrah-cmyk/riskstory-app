"use client";

import { useState } from "react";
import type { ExposureStrike } from "../lib/market/types";
import { buildGexCurvePoints, curveMeasure, type CurveLayer, type CurveSide } from "../lib/gex-curve/curve-data";
import { money, price } from "./utils";

type Props = {
  rows: ExposureStrike[];
  layer: CurveLayer;
  side: CurveSide;
  spot: number;
  selectedStrike: number | null;
  onSelectStrike: (strike: number) => void;
};

const WIDTH = 1000;
const HEIGHT = 440;
const PADDING = { top: 42, right: 38, bottom: 50, left: 70 };

function displayValue(value: number, unit: "gex" | "contracts") {
  return unit === "contracts" ? Math.round(value).toLocaleString() : money(value);
}

export function GexGammaHistogram({ rows, layer, side, spot, selectedStrike, onSelectStrike }: Props) {
  const [hoveredStrike, setHoveredStrike] = useState<number | null>(null);
  const points = buildGexCurvePoints(rows, layer, side);
  const measure = curveMeasure(layer, side);
  const values = points.map((point) => point.value);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const span = Math.max(maxValue - minValue, 1);
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const yFor = (value: number) => PADDING.top + (maxValue - value) / span * plotHeight;
  const zeroY = yFor(0);
  const barStep = plotWidth / Math.max(points.length, 1);
  const barWidth = Math.max(3, Math.min(22, barStep * .7));
  const spotIndex = points.length && Number.isFinite(spot) && spot > 0
    ? points.reduce((closest, point, index) => Math.abs(point.strike - spot) < Math.abs(points[closest].strike - spot) ? index : closest, 0)
    : null;
  const hovered = points.find((point) => point.strike === hoveredStrike) ?? null;

  if (!points.length) {
    return <div className="gexCurveEmpty"><strong>No supported {measure.label.toLowerCase()} rows are available.</strong><span>The provider returned no finite strike values for the selected lens.</span></div>;
  }

  return <div className="gexHistogram" aria-label={`${measure.label} histogram by strike`}>
    <div className="gexCurveMeta"><span>{measure.label} histogram</span><small>{hovered ? `${price(hovered.strike)} · ${displayValue(hovered.value, measure.unit)}` : "Current chain snapshot"}</small></div>
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${measure.label} histogram across ${points.length} provider-backed strikes`}>
      {[maxValue, 0, minValue].filter((value, index, values) => values.indexOf(value) === index).map((value) => <g key={value}><line className="gexCurveGrid" x1={PADDING.left} x2={WIDTH - PADDING.right} y1={yFor(value)} y2={yFor(value)} /><text className="gexCurveAxis" x={PADDING.left - 12} y={yFor(value) + 4} textAnchor="end">{displayValue(value, measure.unit)}</text></g>)}
      <line className="gexCurveBaseline" x1={PADDING.left} x2={WIDTH - PADDING.right} y1={zeroY} y2={zeroY} />
      {spotIndex !== null && <g className="gexHistogramSpot"><line x1={PADDING.left + (spotIndex + .5) * barStep} x2={PADDING.left + (spotIndex + .5) * barStep} y1={PADDING.top} y2={HEIGHT - PADDING.bottom} /><text x={PADDING.left + (spotIndex + .5) * barStep} y={PADDING.top - 12} textAnchor="middle">Spot {price(spot)}</text></g>}
      {points.map((point, index) => {
        const selected = point.strike === selectedStrike;
        const x = PADDING.left + index * barStep + (barStep - barWidth) / 2;
        const y = point.value >= 0 ? yFor(point.value) : zeroY;
        const height = Math.max(point.value === 0 ? 1 : 3, Math.abs(yFor(point.value) - zeroY));
        const title = `Strike ${price(point.strike)} · ${measure.label}: ${displayValue(point.value, measure.unit)}`;
        return <g key={point.strike} className={selected ? "selected" : undefined} onMouseEnter={() => setHoveredStrike(point.strike)} onMouseLeave={() => setHoveredStrike(null)}><rect className={point.value < 0 ? "gexHistogramBar negative" : "gexHistogramBar"} x={x} y={y} width={barWidth} height={height} rx={2.5} tabIndex={0} role="button" aria-label={title} onClick={() => onSelectStrike(point.strike)} onFocus={() => setHoveredStrike(point.strike)} onBlur={() => setHoveredStrike(null)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelectStrike(point.strike); }}><title>{title}</title></rect></g>;
      })}
      {[points[0]?.strike, points[Math.floor(points.length / 2)]?.strike, points.at(-1)?.strike].filter((strike, index, values) => Number.isFinite(strike) && values.indexOf(strike) === index).map((strike) => { const index = points.findIndex((point) => point.strike === strike); return <text className="gexCurveAxis" key={strike} x={PADDING.left + (index + .5) * barStep} y={HEIGHT - 18} textAnchor="middle">{price(strike ?? 0)}</text>; })}
    </svg>
    <p>Each column is one returned strike in the current provider-backed chain. The zero baseline is retained when the selected measure is signed.</p>
  </div>;
}
