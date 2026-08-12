/**
 * Provider-shaped records only. These are intentionally separate from
 * Risk Story's derived MarketRead model until a real UW entitlement test
 * confirms the endpoint semantics for the configured account.
 */
export type UnusualWhalesStockState = {
  close: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  previousClose: number | null;
  volume: number | null;
  totalVolume: number | null;
  tapeTime: string | null;
  marketTime: string | null;
};

export type UnusualWhalesCandle = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  totalVolume: number | null;
  startTime: string | null;
  endTime: string | null;
  marketTime: string | null;
};

export type UnusualWhalesOptionContract = {
  contract: string | null;
  strike: number | null;
  expiry: string | null;
  side: "call" | "put" | null;
  bid: number | null;
  ask: number | null;
  lastPrice: number | null;
  openInterest: number | null;
  volume: number | null;
  impliedVolatility: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
  lastTapeTime: string | null;
};

export type UnusualWhalesGreekExposure = {
  strike: number | null;
  expiry: string | null;
  callGex: number | null;
  putGex: number | null;
  callDelta: number | null;
  putDelta: number | null;
  callVanna: number | null;
  putVanna: number | null;
  callCharm: number | null;
  putCharm: number | null;
};

export type UnusualWhalesGexLevels = {
  callWall: number | null;
  putWall: number | null;
  gammaFlip: number | null;
  gammaMagnet: number | null;
};

export type UnusualWhalesOptionTrade = {
  executedAt: string | null;
  ticker: string | null;
  contract: string | null;
  strike: number | null;
  expiry: string | null;
  side: "call" | "put" | null;
  price: number | null;
  size: number | null;
  premium: number | null;
  openInterest: number | null;
  volume: number | null;
  nbboBid: number | null;
  nbboAsk: number | null;
  impliedVolatility: number | null;
  delta: number | null;
  gamma: number | null;
  tags: string[];
  reportFlags: string[];
  exchange: string | null;
};

export type UnusualWhalesDarkPoolTrade = {
  executedAt: string | null;
  trfExecutedAt: string | null;
  ticker: string | null;
  price: number | null;
  size: number | null;
  premium: number | null;
  volume: number | null;
  marketCenter: string | null;
  tradeCode: string | null;
  saleConditionCodes: string[];
  tradeSettlement: string | null;
};

export type UnusualWhalesDarkPoolPriceLevel = {
  price: number | null;
  darkPoolVolume: number | null;
  regularVolume: number | null;
};

export type UnusualWhalesCurrentSnapshot = {
  symbol: string;
  stockState: UnusualWhalesStockState;
  optionChain: UnusualWhalesOptionContract[];
  gexByStrike: UnusualWhalesGreekExposure[];
  gexByExpiry: UnusualWhalesGreekExposure[];
  gexLevels: UnusualWhalesGexLevels;
};

export type UnusualWhalesRawFlowRead = {
  symbol: string;
  trades: UnusualWhalesOptionTrade[];
};

export type UnusualWhalesRawDarkPoolRead = {
  symbol: string;
  prints: UnusualWhalesDarkPoolTrade[];
  priceLevels: UnusualWhalesDarkPoolPriceLevel[];
};

export type UnusualWhalesCapability =
  | "stock-state"
  | "candles"
  | "option-chain"
  | "gex-by-strike"
  | "gex-by-expiry"
  | "gex-levels"
  | "options-flow"
  | "dark-pool"
  | "spx-normalization"
  | "qqq-stock-state";

export type UnusualWhalesCapabilityResult = {
  capability: UnusualWhalesCapability;
  status: "available" | "unavailable";
  endpoint: string;
  upstreamStatus: number | null;
  code: string | null;
  message: string | null;
};
