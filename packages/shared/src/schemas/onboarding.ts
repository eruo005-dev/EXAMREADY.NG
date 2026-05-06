import { z } from 'zod';

import { nigerianStateSchema, timeOfDaySchema, timezoneSchema, uuidSchema } from './primitives';

export const targetExamInputSchema = z.object({
  examId: uuidSchema,
  examDate: z.string().date().optional(),
  subjectCombination: z.array(z.string().min(1).max(80)).max(8).optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const onboardingInputSchema = z.object({
  fullName: z.string().min(2).max(200),
  age: z.number().int().min(13).max(120),
  state: nigerianStateSchema,
  school: z.string().max(200).optional(),
  targetExams: z.array(targetExamInputSchema).min(1).max(5),
  whatsappOptedIn: z.boolean(),
  smsOptedIn: z.boolean(),
  emailOptedIn: z.boolean(),
  preferredNotificationTime: timeOfDaySchema,
  timezone: timezoneSchema.optional().default('Africa/Lagos'),
});
export type OnboardingInput = z.infer<typeof onboardingInputSchema>;

export const notificationPrefsInputSchema = z.object({
  whatsappOptedIn: z.boolean().optional(),
  smsOptedIn: z.boolean().optional(),
  emailOptedIn: z.boolean().optional(),
  preferredNotificationTime: timeOfDaySchema.optional(),
  timezone: timezoneSchema.optional(),
});
export type NotificationPrefsInput = z.infer<typeof notificationPrefsInputSchema>;
