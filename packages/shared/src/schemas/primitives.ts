import { z } from 'zod';

import { isNigerianState } from '../constants/states';

/** RFC 4122 UUID. */
export const uuidSchema = z.string().uuid();

/**
 * Nigerian phone number in E.164 format.
 * Accepts +234 followed by 10 digits (the leading 0 of the local format dropped).
 * Examples: +2348012345678, +2347061234567
 */
export const nigerianPhoneSchema = z
  .string()
  .regex(/^\+234[789][01]\d{8}$/, {
    message: 'Phone must be a Nigerian number in international format, e.g. +2348012345678',
  });

export const otpCodeSchema = z.string().regex(/^\d{6}$/, '6-digit code required');

export const emailSchema = z.string().email().max(320);

export const nigerianStateSchema = z
  .string()
  .refine(isNigerianState, { message: 'Must be a valid Nigerian state' });

/** HH:MM 24-hour clock, used for preferred_notification_time. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM (24-hour)');

/**
 * Timezone — accepts any IANA name. We don't enumerate the full list but we
 * default to Africa/Lagos and the onboarding wizard does not let users
 * pick freely (it's set automatically from the browser).
 */
export const timezoneSchema = z.string().min(1).max(50);

/**
 * Cursor pagination — `cursor` is the last id of the previous page.
 * `limit` is clamped to 100 to prevent runaway queries.
 */
export const paginationSchema = z.object({
  cursor: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;
