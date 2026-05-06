import { defineRoute, ok } from '@/lib/api/handler';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ auth: 'user' })(async ({ user }) => {
  if (!user) throw new Error('user required');
  const p = user.profile;
  return ok({
    user: {
      id: p.id,
      phone: p.phone,
      email: p.email,
      fullName: p.fullName,
      age: p.age,
      state: p.state,
      school: p.school,
      subscriptionTier: p.subscriptionTier,
      subscriptionExpiresAt: p.subscriptionExpiresAt?.toISOString() ?? null,
      whatsappOptedIn: p.whatsappOptedIn,
      smsOptedIn: p.smsOptedIn,
      emailOptedIn: p.emailOptedIn,
      preferredNotificationTime: p.preferredNotificationTime,
      timezone: p.timezone,
      referralCode: p.referralCode,
      onboardingCompleted: p.onboardingCompletedAt !== null,
    },
  });
});
