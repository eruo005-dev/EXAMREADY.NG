/**
 * Unified send() — single entry point for all notifications.
 *
 * Behavior:
 * 1. Render the requested template
 * 2. Send via the primary channel
 * 3. If WhatsApp synchronously rejects ("not_on_whatsapp", "invalid_number"),
 *    immediately fall through to SMS in the same request — sub-second latency
 *    so the user doesn't notice the fallback
 * 4. Returns the (channel, providerMessageId) of whatever ultimately sent
 *
 * Caller is responsible for:
 * - Checking opt-in flags (api routes do this against users.whatsapp_opted_in etc.)
 * - Enforcing the 2/day non-transactional WhatsApp cap (see ratelimit.ts)
 * - Writing to notification_log (see log.ts)
 *
 * This separation lets one transactional handler (the OTP webhook) bypass
 * those gates while marketing crons honour them.
 */
import type { TemplateKey } from '@examready/shared';

import { sendResend } from './providers/resend';
import { sendTermii } from './providers/termii';
import { getEmailSubject, renderTemplate } from './templates/registry';

export type Channel = 'whatsapp' | 'sms' | 'email';

export type SendInput = {
  templateKey: TemplateKey;
  to: { phone?: string; email?: string };
  channel: Channel;
  /** If primary fails synchronously, try this next. Sprint 0 supports 1-deep fallback. */
  fallback?: Channel;
  vars: Record<string, string>;
  pidgin?: boolean;
};

export type SendResult = {
  ok: boolean;
  channelUsed: Channel | null;
  providerMessageId?: string;
  errorMessage?: string;
  /**
   * Set when the primary channel rejected synchronously and we fell through.
   * Useful for analytics: "what % of WA OTPs fall back to SMS?"
   */
  fellBackTo?: Channel;
};

export async function send(input: SendInput): Promise<SendResult> {
  const rendered = renderTemplate(input.templateKey, input.vars, { pidgin: input.pidgin });

  const tryChannel = async (channel: Channel): Promise<SendResult> => {
    if ((channel === 'whatsapp' || channel === 'sms') && !input.to.phone) {
      return { ok: false, channelUsed: null, errorMessage: `Phone required for ${channel}` };
    }
    if (channel === 'email' && !input.to.email) {
      return { ok: false, channelUsed: null, errorMessage: 'Email required for email channel' };
    }

    if (channel === 'whatsapp' || channel === 'sms') {
      const r = await sendTermii({
        to: input.to.phone!,
        body: rendered.body,
        channel,
      });
      if (r.ok) {
        return { ok: true, channelUsed: channel, providerMessageId: r.providerMessageId };
      }
      return {
        ok: false,
        channelUsed: null,
        errorMessage: r.errorMessage,
        ...(r.syncRejection ? { _syncRejection: r.syncRejection } : {}),
      } as SendResult & { _syncRejection?: string };
    }

    const subject = getEmailSubject(input.templateKey) ?? 'ExamReady';
    const r = await sendResend({
      to: input.to.email!,
      subject,
      body: rendered.body,
    });
    return r.ok
      ? { ok: true, channelUsed: 'email', providerMessageId: r.providerMessageId }
      : { ok: false, channelUsed: null, errorMessage: r.errorMessage };
  };

  const primary = await tryChannel(input.channel);
  if (primary.ok) return primary;

  if (input.fallback && input.fallback !== input.channel) {
    const fallback = await tryChannel(input.fallback);
    if (fallback.ok) {
      return { ...fallback, fellBackTo: input.fallback };
    }
    return {
      ok: false,
      channelUsed: null,
      errorMessage: `Both ${input.channel} and ${input.fallback} failed: ${primary.errorMessage} / ${fallback.errorMessage}`,
    };
  }

  return primary;
}
