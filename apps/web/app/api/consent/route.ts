/**
 * POST /api/consent
 *
 * Records a NDPR/GDPR consent decision in consent_log. Public endpoint —
 * accepts requests from both signed-in users and anonymous visitors.
 *
 * Body: { decision: 'accept_all' | 'essential_only' | 'custom',
 *         categories?: { necessary, analytics, advertising, ... },
 *         sessionId?: string }
 *
 * The IP address is SHA-256-hashed before storage so we can satisfy
 * compliance investigations ("did user X consent on date Y?") without
 * keeping raw PII longer than necessary.
 */
import { createHash } from 'node:crypto';

import { consentLog } from '@examready/db/schema';
import { z } from 'zod';


import { defineRoute, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const consentInputSchema = z.object({
  decision: z.enum(['accept_all', 'essential_only', 'custom']),
  categories: z
    .object({
      necessary: z.literal(true).default(true), // always required
      analytics: z.boolean().default(false),
      advertising: z.boolean().default(false),
    })
    .optional(),
  sessionId: z.string().min(1).max(100).optional(),
});

function hashIp(ip: string): string {
  // Use a stable salt so the same IP hashes consistently. The salt itself
  // is the env CRON_SECRET (already required) — not perfect but adequate
  // for ratcheting back from raw IP storage.
  const salt = process.env.CRON_SECRET ?? 'examready-default-salt';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

export const POST = defineRoute({
  auth: 'public',
  rateLimit: 'public',
  bodySchema: consentInputSchema,
})(async ({ req, parsed }) => {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';

  await db.insert(consentLog).values({
    userId: null, // Anonymous endpoint — even if a user is signed in we don't
                  // surface their id here, since the consent banner is shown
                  // before authentication on the marketing surfaces.
    sessionId: parsed.sessionId,
    decision: parsed.decision,
    categories: parsed.categories ?? null,
    userAgent: (req.headers.get('user-agent') ?? '').slice(0, 500),
    ipHash: hashIp(ip),
  });

  return ok({ recorded: true });
});
