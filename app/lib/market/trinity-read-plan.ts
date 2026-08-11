export const TRINITY_SYMBOLS = ["SPX", "SPY", "QQQ"] as const;

export type TrinityReadPlan = {
  symbol: typeof TRINITY_SYMBOLS[number];
  reuseSelectedRead: boolean;
};

export function planTrinityReads(selectedSymbol: string, requested: boolean): TrinityReadPlan[] {
  if (!requested) return [];

  const normalizedSymbol = selectedSymbol.toUpperCase();
  return TRINITY_SYMBOLS.map((symbol) => ({ symbol, reuseSelectedRead: symbol === normalizedSymbol }));
}
