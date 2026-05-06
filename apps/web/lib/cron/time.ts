/**
 * Timezone-aware time helpers for cron handlers.
 *
 * Per CHECKPOINT 3 decision 3: cron jobs use a [now-2min, now+3min] window
 * (5 minutes total) when matching users by preferred_notification_time.
 *
 * The bucket sliders are wide enough that even if the cron fires a couple
 * minutes late, every opted-in user still gets caught exactly once during
 * the day — the notification_log idempotency check ensures it.
 */

const BUCKET_BACKWARD_SECONDS = 2 * 60;
const BUCKET_FORWARD_SECONDS = 3 * 60;

/**
 * Convert a UTC Date to the time-of-day (in seconds-since-midnight) of
 * an IANA timezone. Uses Intl.DateTimeFormat which handles DST correctly.
 */
export function timeOfDayInTimezone(utc: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(utc);

  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  for (const part of parts) {
    if (part.type === 'hour') hours = parseInt(part.value, 10) % 24;
    if (part.type === 'minute') minutes = parseInt(part.value, 10);
    if (part.type === 'second') seconds = parseInt(part.value, 10);
  }
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Returns YYYY-MM-DD for the calendar date that `utc` falls on in the
 * user's timezone. Used for idempotency: "have I sent this template to
 * this user already today (in their local sense of "today")?"
 */
export function dateInTimezone(utc: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(utc);

  let year = '';
  let month = '';
  let day = '';
  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
  }
  return `${year}-${month}-${day}`;
}

/**
 * Parse a `time` column value (e.g. "18:00:00" or "18:00") into seconds.
 */
export function timeStringToSeconds(time: string): number {
  const parts = time.split(':');
  const h = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '0', 10);
  const s = parseInt(parts[2] ?? '0', 10);
  return h * 3600 + m * 60 + s;
}

/**
 * Is the user's preferred time within the bucket centered on `now` in
 * their timezone?
 *
 * Handles midnight wrap by allowing the comparison window to span the
 * day boundary (e.g. cron fires at 23:59 UTC and user's preferred is 00:01
 * the next day in their tz — still considered a match).
 */
export function isUserInBucket(args: {
  nowUtc: Date;
  userTimezone: string;
  preferredTime: string;
}): boolean {
  const userNowSec = timeOfDayInTimezone(args.nowUtc, args.userTimezone);
  const preferredSec = timeStringToSeconds(args.preferredTime);

  const SECS_IN_DAY = 86400;

  // Compute the smallest signed delta from preferred to now, allowing wrap.
  const rawDelta = userNowSec - preferredSec;
  const delta =
    rawDelta > SECS_IN_DAY / 2
      ? rawDelta - SECS_IN_DAY
      : rawDelta < -SECS_IN_DAY / 2
        ? rawDelta + SECS_IN_DAY
        : rawDelta;

  // delta < 0 means "now is BEFORE preferred" by |delta| seconds.
  // We fire when preferredTime falls within [now - 2min, now + 3min],
  // i.e. delta in [-3min (now is 3 min before preferred), +2min].
  return delta >= -BUCKET_FORWARD_SECONDS && delta <= BUCKET_BACKWARD_SECONDS;
}
