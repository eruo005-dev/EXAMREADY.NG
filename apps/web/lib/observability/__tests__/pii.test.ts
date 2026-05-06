import { describe, expect, test } from 'vitest';

import { redactPii } from '../pii';

describe('redactPii', () => {
  test('redacts known PII keys regardless of value', () => {
    const input = {
      phone: '+2348012345678',
      email: 'student@example.com',
      fullName: 'John Doe',
      score: 87,
    };
    const output = redactPii(input);
    expect(output.phone).toBe('[redacted]');
    expect(output.email).toBe('[redacted]');
    expect(output.fullName).toBe('[redacted]');
    expect(output.score).toBe(87);
  });

  test('redacts nested objects', () => {
    const input = {
      user: {
        profile: {
          phone: '+2348012345678',
          age: 17,
        },
        attemptsCount: 5,
      },
    };
    const output = redactPii(input);
    expect(output.user.profile.phone).toBe('[redacted]');
    expect(output.user.profile.age).toBe(17);
    expect(output.user.attemptsCount).toBe(5);
  });

  test('redacts arrays of mixed types', () => {
    const input = ['safe', '+2348012345678', 'another@example.com', 42];
    const output = redactPii(input);
    expect(output[0]).toBe('safe');
    expect(output[1]).toBe('[redacted]');
    expect(output[2]).toBe('[redacted]');
    expect(output[3]).toBe(42);
  });

  test('redacts PII inside free-text strings', () => {
    const input = {
      description: 'Bug report: my number +2348011111111 stopped working',
      otherField: 'Email me at help@example.com when fixed',
    };
    const output = redactPii(input);
    expect(output.description).not.toContain('+2348011111111');
    expect(output.otherField).not.toContain('help@example.com');
  });

  test('handles null and undefined gracefully', () => {
    expect(redactPii(null)).toBeNull();
    expect(redactPii(undefined)).toBeUndefined();
    expect(redactPii({ phone: null, email: undefined })).toEqual({
      phone: '[redacted]',
      email: '[redacted]',
    });
  });

  test('respects max depth (cycles wrapped via deep nesting)', () => {
    let deep: Record<string, unknown> = { phone: '+2348012345678' };
    for (let i = 0; i < 12; i += 1) deep = { next: deep };
    // Should not crash, even though some deeply nested phones may not be redacted.
    expect(() => redactPii(deep)).not.toThrow();
  });

  test('redacts auth tokens by key name', () => {
    const input = {
      accessToken: 'eyJhbGciOiJIUzI1NiJ9...',
      refreshToken: 'reFr3sh-Tok3n',
      password: 'super-secret',
      otp: '123456',
    };
    const output = redactPii(input);
    expect(output.accessToken).toBe('[redacted]');
    expect(output.refreshToken).toBe('[redacted]');
    expect(output.password).toBe('[redacted]');
    expect(output.otp).toBe('[redacted]');
  });
});
