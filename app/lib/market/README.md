# Market Data Adapter

Risk Story reads market data through one provider interface.

## Active Provider

The active provider is selected in:

`app/lib/market/provider.ts`

Today it returns `demoProvider`.

## Provider Methods

- `getMarketRead({ symbol, range })`
- `getFlowRead({ symbol, range })`

## Next Live Provider

When a live data provider is selected, add a new file next to `demo-provider.ts`, for example:

`live-provider.ts`

Then update `provider.ts` to return that provider when API keys are configured.

The UI should not need to change when the provider changes.
