import type { ExposureStrike, MarketRead } from "../market/types";
import type {
  GexDirection,
  GexIntelligenceRead,
  GexLevelAssessment,
  IntelligenceScore,
  LiquidityVacuumInterval,
  VacuumLocation,
} from "./types";

const MAX_LEVELS = 12;
const MAX_VACUUMS = 5;
const ISOLATION_WINDOW = 2;
const STRONG_LEVEL_SCORE = 70;
const WEAK_LEVEL_SCORE = 45;

type UsableStrike = Omit<ExposureStrike, "callOpenInterest" | "putOpenInterest"> & { callOpenInterest: number; putOpenInterest: number; totalOpenInterest: number; magnitude: number };
type StrengthRow = { row: UsableStrike; strength: IntelligenceScore };

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundScore(value: number) {
  return Math.round(clamp(value));
}

function unavailable(explanation: string): IntelligenceScore {
  return { score: null, availability: "unavailable", explanation, inputs: [] };
}

function direction(value: number, tolerance = 0): GexDirection {
  if (value > tolerance) return "positive";
  if (value < -tolerance) return "negative";
  return "balanced";
}

function usableRows(market: MarketRead): UsableStrike[] {
  return (market.exposure?.rows || [])
    .flatMap((row) => {
      const callOpenInterest = row.callOpenInterest;
      const putOpenInterest = row.putOpenInterest;
      if (!Number.isFinite(row.strike) || !Number.isFinite(row.netGex) || row.strike <= 0 || typeof callOpenInterest !== "number" || typeof putOpenInterest !== "number") return [];
      return [{ ...row, callOpenInterest, putOpenInterest, totalOpenInterest: Math.max(0, callOpenInterest) + Math.max(0, putOpenInterest), magnitude: Math.abs(row.netGex) }];
    })
    .filter((row) => row.magnitude > 0)
    .sort((left, right) => left.strike - right.strike);
}

function levelStrength(row: UsableStrike, maximumMagnitude: number, maximumOpenInterest: number): IntelligenceScore {
  const magnitude = maximumMagnitude ? row.magnitude / maximumMagnitude * 100 : 0;
  const openInterest = maximumOpenInterest ? row.totalOpenInterest / maximumOpenInterest * 100 : 0;
  return {
    score: roundScore(magnitude * 0.7 + openInterest * 0.3),
    availability: "available",
    explanation: "Relative concentration score derived from the current option-chain GEX magnitude and open interest at this strike.",
    inputs: ["netGex", "callOpenInterest", "putOpenInterest"],
  };
}

function levelIsolation(strengths: StrengthRow[], index: number): IntelligenceScore {
  const ownStrength = strengths[index]?.strength.score;
  const neighbors = strengths.filter((_, candidate) => (
    candidate !== index && Math.abs(candidate - index) <= ISOLATION_WINDOW
  ));
  if (ownStrength === null || ownStrength === undefined || neighbors.length < 2) {
    return unavailable("Isolation needs a scored level and at least two adjacent provider-backed strikes.");
  }

  const neighboringStrength = neighbors.reduce((total, item) => total + (item.strength.score || 0), 0) / neighbors.length;
  // A level is isolated only when it is strong itself and its surrounding exposure is materially weaker.
  const contrast = clamp((ownStrength - neighboringStrength) / Math.max(100 - neighboringStrength, 1) * 100);
  const neighborhoodWeakness = 100 - neighboringStrength;
  const ownStrengthGate = 0.6 + ownStrength / 100 * 0.4;
  return {
    score: roundScore((contrast * 0.7 + neighborhoodWeakness * 0.3) * ownStrengthGate),
    availability: "available",
    explanation: "Relative prominence score comparing this level's current GEX/OI strength with the nearest available surrounding strikes.",
    inputs: ["level strength", "neighboring netGex", "neighboring open interest"],
  };
}

function levelConfluence(row: UsableStrike, spot: number, strength: IntelligenceScore, isolation: IntelligenceScore): IntelligenceScore {
  if (strength.score === null || isolation.score === null || !(spot > 0)) {
    return unavailable("Confluence needs a valid spot price plus strength and isolation scores.");
  }
  const proximity = clamp((1 - Math.abs(row.strike - spot) / Math.max(spot * 0.05, 1)) * 100);
  return {
    score: roundScore(strength.score * 0.5 + isolation.score * 0.3 + proximity * 0.2),
    availability: "available",
    explanation: "Composite local-context score from this level's strength, surrounding-exposure contrast, and distance from the provider-backed spot price. These are related snapshot descriptors, not independent confirmation sources.",
    inputs: ["level strength", "level isolation", "spot price"],
  };
}

function buildLevels(rows: UsableStrike[], spot: number) {
  const maximumMagnitude = Math.max(...rows.map((row) => row.magnitude), 1);
  const maximumOpenInterest = Math.max(...rows.map((row) => row.totalOpenInterest), 1);
  const strengths = rows.map((row) => ({ row, strength: levelStrength(row, maximumMagnitude, maximumOpenInterest) }));
  const strongest = strengths
    .map(({ row, strength }, index): GexLevelAssessment => {
      const isolation = levelIsolation(strengths, index);
      return {
        strike: row.strike,
        netGex: row.netGex,
        totalOpenInterest: row.totalOpenInterest,
        direction: direction(row.netGex, maximumMagnitude * 0.02),
        distancePoints: Math.abs(row.strike - spot),
        distancePercent: spot > 0 ? Math.abs(row.strike - spot) / spot * 100 : 0,
        levelStrength: strength,
        levelIsolation: isolation,
        confluence: levelConfluence(row, spot, strength, isolation),
      };
    })
    .sort((left, right) => (right.levelStrength.score || 0) - (left.levelStrength.score || 0)
      || left.distancePoints - right.distancePoints)
    .slice(0, MAX_LEVELS);

  return { strongest, strengths, maximumMagnitude };
}

function vacuumLocation(lowStrike: number, highStrike: number, spot: number): VacuumLocation {
  if (highStrike < spot) return "below_spot";
  if (lowStrike > spot) return "above_spot";
  return "crosses_spot";
}

function liquidityVacuum(strengths: StrengthRow[], spot: number) {
  if (strengths.length < 3) {
    return { ...unavailable("Low-exposure interval scoring needs at least three provider-backed strikes."), intervals: [] as LiquidityVacuumInterval[] };
  }

  const intervals: LiquidityVacuumInterval[] = [];
  let index = 0;
  while (index < strengths.length) {
    if ((strengths[index].strength.score || 0) > WEAK_LEVEL_SCORE) {
      index += 1;
      continue;
    }
    const start = index;
    while (index < strengths.length && (strengths[index].strength.score || 0) <= WEAK_LEVEL_SCORE) index += 1;
    const end = index - 1;
    const leftBoundary = strengths[start - 1];
    const rightBoundary = strengths[index];
    if (!leftBoundary || !rightBoundary || (leftBoundary.strength.score || 0) < STRONG_LEVEL_SCORE || (rightBoundary.strength.score || 0) < STRONG_LEVEL_SCORE) continue;

    const weakSegment = strengths.slice(start, end + 1);
    const averageWeakStrength = weakSegment.reduce((total, item) => total + (item.strength.score || 0), 0) / weakSegment.length;
    const boundaryStrength = ((leftBoundary.strength.score || 0) + (rightBoundary.strength.score || 0)) / 2;
    const weakness = 100 - averageWeakStrength;
    const contrast = clamp(boundaryStrength - averageWeakStrength);
    const continuity = clamp(weakSegment.length / 3 * 100);
    const score = roundScore(weakness * 0.45 + contrast * 0.45 + continuity * 0.1);
    const lowStrike = leftBoundary.row.strike;
    const highStrike = rightBoundary.row.strike;
    intervals.push({
      lowStrike,
      highStrike,
      location: vacuumLocation(lowStrike, highStrike, spot),
      score,
      explanation: "Consecutive low-exposure strikes bounded by stronger current GEX/OI concentrations. This describes option-chain exposure only, not order-book liquidity or a price forecast.",
    });
  }

  const ranked = intervals
    .filter((interval) => interval.score >= 45)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_VACUUMS);

  return {
    score: ranked.length ? roundScore(ranked.reduce((total, interval) => total + interval.score, 0) / ranked.length) : 0,
    availability: "available" as const,
    explanation: ranked.length
      ? "Score summarizes the strongest current low-exposure intervals bounded by stronger option-chain concentrations."
      : "No material low-exposure interval was found in the current chain snapshot.",
    inputs: ["netGex", "callOpenInterest", "putOpenInterest", "neighboring exposure strength"],
    intervals: ranked,
  };
}

function marketClarity(rows: UsableStrike[], market: MarketRead, maximumMagnitude: number) {
  const totalMagnitude = rows.reduce((total, row) => total + row.magnitude, 0);
  if (!totalMagnitude) return { ...unavailable("Market clarity needs non-zero current GEX values."), direction: "balanced" as GexDirection };
  const totalNet = rows.reduce((total, row) => total + row.netGex, 0);
  const dominance = Math.abs(totalNet) / totalMagnitude * 100;
  const concentration = maximumMagnitude / totalMagnitude * 100;
  const dataQuality = clamp(market.quality.completeness);
  const score = roundScore(dominance * 0.5 + concentration * 0.3 + dataQuality * 0.2);
  const tolerance = totalMagnitude * 0.04;
  return {
    score,
    availability: "available" as const,
    direction: direction(totalNet, tolerance),
    explanation: "Clarity measures the concentration and net directional imbalance of the current GEX snapshot, adjusted by reported data completeness.",
    inputs: ["netGex", "data completeness"],
  };
}

function overallConfluence(levels: GexLevelAssessment[], clarity: IntelligenceScore) {
  if (!levels.length || clarity.score === null) return unavailable("Confluence needs scored GEX levels and a market-clarity read.");
  const top = levels.slice(0, 3);
  const levelScore = top.reduce((total, level) => total + (level.confluence.score || 0), 0) / top.length;
  const isolation = top.reduce((total, level) => total + (level.levelIsolation.score || 0), 0) / top.length;
  return {
    score: roundScore(levelScore * 0.55 + isolation * 0.15 + clarity.score * 0.3),
    availability: "available" as const,
    explanation: "Composite local-context score for the strongest current GEX levels, their surrounding-exposure contrast, and market clarity. Inputs are related descriptors from one chain snapshot and are not treated as independent evidence.",
    inputs: ["level strength", "level isolation", "market clarity"],
  };
}

export function analyzeGexIntelligence(market: MarketRead): GexIntelligenceRead {
  const rows = usableRows(market);
  const spot = market.snapshot.spot;
  const generatedAt = new Date().toISOString();
  const provenance = {
    provider: market.provenance.provider,
    mode: market.provenance.mode,
    asOf: market.provenance.asOf,
    receivedAt: market.provenance.receivedAt,
  };

  if (!(spot > 0) || !rows.length) {
    const reason = !(spot > 0)
      ? "A provider-backed spot price is required before GEX intelligence can be calculated."
      : "No provider-backed exposure rows with usable net GEX are available.";
    return {
      schemaVersion: "1.0",
      symbol: market.symbol,
      generatedAt,
      provenance,
      availability: "unavailable",
      warnings: [...market.quality.warnings, reason],
      levels: [],
      liquidityVacuum: { ...unavailable(reason), intervals: [] },
      marketClarity: { ...unavailable(reason), direction: "balanced" },
      confluence: unavailable(reason),
    };
  }

  const { strongest, strengths, maximumMagnitude } = buildLevels(rows, spot);
  const vacuum = liquidityVacuum(strengths, spot);
  const clarity = marketClarity(rows, market, maximumMagnitude);
  return {
    schemaVersion: "1.0",
    symbol: market.symbol,
    generatedAt,
    provenance,
    availability: "available",
    warnings: [...market.quality.warnings],
    levels: strongest,
    liquidityVacuum: vacuum,
    marketClarity: clarity,
    confluence: overallConfluence(strongest, clarity),
  };
}
