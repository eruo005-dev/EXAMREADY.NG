/**
 * User-facing error message translations.
 *
 * The API returns canonical error codes (see @examready/shared apiErrorCodes).
 * This map turns those codes into copy that's friendly, specific, and actionable —
 * Nigerian student voice, no corporate fluff.
 *
 * Use via `userFacingErrorMessage(error)` in toast/dialog handlers.
 */

import type { ApiErrorCode } from '@examready/shared';

export type ApiErrorPayload = {
  code: string;
  message?: string;
  retryAfterSeconds?: number;
  nextAvailableAt?: string;
};

const fallback = 'Something went wrong on our end. Try again, or get help on WhatsApp from the contact page.';

const formatRelativeTime = (iso: string): string => {
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return 'soon';
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days >= 1) {
    return `${days} day${days === 1 ? '' : 's'}${hours > 0 ? `, ${hours} hour${hours === 1 ? '' : 's'}` : ''}`;
  }
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const minutes = Math.max(1, Math.floor(ms / (60 * 1000)));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
};

const TRANSLATIONS: Record<ApiErrorCode, (e: ApiErrorPayload) => string> = {
  VALIDATION_ERROR: () => 'Please double-check the form — something doesn\'t look right.',
  UNAUTHORIZED: () => 'Sign in to continue.',
  FORBIDDEN: () => 'You don\'t have access to this. If this looks wrong, message us on WhatsApp.',
  NOT_FOUND: () => 'We couldn\'t find that. The link might be old or the item may have been removed.',
  CONFLICT: (e) => e.message ?? 'That action collides with something else. Try refreshing.',
  RATE_LIMITED: (e) => {
    const seconds = e.retryAfterSeconds ?? 60;
    if (seconds < 60) return `Slow down a bit — try again in ${seconds}s.`;
    const minutes = Math.ceil(seconds / 60);
    return `Slow down a bit — try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
  },
  TIER_LIMIT_EXCEEDED: (e) => {
    if (e.nextAvailableAt) {
      return `Free plan limit reached. Upgrade to Pro for unlimited, or wait ${formatRelativeTime(e.nextAvailableAt)}.`;
    }
    return 'Free plan limit reached. Upgrade to Pro for unlimited access.';
  },
  PAYMENT_REQUIRED: () => 'Your subscription has lapsed. Renew to continue with this feature.',
  WEBHOOK_SIGNATURE_INVALID: () => 'Security check failed. Try again — if this keeps happening, contact support.',
  BAD_GATEWAY: () => 'A network partner is having trouble. Wait a minute and try again.',
  INTERNAL_ERROR: () => fallback,
};

export function userFacingErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return fallback;
  const e = error as ApiErrorPayload;
  if (typeof e.code !== 'string') return fallback;

  const handler = TRANSLATIONS[e.code as ApiErrorCode];
  return handler ? handler(e) : fallback;
}

/**
 * Convenience for toast-style usage:
 *   toast({ variant: 'destructive', ...errorToToast(error) })
 */
export function errorToToast(error: unknown): {
  title: string;
  description: string;
} {
  return {
    title: 'Something went wrong',
    description: userFacingErrorMessage(error),
  };
}
