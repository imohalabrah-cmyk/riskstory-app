"use client";

import { createContext, useContext, useMemo, useState, type PropsWithChildren } from "react";

export type IntelligenceLevelSelection = {
  id: string;
  label?: string;
};

export type IntelligenceSelection = {
  symbol: string;
  strike: number | null;
  expiration: string | null;
  level: IntelligenceLevelSelection | null;
};

export type IntelligenceSelectionPatch = Partial<IntelligenceSelection>;

type IntelligenceSelectionContextValue = {
  selection: IntelligenceSelection;
  setSelection: (patch: IntelligenceSelectionPatch) => void;
  clearSelection: () => void;
};

const DEFAULT_SELECTION: IntelligenceSelection = {
  symbol: "SPY",
  strike: null,
  expiration: null,
  level: null,
};

const IntelligenceSelectionContext = createContext<IntelligenceSelectionContextValue | null>(null);

export function IntelligenceSelectionProvider({ children }: PropsWithChildren) {
  const [selection, setSelectionState] = useState<IntelligenceSelection>(DEFAULT_SELECTION);

  const value = useMemo<IntelligenceSelectionContextValue>(() => ({
    selection,
    setSelection: (patch) => setSelectionState((current) => ({ ...current, ...patch })),
    clearSelection: () => setSelectionState(DEFAULT_SELECTION),
  }), [selection]);

  return <IntelligenceSelectionContext.Provider value={value}>{children}</IntelligenceSelectionContext.Provider>;
}

export function useIntelligenceSelection() {
  const context = useContext(IntelligenceSelectionContext);
  if (!context) throw new Error("useIntelligenceSelection must be used within IntelligenceSelectionProvider.");
  return context;
}
