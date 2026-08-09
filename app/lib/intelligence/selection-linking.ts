export type LinkedSelection = {
  symbol: string;
  strike: number | null;
  expiration: string | null;
};

export type LinkedSelectionTarget = {
  symbol: string | null | undefined;
  strikes: readonly number[];
  expiration?: string | null;
};

export function selectionMatchesSymbol(selection: LinkedSelection, symbol: string | null | undefined) {
  return Boolean(symbol && selection.symbol === symbol);
}

export function resolveLinkedStrike(selection: LinkedSelection, target: LinkedSelectionTarget) {
  if (!selectionMatchesSymbol(selection, target.symbol) || selection.strike === null) return null;
  if (target.expiration && selection.expiration && target.expiration !== selection.expiration) return null;
  return target.strikes.includes(selection.strike) ? selection.strike : null;
}

export function clearedLinkedSelection() {
  return { symbol: "SPY", strike: null, expiration: null } satisfies LinkedSelection;
}
