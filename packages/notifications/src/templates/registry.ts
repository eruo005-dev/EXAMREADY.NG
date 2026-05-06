/**
 * Template registry — every notification we send is defined here.
 *
 * For WhatsApp templates: Termii requires templates to be pre-approved by
 * Meta before they can be sent. The `termiiTemplateId` field is filled in
 * after submission via Termii dashboard. The README has the application
 * checklist that lists all templates so they can be submitted in one batch
 * (approval typically takes 2-5 business days per template).
 *
 * Variables use {{1}}, {{2}} numbered placeholders to match Meta's WhatsApp
 * template format. The order in the `vars` tuple defines how they're
 * mapped to placeholders.
 *
 * Pidgin variants are supplied for messages where they meaningfully change
 * tone or comprehension; users get the variant matching their `language`
 * preference (Sprint 0 default: 'en').
 */

import type { TemplateKey } from '@examready/shared';

export type RenderedTemplate = {
  body: string;
  whatsappTemplateId?: string;
};

type TemplateVariant = {
  body: string; // English with {{1}}, {{2}}, …
  pidgin?: string;
  /** Termii / Meta WhatsApp template id, set after approval. */
  whatsappTemplateId?: string;
  /** Resend email subject — only required for email-capable templates. */
  emailSubject?: string;
};

/**
 * Maps template_key to its rendered variants. Adding a new template?
 * Add it here AND register the key in @examready/shared/constants/notification-templates.
 */
export const templates = {
  otp_code: {
    body: 'Your ExamReady code is {{1}}. Valid for 10 minutes. Do not share this code with anyone.',
    emailSubject: 'Your ExamReady verification code',
  },
  welcome: {
    body: 'Welcome to ExamReady, {{1}}! Your {{2}} prep starts now. Tap here to begin: {{3}}',
    pidgin: 'Welcome to ExamReady, {{1}}! Your {{2}} prep don start. Tap here: {{3}}',
    emailSubject: 'Welcome to ExamReady',
  },
  daily_reminder: {
    body: 'Hi {{1}}, ready to study? You have {{2}} weak topics in {{3}}. Tap to start: {{4}}',
    emailSubject: 'Your daily ExamReady study reminder',
  },
  streak_alert: {
    body: '🔥 {{1}}-day streak! Your exam is in {{2}} days. Keep going.',
  },
  weekly_summary: {
    body: 'This week: {{1}} questions, {{2}}% accuracy. Ahead of {{3}}% of {{4}} students preparing for the same exam.',
    emailSubject: 'Your ExamReady weekly summary',
  },
  payment_success: {
    body: 'Payment of ₦{{1}} received. {{2}} access active until {{3}}.',
    emailSubject: 'Payment confirmed — ExamReady',
  },
  payment_failed: {
    body: 'We could not process your ₦{{1}} payment. Please retry: {{2}}',
    emailSubject: 'Payment issue — ExamReady',
  },
  subscription_expiring: {
    body: 'Your {{1}} plan expires in {{2}} days. Renew to keep ad-free access: {{3}}',
    emailSubject: 'ExamReady subscription expiring soon',
  },
  subscription_expired: {
    body: 'Your {{1}} plan has expired. Re-subscribe to restore full access: {{2}}',
    emailSubject: 'Your ExamReady subscription has expired',
  },
  exam_countdown: {
    body: '📅 {{1}} starts in {{2}} days. Your current accuracy is {{3}}%. Practice your weak topics: {{4}}',
  },
  referral_qualified: {
    body: '🎉 {{1}} subscribed using your link. You\'ve been credited 7 Pro days. Thanks for spreading the word!',
    emailSubject: 'You earned 7 free Pro days',
  },
  mock_result: {
    body: 'Mock exam done: {{1}}/{{2}} ({{3}}%). Review your answers: {{4}}',
  },
  admin_broadcast: {
    body: '{{1}}',
    emailSubject: 'Update from ExamReady',
  },
} as const satisfies Record<TemplateKey, TemplateVariant>;

/**
 * Render a template with positional vars. Variables that don't appear in
 * the template body are silently ignored; missing vars become the literal
 * placeholder so the message is obviously broken in QA rather than a silent
 * empty string in production.
 */
export function renderTemplate(
  key: TemplateKey,
  vars: Record<string, string>,
  options: { pidgin?: boolean } = {},
): RenderedTemplate {
  const tpl = templates[key];
  const source = options.pidgin && 'pidgin' in tpl && tpl.pidgin ? tpl.pidgin : tpl.body;

  // Vars are passed as { '1': 'Alice', '2': 'JAMB', … } — the numeric keys
  // map to {{1}}, {{2}}.
  const body = source.replace(/\{\{(\d+)\}\}/g, (_match, num: string) => {
    const value = vars[num];
    return value !== undefined ? value : `{{${num}}}`;
  });

  return {
    body,
    whatsappTemplateId: 'whatsappTemplateId' in tpl ? tpl.whatsappTemplateId : undefined,
  };
}

export function getEmailSubject(key: TemplateKey): string | undefined {
  const tpl = templates[key];
  return 'emailSubject' in tpl ? tpl.emailSubject : undefined;
}
