/**
 * Resend provider — transactional email.
 * https://resend.com/docs/api-reference/emails/send-email
 */

export type ResendSendInput = {
  to: string;
  subject: string;
  body: string;
  /** Optional pre-rendered HTML; if absent, body is sent as plain text. */
  html?: string;
};

export type ResendSendResult = {
  ok: boolean;
  providerMessageId?: string;
  errorMessage?: string;
};

const RESEND_BASE_URL = 'https://api.resend.com';

export async function sendResend(input: ResendSendInput): Promise<ResendSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, errorMessage: 'RESEND_API_KEY not configured' };
  }

  const from = process.env.RESEND_FROM_EMAIL ?? 'hello@examready.ng';

  let res: Response;
  try {
    res = await fetch(`${RESEND_BASE_URL}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.body,
        html: input.html,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      errorMessage: `Network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, errorMessage: `Resend ${res.status}: ${text.slice(0, 500)}` };
  }

  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, providerMessageId: data.id };
}
