# Risk Story Intelligence Engines

## Scope

This document describes analysis engines that transform already available provider-backed option-chain fields into structured scores for a future UI. These engines do not create a provider, change a market-data response, or issue trade recommendations.

## Data contract

`analyzeGexIntelligence` accepts a `MarketRead` and only evaluates `exposure.rows` when the rows contain a finite strike and non-zero `netGex`. Its inputs are provider-backed option-chain values or existing derived values already identified by `MarketRead.provenance` and `MarketRead.metrics`.

When a valid spot price or usable GEX exposure is absent, the engine returns `availability: "unavailable"` with explicit reasons. It never replaces missing inputs with synthetic rows, levels, or scores.

## GEX Intelligence Engine v1

The engine lives in `app/lib/gex-intelligence` and is presentation-agnostic. It returns a `GexIntelligenceRead` with scores from 0 to 100 when inputs are available. A higher score means stronger alignment with the defined measurement only; it is not a forecast, a likelihood, or a trading instruction.

### Level Strength

Measures each strike relative to the largest absolute current net GEX and the largest combined call/put open interest in the same snapshot. It answers: *how concentrated is the available current exposure at this strike relative to the rest of this chain?*

### Level Isolation

Measures whether a level is materially stronger than the nearest available strikes around it. The calculation compares the current level's composite GEX/OI strength against a two-strike neighborhood on each side where available. A low-strength level cannot receive a high isolation score solely because nearby values are even lower. Strike spacing is not an isolation input.

### Liquidity Vacuum

Finds consecutive low-exposure strikes bounded by strong current GEX/OI concentrations. These are labelled as low-exposure intervals, not order-book liquidity, directional paths, or price targets. Strike spacing is not an input.

### Market Clarity

Summarizes three snapshot properties: net GEX directional imbalance, concentration in the largest level, and the `MarketRead.quality.completeness` value. The direction is limited to `positive`, `negative`, or `balanced` as a description of the snapshot's net GEX sign.

### Confluence Score

Combines the strongest local level-context scores, their isolation, and market clarity. It deliberately does not use `MarketRead.levels` as an additional weighted signal because those levels may be derived from the same GEX/OI chain inputs. The score describes internal consistency within one snapshot, not independent confirmation or an execution recommendation.

## Extension boundary

The output types deliberately separate calculation from display. A future API route, worker, or React component may consume `GexIntelligenceRead` without importing calculation internals. Additional engines (for example historical persistence, expiry-aware exposure, or data-provider-specific quality checks) should be added as new modules rather than embedding UI-specific behavior in this engine.

## Limitations

- The input is a current option-chain snapshot. It is not a historical GEX time series.
- The engine does not infer dealer positioning beyond the assumptions already declared by the exposure provider.
- Dark pool, flow, whale activity, and order-book liquidity are not inputs to this version.
- Scores are analytical descriptors only and must not be presented as buy, sell, or guaranteed price-movement signals.
