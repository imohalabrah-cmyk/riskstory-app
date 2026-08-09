"use client";

import { Activity, Bell, Boxes, ChartCandlestick, Compass, Gauge, LayoutDashboard, Network, TableProperties, TrendingUp } from "lucide-react";
import type { ViewId } from "./types";
import { classNames } from "./utils";

const items: Array<{ id: ViewId; label: string; icon: typeof LayoutDashboard }> = [
  { id: "command", label: "Command Center", icon: LayoutDashboard },
  { id: "marketStory", label: "Market Story", icon: Compass },
  { id: "gamma", label: "Gamma Center", icon: Gauge },
  { id: "gex", label: "GEX Intelligence", icon: Network },
  { id: "heatmap", label: "Heatmap Matrix", icon: TableProperties },
  { id: "trinity", label: "Trinity View", icon: Boxes },
  { id: "flow", label: "Options Flow", icon: Activity },
  { id: "chart", label: "Chart Lab", icon: ChartCandlestick },
  { id: "openInterest", label: "Open Interest", icon: TrendingUp },
  { id: "alerts", label: "Alerts", icon: Bell },
];

type Props = { active: ViewId; onChange: (view: ViewId) => void };

export function Sidebar({ active, onChange }: Props) {
  return <aside className="rail" aria-label="Primary navigation">
    <div className="logo" aria-label="Risk Story">ϟ</div>
    <nav className="nav">
      {items.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={classNames(active === id && "active")} onClick={() => onChange(id)} title={label} aria-label={label} aria-current={active === id ? "page" : undefined}><Icon size={20} /></button>)}
    </nav>
  </aside>;
}
