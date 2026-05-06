# Termii — Finishing Sender Approval

Focused guide for completing the stalled WhatsApp Business sender approval. This blocks live OTP delivery (Supabase Auth → Termii via `/api/webhooks/supabase/send-sms`).

---

## What's blocking

You started the Termii Business signup but haven't completed sender ID verification. Until that's done:

- WhatsApp / SMS sender shows as "Termii" (their default) instead of "EXAMREADY"
- Carrier delivery rate drops because students see an unfamiliar sender ID
- DLT registration (NCC requirement) is incomplete

---

## Documents Termii will request

Have these ready before you log into the dashboard:

- [ ] **CAC certificate** (Corporate Affairs Commission registration). Termii's compliance team needs to verify the business is real. PDF or clear photo.
- [ ] **Business address proof** — utility bill, bank statement, or office lease. Must show the same address as on the CAC.
- [ ] **Sender identity documentation** — describes how `EXAMREADY` connects to your business. Usually a one-page letter on company letterhead saying "We will use this sender ID for transactional and educational messages to students who have signed up to our platform examready.ng."
- [ ] **Sample messages** — 5-10 example messages you'll actually send, covering each template type. See "Templates" below.
- [ ] **Use case description** — Termii asks why you need a Nigerian sender ID; "Educational platform for Nigerian secondary-school students preparing for JAMB, WAEC, NECO. Messages include OTP delivery, daily study reminders, weekly progress summaries, payment confirmations." is enough.

---

## Templates needing submission

Termii's compliance team reviews each template separately. Pull these from the notification template registry:

```bash
grep -rh "templateKey" packages/notifications/src/templates/ | sort -u
```

Expected templates (13+ as of Sprint 6):

1. `otp_code` — "Your ExamReady code is {code}. It expires in 10 minutes."
2. `welcome` — Post-signup greeting
3. `daily_reminder` — Streak reminder (varies by streak count)
4. `streak_broken` — Recovery prompt after a break
5. `weekly_summary` — Performance digest
6. `subscription_active` — Payment confirmation
7. `subscription_canceled` — Cancellation acknowledgement
8. `subscription_grace` — Card declined / grace period
9. `subscription_expired` — Final downgrade notice
10. `bursary_approved` — Free Pro grant
11. `bursary_denied` — Polite decline
12. `mock_exam_reminder` — 24h before scheduled mock CBT
13. `study_plan_generated` — New plan ready
14. `referral_qualified` — Friend signed up

For each, Termii needs the EXACT text variant (and any localised variants) you'll send. Open `packages/notifications/src/templates/` and copy the rendered output of each.

---

## Approval timeline

- **Day 0:** Submit all docs + templates via Termii dashboard
- **Day 1-2:** Termii compliance team reviews. Often comes back with one round of clarifications.
- **Day 2-3:** Resubmit any clarifications.
- **Day 3-5:** NCC DLT registration runs in parallel (Termii initiates this on your behalf once they approve internally).
- **Day 5-7:** Sender ID `EXAMREADY` becomes active on all carriers. Test delivery.

If anything is silent for **> 48 hours**: WhatsApp the Termii Business support contact directly and reference your sender approval ticket number.

---

## What to do if approval takes > 10 days

1. Check Termii compliance email for any silent rejection — sometimes their automated mailer marks things as spam.
2. Contact `support@termii.com` with your ticket number, asking for a status update.
3. If still stuck after 14 days total, escalate via the WhatsApp support number on the Termii pricing page.
4. **Plan B (SMS-only fallback):** while WhatsApp sender approval is pending, you can switch the OTP delivery to SMS-only by setting an env override in `apps/web/app/api/webhooks/supabase/send-sms/route.ts`. The code already supports a per-user `otp:channel-pref` Redis key. For an emergency cutover, hardcode `preferredChannel = 'sms'` in that route until WhatsApp is live.

---

## After approval is live

- [ ] Set `TERMII_API_KEY` in Vercel (production AND staging)
- [ ] Implement webhook signature verification on `/api/webhooks/termii` — see AUDIT_REPORT.md M-2
- [ ] Set `TERMII_WEBHOOK_SECRET` in Vercel
- [ ] Test OTP flow end-to-end with a real Nigerian SIM (MTN + Airtel + Glo if you can)
- [ ] Update WhatsApp Business number on `apps/web/app/(marketing)/contact/page.tsx` — replace `+2348012345678` with the real number
- [ ] Run preflight: `pnpm --filter @examready/web preflight` — Termii balance check should pass
