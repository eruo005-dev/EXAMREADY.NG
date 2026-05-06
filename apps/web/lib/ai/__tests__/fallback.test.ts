/**
 * Fallback wrapper unit tests — pure JS, no API keys needed.
 *
 * Verifies:
 *  - happy path: primary succeeds, fallback never runs, wasFallback=false
 *  - retryable failure: primary throws ProviderError(isRetryable=true),
 *    fallback runs, wasFallback=true, both calls observed
 *  - non-retryable failure: primary throws non-retryable error, fallback
 *    NEVER runs (4xx schema bugs would fail identically on the secondary)
 *  - no-fallback path (Pidgin): primary throws, fallback=null, error
 *    propagates unchanged AND no other provider is touched
 *
 * Sprint 6: primary is DeepSeek, fallback is OpenAI gpt-4o-mini for
 * all active routing. The Pidgin no-fallback rule is unchanged — even
 * with PIDGIN_ENABLED=true, that path's fallback is null.
 *
 * The runWithFallback wrapper accepts an optional resolver argument so
 * tests can inject fakes without mucking with env vars or SDK internals.
 */
import { describe, expect, test, vi } from 'vitest';

import { PIDGIN_ENABLED } from '../prompts/explain-differently';
import { type AiProvider, ProviderError, type ProviderName, runWithFallback } from '../providers';

function fakeProvider(name: ProviderName): AiProvider {
  return {
    name,
    isConfigured: () => true,
    completion: vi.fn(),
    stream: vi.fn(),
    toolUse: vi.fn(),
  };
}

const PRIMARY = { provider: 'deepseek' as const, model: 'deepseek-chat' };
const FALLBACK = { provider: 'openai' as const, model: 'gpt-4o-mini' };

describe('runWithFallback', () => {
  test('happy path: returns primary result, wasFallback=false', async () => {
    const primary = fakeProvider('deepseek');
    const fallback = fakeProvider('openai');
    (primary.completion as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: 'hi from deepseek',
      inputTokens: 5,
      outputTokens: 3,
    });
    const resolver = (name: ProviderName) => (name === 'deepseek' ? primary : fallback);

    const outcome = await runWithFallback(
      PRIMARY,
      FALLBACK,
      (p, m) => p.completion({ model: m, maxTokens: 8, systemPrompt: 's', messages: [] }),
      resolver,
    );
    expect(outcome.wasFallback).toBe(false);
    expect(outcome.provider).toBe('deepseek');
    expect(outcome.model).toBe('deepseek-chat');
    expect(outcome.result.text).toBe('hi from deepseek');
    expect(fallback.completion).not.toHaveBeenCalled();
  });

  test('retryable primary failure → fallback runs, wasFallback=true', async () => {
    const primary = fakeProvider('deepseek');
    const fallback = fakeProvider('openai');
    (primary.completion as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ProviderError('503 Service Unavailable', 'deepseek', true),
    );
    (fallback.completion as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: 'hi from openai',
      inputTokens: 5,
      outputTokens: 3,
    });
    const resolver = (name: ProviderName) => (name === 'deepseek' ? primary : fallback);

    const outcome = await runWithFallback(
      PRIMARY,
      FALLBACK,
      (p, m) => p.completion({ model: m, maxTokens: 8, systemPrompt: 's', messages: [] }),
      resolver,
    );
    expect(outcome.wasFallback).toBe(true);
    expect(outcome.provider).toBe('openai');
    expect(outcome.model).toBe('gpt-4o-mini');
    expect(outcome.result.text).toBe('hi from openai');
    expect(primary.completion).toHaveBeenCalledOnce();
    expect(fallback.completion).toHaveBeenCalledOnce();
  });

  test('non-retryable primary failure → rethrows without calling fallback', async () => {
    const primary = fakeProvider('deepseek');
    const fallback = fakeProvider('openai');
    (primary.completion as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ProviderError('400 invalid_request_error', 'deepseek', false),
    );
    const resolver = (name: ProviderName) => (name === 'deepseek' ? primary : fallback);

    await expect(
      runWithFallback(
        PRIMARY,
        FALLBACK,
        (p, m) => p.completion({ model: m, maxTokens: 8, systemPrompt: 's', messages: [] }),
        resolver,
      ),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(fallback.completion).not.toHaveBeenCalled();
  });

  test('Pidgin path (fallback=null): primary failure propagates, NO silent OpenAI call', async () => {
    const primary = fakeProvider('deepseek');
    const openai = fakeProvider('openai');
    (primary.completion as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ProviderError('503 Service Unavailable', 'deepseek', true),
    );
    const resolver = (name: ProviderName) => (name === 'deepseek' ? primary : openai);

    const PIDGIN_PRIMARY = { provider: 'deepseek' as const, model: 'deepseek-chat' };
    await expect(
      runWithFallback(
        PIDGIN_PRIMARY,
        null,
        (p, m) => p.completion({ model: m, maxTokens: 8, systemPrompt: 's', messages: [] }),
        resolver,
      ),
    ).rejects.toBeInstanceOf(ProviderError);
    // The whole point: when fallback=null (Pidgin), no other provider is silently called.
    expect(openai.completion).not.toHaveBeenCalled();
  });

  test('PIDGIN_ENABLED env gate is read fresh on every call', () => {
    // The actual route gate is in /api/ai/explain-differently. This
    // assertion just proves the env var is read FRESH on every call to
    // PIDGIN_ENABLED() — so no future refactor accidentally caches it
    // at module-load and leaves the gate stuck on the import-time value.
    const originalValue = process.env.PIDGIN_ENABLED;
    try {
      delete process.env.PIDGIN_ENABLED;
      expect(PIDGIN_ENABLED()).toBe(false);
      process.env.PIDGIN_ENABLED = 'true';
      expect(PIDGIN_ENABLED()).toBe(true);
      process.env.PIDGIN_ENABLED = 'false';
      expect(PIDGIN_ENABLED()).toBe(false);
    } finally {
      if (originalValue === undefined) delete process.env.PIDGIN_ENABLED;
      else process.env.PIDGIN_ENABLED = originalValue;
    }
  });
});
