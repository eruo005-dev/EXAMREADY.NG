/**
 * Domain types not derived from Zod schemas — typically things returned by
 * specific API endpoints where the response is shaped from JOINed DB queries
 * rather than mirroring a single table.
 */

export type DashboardData = {
  user: {
    id: string;
    fullName: string | null;
    subscriptionTier: 'free' | 'basic' | 'pro';
    subscriptionExpiresAt: string | null;
    streakDays: number;
    readyPointsBalance: number;
  };
  targetExams: Array<{
    examId: string;
    examName: string;
    examDate: string | null;
    daysUntil: number | null;
  }>;
  stats30d: {
    questionsAnswered: number;
    accuracyPercent: number;
    studyTimeSeconds: number;
    attemptsCount: number;
  };
  weakTopics: Array<{
    topicId: string;
    topicName: string;
    subjectName: string;
    accuracyPercent: number;
    attempts: number;
  }>;
  recentAttempts: Array<{
    attemptId: string;
    mode: string;
    examName: string;
    correctCount: number;
    totalQuestions: number;
    submittedAt: string;
  }>;
  inProgressAttempt: {
    attemptId: string;
    mode: string;
    questionsRemaining: number;
    startedAt: string;
  } | null;
};

export type HealthStatus = {
  ok: boolean;
  db: { ok: boolean; latencyMs: number };
  redis: { ok: boolean; latencyMs: number };
  version: string;
};
