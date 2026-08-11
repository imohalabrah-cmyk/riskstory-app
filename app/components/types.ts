import type {
  CandleRead,
  FlowRead,
  MarketRead,
} from "../lib/market/types";

export type ViewId =
  | "command"
  | "marketStory"
  | "gamma"
  | "gex"
  | "heatmap"
  | "trinity"
  | "flow"
  | "chart"
  | "openInterest"
  | "alerts";

export type AppData = {
  market: MarketRead | null;
  trinity: Record<"SPX" | "SPY" | "QQQ", MarketRead | null>;
  candles: CandleRead | null;
  flow: FlowRead | null;
};
