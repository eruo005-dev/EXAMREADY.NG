/**
 * Termii provider — handles both WhatsApp and SMS for Nigerian numbers.
 * https://developer.termii.com
 *
 * The single Termii client is the ONLY place this codebase calls termii.com.
 * apps/web must NOT import the Termii SDK directly — it goes through
 * packages/notifications.send().
 */

export type TermiiSendInput = {
  to: string; // E.164 phone, e.g. +2348012345678
  body: string;
  channel: 'whatsapp' | 'sms';
};

export type TermiiSendResult = {
  ok: boolean;
  /** Termii's message_id for delivery-receipt correlation. */
  providerMessageId?: string;
  /**
   * If sync rejection (e.g. "not on whatsapp"), capture the reason so the
   * caller can decide whether to fall through to SMS immediately.
   */
  syncRejection?: 'not_on_whatsapp' | 'invalid_number' | 'rate_limited' | 'unknown';
  errorMessage?: string;
};

type TermiiSendResponse = {
  message_id?: string;
  code?: string;
  message?: string;
};

const TERMII_BASE_URL = 'https://api.ng.termii.com';

function normalizeForTermii(phone: string): string {
  // Termii expects "234..." without the leading +.
  return phone.startsWith('+') ? phone.slice(1) : phone;
}

/**
 * Send a single message via Termii. Caller is responsible for logging the
 * result to notification_log — this function only handles transport.
 */
export async function sendTermii(input: TermiiSendInput): Promise<TermiiSendResult> {
  const apiKey = process.env.TERMII_API_KEY;
  if (!apiKey) {
    return { ok: false, errorMessage: 'TERMII_API_KEY not configured' };
  }

  const isWhatsApp = input.channel === 'whatsapp';
  const url = `${TERMII_BASE_URL}/api/sms/send`;

  // For WhatsApp, channel=whatsapp routes via Termii's WA Business API.
  // For SMS, channel=generic uses the registered SMS sender id.
  const payload = {
    to: normalizeForTermii(input.to),
    from: process.env.TERMII_SENDER_ID ?? 'ExamReady',
    sms: input.body,
    type: 'plain',
    channel: isWhatsApp ? 'whatsapp' : 'generic',
    api_key: apiKey,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return {
      ok: false,
      errorMessage: `Network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const lowered = text.toLowerCase();
    let syncRejection: TermiiSendResult['syncRejection'] = 'unknown';
    if (lowered.includes('whatsapp') && (lowered.includes('not registered') || lowered.includes('no whatsapp'))) {
      syncRejection = 'not_on_whatsapp';
    } else if (lowered.includes('invalid') && lowered.includes('number')) {
      syncRejection = 'invalid_number';
    } else if (res.status === 429) {
      syncRejection = 'rate_limited';
    }
    return { ok: false, syncRejection, errorMessage: `Termii ${res.status}: ${text.slice(0, 500)}` };
  }

  const data = (await res.json().catch(() => ({}))) as TermiiSendResponse;

  return {
    ok: true,
    providerMessageId: data.message_id,
  };
}
