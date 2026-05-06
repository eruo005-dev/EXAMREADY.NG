import { z } from 'zod';

import { NOTIFICATION_TEMPLATES } from '../constants/notification-templates';
import { nigerianPhoneSchema, uuidSchema } from './primitives';

export const notificationChannelSchema = z.enum(['whatsapp', 'sms', 'email', 'push']);

export const templateKeySchema = z.enum(
  Object.keys(NOTIFICATION_TEMPLATES) as [keyof typeof NOTIFICATION_TEMPLATES],
);

export const adminTestNotificationSchema = z.object({
  userId: uuidSchema,
  templateKey: templateKeySchema,
  channel: notificationChannelSchema.exclude(['push']),
  vars: z.record(z.string(), z.string()).default({}),
});
export type AdminTestNotificationInput = z.infer<typeof adminTestNotificationSchema>;

/**
 * Supabase Send SMS Hook payload — see docs.supabase.com/auth/auth-hooks
 * Standard Webhooks v1 envelope: { user, sms: { otp } }
 */
export const supabaseSendSmsHookSchema = z.object({
  user: z.object({
    id: uuidSchema.optional(),
    phone: nigerianPhoneSchema,
  }),
  sms: z.object({
    otp: z.string().regex(/^\d{4,8}$/),
  }),
});
export type SupabaseSendSmsHookPayload = z.infer<typeof supabaseSendSmsHookSchema>;
