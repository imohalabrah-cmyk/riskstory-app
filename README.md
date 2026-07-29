# Risk Story

Professional gamma intelligence and options flow prototype.

## Demo Login

- user: mohammed
- password: riskstory

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Structure

- app/page.tsx: renders the Risk Story prototype shell
- app/globals.css: visual system and responsive layout
- public/assets/js/app.js: prototype state, interactions, demo data, charts, gamma, flow, alerts
- public/assets/data/data-model.md: draft production data contract

## Next Steps

1. Split public/assets/js/app.js into domain modules.
2. Replace demo data with provider adapters.
3. Add authentication and deployment pipeline.
