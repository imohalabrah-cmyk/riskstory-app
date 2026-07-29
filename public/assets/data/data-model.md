# Risk Story Data Model Draft

This prototype currently uses generated demo data through a provider adapter.
The production data layer should implement the same contract in `app/lib/market`.

## Symbols
- symbol
- assetType: index | etf | stock
- has0DTE
- availableExpirations

## Gamma Levels
- symbol
- expiry
- strike
- callGamma
- putGamma
- netGex
- callGex
- putGex
- callOi
- putOi
- totalOi
- levelType: call_wall | put_wall | zero_gamma | control_node | magnet | normal
- strengthScore
- reason

## Heatmap Cells
- symbol
- expiry
- strike
- netGex
- bias: call_heavy | put_heavy | neutral
- premium
- strengthScore

## Options Flow
- time
- symbol
- assetType
- side: call | put
- tradeType: sweep | split | dark | block
- strike
- expiry
- premium
- volume
- openInterest
- sentiment
- signal

## Alerts
- symbol
- condition
- value
- expiry
- enabled

## Provider Contract
- `getMarketRead({ symbol, range })`
- `getFlowRead({ symbol, range })`

The active provider is selected in:

`app/lib/market/provider.ts`
