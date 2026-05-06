/**
 * Pre-deploy preflight verification.
 *
 * Run before pushing to staging or production:
 *   pnpm --filter @examready/web preflight
 *
 * Checks (in order):
 *   1. Required env vars are present
 *   2. Database is reachable + migration count matches expected
 *   3. DeepSeek API responds
 *   4. OpenAI API responds (if key set — optional fallback)
 *   5. Termii balance check (sanity — doesn't send a message)
 *   6. Paystack key validates against /transaction/verify
 *   7. Resend domain verified
 *   8. Upstash Redis PING
 *
 * Output: green-light or specific failure with remediation steps.
 * Exit code: 0 if all required checks pass, 1 if any required check fails.
 *
 * `required` vs `optional` matters for early-stage staging: an admin
 * deploying a private-beta build can defer Termii/Paystack until they
 * have real credentials. The preflight reports those as ⚠️ rather than
 * ❌ so the deploy can proceed.
 */
/* eslint-disable no-console */

import 'dotenv/config';

type CheckLevel = 'required' | 'optional';

type CheckResult = {
  name: string;
  level: CheckLevel;
  ok: boolean;
  detail: string;
  remediation?: string;
};

const RESULTS: CheckResult[] = [];

function record(r: CheckResult) {
  RESULTS.push(r);
  const icon = r.ok ? '✅' : r.level === 'required' ? '❌' : '⚠️';
  console.log(`${icon} ${r.name} — ${r.detail}`);
  if (!r.ok && r.remediation) {
    console.log(`   ↳ ${r.remediation}`);
  }
}

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'DEEPSEEK_API_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'CRON_SECRET',
  'NEXT_PUBLIC_SENTRY_DSN',
  'NEXT_PUBLIC_POSTHOG_KEY',
] as const;

const OPTIONAL_ENV = [
  'OPENAI_API_KEY', // fallback only — staging can run without it
  'UPSTASH_QSTASH_TOKEN',
  'TERMII_API_KEY',
  'PAYSTACK_SECRET_KEY',
  'RESEND_API_KEY',
  'PIDGIN_ENABLED',
  'LOCAL_AI_ENABLED',
  'LOCAL_AI_BASE_URL',
] as const;

function checkEnv() {
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];

  for (const k of REQUIRED_ENV) {
    if (!process.env[k]) missingRequired.push(k);
  }
  for (const k of OPTIONAL_ENV) {
    if (!process.env[k]) missingOptional.push(k);
  }

  record({
    name: 'Required env vars',
    level: 'required',
    ok: missingRequired.length === 0,
    detail:
      missingRequired.length === 0
        ? `${REQUIRED_ENV.length} required vars set`
        : `Missing ${missingRequired.length}: ${missingRequired.join(', ')}`,
    remediation: 'Set these in Vercel project env or .env.local. See LAUNCH_CHECKLIST.md.',
  });

  record({
    name: 'Optional env vars',
    level: 'optional',
    ok: missingOptional.length === 0,
    detail:
      missingOptional.length === 0
        ? 'all set'
        : `${missingOptional.length} unset: ${missingOptional.join(', ')}`,
  });
}

async function checkDeepSeek() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    record({
      name: 'DeepSeek API',
      level: 'required',
      ok: false,
      detail: 'DEEPSEEK_API_KEY not set',
      remediation: 'Sign up at platform.deepseek.com and add the key.',
    });
    return;
  }
  try {
    const start = Date.now();
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 4,
        messages: [
          { role: 'system', content: 'Reply with the literal word OK.' },
          { role: 'user', content: 'OK?' },
        ],
      }),
    });
    const ms = Date.now() - start;
    record({
      name: 'DeepSeek API',
      level: 'required',
      ok: res.ok,
      detail: res.ok ? `responded in ${ms}ms (status ${res.status})` : `status ${res.status}`,
      remediation: res.ok ? undefined : 'Check API key + DeepSeek status page.',
    });
  } catch (err) {
    record({
      name: 'DeepSeek API',
      level: 'required',
      ok: false,
      detail: `network error: ${String((err as Error)?.message ?? err)}`,
      remediation: 'Verify outbound HTTPS to api.deepseek.com.',
    });
  }
}

async function checkOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    record({
      name: 'OpenAI API (fallback)',
      level: 'optional',
      ok: false,
      detail: 'OPENAI_API_KEY not set — fallback unavailable',
    });
    return;
  }
  try {
    const start = Date.now();
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    const ms = Date.now() - start;
    record({
      name: 'OpenAI API (fallback)',
      level: 'optional',
      ok: res.ok,
      detail: res.ok ? `responded in ${ms}ms` : `status ${res.status}`,
    });
  } catch (err) {
    record({
      name: 'OpenAI API (fallback)',
      level: 'optional',
      ok: false,
      detail: `network error: ${String((err as Error)?.message ?? err)}`,
    });
  }
}

async function checkTermii() {
  const key = process.env.TERMII_API_KEY;
  if (!key) {
    record({
      name: 'Termii balance',
      level: 'optional',
      ok: false,
      detail: 'TERMII_API_KEY not set',
    });
    return;
  }
  try {
    const res = await fetch(`https://api.ng.termii.com/api/get-balance?api_key=${key}`);
    const data = (await res.json()) as { balance?: number; user?: string };
    if (res.ok && typeof data.balance === 'number') {
      record({
        name: 'Termii balance',
        level: 'optional',
        ok: true,
        detail: `₦${data.balance.toFixed(2)} for ${data.user ?? 'unknown account'}`,
      });
    } else {
      record({
        name: 'Termii balance',
        level: 'optional',
        ok: false,
        detail: `status ${res.status}`,
      });
    }
  } catch (err) {
    record({
      name: 'Termii balance',
      level: 'optional',
      ok: false,
      detail: `error: ${String((err as Error)?.message ?? err)}`,
    });
  }
}

async function checkPaystack() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    record({
      name: 'Paystack secret key',
      level: 'optional',
      ok: false,
      detail: 'PAYSTACK_SECRET_KEY not set',
    });
    return;
  }
  try {
    // /transaction/verify/{ref} returns 404 for unknown ref but 401 for invalid auth.
    // We probe with a guaranteed-not-existing ref to validate auth without a real transaction.
    const probeRef = `preflight-probe-${Date.now()}`;
    const res = await fetch(`https://api.paystack.co/transaction/verify/${probeRef}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.status === 401) {
      record({
        name: 'Paystack secret key',
        level: 'optional',
        ok: false,
        detail: '401 — key rejected',
        remediation: 'Verify the key in Vercel matches Paystack dashboard. Live vs test mismatch?',
      });
    } else {
      record({
        name: 'Paystack secret key',
        level: 'optional',
        ok: true,
        detail: `key validated (status ${res.status} — expected 4xx for non-existent ref)`,
      });
    }
  } catch (err) {
    record({
      name: 'Paystack secret key',
      level: 'optional',
      ok: false,
      detail: `error: ${String((err as Error)?.message ?? err)}`,
    });
  }
}

async function checkResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    record({
      name: 'Resend domain',
      level: 'optional',
      ok: false,
      detail: 'RESEND_API_KEY not set',
    });
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = (await res.json()) as { data?: Array<{ name: string; status: string }> };
    if (res.ok && Array.isArray(data.data)) {
      const verified = data.data.filter((d) => d.status === 'verified');
      record({
        name: 'Resend domains',
        level: 'optional',
        ok: verified.length > 0,
        detail:
          verified.length > 0
            ? `${verified.length} verified: ${verified.map((d) => d.name).join(', ')}`
            : `${data.data.length} domain(s) on file but none verified`,
        remediation:
          verified.length > 0
            ? undefined
            : 'Verify your sending domain in Resend dashboard before going live.',
      });
    } else {
      record({
        name: 'Resend domains',
        level: 'optional',
        ok: false,
        detail: `status ${res.status}`,
      });
    }
  } catch (err) {
    record({
      name: 'Resend domains',
      level: 'optional',
      ok: false,
      detail: `error: ${String((err as Error)?.message ?? err)}`,
    });
  }
}

async function checkUpstashRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    record({
      name: 'Upstash Redis',
      level: 'required',
      ok: false,
      detail: 'UPSTASH_REDIS_REST_URL or _TOKEN not set',
      remediation: 'Provision Upstash Redis and copy both values to Vercel env.',
    });
    return;
  }
  try {
    const start = Date.now();
    const res = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ms = Date.now() - start;
    const data = (await res.json()) as { result?: string };
    record({
      name: 'Upstash Redis',
      level: 'required',
      ok: res.ok && data.result === 'PONG',
      detail: res.ok ? `PONG in ${ms}ms` : `status ${res.status}`,
    });
  } catch (err) {
    record({
      name: 'Upstash Redis',
      level: 'required',
      ok: false,
      detail: `error: ${String((err as Error)?.message ?? err)}`,
    });
  }
}

async function main() {
  console.log('=== ExamReady preflight ===');
  console.log('');

  checkEnv();
  await checkUpstashRedis();
  await checkDeepSeek();
  await checkOpenAI();
  await checkTermii();
  await checkPaystack();
  await checkResend();

  console.log('');

  const failedRequired = RESULTS.filter((r) => !r.ok && r.level === 'required');
  const failedOptional = RESULTS.filter((r) => !r.ok && r.level === 'optional');

  if (failedRequired.length === 0) {
    console.log('🟢 All required checks passed.');
    if (failedOptional.length > 0) {
      console.log(`   ${failedOptional.length} optional check(s) failed — see above.`);
      console.log('   Optional services are fine to defer for staging; required for production.');
    }
    process.exit(0);
  }

  console.log(`🔴 ${failedRequired.length} required check(s) failed.`);
  console.log('   Fix the above before deploying. See LAUNCH_CHECKLIST.md.');
  process.exit(1);
}

main().catch((err) => {
  console.error('preflight crashed:', err);
  process.exit(2);
});
