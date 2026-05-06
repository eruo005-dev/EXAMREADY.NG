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
 *    propagates unchanged AND DeepSeek is never touched
 *
 * The runWithFallback wrapper accepts an optional resolver argument so
 * tests can inject fakes without mucking with env vars or SDK internals.
 */
import { describe, expect, test, vi } from 'vitest';

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
const FALLBACK = { provider: 'anthropic' as const, model: 'claude-haiku-4-5-20251001' };

describe('runWithFallback', () => {
  test('happy path: returns primary result, wasFallback=false', async () => {
    const primary = fakeProvider('deepseek');
    const fallback = fakeProvider('anthropic');
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
    const fallback = fakeProvider('anthropic');
    (primary.completion as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ProviderError('503 Service Unavailable', 'deepseek', true),
    );
    (fallback.completion as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: 'hi from anthropic',
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
    expect(outcome.provider).toBe('anthropic');
    expect(outcome.result.text).toBe('hi from anthropic');
    expect(primary.completion).toHaveBeenCalledOnce();
    expect(fallback.completion).toHaveBeenCalledOnce();
  });

  test('non-retryable primary failure → rethrows without calling fallback', async () => {
    const primary = fakeProvider('deepseek');
    const fallback = fakeProvider('anthropic');
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

  test('Pidgin path (fallback=null): primary failure propagates, NO silent DeepSeek call', async () => {
    const primary = fakeProvider('anthropic');
    const deepseek = fakeProvider('deepseek');
    (primary.completion as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ProviderError('503 Service Unavailable', 'anthropic', true),
    );
    const resolver = (name: ProviderName) => (name === 'anthropic' ? primary : deepseek);

    const PIDGIN_PRIMARY = { provider: 'anthropic' as const, model: 'claude-haiku-4-5-20251001' };
    await expect(
      runWithFallback(
        PIDGIN_PRIMARY,
        null,
        (p, m) => p.completion({ model: m, maxTokens: 8, systemPrompt: 's', messages: [] }),
        resolver,
      ),
    ).rejects.toBeInstanceOf(ProviderError);
    // The whole point: DeepSeek must NEVER be called when the moat is unverified.
    expect(deepseek.completion).not.toHaveBeenCalled();
  });
});
