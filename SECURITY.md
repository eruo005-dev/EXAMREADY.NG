# Security Policy

Thanks for helping keep ExamReady.ng safe.

## Reporting a vulnerability

**Please do not file a public GitHub issue.** Email `security@examready.ng`
with the details. We respond within 48 hours, typically much faster.

If you're reporting a critical vulnerability that risks user data, you can
also message us on WhatsApp from the [contact page](https://examready.ng/contact)
— mention "security report" first so we route it to the right person.

## What to include

- The class of vulnerability (e.g. XSS, SQL injection, IDOR, auth bypass)
- The affected URL or endpoint
- Steps to reproduce — clear enough that we can verify within 30 minutes
- Your assessment of impact (who is affected, what data is exposed, whether
  it's already exploitable in production)
- Whether you'd like us to credit you publicly when we publish the fix

## What you should not do

- Do not run automated scans against production. We use Cloudflare bot
  protection and rate limiting; aggressive scanning will get you blocked
  and slow down legitimate students using the platform.
- Do not access, modify, or download data belonging to other users.
  Demonstrating IDOR with a single one-off probe is fine; downloading any
  dataset is not.
- Do not test denial-of-service techniques.
- Do not socially engineer ExamReady staff or contractors.

## Scope

In scope:
- All `*.examready.ng` domains and subdomains
- The mobile app (once published) — APK/IPA reports welcome
- Build / supply-chain issues affecting our public repos

Out of scope:
- Third-party services we use (report those to the vendor: Supabase,
  Paystack, Termii, Vercel, etc.)
- Issues requiring physical device access
- Self-XSS that requires the victim to paste hostile script into their
  own browser
- Missing security headers on `/_next/*` static assets

## Coordinated disclosure

We aim to fix valid reports within 14 days for high-severity issues and
30 days for medium-severity. We will credit reporters who follow this
policy and request credit. We don't currently run a paid bug bounty —
that may change as we grow.

## Past advisories

None yet.
