export type AssetType = "index" | "etf" | "stock";

export type MarketRange = "0DTE" | "1D" | "Daily" | "Weekly" | "Monthly" | "Custom";

export type DataMode = "live" | "delayed" | "unavailable";

export type DataMethod = "reported" | "derived" | "estimated" | "unavailable";

export type DataProvenance = {
  provider: string;
  mode: DataMode;
  label: string;
  asOf: string | null;
  receivedAt: string;
  delayMinutes: number | null;
  note: string;
};

export type MetricRead = {
  value: number;
  method: DataMethod;
  source: "quote" | "option-chain" | "model" | "unavailable";
  label: string;
};

export type MarketMetricSet = {
  spot: MetricRead;
  netGex: MetricRead;
  callGex: MetricRead;
  putGex: MetricRead;
  zeroGamma: MetricRead;
  callWall: MetricRead;
  putWall: MetricRead;
};

export type DataQuality = {
  completeness: number;
  warnings: string[];
};

export type MarketSnapshot = {
  spot: number;
  zeroGamma: number;
  callWall: number;
  putWall: number;
  netGex: number;
  callGex: number;
  putGex: number;
};

export type MarketLevel = {
  type: "call_wall" | "put_wall" | "zero_gamma" | "control_node" | "magnet" | "pressure";
  price: number;
  strength: number;
  reason: string;
};

export type ExposureStrike = {
  strike: number;
  callOpenInterest: number;
  putOpenInterest: number;
  callVolume: number;
  putVolume: number;
  callGex: number;
  putGex: number;
  netGex: number;
  callDex: number;
  putDex: number;
  netDex: number;
  callVanna: number;
  putVanna: number;
  netVanna: number;
  callCharm: number;
  putCharm: number;
  netCharm: number;
  combined: number;
};

export type ExposureProfile = {
  method: "chain-greeks-v1";
  assumption: string;
  deltaCoverage: number;
  ivCoverage: number;
  rows: ExposureStrike[];
  expirations: Array<{
    expiration: string;
    rows: ExposureStrike[];
  }>;
};

export type MarketRead = {
  schemaVersion: "1.0";
  provider: string;
  symbol: string;
  range: string;
  updatedAt: string;
  provenance: DataProvenance;
  metrics: MarketMetricSet;
  quality: DataQuality;
  snapshot: MarketSnapshot;
  levels: MarketLevel[];
  exposure?: ExposureProfile;
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type CandleRead = {
  schemaVersion: "1.0";
  provider: string;
  symbol: string;
  frame: string;
  updatedAt: string;
  delayed: boolean;
  provenance: DataProvenance;
  quality: DataQuality;
  candles: Candle[];
  connection?: {
    state: "delayed" | "stale" | "reconnecting" | "unavailable";
    lastSuccessfulAt: string | null;
    pollIntervalSeconds: number | null;
  };
  pagination?: {
    hasMore: boolean;
    oldestTime: number | null;
  };
};

export type FlowSide = "Call" | "Put";
export type FlowType = "SWEEP" | "SPLIT" | "DARK" | "BLOCK";

export type FlowRow = {
  time: string;
  symbol: string;
  assetType: AssetType;
  side: FlowSide;
  type: FlowType;
  strike: number;
  expiry: string;
  premium: number;
  volume: number;
  openInterest: number;
};

export type FlowRead = {
  schemaVersion: "1.0";
  provider: string;
  updatedAt: string;
  provenance: DataProvenance;
  quality: DataQuality;
  rows: FlowRow[];
};

export type MarketDataProvider = {
  name: string;
  getMarketRead(params: { symbol: string; range: string }): Promise<MarketRead>;
  getFlowRead(params?: { symbol?: string; range?: string }): Promise<FlowRead>;
  getCandles(params: { symbol: string; frame: string; before?: number; latest?: boolean }): Promise<CandleRead>;
};
