/**
 * Predicted Score band-mapping (Sprint 6 — new moat).
 *
 * Maps practice accuracy → exam score band per exam. The bands are
 * calibrated to historical JAMB / WAEC / NECO scoring patterns; they
 * are not a guarantee — students who score above their prediction
 * usually studied 20%+ more in their final 4 weeks. The interpretation
 * AI call (cached 24h) tells the student that explicitly.
 *
 * Numbers are intentionally conservative — better to under-promise.
 * Tune from real data once we have at least 500 users with both a
 * predicted score and an actual exam result on file.
 */

export type ScoreBand = {
  /** Inclusive lower accuracy threshold (0-100). */
  minAccuracy: number;
  /** Inclusive upper accuracy threshold (0-100). */
  maxAccuracy: number;
  /** Predicted score range — text label rendered to the user. */
  bandLabel: string;
  /** Numeric low end (used internally for sorting / advancement messages). */
  bandLow: number;
  /** Numeric high end. */
  bandHigh: number;
};

const JAMB_BANDS: ScoreBand[] = [
  { minAccuracy: 90, maxAccuracy: 100, bandLabel: '320-360', bandLow: 320, bandHigh: 360 },
  { minAccuracy: 85, maxAccuracy: 89, bandLabel: '280-310', bandLow: 280, bandHigh: 310 },
  { minAccuracy: 75, maxAccuracy: 84, bandLabel: '260-290', bandLow: 260, bandHigh: 290 },
  { minAccuracy: 65, maxAccuracy: 74, bandLabel: '230-260', bandLow: 230, bandHigh: 260 },
  { minAccuracy: 55, maxAccuracy: 64, bandLabel: '200-230', bandLow: 200, bandHigh: 230 },
  { minAccuracy: 45, maxAccuracy: 54, bandLabel: '170-200', bandLow: 170, bandHigh: 200 },
  { minAccuracy: 0, maxAccuracy: 44, bandLabel: '< 170', bandLow: 0, bandHigh: 170 },
];

const WAEC_BANDS: ScoreBand[] = [
  { minAccuracy: 80, maxAccuracy: 100, bandLabel: 'A1', bandLow: 75, bandHigh: 100 },
  { minAccuracy: 70, maxAccuracy: 79, bandLabel: 'B2', bandLow: 70, bandHigh: 74 },
  { minAccuracy: 65, maxAccuracy: 69, bandLabel: 'B3', bandLow: 65, bandHigh: 69 },
  { minAccuracy: 60, maxAccuracy: 64, bandLabel: 'C4', bandLow: 60, bandHigh: 64 },
  { minAccuracy: 55, maxAccuracy: 59, bandLabel: 'C5', bandLow: 55, bandHigh: 59 },
  { minAccuracy: 50, maxAccuracy: 54, bandLabel: 'C6', bandLow: 50, bandHigh: 54 },
  { minAccuracy: 45, maxAccuracy: 49, bandLabel: 'D7', bandLow: 45, bandHigh: 49 },
  { minAccuracy: 40, maxAccuracy: 44, bandLabel: 'E8', bandLow: 40, bandHigh: 44 },
  { minAccuracy: 0, maxAccuracy: 39, bandLabel: 'F9', bandLow: 0, bandHigh: 39 },
];

// NECO uses the same 9-grade system as WAEC.
const NECO_BANDS: ScoreBand[] = WAEC_BANDS;

const BAND_TABLES: Record<string, ScoreBand[]> = {
  'jamb-utme': JAMB_BANDS,
  'waec-ssce': WAEC_BANDS,
  'neco-ssce': NECO_BANDS,
};

export function bandForAccuracy(examSlug: string, accuracyPercent: number): ScoreBand | null {
  const table = BAND_TABLES[examSlug];
  if (!table) return null;
  return (
    table.find((b) => accuracyPercent >= b.minAccuracy && accuracyPercent <= b.maxAccuracy) ?? null
  );
}

export type TrendDirection = 'improving' | 'plateauing' | 'declining';

/**
 * Compare 14-day rolling accuracy vs 90-day. > 5pp better = improving,
 * > 5pp worse = declining, otherwise plateauing.
 */
export function trendFromAccuracies(rolling14: number, rolling90: number): TrendDirection {
  const delta = rolling14 - rolling90;
  if (delta >= 5) return 'improving';
  if (delta <= -5) return 'declining';
  return 'plateauing';
}
