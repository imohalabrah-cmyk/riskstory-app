import type { OccQueryType, OccSeriesRow } from "./types";

const OCC_SERIES_URL = "https://marketdata.theocc.com/series-search";
const SERIES_ROW = /^(\S+)\s+(\d{4})\s+(\d{2})\s+(\d{2})\s+(\d+)\s+(\d{3})\s+C\s+P\s+(\d+)\s+(\d+)\s+(\d+)\s*$/;

function integer(value: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

export function parseOccSeriesSearch(text: string): OccSeriesRow[] {
  const rows: OccSeriesRow[] = [];

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(SERIES_ROW);
    if (!match) continue;

    const [, productSymbol, year, month, day, strikeInteger, strikeDecimal, callOi, putOi, positionLimit] = match;
    rows.push({
      productSymbol: productSymbol.trim().toUpperCase(),
      contractDate: `${year}-${month}-${day}`,
      strike: integer(strikeInteger) + integer(strikeDecimal) / 1000,
      callOpenInterest: integer(callOi),
      putOpenInterest: integer(putOi),
      positionLimit: integer(positionLimit),
    });
  }

  return rows;
}

export function occSeriesSourceUrl(queryType: OccQueryType, symbol: string) {
  const params = new URLSearchParams({ symbolType: queryType, symbol });
  return `${OCC_SERIES_URL}?${params.toString()}`;
}

export async function fetchOccSeries(queryType: OccQueryType, symbol: string): Promise<{ rows: OccSeriesRow[]; sourceUrl: string }> {
  const sourceUrl = occSeriesSourceUrl(queryType, symbol);
  const response = await fetch(sourceUrl, {
    cache: "no-store",
    headers: {
      Accept: "application/octet-stream,text/plain;q=0.9,*/*;q=0.8",
      "User-Agent": "Risk-Story-OCC-Sync/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) throw new Error(`OCC returned HTTP ${response.status} for ${symbol}`);
  const rows = parseOccSeriesSearch(await response.text());
  if (!rows.length) throw new Error(`OCC returned no parseable series rows for ${symbol}`);
  return { rows, sourceUrl };
}
