# Risk Story Next Steps

## Current foundation
- The platform runs locally as a Next.js app.
- Login is demo-only: `mohammed / riskstory`.
- UI screens are ready for gamma, heatmap, Trinity, flow, chart lab, and alerts.
- Demo data now passes through `public/assets/js/modules/data-source.js`.

## Phase 1: stabilize the prototype
- Keep the current glass dark interface.
- Replace any remaining placeholder buttons with visible states or toasts.
- Keep chart zoom, pan, expiry, and range controls consistent across Gamma and Chart Lab.
- Save the project in one clean folder before connecting GitHub.

## Phase 2: prepare real data
- Choose a first data provider for options flow and option chain.
- Start with SPX, SPY, QQQ, IWM, DIA, and the first 100 symbols.
- Store provider logic behind one adapter so providers can be swapped later.
- Keep demo data available as fallback when the provider is unavailable.

## Phase 3: backend and accounts
- Add a small API layer for symbols, expirations, gamma, heatmap, flow, and alerts.
- Replace demo login with real accounts.
- Add admin settings for provider keys and symbol lists.

## Phase 4: launch path
- Deploy the frontend.
- Connect domain and SSL.
- Add monitoring.
- Add billing only after the data cost and legal terms are clear.
