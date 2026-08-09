"use client";

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

const CHART_WIDTH = 1000;
const CHART_HEIGHT = 440;
const PADDING = { top: 44, right: 36, bottom: 46, left: 72 };

function yAxisLabel(value: number, unit: "gex" | "contracts") {
  return unit === "contracts" ? Math.round(value).toLocaleString() : money(value);
}

export function GexGammaCurve({ rows, layer, side, spot, selectedStrike, onSelectStrike }: Props) {
  const points = buildGexCurvePoints(rows, layer, side);
  const measure = curveMeasure(layer, side);
  const values = points.map((point) => point.value);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const valueSpan = Math.max(maxValue - minValue, 1);
  const minStrike = points[0]?.strike ?? 0;
  const maxStrike = points.at(-1)?.strike ?? minStrike + 1;
  const strikeSpan = Math.max(maxStrike - minStrike, 1);
  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const xFor = (strike: number) => PADDING.left + (strike - minStrike) / strikeSpan * plotWidth;
  const yFor = (value: number) => PADDING.top + (maxValue - value) / valueSpan * plotHeight;
  const zeroY = yFor(0);
  const polyline = points.map((point) => `${xFor(point.strike)},${yFor(point.value)}`).join(" ");
  const yTicks = [maxValue, (maxValue + minValue) / 2, minValue];
  const xTicks = [...new Set([minStrike, points[Math.floor(points.length / 2)]?.strike, maxStrike])].filter(Number.isFinite);
  const hasPositiveAndNegative = minValue < 0 && maxValue > 0;

  if (!points.length) {
    return <div className="gexCurveEmpty"><strong>No supported {measure.label.toLowerCase()} rows are available.</strong><span>The provider returned no finite strike values for the selected lens.</span></div>;
  }

  return <div className="gexCurve" aria-label={`${measure.label} curve by strike`}>
    <div className="gexCurveMeta"><span>{measure.label} by strike</span><small>{hasPositiveAndNegative ? "Signed current snapshot" : "Current snapshot"}</small></div>
    <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={`${measure.label} curve across ${points.length} provider-backed strikes`}>
      {yTicks.map((value) => <g key={value}><line className="gexCurveGrid" x1={PADDING.left} x2={CHART_WIDTH - PADDING.right} y1={yFor(value)} y2={yFor(value)} /><text className="gexCurveAxis" x={PADDING.left - 12} y={yFor(value) + 4} textAnchor="end">{yAxisLabel(value, measure.unit)}</text></g>)}
      <line className="gexCurveBaseline" x1={PADDING.left} x2={CHART_WIDTH - PADDING.right} y1={zeroY} y2={zeroY} />
      <text className="gexCurveZero" x={CHART_WIDTH - PADDING.right} y={zeroY - 8} textAnchor="end">0</text>
      {Number.isFinite(spot) && spot > 0 && spot >= minStrike && spot <= maxStrike && <g><line className="gexCurveSpot" x1={xFor(spot)} x2={xFor(spot)} y1={PADDING.top} y2={CHART_HEIGHT - PADDING.bottom} /><text className="gexCurveSpotLabel" x={xFor(spot)} y={PADDING.top - 12} textAnchor="middle">Spot {price(spot)}</text></g>}
      <polyline className="gexCurveLine" points={polyline} />
      {points.map((point) => {
        const selected = point.strike === selectedStrike;
        const isNegative = point.value < 0;
        return <g key={point.strike} className={selected ? "selected" : undefined}><circle className={isNegative ? "gexCurvePoint negative" : "gexCurvePoint"} cx={xFor(point.strike)} cy={yFor(point.value)} r={selected ? 6.5 : 4.25} onClick={() => onSelectStrike(point.strike)} tabIndex={0} role="button" aria-label={`${price(point.strike)}: ${yAxisLabel(point.value, measure.unit)}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelectStrike(point.strike); }}><title>{`Strike ${price(point.strike)} · ${measure.label}: ${yAxisLabel(point.value, measure.unit)}`}</title></circle></g>;
      })}
      {xTicks.map((strike) => <text className="gexCurveAxis" key={strike} x={xFor(strike)} y={CHART_HEIGHT - 18} textAnchor="middle">{price(strike)}</text>)}
    </svg>
    <p>Each point is one returned strike in the current chain snapshot. Straight segments connect adjacent returned strikes only; no strikes or timestamps are generated.</p>
  </div>;
}
