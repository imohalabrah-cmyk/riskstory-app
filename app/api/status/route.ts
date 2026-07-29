import { NextResponse } from "next/server";

export async function GET() {
  const hasMarketDataToken = Boolean(process.env.MARKETDATA_TOKEN);
  const configuredAt = new Date().toISOString();
  const marketMode = hasMarketDataToken ? "delayed" : "unavailable";

  return NextResponse.json({
    schemaVersion: "1.0",
    app: "risk-story",
    marketData: {
      configured: hasMarketDataToken,
      provider: hasMarketDataToken ? "marketdata" : "unavailable",
      mode: marketMode,
      realtimeEntitlementVerified: false,
    },
    activeProvider: hasMarketDataToken ? "marketdata" : "unavailable",
    candles: {
      provider: hasMarketDataToken ? "marketdata" : "unavailable",
      mode: marketMode,
    },
    optionsIntelligence: {
      provider: hasMarketDataToken ? "marketdata" : "unavailable",
      method: hasMarketDataToken ? "derived-from-option-chain" : "unavailable",
    },
    flow: {
      provider: "unavailable",
      mode: "unavailable",
    },
    readiness: {
      market: { mode: marketMode, method: hasMarketDataToken ? "reported" : "unavailable", provider: hasMarketDataToken ? "marketdata" : "unavailable" },
      candles: { mode: marketMode, method: hasMarketDataToken ? "reported" : "unavailable", provider: hasMarketDataToken ? "marketdata" : "unavailable" },
      gamma: { mode: marketMode, method: "derived", provider: "Risk Story chain model" },
      heatmap: { mode: marketMode, method: hasMarketDataToken ? "derived" : "unavailable", provider: hasMarketDataToken ? "MarketData option chain" : "unavailable" },
      trinity: { mode: marketMode, method: "derived", provider: "Risk Story composite model" },
      flow: { mode: "unavailable", method: "unavailable", provider: "unavailable" },
    },
    notes: [
      hasMarketDataToken
        ? "Market reads attempt MarketData first. They remain labeled delayed until realtime entitlement is verified."
        : "Add MARKETDATA_TOKEN in .env.local to enable provider-backed market reads.",
      "Live sweep, block, split, and dark-pool flow still needs a dedicated flow provider.",
      "Risk Story does not display synthetic fallback market data.",
    ],
    updatedAt: configuredAt,
  });
}
