/**
 * POST /api/waitlist
 *
 * Captures an email + exam_slug pair from the /coming-soon page so we
 * can email the user when that exam launches. Idempotent on
 * (email, exam_slug) — same submission twice is a no-op.
 *
 * Public + rate-limited (60/IP/min via the 'public' bucket).
 */
import { examWaitlist } from '@examready/db/schema';
import { z } from 'zod';


import { defineRoute, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const waitlistInputSchema = z.object({
  email: z.string().email().max(320),
  examSlug: z.string().min(1).max(80),
  sourceUrl: z.string().max(500).optional(),
});

export const POST = defineRoute({
  auth: 'public',
  rateLimit: 'public',
  bodySchema: waitlistInputSchema,
})(async ({ parsed }) => {
  await db
    .insert(examWaitlist)
    .values({
      email: parsed.email.toLowerCase().trim(),
      examSlug: parsed.examSlug,
      sourceUrl: parsed.sourceUrl,
    })
    .onConflictDoNothing();

  return ok({ added: true });
});
