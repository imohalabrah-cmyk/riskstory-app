import type { DataProvenance } from "../market/types";

export type IntelligenceAvailability = "available" | "unavailable";
export type GexDirection = "positive" | "negative" | "balanced";
export type VacuumLocation = "below_spot" | "above_spot" | "crosses_spot";

export type IntelligenceScore = {
  score: number | null;
  availability: IntelligenceAvailability;
  explanation: string;
  inputs: string[];
};

export type GexLevelAssessment = {
  strike: number;
  netGex: number;
  totalOpenInterest: number;
  direction: GexDirection;
  distancePoints: number;
  distancePercent: number;
  levelStrength: IntelligenceScore;
  levelIsolation: IntelligenceScore;
  confluence: IntelligenceScore;
};

export type LiquidityVacuumInterval = {
  lowStrike: number;
  highStrike: number;
  location: VacuumLocation;
  score: number;
  explanation: string;
};

export type GexIntelligenceRead = {
  schemaVersion: "1.0";
  symbol: string;
  generatedAt: string;
  provenance: Pick<DataProvenance, "provider" | "mode" | "asOf" | "receivedAt">;
  availability: IntelligenceAvailability;
  warnings: string[];
  levels: GexLevelAssessment[];
  liquidityVacuum: IntelligenceScore & { intervals: LiquidityVacuumInterval[] };
  marketClarity: IntelligenceScore & { direction: GexDirection };
  confluence: IntelligenceScore;
};
