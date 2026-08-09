import type { ExposureStrike } from "../market/types";
import { combineReportedValues } from "../market/reported-values";

export type CurveLayer = "gex" | "netGex" | "openInterest";
export type CurveSide = "combined" | "calls" | "puts";

export type GexCurvePoint = {
  strike: number;
  value: number;
};

export type GexProfileRow = GexCurvePoint & {
  totalOpenInterest: number | null;
};

export type GexHeatmapCell = {
  id: "callGex" | "putGex" | "grossGex" | "netGex" | "callOpenInterest" | "putOpenInterest" | "combinedOpenInterest";
  label: string;
  value: number | null;
  unit: "gex" | "contracts";
  signed: boolean;
};

export type GexHeatmapRow = {
  strike: number;
  totalOpenInterest: number | null;
  cells: GexHeatmapCell[];
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
    return combineReportedValues(row.callOpenInterest, row.putOpenInterest);
  }

  if (layer === "netGex") return row.netGex;
  if (side === "calls") return row.callGex;
  if (side === "puts") return row.putGex;
  return Math.abs(row.callGex) + Math.abs(row.putGex);
}

export function buildGexCurvePoints(rows: ExposureStrike[], layer: CurveLayer, side: CurveSide): GexCurvePoint[] {
  return rows.flatMap((row) => {
    const value = curveValue(row, layer, side);
    if (!Number.isFinite(row.strike) || row.strike <= 0 || typeof value !== "number" || !Number.isFinite(value)) return [];
    return [{ strike: row.strike, value }];
  }).sort((left, right) => left.strike - right.strike);
}

export function buildGexProfileRows(rows: ExposureStrike[], layer: CurveLayer, side: CurveSide): GexProfileRow[] {
  return rows.flatMap((row) => {
    const value = curveValue(row, layer, side);
    if (!Number.isFinite(row.strike) || row.strike <= 0 || typeof value !== "number" || !Number.isFinite(value)) return [];
    return [{ strike: row.strike, value, totalOpenInterest: combineReportedValues(row.callOpenInterest, row.putOpenInterest) }];
  }).sort((left, right) => right.strike - left.strike);
}

type HeatmapColumnDefinition = Omit<GexHeatmapCell, "value"> & { value: (row: ExposureStrike) => number | null };

function heatmapColumns(layer: CurveLayer): HeatmapColumnDefinition[] {
  if (layer === "netGex") {
    return [{ id: "netGex", label: "Net GEX", unit: "gex", signed: true, value: (row) => row.netGex }];
  }

  if (layer === "openInterest") {
    return [
      { id: "callOpenInterest", label: "Call OI", unit: "contracts", signed: false, value: (row) => row.callOpenInterest },
      { id: "putOpenInterest", label: "Put OI", unit: "contracts", signed: false, value: (row) => row.putOpenInterest },
      { id: "combinedOpenInterest", label: "Combined OI", unit: "contracts", signed: false, value: (row) => combineReportedValues(row.callOpenInterest, row.putOpenInterest) },
    ];
  }

  return [
    { id: "callGex", label: "Call GEX", unit: "gex", signed: true, value: (row) => row.callGex },
    { id: "putGex", label: "Put GEX", unit: "gex", signed: true, value: (row) => row.putGex },
    { id: "grossGex", label: "Gross GEX", unit: "gex", signed: false, value: (row) => Math.abs(row.callGex) + Math.abs(row.putGex) },
  ];
}

export function buildGexHeatmapRows(rows: ExposureStrike[], layer: CurveLayer): GexHeatmapRow[] {
  const columns = heatmapColumns(layer);
  return rows
    .filter((row) => Number.isFinite(row.strike) && row.strike > 0)
    .map((row) => {
      const totalOpenInterest = combineReportedValues(row.callOpenInterest, row.putOpenInterest);
      const cells = columns.map((column) => {
        const value = column.value(row);
        return { id: column.id, label: column.label, unit: column.unit, signed: column.signed, value: typeof value === "number" && Number.isFinite(value) ? value : null };
      });
      return { strike: row.strike, totalOpenInterest, cells };
    })
    .filter((row) => row.cells.some((cell) => cell.value !== null))
    .sort((left, right) => right.strike - left.strike);
}
