/**
 * Feature limits per subscription tier. These power the tier-gate checks
 * in API routes (POST /api/attempts uses MOCK_CBT_PER_WEEK_FREE) and the
 * pricing page comparison table.
 *
 * Free-tier mock_cbt cap is a ROLLING 7-day window measured from the user's
 * most recently submitted mock_cbt attempt — not calendar week.
 */
export const FEATURE_LIMITS = {
  free: {
    aiQuestionsPerDay: 5,
    mockCbtRollingDays: 7, // 1 mock per rolling 7-day window
    showAds: true,
    offlineDownloads: false,
    prioritySupport: false,
  },
  basic: {
    aiQuestionsPerDay: 20,
    mockCbtRollingDays: 0, // unlimited
    showAds: false,
    offlineDownloads: false,
    prioritySupport: false,
  },
  pro: {
    aiQuestionsPerDay: Infinity,
    mockCbtRollingDays: 0, // unlimited
    showAds: false,
    offlineDownloads: true,
    prioritySupport: true,
  },
} as const;

export type SubscriptionTier = keyof typeof FEATURE_LIMITS;
