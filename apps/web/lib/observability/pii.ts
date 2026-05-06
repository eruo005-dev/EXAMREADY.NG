/**
 * PII redaction helpers for Sentry + PostHog.
 *
 * The student dataset is sensitive — Nigerian phone numbers, names, school
 * info, and exam history. Even though we're operating under NDPR and have
 * lawful basis for processing, we don't need any of it in our error logs
 * or analytics. Strip everything that could identify a single user.
 *
 * Strategy:
 * 1. Walk the object recursively
 * 2. Replace values whose KEY matches a PII pattern with '[redacted]'
 * 3. Replace values whose CONTENT looks like PII (E.164 phone, email)
 *    even when the key is innocuous (e.g. user-typed a phone in a
 *    free-text feedback field)
 */

const PII_KEY_PATTERNS = [
  /^phone$/i,
  /^email$/i,
  /^fullName$/i,
  /^full_name$/i,
  /^name$/i,
  /^school$/i,
  /^token$/i,
  /^accessToken$/i,
  /^refreshToken$/i,
  /^password$/i,
  /^otp$/i,
  /^code$/i,
  /^paystackReference$/i,
  /^ipAddress$/i,
  /^ip$/i,
];

const NIGERIAN_PHONE_REGEX = /\+234[789][01]\d{8}/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const REDACTED = '[redacted]';
const MAX_DEPTH = 8;

function looksLikePiiValue(value: string): boolean {
  if (!value) return false;
  return NIGERIAN_PHONE_REGEX.test(value) || EMAIL_REGEX.test(value);
}

function redactString(value: string): string {
  return value
    .replace(NIGERIAN_PHONE_REGEX, REDACTED)
    .replace(EMAIL_REGEX, REDACTED);
}

export function redactPii<T>(input: T, depth = 0): T {
  if (depth > MAX_DEPTH) return input;
  if (input === null || input === undefined) return input;

  if (typeof input === 'string') {
    return (looksLikePiiValue(input) ? redactString(input) : input) as T;
  }

  if (Array.isArray(input)) {
    return input.map((v) => redactPii(v, depth + 1)) as unknown as T;
  }

  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (PII_KEY_PATTERNS.some((re) => re.test(key))) {
        out[key] = REDACTED;
      } else {
        out[key] = redactPii(value, depth + 1);
      }
    }
    return out as T;
  }

  return input;
}
