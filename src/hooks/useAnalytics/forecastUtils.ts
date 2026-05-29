import type { ExpenseRecord, StoredProduct } from "../useExpenses/types";
import type { PdfRecord } from "../usePdf/types";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

export type MonthlyTotal = {
  month: string;
  monthIndex: number;
  total: number;
};

export type ForecastPoint = {
  month: string;
  monthIndex: number;
  actual: number | null;
  forecast: number | null;
};

/** Metadata describing how the forecast was built — used for the info box. */
export type ForecastMeta = {
  /** How many months of current-year data were used */
  currentYearMonths: number;
  /** Whether previous-year seasonal data was blended in */
  usedPreviousYear: boolean;
  /** How many months of data were available from the previous year */
  previousYearMonths: number;
  /** Trend weight (0-1) */
  trendWeight: number;
  /** Seasonal weight (0-1) */
  seasonalWeight: number;
  /** Linear regression slope (monthly delta) */
  trendSlope: number;
  /** Average monthly income from known current-year months */
  currentYearAvg: number;
  /** Average monthly income from previous year (0 if unused) */
  previousYearAvg: number;
  /** 0–1 score based on data completeness and quality */
  confidenceScore: number;
  /** Summary quality level derived from confidenceScore */
  dataQuality: "low" | "medium" | "high";
  /** Human-readable explanation of weighting rationale */
  weightingExplanation: string;
};

/**
 * Aggregate expenses by month (0-11)
 */
export function getMonthlyExpenseTotals(
  expenses: ExpenseRecord[],
): MonthlyTotal[] {
  const map = new Map<number, number>();
  expenses.forEach((e) => {
    const m = new Date(e.expense_date).getMonth();
    map.set(m, (map.get(m) ?? 0) + e.amount);
  });
  return Array.from({ length: 12 }, (_, i) => ({
    month: MONTH_NAMES[i],
    monthIndex: i,
    total: map.get(i) ?? 0,
  }));
}

/**
 * Aggregate income (pdf_records profit) by month (0-11)
 */
export function getMonthlyIncomeTotals(pdfs: PdfRecord[]): MonthlyTotal[] {
  const map = new Map<number, number>();
  pdfs.forEach((p) => {
    const m = new Date(p.date_created).getMonth();
    map.set(m, (map.get(m) ?? 0) + p.profit);
  });
  return Array.from({ length: 12 }, (_, i) => ({
    month: MONTH_NAMES[i],
    monthIndex: i,
    total: map.get(i) ?? 0,
  }));
}

/**
 * Get current month index (0-based) from the wall clock.
 */
function getCurrentMonthIndex(): number {
  return new Date().getMonth();
}

/**
 * Simple linear-regression-based expense forecast.
 * Uses data from months 0..currentMonth to project currentMonth+1..11.
 */
export function buildExpenseForecast(
  expenses: ExpenseRecord[],
  year: number,
): ForecastPoint[] {
  const monthly = getMonthlyExpenseTotals(expenses);
  const currentYear = new Date().getFullYear();
  const currentMonth =
    year < currentYear ? 11 : year > currentYear ? -1 : getCurrentMonthIndex();

  // Collect months that have data up to and including current month
  const knownPoints = monthly
    .filter((m) => m.monthIndex <= currentMonth && m.total > 0)
    .map((m) => ({ x: m.monthIndex, y: m.total }));

  // Simple linear regression
  let slope = 0;
  let intercept = 0;

  if (knownPoints.length >= 2) {
    const n = knownPoints.length;
    const sumX = knownPoints.reduce((s, p) => s + p.x, 0);
    const sumY = knownPoints.reduce((s, p) => s + p.y, 0);
    const sumXY = knownPoints.reduce((s, p) => s + p.x * p.y, 0);
    const sumXX = knownPoints.reduce((s, p) => s + p.x * p.x, 0);
    const denom = n * sumXX - sumX * sumX;
    if (denom !== 0) {
      slope = (n * sumXY - sumX * sumY) / denom;
      intercept = (sumY - slope * sumX) / n;
    }
  } else if (knownPoints.length === 1) {
    // With only one data point, use it as flat projection
    intercept = knownPoints[0].y;
    slope = 0;
  }

  return monthly.map((m) => {
    if (m.monthIndex <= currentMonth) {
      return {
        month: m.month,
        monthIndex: m.monthIndex,
        actual: m.total,
        forecast:
          m.monthIndex === currentMonth && knownPoints.length >= 1
            ? m.total // overlap point
            : null,
      };
    }
    // Future months
    const projected = Math.max(0, intercept + slope * m.monthIndex);
    return {
      month: m.month,
      monthIndex: m.monthIndex,
      actual: null,
      forecast: Math.round(projected * 100) / 100,
    };
  });
}

/**
 * Linear regression helper.
 */
function linearRegression(points: { x: number; y: number }[]) {
  if (points.length < 2) {
    return { slope: 0, intercept: points.length === 1 ? points[0].y : 0 };
  }
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/**
 * Enhanced income forecast that blends current-year linear trend with
 * previous-year seasonal patterns for more accurate projections.
 *
 * Strategy:
 * - Current-year trend (linear regression) captures this year's trajectory
 * - Previous-year seasonal ratios capture month-to-month patterns
 * - When both are available, uses weighted blend (60% trend, 40% seasonal)
 * - Falls back gracefully when only one source is available
 */
export function buildIncomeForecast(
  pdfs: PdfRecord[],
  year: number,
  previousYearPdfs?: PdfRecord[],
): ForecastPoint[] {
  return buildIncomeForecastWithMeta(pdfs, year, previousYearPdfs).data;
}

/**
 * Production-grade income forecast that adaptively blends current-year
 * linear trend with previous-year seasonal patterns.
 *
 * Strategy:
 * 1. Build seasonal profile from previous year's FULL 12-month shape
 * 2. Compute growth factor from ≥2 overlapping months (default 1.0)
 * 3. Dynamic weighting: early year → lean seasonal, late year → lean trend
 * 4. Safety-cap seasonal spikes relative to current average
 * 5. Dampen volatile slopes when data is sparse (2–3 points)
 * 6. Falls back to pure trend when no previous year data
 */
export function buildIncomeForecastWithMeta(
  pdfs: PdfRecord[],
  year: number,
  previousYearPdfs?: PdfRecord[],
): { data: ForecastPoint[]; meta: ForecastMeta } {
  const monthly = getMonthlyIncomeTotals(pdfs);
  const currentYear = new Date().getFullYear();
  const currentMonth =
    year < currentYear ? 11 : year > currentYear ? -1 : getCurrentMonthIndex();

  // ── Current-year linear regression ──────────────────────────────────
  const knownPoints = monthly
    .filter((m) => m.monthIndex <= currentMonth && m.total > 0)
    .map((m) => ({ x: m.monthIndex, y: m.total }));

  const { slope: rawSlope, intercept } = linearRegression(knownPoints);

  // Dampen slope when data is sparse (2–3 points) to reduce volatility
  const slopeDampening =
    knownPoints.length >= 2 && knownPoints.length <= 3 ? 0.5 : 1.0;
  let slope = rawSlope * slopeDampening;

  const currentYearActualTotal = monthly
    .filter((m) => m.monthIndex <= currentMonth)
    .reduce((s, m) => s + m.total, 0);

  const currentYearAvg =
    knownPoints.length > 0
      ? knownPoints.reduce((s, p) => s + p.y, 0) / knownPoints.length
      : 0;

  // Light recent bias: nudge slope toward the last observed delta,
  // clamped to avoid extreme influence from large spikes
  if (knownPoints.length >= 2) {
    const last = knownPoints[knownPoints.length - 1];
    const prev = knownPoints[knownPoints.length - 2];
    const recentDelta = last.y - prev.y;
    const adjustment =
      Math.sign(recentDelta) *
      Math.min(
        Math.abs(recentDelta * 0.1),
        currentYearAvg || Math.abs(recentDelta * 0.1),
      );
    slope += adjustment;
  }

  // ── Previous-year seasonal pattern (full 12-month shape) ───────────
  const prevMonthly = previousYearPdfs?.length
    ? getMonthlyIncomeTotals(previousYearPdfs)
    : null;

  const previousYearDataMonths = prevMonthly
    ? prevMonthly.filter((m) => m.total > 0).length
    : 0;

  const prevAnnualTotal = prevMonthly
    ? prevMonthly.reduce((s, m) => s + m.total, 0)
    : 0;

  let seasonalProjections: Map<number, number> | null = null;
  let growthFactor = 1;
  let prevAvgAll = 0;

  if (prevMonthly && prevAnnualTotal > 0) {
    prevAvgAll =
      previousYearDataMonths > 0 ? prevAnnualTotal / previousYearDataMonths : 0;

    // Compute growth factor — require ≥2 overlapping months for stability
    const overlapCurrent: number[] = [];
    const overlapPrev: number[] = [];
    for (let m = 0; m <= currentMonth; m++) {
      const cVal = monthly[m]?.total ?? 0;
      const pVal = prevMonthly[m]?.total ?? 0;
      if (cVal > 0 && pVal > 0) {
        overlapCurrent.push(cVal);
        overlapPrev.push(pVal);
      }
    }

    if (overlapCurrent.length >= 2) {
      // Reliable overlap-based growth
      const sumC = overlapCurrent.reduce((a, b) => a + b, 0);
      const sumP = overlapPrev.reduce((a, b) => a + b, 0);
      growthFactor = sumC / sumP;
    } else {
      // Fallback: year-to-date ratio, or 1.0
      const prevByNow = prevMonthly
        .filter((m) => m.monthIndex <= currentMonth)
        .reduce((s, m) => s + m.total, 0);

      if (prevByNow > 0 && currentYearActualTotal > 0) {
        growthFactor = currentYearActualTotal / prevByNow;
      }
      // else keep growthFactor = 1 (same scale as last year)
    }

    // Safety cap for seasonal spikes — use the higher of current avg
    // or previous-year avg as baseline so early-year low averages
    // don't kill valid seasonal projections
    const MAX_MULTIPLIER = 3;
    const capBase = Math.max(currentYearAvg, prevAvgAll);

    // Build seasonal projections: previous year's shape × growth factor
    seasonalProjections = new Map();
    for (let m = 0; m < 12; m++) {
      if (m > currentMonth) {
        let scaled = (prevMonthly[m]?.total ?? 0) * growthFactor;
        if (capBase > 0) {
          scaled = Math.min(scaled, capBase * MAX_MULTIPLIER);
        }
        seasonalProjections.set(m, scaled);
      }
    }
  }

  // ── Dynamic weighting based on year progress ───────────────────────
  // Early year → lean on seasonal (knows the shape).
  // Late year  → lean on trend (knows the trajectory).
  const progress = (currentMonth + 1) / 12;
  const TREND_WEIGHT = seasonalProjections
    ? Math.min(0.8, 0.2 + progress)
    : 1.0;
  const SEASONAL_WEIGHT = seasonalProjections ? 1 - TREND_WEIGHT : 0.0;

  // ── Build forecast data ────────────────────────────────────────────
  const data: ForecastPoint[] = monthly.map((m) => {
    if (m.monthIndex <= currentMonth) {
      return {
        month: m.month,
        monthIndex: m.monthIndex,
        actual: m.total,
        forecast:
          m.monthIndex === currentMonth && knownPoints.length >= 1
            ? m.total
            : null,
      };
    }

    // Future months: blend trend + seasonal
    // Floor the trend using a hybrid baseline so early-year low averages
    // don't produce a weak floor when previous-year data is stronger
    const trendRaw = intercept + slope * m.monthIndex;
    const baseline = Math.max(currentYearAvg * 0.5, prevAvgAll * 0.3);
    const trendValue = Math.max(0, Math.max(baseline, trendRaw));
    const seasonalValue = seasonalProjections?.get(m.monthIndex) ?? 0;

    let blended: number;
    if (seasonalProjections) {
      // If trend projects ≤0 but seasonal is positive → trust seasonal
      if (trendValue <= 0 && seasonalValue > 0) {
        blended = seasonalValue;
      } else {
        blended = TREND_WEIGHT * trendValue + SEASONAL_WEIGHT * seasonalValue;
      }
    } else {
      blended = trendValue;
    }

    return {
      month: m.month,
      monthIndex: m.monthIndex,
      actual: null,
      forecast: Math.round(Math.max(0, blended) * 100) / 100,
    };
  });

  // ── Extended metadata ──────────────────────────────────────────────
  // Current year data is weighted 1.5× more than previous year
  const weightedDataPoints =
    knownPoints.length * 1.5 +
    (seasonalProjections ? previousYearDataMonths : 0);
  // Scale by time factor so early-year confidence is naturally lower
  const timeFactor = (currentMonth + 1) / 12;
  const confidenceScore = Math.min(
    1,
    Math.round((weightedDataPoints / 24) * (0.5 + 0.5 * timeFactor) * 100) /
      100,
  );

  const dataQuality: "low" | "medium" | "high" =
    confidenceScore < 0.25 ? "low" : confidenceScore < 0.5 ? "medium" : "high";

  const weightingExplanation = seasonalProjections
    ? `${Math.round(TREND_WEIGHT * 100)}% Trend / ${Math.round(SEASONAL_WEIGHT * 100)}% Saisonal – basierend auf ${knownPoints.length} von 12 Monaten. Die Gewichtung passt sich automatisch an: je mehr aktuelle Daten vorhanden sind, desto stärker fließt der Trend ein.`
    : knownPoints.length > 0
      ? `100% Trend — keine verwertbaren Vorjahresdaten vorhanden. Mit Vorjahresdaten könnte die Prognose saisonale Muster berücksichtigen.`
      : `Keine ausreichenden Daten für eine Prognose verfügbar.`;

  const meta: ForecastMeta = {
    currentYearMonths: knownPoints.length,
    usedPreviousYear: seasonalProjections !== null,
    previousYearMonths: previousYearDataMonths,
    trendWeight: TREND_WEIGHT,
    seasonalWeight: SEASONAL_WEIGHT,
    trendSlope: Math.round(slope * 100) / 100,
    currentYearAvg: Math.round(currentYearAvg * 100) / 100,
    previousYearAvg: Math.round(prevAvgAll * 100) / 100,
    confidenceScore,
    dataQuality,
    weightingExplanation,
  };

  return { data, meta };
}

/**
 * Calculate total forecast for rest of year
 */
export function getForecastSummary(forecastData: ForecastPoint[]) {
  const totalActual = forecastData.reduce((s, p) => s + (p.actual ?? 0), 0);
  const totalForecast = forecastData.reduce((s, p) => s + (p.forecast ?? 0), 0);
  const projectedTotal = totalActual + totalForecast;
  // Exclude overlap point (where actual and forecast both exist)
  const overlapAmount = forecastData
    .filter((p) => p.actual !== null && p.forecast !== null)
    .reduce((s, p) => s + (p.forecast ?? 0), 0);
  return {
    totalActual,
    totalForecast: totalForecast - overlapAmount,
    projectedTotal: projectedTotal - overlapAmount,
  };
}

/**
 * Get per-category expense totals from expense records.
 */
export function getCategoryExpenseTotals(
  expenses: ExpenseRecord[],
): Map<string, number> {
  const map = new Map<string, number>();
  expenses.forEach((e) => {
    const products = Array.isArray(e.products)
      ? (e.products as StoredProduct[])
      : [];
    if (products.length > 0) {
      products.forEach((p) => {
        map.set(p.category, (map.get(p.category) ?? 0) + p.amount);
      });
    } else {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    }
  });
  return map;
}
