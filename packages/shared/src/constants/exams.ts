/**
 * Stable exam slugs matching the seed data. Used as type-safe references
 * in cohort filters, marketing copy, and AdSense placement decisions.
 */
export const EXAM_SLUGS = [
  'jamb-utme',
  'waec-ssce',
  'neco-ssce',
  'post-utme',
  'gce',
  'nabteb',
  'ican',
  'jupeb',
  'ielts',
  'sat',
] as const;

export type ExamSlug = (typeof EXAM_SLUGS)[number];

/**
 * Exams that include minors (typically 14-17). These users must see only
 * non-personalized AdSense ads and cannot use any feature that involves
 * peer-to-peer messaging beyond moderated study groups.
 */
export const EXAMS_FOR_MINORS: readonly ExamSlug[] = [
  'jamb-utme',
  'waec-ssce',
  'neco-ssce',
  'post-utme',
  'gce',
  'nabteb',
];
