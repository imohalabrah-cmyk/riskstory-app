import type { ExposureStrike } from "../market/types";

export type CurveLayer = "gex" | "netGex" | "openInterest";
export type CurveSide = "combined" | "calls" | "puts";

export type GexCurvePoint = {
  strike: number;
  value: number;
};

export type GexCurveMeasure = {
  label: string;
  unit: "gex" | "contracts";
  signed: boolean;
};

export function curveMeasure(layer: CurveLayer, side: CurveSide): GexCurveMeasure {
  if (layer === "openInterest") {
    return {
      label: side === "calls" ? "Call open interest" : side === "puts" ? "Put open interest" : "Combined open interest",
      unit: "contracts",
      signed: false,
    };
  }

  if (layer === "netGex") {
    return { label: "Net GEX", unit: "gex", signed: true };
  }

  if (side === "calls") return { label: "Call GEX", unit: "gex", signed: false };
  if (side === "puts") return { label: "Put GEX", unit: "gex", signed: true };
  return { label: "Gross GEX", unit: "gex", signed: false };
}

export function curveValue(row: ExposureStrike, layer: CurveLayer, side: CurveSide) {
  if (layer === "openInterest") {
    if (side === "calls") return row.callOpenInterest;
    if (side === "puts") return row.putOpenInterest;
    return row.callOpenInterest + row.putOpenInterest;
  }

  if (layer === "netGex") return row.netGex;
  if (side === "calls") return row.callGex;
  if (side === "puts") return row.putGex;
  return Math.abs(row.callGex) + Math.abs(row.putGex);
}

export function buildGexCurvePoints(rows: ExposureStrike[], layer: CurveLayer, side: CurveSide): GexCurvePoint[] {
  return rows
    .map((row) => ({ strike: row.strike, value: curveValue(row, layer, side) }))
    .filter((point) => Number.isFinite(point.strike) && point.strike > 0 && Number.isFinite(point.value))
    .sort((left, right) => left.strike - right.strike);
}
