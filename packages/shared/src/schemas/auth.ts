import { z } from 'zod';

import { nigerianPhoneSchema, otpCodeSchema, uuidSchema } from './primitives';

export const requestOtpSchema = z.object({
  phone: nigerianPhoneSchema,
});
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  phone: nigerianPhoneSchema,
  code: otpCodeSchema,
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const resendOtpSchema = z.object({
  phone: nigerianPhoneSchema,
  channel: z.enum(['whatsapp', 'sms']),
});
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;

export const googleSignInSchema = z.object({
  idToken: z.string().min(50),
});
export type GoogleSignInInput = z.infer<typeof googleSignInSchema>;

export const sessionUserSchema = z.object({
  id: uuidSchema,
  phone: z.string(),
  email: z.string().nullable(),
  fullName: z.string().nullable(),
  subscriptionTier: z.enum(['free', 'basic', 'pro']),
  onboardingCompleted: z.boolean(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const authSessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number().int(),
});

export const verifyOtpResponseSchema = z.object({
  session: authSessionSchema,
  user: sessionUserSchema,
  isNewUser: z.boolean(),
});
export type VerifyOtpResponse = z.infer<typeof verifyOtpResponseSchema>;
