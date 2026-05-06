/**
 * Sentry initialization. Lazy: no-op if SENTRY_DSN env is unset, so local
 * dev and unconfigured staging environments don't ship errors anywhere.
 *
 * PII handling: every event passes through redactPii() before send. We
 * specifically blank out user.email, user.username, user.ip_address per
 * Sentry's user-context fields, and recursively redact request bodies and
 * extra contexts.
 */
import type * as SentryNs from '@sentry/nextjs';

import { redactPii } from './pii';

let initialized = false;
let SentryRef: typeof SentryNs | null = null;

export async function initSentryServer(): Promise<void> {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  // Dynamic import keeps Sentry out of the bundle for environments that
  // don't use it, and avoids loading its initialisation code at module
  // import time.
  const Sentry = await import('@sentry/nextjs');
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
    beforeSend(event) {
      // Wipe user identification fields entirely.
      if (event.user) {
        event.user = { id: event.user.id ? '[redacted]' : undefined };
      }
      // Strip the request body if Sentry decided to attach one.
      if (event.request) {
        event.request = {
          ...event.request,
          headers: undefined, // never send headers — auth tokens, cookies live there
          data: event.request.data ? redactPii(event.request.data) : undefined,
        };
      }
      // Recursively redact extras + contexts.
      if (event.extra) event.extra = redactPii(event.extra);
      if (event.contexts) {
        // Don't strip the runtime/os contexts — they're useful and PII-free.
        // Only redact explicitly-app-supplied ones.
        const { app, ...rest } = event.contexts;
        event.contexts = { ...rest, ...(app ? { app: redactPii(app) } : {}) };
      }
      return event;
    },
  });
  SentryRef = Sentry;
  initialized = true;
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!SentryRef) return;
  SentryRef.captureException(err, context ? { extra: redactPii(context) } : undefined);
}
