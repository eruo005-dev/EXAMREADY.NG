/**
 * Pure-JS unit tests for the cron time helpers — no database required.
 */
import { describe, expect, test } from 'vitest';

import {
  dateInTimezone,
  isUserInBucket,
  timeOfDayInTimezone,
  timeStringToSeconds,
} from '../time';

describe('timeOfDayInTimezone', () => {
  test('UTC at noon returns 12:00:00 = 43200', () => {
    expect(timeOfDayInTimezone(new Date('2026-05-06T12:00:00Z'), 'UTC')).toBe(12 * 3600);
  });

  test('Africa/Lagos (+1) at 12:00 UTC returns 13:00 = 46800', () => {
    expect(timeOfDayInTimezone(new Date('2026-05-06T12:00:00Z'), 'Africa/Lagos')).toBe(13 * 3600);
  });

  test('America/New_York (-4 DST) at 12:00 UTC returns 08:00 = 28800', () => {
    expect(timeOfDayInTimezone(new Date('2026-05-06T12:00:00Z'), 'America/New_York')).toBe(8 * 3600);
  });
});

describe('dateInTimezone', () => {
  test('UTC midnight returns the same calendar date', () => {
    expect(dateInTimezone(new Date('2026-05-06T00:00:00Z'), 'UTC')).toBe('2026-05-06');
  });

  test('Africa/Lagos at 23:30 UTC is already next day locally', () => {
    expect(dateInTimezone(new Date('2026-05-06T23:30:00Z'), 'Africa/Lagos')).toBe('2026-05-07');
  });
});

describe('timeStringToSeconds', () => {
  test('parses HH:MM:SS', () => {
    expect(timeStringToSeconds('18:00:00')).toBe(18 * 3600);
    expect(timeStringToSeconds('06:30:15')).toBe(6 * 3600 + 30 * 60 + 15);
  });

  test('parses HH:MM (no seconds)', () => {
    expect(timeStringToSeconds('18:00')).toBe(18 * 3600);
  });
});

describe('isUserInBucket — bucket window [now-2min, now+3min]', () => {
  // Africa/Lagos user with preferred 18:00 → 17:00 UTC
  const userTimezone = 'Africa/Lagos';
  const preferredTime = '18:00:00';

  test('exactly at preferred time → in bucket', () => {
    expect(
      isUserInBucket({
        nowUtc: new Date('2026-05-06T17:00:00Z'),
        userTimezone,
        preferredTime,
      }),
    ).toBe(true);
  });

  test('1 min after preferred time (preferred just inside backward window) → in bucket', () => {
    // now=17:01 UTC = 18:01 Lagos. preferred=18:00. delta=+1min. In [-3,+2].
    expect(
      isUserInBucket({
        nowUtc: new Date('2026-05-06T17:01:00Z'),
        userTimezone,
        preferredTime,
      }),
    ).toBe(true);
  });

  test('2 min after preferred → exactly at edge → in bucket', () => {
    expect(
      isUserInBucket({
        nowUtc: new Date('2026-05-06T17:02:00Z'),
        userTimezone,
        preferredTime,
      }),
    ).toBe(true);
  });

  test('3 min after preferred → out of bucket', () => {
    expect(
      isUserInBucket({
        nowUtc: new Date('2026-05-06T17:03:00Z'),
        userTimezone,
        preferredTime,
      }),
    ).toBe(false);
  });

  test('3 min before preferred → exactly at edge → in bucket', () => {
    // now=16:57 UTC = 17:57 Lagos. preferred=18:00. delta=-3min. Edge inclusive.
    expect(
      isUserInBucket({
        nowUtc: new Date('2026-05-06T16:57:00Z'),
        userTimezone,
        preferredTime,
      }),
    ).toBe(true);
  });

  test('4 min before preferred → out of bucket', () => {
    expect(
      isUserInBucket({
        nowUtc: new Date('2026-05-06T16:56:00Z'),
        userTimezone,
        preferredTime,
      }),
    ).toBe(false);
  });

  test('midnight wrap: preferred 00:01, now 23:59 UTC = 00:59 Lagos', () => {
    // User pref 00:01 Lagos. Now = 23:59 UTC = 00:59 Lagos. delta = +58min (out)
    expect(
      isUserInBucket({
        nowUtc: new Date('2026-05-06T23:59:00Z'),
        userTimezone,
        preferredTime: '00:01:00',
      }),
    ).toBe(false);
  });

  test('midnight wrap: preferred 23:59, now 00:00 Lagos (= 23:00 UTC prev day)', () => {
    // User pref 23:59 Lagos. Now = 23:00 UTC = 00:00 Lagos next day.
    // Delta wraps: preferred 23:59 vs now 00:00 → -1min (now is 1 min after preferred,
    // wrapping past midnight). Should be in bucket.
    expect(
      isUserInBucket({
        nowUtc: new Date('2026-05-06T23:00:00Z'),
        userTimezone,
        preferredTime: '23:59:00',
      }),
    ).toBe(true);
  });
});
