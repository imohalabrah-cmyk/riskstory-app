export type OpenInterestSide = "call" | "put";

export type OccQueryType = "O" | "U";

export type TrackedSymbol = {
  symbol: string;
  displayName: string;
  assetType: "index" | "etf" | "stock";
  active: boolean;
  sortOrder: number;
  occQueryType: OccQueryType;
  occQuerySymbol: string;
  occProductSymbol: string;
};

export type OccSeriesRow = {
  productSymbol: string;
  contractDate: string;
  strike: number;
  callOpenInterest: number;
  putOpenInterest: number;
  positionLimit: number;
};

export type OpenInterestLevel = {
  side: OpenInterestSide;
  strike: number;
  openInterest: number;
  rank: number;
};

export type OpenInterestStrength = "watch" | "strong" | "major";

export type OpenInterestScoreBreakdown = {
  historical: number;
  cluster: number;
  proximity: number;
  persistence: number;
  dominance: number;
};

export type HistoricalOpenInterestSession = {
  contractDate: string;
  levels: OpenInterestLevel[];
};

export type OpenInterestReactionZone = {
  side: OpenInterestSide;
  role: "support" | "resistance" | "magnet";
  lowStrike: number;
  highStrike: number;
  centerStrike: number;
  totalOpenInterest: number;
  peakOpenInterest: number;
  strongestStrike: number;
  levelCount: number;
  strength: OpenInterestStrength;
  score: number;
  scoreBreakdown: OpenInterestScoreBreakdown;
  persistenceSessions: number;
  distancePercent: number;
  distancePoints: number;
  windowPoints: number;
  isExtended: boolean;
  rank: number;
};

export type OpenInterestThresholds = {
  watch: number;
  strong: number;
  major: number;
  source: "baseline" | "calibrated";
  sessionCount: number;
  targetSessions: 20;
};

export type DailyOpenInterestSummary = {
  summaryDate: string;
  contractDate: string;
  symbol: string;
  displayName: string;
  assetType: string;
  productSymbol: string;
  referencePrice: number;
  referencePriceSource: string;
  referencePriceAsOf: string;
  analysisWindowPoints: number;
  pivot: number;
  upperZone: number;
  lowerZone: number;
  totalCallOi: number;
  totalPutOi: number;
  scenarioAr: string;
  sourceProvider: "OCC";
  sourceLabel: string;
  sourceUrl: string;
  firstFetchedAt: string;
  lastVerifiedAt: string;
  calls: OpenInterestLevel[];
  puts: OpenInterestLevel[];
  reactionZones: OpenInterestReactionZone[];
  attractionZones: OpenInterestReactionZone[];
  thresholds: OpenInterestThresholds;
};

export type OpenInterestDashboard = {
  schemaVersion: "2.2";
  summaryDate: string | null;
  availableDates: string[];
  summaries: DailyOpenInterestSummary[];
  generatedAt: string;
  source: "OCC Series Search";
};
