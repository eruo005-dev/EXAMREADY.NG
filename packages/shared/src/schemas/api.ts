import { z } from 'zod';

/**
 * Canonical response envelopes.
 *
 * All non-webhook routes return either:
 *   { ok: true, data: T }     — success
 *   { ok: false, error: { code, message, details? } }   — error
 *
 * 429 responses additionally set the HTTP `Retry-After` header (in seconds)
 * AND embed retryAfterSeconds in the body for clients that ignore the header.
 */

export const apiSuccessSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ ok: z.literal(true), data });

export const apiErrorCodes = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'TIER_LIMIT_EXCEEDED',
  'PAYMENT_REQUIRED',
  'WEBHOOK_SIGNATURE_INVALID',
  'BAD_GATEWAY',
  'INTERNAL_ERROR',
  // Sprint 6 additions
  'FEATURE_DISABLED', // env-flag-gated feature (e.g. Pidgin) is currently off
  'INSUFFICIENT_DATA', // Predicted Score requires N+ submitted answers
] as const;
export type ApiErrorCode = (typeof apiErrorCodes)[number];

export const apiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.enum(apiErrorCodes),
    message: z.string(),
    details: z.unknown().optional(),
    /**
     * Present on RATE_LIMITED responses. Mirrored as the HTTP Retry-After
     * header. Frontend should respect whichever it sees first.
     */
    retryAfterSeconds: z.number().int().nonnegative().optional(),
    /**
     * Present on TIER_LIMIT_EXCEEDED for the rolling-7-day mock_cbt cap.
     * UI uses this to render "Next mock available in 4 days, 3 hours".
     */
    nextAvailableAt: z.string().datetime().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** Helper for typing handlers that return either shape. */
export type ApiResponse<T> =
  | { ok: true; data: T }
  | (z.infer<typeof apiErrorSchema> & {
      error: { code: ApiErrorCode };
    });
