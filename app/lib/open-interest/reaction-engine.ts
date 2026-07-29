import type {
  HistoricalOpenInterestSession,
  OpenInterestLevel,
  OpenInterestReactionZone,
  OpenInterestSide,
  OpenInterestStrength,
  OpenInterestThresholds,
} from "./types";

type ReactionRole = OpenInterestReactionZone["role"];

type EngineInput = {
  symbol: string;
  levels: OpenInterestLevel[];
  referencePrice: number;
  thresholds: OpenInterestThresholds;
  history: HistoricalOpenInterestSession[];
};

type ZoneConfig = {
  windowPoints: number;
  clusterGap: number;
};

const CONFIG: Record<string, ZoneConfig> = {
  SPX: { windowPoints: 100, clusterGap: 10 },
  SPY: { windowPoints: 10, clusterGap: 2 },
  QQQ: { windowPoints: 10, clusterGap: 2 },
};

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, value));
}

function weightedCenter(levels: OpenInterestLevel[]) {
  const weight = levels.reduce((total, level) => total + level.openInterest, 0);
  if (!weight) return 0;
  return levels.reduce((total, level) => total + level.strike * level.openInterest, 0) / weight;
}

function percentileRank(values: number[], value: number) {
  const usable = values.filter((item) => item > 0);
  if (!usable.length) return 0;
  return usable.filter((item) => item <= value).length / usable.length * 100;
}

function baselineStrengthScore(value: number, thresholds: OpenInterestThresholds) {
  if (value >= thresholds.major) {
    return clamp(85 + (value / Math.max(thresholds.major, 1) - 1) * 15);
  }
  if (value >= thresholds.strong) {
    return 70 + (value - thresholds.strong) / Math.max(thresholds.major - thresholds.strong, 1) * 15;
  }
  return 50 + (value - thresholds.watch) / Math.max(thresholds.strong - thresholds.watch, 1) * 20;
}

function strengthFromScore(score: number): OpenInterestStrength {
  if (score >= 85) return "major";
  if (score >= 70) return "strong";
  return "watch";
}

function buildClusters(levels: OpenInterestLevel[], clusterGap: number) {
  const clusters: OpenInterestLevel[][] = [];
  [...levels].sort((left, right) => left.strike - right.strike).forEach((level) => {
    const current = clusters[clusters.length - 1];
    if (!current || level.strike - current[current.length - 1].strike > clusterGap) clusters.push([level]);
    else current.push(level);
  });
  return clusters;
}

function consecutivePersistence(
  sessions: HistoricalOpenInterestSession[],
  side: OpenInterestSide,
  lowStrike: number,
  highStrike: number,
  clusterGap: number,
  watchThreshold: number,
) {
  let count = 1;
  for (const session of sessions) {
    const persists = session.levels.some((level) => (
      level.side === side
      && level.strike >= lowStrike - clusterGap
      && level.strike <= highStrike + clusterGap
      && level.openInterest >= watchThreshold * 0.75
    ));
    if (!persists) break;
    count += 1;
  }
  return count;
}

function nearestBoundary(role: ReactionRole, side: OpenInterestSide, low: number, high: number) {
  if (role === "support") return high;
  if (role === "resistance") return low;
  return side === "call" ? high : low;
}

function scoreZone(
  cluster: OpenInterestLevel[],
  role: ReactionRole,
  input: EngineInput,
  config: ZoneConfig,
) {
  const lowStrike = cluster[0].strike;
  const highStrike = cluster[cluster.length - 1].strike;
  const totalOpenInterest = cluster.reduce((total, level) => total + level.openInterest, 0);
  const strongest = [...cluster].sort((left, right) => right.openInterest - left.openInterest)[0];
  const boundary = nearestBoundary(role, strongest.side, lowStrike, highStrike);
  const distancePoints = Math.abs(input.referencePrice - boundary);
  const historicalValues = input.history.flatMap((session) => session.levels)
    .filter((level) => level.side === strongest.side)
    .map((level) => level.openInterest);
  const historical = input.thresholds.source === "calibrated"
    ? percentileRank(historicalValues, strongest.openInterest)
    : baselineStrengthScore(strongest.openInterest, input.thresholds);
  const clusterScore = clamp(totalOpenInterest / Math.max(input.thresholds.major * 1.5, 1) * 100);
  const proximity = clamp((1 - distancePoints / Math.max(config.windowPoints, 1)) * 100);
  const persistenceSessions = consecutivePersistence(
    input.history,
    strongest.side,
    lowStrike,
    highStrike,
    config.clusterGap,
    input.thresholds.watch,
  );
  const persistence = clamp(persistenceSessions / 5 * 100);
  const oppositeSide: OpenInterestSide = strongest.side === "call" ? "put" : "call";
  const oppositeTotal = input.levels
    .filter((level) => level.side === oppositeSide && level.strike >= lowStrike && level.strike <= highStrike)
    .reduce((total, level) => total + level.openInterest, 0);
  const dominance = totalOpenInterest + oppositeTotal
    ? totalOpenInterest / (totalOpenInterest + oppositeTotal) * 100
    : 100;
  const scoreBreakdown = {
    historical: Math.round(clamp(historical)),
    cluster: Math.round(clusterScore),
    proximity: Math.round(proximity),
    persistence: Math.round(persistence),
    dominance: Math.round(dominance),
  };
  const score = Math.round(
    scoreBreakdown.historical * 0.35
    + scoreBreakdown.cluster * 0.25
    + scoreBreakdown.proximity * 0.2
    + scoreBreakdown.persistence * 0.1
    + scoreBreakdown.dominance * 0.1
  );

  return {
    side: strongest.side,
    role,
    lowStrike,
    highStrike,
    centerStrike: weightedCenter(cluster),
    totalOpenInterest,
    peakOpenInterest: strongest.openInterest,
    strongestStrike: strongest.strike,
    levelCount: cluster.length,
    strength: strengthFromScore(score),
    score,
    scoreBreakdown,
    persistenceSessions,
    distancePercent: input.referencePrice > 0 ? distancePoints / input.referencePrice * 100 : 0,
    distancePoints,
    windowPoints: config.windowPoints,
    isExtended: false,
    rank: 0,
  } satisfies OpenInterestReactionZone;
}

function roleZones(
  side: OpenInterestSide,
  role: "support" | "resistance",
  input: EngineInput,
  config: ZoneConfig,
) {
  const isDirectional = (level: OpenInterestLevel) => role === "support"
    ? level.strike <= input.referencePrice
    : level.strike >= input.referencePrice;
  const eligible = input.levels.filter((level) => (
    level.side === side && level.openInterest >= input.thresholds.watch && isDirectional(level)
  ));
  const inWindow = eligible.filter((level) => Math.abs(level.strike - input.referencePrice) <= config.windowPoints);
  const zones = buildClusters(inWindow, config.clusterGap)
    .map((cluster) => scoreZone(cluster, role, input, config))
    .sort((left, right) => right.score - left.score || left.distancePoints - right.distancePoints)
    .slice(0, 3);

  if (zones.length) return zones.map((zone, index) => ({ ...zone, rank: index + 1 }));

  const extended = buildClusters(
    eligible.filter((level) => Math.abs(level.strike - input.referencePrice) > config.windowPoints),
    config.clusterGap,
  )
    .map((cluster) => ({ ...scoreZone(cluster, role, input, config), isExtended: true }))
    .sort((left, right) => left.distancePoints - right.distancePoints || right.score - left.score)[0];
  return extended ? [{ ...extended, rank: 1 }] : [];
}

function attractionZones(input: EngineInput, config: ZoneConfig) {
  const candidates = input.levels.filter((level) => (
    level.openInterest >= input.thresholds.watch
    && Math.abs(level.strike - input.referencePrice) <= config.windowPoints
    && ((level.side === "call" && level.strike < input.referencePrice)
      || (level.side === "put" && level.strike > input.referencePrice))
  ));

  return (["call", "put"] as OpenInterestSide[]).flatMap((side) => (
    buildClusters(candidates.filter((level) => level.side === side), config.clusterGap)
      .map((cluster) => scoreZone(cluster, "magnet", input, config))
  ))
    .sort((left, right) => right.score - left.score || left.distancePoints - right.distancePoints)
    .slice(0, 2)
    .map((zone, index) => ({ ...zone, rank: index + 1 }));
}

export function buildReactionMap(input: EngineInput) {
  const config = CONFIG[input.symbol] || { windowPoints: 10, clusterGap: 2 };
  if (!(input.referencePrice > 0)) {
    return {
      analysisWindowPoints: config.windowPoints,
      reactionZones: [] as OpenInterestReactionZone[],
      attractionZones: [] as OpenInterestReactionZone[],
      localLevels: [] as OpenInterestLevel[],
    };
  }

  const reactionZones = [
    ...roleZones("put", "support", input, config),
    ...roleZones("call", "resistance", input, config),
  ];
  const localLevels = input.levels.filter((level) => (
    Math.abs(level.strike - input.referencePrice) <= config.windowPoints
    && level.openInterest >= input.thresholds.watch / 2
  ));

  return {
    analysisWindowPoints: config.windowPoints,
    reactionZones,
    attractionZones: attractionZones(input, config),
    localLevels,
  };
}
