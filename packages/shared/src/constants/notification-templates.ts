/**
 * Notification template keys — registered in packages/notifications/templates
 * and pre-submitted to Termii for WhatsApp template approval.
 *
 * `transactional` templates bypass the per-user rate limit (max 2
 * non-transactional WhatsApp/day). `marketing` templates count toward it.
 */
export const NOTIFICATION_TEMPLATES = {
  otp_code: { kind: 'transactional', channels: ['whatsapp', 'sms'] },
  welcome: { kind: 'marketing', channels: ['whatsapp', 'sms', 'email'] },
  daily_reminder: { kind: 'marketing', channels: ['whatsapp', 'email'] },
  streak_alert: { kind: 'marketing', channels: ['whatsapp'] },
  weekly_summary: { kind: 'marketing', channels: ['whatsapp', 'email'] },
  payment_success: { kind: 'transactional', channels: ['whatsapp', 'sms', 'email'] },
  payment_failed: { kind: 'transactional', channels: ['whatsapp', 'sms', 'email'] },
  subscription_expiring: { kind: 'transactional', channels: ['whatsapp', 'email'] },
  subscription_expired: { kind: 'transactional', channels: ['whatsapp', 'email'] },
  exam_countdown: { kind: 'marketing', channels: ['whatsapp'] },
  referral_qualified: { kind: 'marketing', channels: ['whatsapp', 'email'] },
  mock_result: { kind: 'marketing', channels: ['whatsapp'] },
  admin_broadcast: { kind: 'marketing', channels: ['whatsapp', 'sms', 'email'] },
} as const;

export type TemplateKey = keyof typeof NOTIFICATION_TEMPLATES;

export const isTransactional = (key: TemplateKey): boolean =>
  NOTIFICATION_TEMPLATES[key].kind === 'transactional';

export const NON_TRANSACTIONAL_DAILY_CAP = 2;
