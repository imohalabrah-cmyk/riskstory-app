import type { ExposureStrike } from "../market/types";

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

export function buildGexProfileRows(rows: ExposureStrike[], layer: CurveLayer, side: CurveSide): GexProfileRow[] {
  return rows
    .map((row) => {
      const totalOpenInterest = row.callOpenInterest + row.putOpenInterest;
      return {
        strike: row.strike,
        value: curveValue(row, layer, side),
        totalOpenInterest: Number.isFinite(totalOpenInterest) ? totalOpenInterest : null,
      };
    })
    .filter((row) => Number.isFinite(row.strike) && row.strike > 0 && Number.isFinite(row.value))
    .sort((left, right) => right.strike - left.strike);
}

type HeatmapColumnDefinition = Omit<GexHeatmapCell, "value"> & { value: (row: ExposureStrike) => number };

function heatmapColumns(layer: CurveLayer): HeatmapColumnDefinition[] {
  if (layer === "netGex") {
    return [{ id: "netGex", label: "Net GEX", unit: "gex", signed: true, value: (row) => row.netGex }];
  }

  if (layer === "openInterest") {
    return [
      { id: "callOpenInterest", label: "Call OI", unit: "contracts", signed: false, value: (row) => row.callOpenInterest },
      { id: "putOpenInterest", label: "Put OI", unit: "contracts", signed: false, value: (row) => row.putOpenInterest },
      { id: "combinedOpenInterest", label: "Combined OI", unit: "contracts", signed: false, value: (row) => row.callOpenInterest + row.putOpenInterest },
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
      const totalOpenInterest = row.callOpenInterest + row.putOpenInterest;
      const cells = columns.map((column) => {
        const value = column.value(row);
        return { id: column.id, label: column.label, unit: column.unit, signed: column.signed, value: Number.isFinite(value) ? value : null };
      });
      return { strike: row.strike, totalOpenInterest: Number.isFinite(totalOpenInterest) ? totalOpenInterest : null, cells };
    })
    .filter((row) => row.cells.some((cell) => cell.value !== null))
    .sort((left, right) => right.strike - left.strike);
}
