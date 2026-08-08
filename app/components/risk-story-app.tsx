"use client";

import { useState } from "react";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { Dashboard } from "./dashboard";
import { ChartPanel } from "./chart-panel";
import { FlowPanel } from "./flow-panel";
import { GammaPanel } from "./gamma-panel";
import { HeatmapPanel } from "./heatmap-panel";
import { TrinityPanel } from "./trinity-panel";
import { OpenInterestPanel } from "./open-interest-panel";
import { AlertsPanel } from "./alerts-panel";
import { useRiskStoryData } from "./hooks/use-risk-story-data";
import type { ViewId } from "./types";

export function RiskStoryApp() {
  const [view, setView] = useState<ViewId>("command");
  const [symbol, setSymbol] = useState("SPY");
  const [range, setRange] = useState("0DTE");
  const [frame, setFrame] = useState("10m");
  const { data, loading, error, refresh } = useRiskStoryData(symbol || "SPY", range, frame);
  const expand = (target: ViewId) => setView(target);
  return <div className="appShell">
    <Sidebar active={view} onChange={setView} />
    <main className="main"><Header view={view} symbol={symbol} onSymbol={setSymbol} onRefresh={() => void refresh()} loading={loading} />
      <section className="workspace" aria-busy={loading}>{error && <p className="dataNotice">{error}</p>}
        {view === "command" && <div className="commandView"><Dashboard market={data.market} loading={loading} /><div className="commandPrimary"><ChartPanel market={data.market} candles={data.candles} range={range} onRange={setRange} frame={frame} onFrame={setFrame} onExpand={() => expand("chart")} /><FlowPanel flow={data.flow} compact /></div><div className="commandSecondary"><TrinityPanel reads={data.trinity} onExpand={() => expand("trinity")} /><HeatmapPanel market={data.market} onExpand={() => expand("heatmap")} /></div></div>}
        {view === "gamma" && <div className="gammaView"><Dashboard market={data.market} loading={loading} /><ChartPanel title="Gamma Chart" market={data.market} candles={data.candles} range={range} onRange={setRange} frame={frame} onFrame={setFrame} /><GammaPanel market={data.market} /></div>}
        {view === "heatmap" && <HeatmapPanel market={data.market} title="Heatmap Matrix" />}
        {view === "trinity" && <TrinityPanel reads={data.trinity} />}
        {view === "flow" && <FlowPanel flow={data.flow} />}
        {view === "chart" && <ChartPanel title="Chart Lab" market={data.market} candles={data.candles} range={range} onRange={setRange} frame={frame} onFrame={setFrame} />}
        {view === "openInterest" && <OpenInterestPanel data={data.openInterest} />}
        {view === "alerts" && <AlertsPanel />}
      </section>
    </main>
  </div>;
}
