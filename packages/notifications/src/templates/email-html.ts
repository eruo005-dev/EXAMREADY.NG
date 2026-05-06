/**
 * HTML email template helpers — bare-bones, no MJML, no React Email.
 *
 * Email clients still don't reliably support modern CSS. The templates
 * here use inline styles only, no external stylesheets, and tested-safe
 * HTML (table-based layout for the wrapper). Brand colors hard-coded
 * because email clients can't read CSS variables.
 *
 * Plain-text alternative is automatic via Resend if we don't supply one;
 * we DO supply one (the rendered template body) so corporate spam
 * filters don't punish HTML-only emails.
 */

const BRAND_GREEN = '#0F7A3D';
const TEXT_DARK = '#1F2937';
const TEXT_MUTED = '#6B7280';
const BORDER = '#E5E7EB';

export type EmailHtmlInput = {
  subject: string;
  preheader?: string; // hidden text shown in inbox previews
  body: string; // single block of plain text from the template registry
  ctaUrl?: string;
  ctaLabel?: string;
};

export function renderEmailHtml(input: EmailHtmlInput): string {
  const escapedBody = escapeHtml(input.body).replace(/\n/g, '<br>');
  const cta =
    input.ctaUrl && input.ctaLabel
      ? `<tr>
        <td style="padding:16px 0 0 0">
          <a href="${escapeAttr(input.ctaUrl)}" style="display:inline-block;background:${BRAND_GREEN};color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">${escapeHtml(input.ctaLabel)}</a>
        </td>
      </tr>`
      : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#F9FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TEXT_DARK}">
    ${
      input.preheader
        ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#F9FAFB">${escapeHtml(input.preheader)}</div>`
        : ''
    }
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F9FAFB;padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border:1px solid ${BORDER};border-radius:8px">
            <tr>
              <td style="padding:24px 32px;border-bottom:1px solid ${BORDER}">
                <a href="https://examready.ng" style="text-decoration:none">
                  <span style="display:inline-block;width:32px;height:32px;background:${BRAND_GREEN};color:#ffffff;border-radius:6px;text-align:center;line-height:32px;font-weight:700;vertical-align:middle">E</span>
                  <span style="vertical-align:middle;margin-left:8px;font-weight:600;color:${TEXT_DARK}">ExamReady<span style="color:${BRAND_GREEN}">.ng</span></span>
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;font-size:15px;line-height:1.6">
                ${escapedBody}
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  ${cta}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:1px solid ${BORDER};font-size:12px;color:${TEXT_MUTED}">
                You&rsquo;re receiving this because you opted in to ExamReady email updates.
                <a href="https://examready.ng/settings/notifications" style="color:${BRAND_GREEN};text-decoration:underline">Manage your preferences</a>.
                <br>
                ExamReady.ng &middot; Made in Nigeria.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
