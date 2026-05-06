/**
 * GET /api/health/ai
 *
 * Admin-only liveness probe for the AI providers. Pings both providers
 * with a tiny 4-token request and returns latency + status.
 *
 * Use this when investigating "is DeepSeek up right now" mid-incident.
 * Does NOT replace Sentry / uptime monitoring — those run automatically;
 * this is an on-demand operator dashboard.
 *
 * Why not public? Two reasons:
 *  1. The probe spends real money (a couple of tokens × 2 providers).
 *  2. Provider liveness is operational signal, not user-facing UX —
 *     surfacing it publicly would invite "is the AI broken?" questions
 *     based on transient blips.
 */
import { getProvider, type ProviderName } from '@/lib/ai/providers';
import { defineRoute, ok } from '@/lib/api/handler';

export const dynamic = 'force-dynamic';

const PROBE_PROMPT = 'Reply with just the word OK.';

const PROVIDER_PROBES: Array<{ name: ProviderName; model: string }> = [
  { name: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  { name: 'deepseek', model: 'deepseek-chat' },
];

type ProbeResult = {
  provider: ProviderName;
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
};

async function probe(target: { name: ProviderName; model: string }): Promise<ProbeResult> {
  const provider = getProvider(target.name);
  if (!provider.isConfigured()) {
    return {
      provider: target.name,
      configured: false,
      ok: false,
      latencyMs: null,
      error: 'API key not set on this deployment',
    };
  }

  const start = Date.now();
  try {
    await provider.completion({
      model: target.model,
      maxTokens: 4,
      systemPrompt: 'Output exactly the text the user requests, nothing more.',
      messages: [{ role: 'user', content: PROBE_PROMPT }],
    });
    return {
      provider: target.name,
      configured: true,
      ok: true,
      latencyMs: Date.now() - start,
      error: null,
    };
  } catch (err) {
    return {
      provider: target.name,
      configured: true,
      ok: false,
      latencyMs: Date.now() - start,
      error: String((err as Error)?.message ?? err).slice(0, 200),
    };
  }
}

export const GET = defineRoute({ auth: 'admin' })(async () => {
  const results = await Promise.all(PROVIDER_PROBES.map(probe));
  return ok({
    checkedAt: new Date().toISOString(),
    providers: results,
  });
});
