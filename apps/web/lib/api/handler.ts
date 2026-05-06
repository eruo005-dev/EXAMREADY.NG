/**
 * Handler composition — every API route uses defineRoute().
 *
 * Order: errorBoundary -> rateLimit -> auth -> zodValidate -> handler
 *
 * - errorBoundary: catches thrown ApiError + unknown errors, formats canonical envelope
 * - rateLimit: enforces the kind from defaultLimit[auth] or explicit override
 * - auth: 'public' / 'user' / 'admin' / 'cron' / 'webhook'
 * - zodValidate: parses body/query, throws ValidationError on failure
 *
 * Auth-specific kinds:
 * - 'cron' verifies Authorization: Bearer ${CRON_SECRET}
 * - 'webhook' provides per-provider HMAC verification (Paystack, Supabase, Termii)
 *   Webhook handlers never share a "trusted" code path — each verifies its own signature.
 */
import type { NextRequest } from 'next/server';
import { ZodError, type ZodTypeAny, type z } from 'zod';

import { getAuthedUser, requireAdmin, type AuthedUser } from '../auth/session';
import { applyRateLimit, type RateLimitKind } from '../ratelimit';

import { ApiError, RateLimitedError, UnauthorizedError, ValidationError } from './errors';
import { err, ok } from './responses';

export type AuthMode = 'public' | 'user' | 'admin' | 'cron' | 'webhook';

const defaultLimit: Record<AuthMode, RateLimitKind> = {
  public: 'public',
  user: 'user',
  admin: 'admin',
  cron: 'bypass',
  webhook: 'bypass',
};

export type RouteContext<TParams = Record<string, string>> = {
  params: TParams;
};

export type RouteHandlerArgs<TParsed, TParams> = {
  req: NextRequest;
  params: TParams;
  parsed: TParsed;
  user?: AuthedUser;
};

function getClientIp(req: NextRequest): string {
  const xfwd = req.headers.get('x-forwarded-for');
  if (xfwd) return xfwd.split(',')[0]!.trim();
  const real = req.headers.get('x-real-ip');
  return real ?? '0.0.0.0';
}

async function readBody(req: NextRequest): Promise<unknown> {
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return undefined;
  try {
    return await req.json();
  } catch {
    throw new ValidationError({ body: 'Invalid JSON' });
  }
}

function authenticateCron(req: NextRequest): void {
  const header = req.headers.get('authorization');
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    throw new ApiError('INTERNAL_ERROR', 'CRON_SECRET not configured', 500);
  }
  if (header !== `Bearer ${expected}`) {
    throw new UnauthorizedError('Invalid cron secret');
  }
}

/**
 * defineRoute — produces a Next.js Route Handler bound to the given config.
 *
 * S is inferred from `config.bodySchema`. TParams is specified on the
 * inner call (after currying) so the user can supply it without breaking
 * inference of S:
 *
 *   export const PATCH = defineRoute({
 *     auth: 'user',
 *     bodySchema: submitAnswerSchema,
 *   })<{ attemptId: string }>(async ({ params, parsed, user }) => { ... });
 *
 * Without a bodySchema, the handler's `parsed` is typed as `undefined`.
 * Without an explicit TParams generic on the inner call, params defaults
 * to `Record<string, string>` (any string-keyed dynamic segments).
 */
export function defineRoute<S extends ZodTypeAny | undefined = undefined>(config: {
  auth: AuthMode;
  rateLimit?: RateLimitKind;
  bodySchema?: S;
  querySchema?: ZodTypeAny;
}) {
  return function wrap<TParams = Record<string, string>>(
    handler: (
      args: RouteHandlerArgs<S extends ZodTypeAny ? z.infer<S> : undefined, TParams>,
    ) => Promise<Response>,
  ) {
    return async (req: NextRequest, ctx: RouteContext<TParams>): Promise<Response> => {
      try {
        const ip = getClientIp(req);

        // 1. Rate limit (with auth-mode default unless overridden).
        const rateLimitKind = config.rateLimit ?? defaultLimit[config.auth];
        // For 'auth' kind we need phone — pulled out of body once parsed below.
        // Public/user/admin can rate-limit before parse using ip / userId.
        let userIdForRateLimit: string | undefined;
        let phoneForRateLimit: string | undefined;

        // 2. Auth (parses cookies / headers).
        let user: AuthedUser | undefined;
        if (config.auth === 'cron') {
          authenticateCron(req);
        } else if (config.auth === 'user') {
          user = await getAuthedUser(req);
          userIdForRateLimit = user.profile.id;
        } else if (config.auth === 'admin') {
          user = await requireAdmin(req);
          userIdForRateLimit = user.profile.id;
        }
        // 'public' and 'webhook' don't authenticate here — webhooks verify
        // signatures inside their handler.

        // 3. Body parse + validation.
        let parsed: unknown = undefined;
        if (config.bodySchema) {
          const raw = await readBody(req);
          const result = (config.bodySchema as ZodTypeAny).safeParse(raw);
          if (!result.success) {
            throw new ValidationError(result.error.flatten());
          }
          parsed = result.data;
          // For auth routes, pull phone from the parsed body for rate-limit context.
          if (
            config.auth === 'public' &&
            rateLimitKind === 'auth' &&
            typeof parsed === 'object' &&
            parsed !== null &&
            'phone' in parsed &&
            typeof (parsed as { phone?: unknown }).phone === 'string'
          ) {
            phoneForRateLimit = (parsed as { phone: string }).phone;
          }
        }

        // 4. Apply rate limit (after parse so we have phone for auth bucket).
        if (rateLimitKind !== 'bypass') {
          const rl = await applyRateLimit(rateLimitKind, {
            ip,
            userId: userIdForRateLimit,
            phone: phoneForRateLimit,
          });
          if (!rl.ok) {
            throw new RateLimitedError(rl.retryAfterSeconds ?? 60);
          }
        }

        // 5. Run handler. The cast is safe — `parsed` is the validated output
        // of `config.bodySchema` (or undefined when no schema given), which
        // matches the handler's declared type.
        return await handler({
          req,
          params: ctx.params,
          parsed,
          user,
        } as Parameters<typeof handler>[0]);
      } catch (e) {
        return handleError(e);
      }
    };
  };
}

function handleError(e: unknown): Response {
  if (e instanceof ApiError) {
    return err(e.code, e.message, e.status, {
      details: e.details,
      retryAfterSeconds: e.extras?.retryAfterSeconds,
      nextAvailableAt: e.extras?.nextAvailableAt,
    });
  }
  if (e instanceof ZodError) {
    return err('VALIDATION_ERROR', 'Invalid input', 400, { details: e.flatten() });
  }
  // Auth helpers throw their own non-ApiError types.
  if (
    e instanceof Error &&
    (e.constructor.name === 'UnauthorizedError' || (e as { code?: string }).code === 'UNAUTHORIZED')
  ) {
    return err('UNAUTHORIZED', e.message, 401);
  }
  if (
    e instanceof Error &&
    (e.constructor.name === 'ForbiddenError' || (e as { code?: string }).code === 'FORBIDDEN')
  ) {
    return err('FORBIDDEN', e.message, 403);
  }

  // eslint-disable-next-line no-console
  console.error('[api] Unhandled error:', e);
  // Fire-and-forget Sentry capture. The dynamic import keeps Sentry out
  // of the bundle when DSN unset; missing module path falls through.
  void import('../observability/sentry').then(({ initSentryServer, captureError }) =>
    initSentryServer().then(() => captureError(e)),
  ).catch(() => undefined);
  return err('INTERNAL_ERROR', 'Internal server error', 500);
}

export { ok, err };
export type { AuthedUser };

// Re-export common error classes so route files can throw them.
export {
  ApiError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  TierLimitExceededError,
  UnauthorizedError,
  ValidationError,
  WebhookSignatureError,
} from './errors';
