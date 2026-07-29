import { marketDataProvider } from "./marketdata-provider";
import { unavailableProvider } from "./unavailable-provider";

export function getMarketProvider() {
  return process.env.MARKETDATA_TOKEN ? marketDataProvider : unavailableProvider;
}
