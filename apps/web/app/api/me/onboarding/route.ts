/**
 * PATCH /api/me/onboarding
 *
 * Completes the onboarding wizard. Updates the users row, replaces
 * target_exams rows, sets onboarding_completed_at = now(). Triggers
 * the welcome notification (queued, not awaited).
 */

import { targetExams, users } from '@examready/db/schema';
import { send } from '@examready/notifications';
import { onboardingInputSchema } from '@examready/shared';
import { eq } from 'drizzle-orm';

import { defineRoute, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({
  auth: 'user',
  bodySchema: onboardingInputSchema,
})(async ({ parsed, user }) => {
  if (!user) throw new Error('user required');
  const userId = user.profile.id;

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        fullName: parsed.fullName,
        age: parsed.age,
        state: parsed.state,
        school: parsed.school,
        whatsappOptedIn: parsed.whatsappOptedIn,
        smsOptedIn: parsed.smsOptedIn,
        emailOptedIn: parsed.emailOptedIn,
        preferredNotificationTime: parsed.preferredNotificationTime,
        timezone: parsed.timezone,
        onboardingCompletedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await tx.delete(targetExams).where(eq(targetExams.userId, userId));
    await tx.insert(targetExams).values(
      parsed.targetExams.map((te) => ({
        userId,
        examId: te.examId,
        examDate: te.examDate,
        subjectCombination: te.subjectCombination,
        priority: te.priority,
      })),
    );
  });

  // Fire-and-forget welcome — failure here must not block onboarding.
  if (parsed.whatsappOptedIn || parsed.emailOptedIn) {
    void send({
      templateKey: 'welcome',
      to: { phone: user.profile.phone, email: user.profile.email ?? undefined },
      channel: parsed.whatsappOptedIn ? 'whatsapp' : 'email',
      fallback: parsed.smsOptedIn ? 'sms' : undefined,
      vars: {
        '1': parsed.fullName.split(' ')[0] ?? parsed.fullName,
        '2': 'exam',
        '3': process.env.PUBLIC_BASE_URL ?? 'https://examready.ng',
      },
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[onboarding] welcome send failed:', err);
    });
  }

  const [updated] = await db.select().from(users).where(eq(users.id, userId));
  if (!updated) throw new Error('User not found after update');

  return ok({
    user: {
      id: updated.id,
      fullName: updated.fullName,
      onboardingCompleted: true,
    },
  });
});
