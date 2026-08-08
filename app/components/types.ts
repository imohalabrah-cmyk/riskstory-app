import type {
  CandleRead,
  FlowRead,
  MarketRead,
} from "../lib/market/types";
import type { OpenInterestDashboard } from "../lib/open-interest/types";

export type ViewId =
  | "command"
  | "gamma"
  | "heatmap"
  | "trinity"
  | "flow"
  | "chart"
  | "openInterest"
  | "alerts";

export type AppData = {
  market: MarketRead | null;
  candles: CandleRead | null;
  flow: FlowRead | null;
  openInterest: OpenInterestDashboard | null;
};
