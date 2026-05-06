import type { ApiErrorCode } from '@examready/shared';

/**
 * Domain errors thrown anywhere in the API layer. The handler composition
 * catches these and maps them to the canonical { ok: false, error } envelope.
 */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown,
    readonly extras?: { retryAfterSeconds?: number; nextAvailableAt?: string },
  ) {
    super(message);
  }
}

export class ValidationError extends ApiError {
  constructor(details: unknown) {
    super('VALIDATION_ERROR', 'Invalid input', 400, details);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Sign in required') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', message, 403);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Not found') {
    super('NOT_FOUND', message, 404);
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Conflict') {
    super('CONFLICT', message, 409);
  }
}

export class RateLimitedError extends ApiError {
  constructor(retryAfterSeconds: number) {
    super('RATE_LIMITED', 'Too many requests', 429, undefined, { retryAfterSeconds });
  }
}

export class TierLimitExceededError extends ApiError {
  constructor(message: string, nextAvailableAt: string) {
    super('TIER_LIMIT_EXCEEDED', message, 403, undefined, { nextAvailableAt });
  }
}

export class WebhookSignatureError extends ApiError {
  constructor(message = 'Invalid webhook signature') {
    super('WEBHOOK_SIGNATURE_INVALID', message, 401);
  }
}
