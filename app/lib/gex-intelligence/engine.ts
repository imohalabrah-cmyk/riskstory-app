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

type UsableStrike = ExposureStrike & { totalOpenInterest: number; magnitude: number };

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

function median(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function usableRows(market: MarketRead): UsableStrike[] {
  return (market.exposure?.rows || [])
    .filter((row) => Number.isFinite(row.strike) && Number.isFinite(row.netGex) && row.strike > 0)
    .map((row) => ({
      ...row,
      totalOpenInterest: Math.max(0, row.callOpenInterest) + Math.max(0, row.putOpenInterest),
      magnitude: Math.abs(row.netGex),
    }))
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

function levelIsolation(rows: UsableStrike[], index: number, medianStep: number): IntelligenceScore {
  if (!medianStep || rows.length < 3) {
    return unavailable("Isolation needs at least three provider-backed strikes with a measurable spacing.");
  }
  const previousGap = index > 0 ? rows[index].strike - rows[index - 1].strike : Number.NaN;
  const nextGap = index < rows.length - 1 ? rows[index + 1].strike - rows[index].strike : Number.NaN;
  const usableGaps = [previousGap, nextGap].filter((gap) => Number.isFinite(gap) && gap > 0);
  if (!usableGaps.length) return unavailable("No neighboring provider-backed strike is available to measure isolation.");

  const averageGap = usableGaps.reduce((total, gap) => total + gap, 0) / usableGaps.length;
  return {
    score: roundScore((averageGap / medianStep - 1) / 2 * 100),
    availability: "available",
    explanation: "Spacing score derived from adjacent available strikes; it does not infer order-book liquidity.",
    inputs: ["strike spacing"],
  };
}

function levelConfluence(market: MarketRead, row: UsableStrike, step: number, strength: IntelligenceScore): IntelligenceScore {
  const tolerance = Math.max(step / 2, row.strike * 0.0005);
  const matches = market.levels.filter((level) => Math.abs(level.price - row.strike) <= tolerance);
  if (!matches.length) {
    return {
      score: roundScore((strength.score || 0) * 0.45),
      availability: "available",
      explanation: "No named market level currently matches this strike; score reflects only the local GEX concentration.",
      inputs: ["netGex", "open interest"],
    };
  }
  const namedStrength = matches.reduce((total, level) => total + level.strength, 0) / matches.length;
  return {
    score: roundScore((strength.score || 0) * 0.55 + namedStrength * 0.45),
    availability: "available",
    explanation: "Local GEX concentration aligns with one or more provider-derived market levels at this strike.",
    inputs: ["netGex", "open interest", "market levels"],
  };
}

function buildLevels(market: MarketRead, rows: UsableStrike[], spot: number) {
  const maximumMagnitude = Math.max(...rows.map((row) => row.magnitude), 1);
  const maximumOpenInterest = Math.max(...rows.map((row) => row.totalOpenInterest), 1);
  const medianStep = median(rows.slice(1).map((row, index) => row.strike - rows[index].strike));
  const strongest = rows
    .map((row, index): GexLevelAssessment => {
      const strength = levelStrength(row, maximumMagnitude, maximumOpenInterest);
      return {
        strike: row.strike,
        netGex: row.netGex,
        totalOpenInterest: row.totalOpenInterest,
        direction: direction(row.netGex, maximumMagnitude * 0.02),
        distancePoints: Math.abs(row.strike - spot),
        distancePercent: spot > 0 ? Math.abs(row.strike - spot) / spot * 100 : 0,
        levelStrength: strength,
        levelIsolation: levelIsolation(rows, index, medianStep),
        confluence: levelConfluence(market, row, medianStep, strength),
      };
    })
    .sort((left, right) => (right.levelStrength.score || 0) - (left.levelStrength.score || 0)
      || left.distancePoints - right.distancePoints)
    .slice(0, MAX_LEVELS);

  return { strongest, maximumMagnitude, medianStep };
}

function vacuumLocation(lowStrike: number, highStrike: number, spot: number): VacuumLocation {
  if (highStrike < spot) return "below_spot";
  if (lowStrike > spot) return "above_spot";
  return "crosses_spot";
}

function liquidityVacuum(rows: UsableStrike[], spot: number, maximumMagnitude: number, medianStep: number) {
  if (rows.length < 2 || !medianStep) {
    return { ...unavailable("Liquidity-vacuum scoring needs at least two regularly spaced provider-backed strikes."), intervals: [] as LiquidityVacuumInterval[] };
  }

  const intervals = rows.slice(1).map((right, index): LiquidityVacuumInterval => {
    const left = rows[index];
    const averageMagnitude = (left.magnitude + right.magnitude) / 2;
    const exposureWeakness = 1 - averageMagnitude / maximumMagnitude;
    const spacing = right.strike - left.strike;
    const gapFactor = clamp((spacing / medianStep - 1) / 2);
    const score = roundScore(exposureWeakness * 75 + gapFactor * 25);
    return {
      lowStrike: left.strike,
      highStrike: right.strike,
      location: vacuumLocation(left.strike, right.strike, spot),
      score,
      explanation: "Relative low-exposure interval derived from adjacent current GEX strikes and their spacing; it is not a prediction of price travel.",
    };
  })
    .filter((interval) => interval.score >= 45)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_VACUUMS);

  return {
    score: intervals.length ? roundScore(intervals.reduce((total, interval) => total + interval.score, 0) / intervals.length) : 0,
    availability: "available" as const,
    explanation: intervals.length
      ? "Score summarizes the strongest low-exposure intervals in the current chain snapshot."
      : "No material low-exposure interval was found in the current chain snapshot.",
    inputs: ["netGex", "strike spacing"],
    intervals,
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
    explanation: "Composite consistency score for the strongest current GEX levels, their spacing, named-level alignment, and market clarity. It does not express a trading direction.",
    inputs: ["level strength", "level isolation", "market levels", "market clarity"],
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

  const { strongest, maximumMagnitude, medianStep } = buildLevels(market, rows, spot);
  const vacuum = liquidityVacuum(rows, spot, maximumMagnitude, medianStep);
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
