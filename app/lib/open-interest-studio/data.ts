import { combineReportedValues } from "../market/reported-values";
import type { ExpirationExposureStrike, MarketRead } from "../market/types";

export type OpenInterestStudioRow = {
  strike: number;
  expiration: string;
  callOpenInterest: number | null;
  putOpenInterest: number | null;
  combinedOpenInterest: number | null;
  callVolume: number | null;
  putVolume: number | null;
  combinedVolume: number | null;
};

export type OpenInterestStudioRead = {
  symbol: string;
  spot: number | null;
  expirations: string[];
  rowsByExpiration: Map<string, OpenInterestStudioRow[]>;
};

function isUsableStrike(value: number) {
  return Number.isFinite(value) && value > 0;
}

function studioRow(row: ExpirationExposureStrike, expiration: string): OpenInterestStudioRow | null {
  if (!isUsableStrike(row.strike)) return null;
  return {
    strike: row.strike,
    expiration,
    callOpenInterest: row.callOpenInterest,
    putOpenInterest: row.putOpenInterest,
    combinedOpenInterest: combineReportedValues(row.callOpenInterest, row.putOpenInterest),
    callVolume: row.callVolume,
    putVolume: row.putVolume,
    combinedVolume: combineReportedValues(row.callVolume, row.putVolume),
  };
}

export function buildOpenInterestStudioRead(market: MarketRead | null): OpenInterestStudioRead | null {
  if (!market || market.provenance.mode === "unavailable" || !market.exposure?.expirations.length) return null;

  const rowsByExpiration = new Map<string, OpenInterestStudioRow[]>();
  market.exposure.expirations.forEach((item) => {
    if (!item.expiration) return;
    const rows = item.rows
      .flatMap((row) => {
        const mapped = studioRow(row, item.expiration);
        return mapped ? [mapped] : [];
      })
      .sort((left, right) => right.strike - left.strike);
    if (rows.length) rowsByExpiration.set(item.expiration, rows);
  });

  if (!rowsByExpiration.size) return null;
  return {
    symbol: market.symbol,
    spot: market.snapshot.spot > 0 ? market.snapshot.spot : null,
    expirations: [...rowsByExpiration.keys()].sort((left, right) => left.localeCompare(right)),
    rowsByExpiration,
  };
}

export function openInterestRowsForExpiration(read: OpenInterestStudioRead, expiration: string) {
  return read.rowsByExpiration.get(expiration) ?? [];
}

export function findOpenInterestRow(rows: OpenInterestStudioRow[], strike: number | null) {
  return strike === null ? null : rows.find((row) => row.strike === strike) ?? null;
}

export function closestOpenInterestStrike(rows: OpenInterestStudioRow[], spot: number | null) {
  if (!(spot && rows.length)) return null;
  return rows.reduce((closest, row) => Math.abs(row.strike - spot) < Math.abs(closest.strike - spot) ? row : closest).strike;
}
