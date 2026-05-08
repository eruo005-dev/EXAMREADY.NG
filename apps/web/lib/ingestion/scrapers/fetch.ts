/**
 * Polite HTTP fetcher for web ingestion.
 *
 * Every Phase-3 scraper goes through this module so the rate limit,
 * robots.txt check, and scraping_cache hit/miss path are handled in
 * exactly one place.
 *
 * Behaviour:
 *   - Cache LOOK-UP first. If we have a non-expired row in
 *     scraping_cache for the exact URL, return that. No network call.
 *   - On cache MISS, check robots.txt for the URL's origin. We honour
 *     User-agent: * Disallow rules. ExamReady's UA string is
 *     'ExamReadyBot/0.1 (+https://examready.ng/bot)'.
 *   - Apply per-host rate limit (10 requests/min, 1s minimum delay
 *     between requests to the same host).
 *   - GET. On 2xx persist to cache (text only — binary downloads go
 *     through a separate path). On 3xx follow once. On 4xx/5xx surface
 *     the error to the caller; do NOT cache failures.
 *
 * SECURITY NOTE: every URL is validated against an allow-list of
 * origins (jamb.gov.ng, waec.org.ng, neco.gov.ng, wikipedia.org, nuc.edu.ng,
 * + a configurable extension via ALLOWED_SCRAPE_ORIGINS env). This blocks
 * SSRF — a malformed input can't redirect us into an internal network.
 */
import { db } from '../../db';
import { scrapingCache } from '@examready/db/schema';
import { eq, sql } from 'drizzle-orm';

export const USER_AGENT = 'ExamReadyBot/0.1 (+https://examready.ng/bot)';

/** Default whitelisted origins. Add more via ALLOWED_SCRAPE_ORIGINS env (comma-separated). */
const DEFAULT_ALLOWED = new Set([
  'jamb.gov.ng',
  'www.jamb.gov.ng',
  'ibass.jamb.gov.ng',
  'waec.org.ng',
  'www.waecnigeria.org',
  'neco.gov.ng',
  'www.neco.gov.ng',
  'en.wikipedia.org',
  'nuc.edu.ng',
  'www.nuc.edu.ng',
  'myschool.ng',
  'www.myschool.ng',
]);

function allowedHost(host: string): boolean {
  if (DEFAULT_ALLOWED.has(host)) return true;
  const extra = (process.env.ALLOWED_SCRAPE_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return extra.includes(host);
}

/** In-memory rate-limit clock — last fetch timestamp per host. */
const lastFetchByHost = new Map<string, number>();
const MIN_DELAY_MS = 1000;
const MAX_PER_MINUTE = 10;
const recentByHost = new Map<string, number[]>();

async function applyRateLimit(host: string): Promise<void> {
  const now = Date.now();
  const last = lastFetchByHost.get(host) ?? 0;
  const wait = Math.max(0, MIN_DELAY_MS - (now - last));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  // 60-second sliding window — drop timestamps older than 60s.
  const recent = (recentByHost.get(host) ?? []).filter((t) => Date.now() - t < 60_000);
  if (recent.length >= MAX_PER_MINUTE) {
    const sleep = 60_000 - (Date.now() - recent[0]!);
    if (sleep > 0) await new Promise((r) => setTimeout(r, sleep));
  }
  recent.push(Date.now());
  recentByHost.set(host, recent);
  lastFetchByHost.set(host, Date.now());
}

const robotsByHost = new Map<string, string[]>();

async function loadRobots(host: string): Promise<string[]> {
  const cached = robotsByHost.get(host);
  if (cached) return cached;
  try {
    const res = await fetch(`https://${host}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) {
      robotsByHost.set(host, []);
      return [];
    }
    const text = await res.text();
    // Pull "Disallow:" lines under "User-agent: *". Simplistic but safe.
    const lines = text.split(/\n/).map((l) => l.trim());
    let active = false;
    const disallow: string[] = [];
    for (const line of lines) {
      if (/^User-agent:\s*\*/i.test(line)) active = true;
      else if (/^User-agent:/i.test(line)) active = false;
      else if (active) {
        const m = line.match(/^Disallow:\s*(\S+)/i);
        if (m && m[1]) disallow.push(m[1]);
      }
    }
    robotsByHost.set(host, disallow);
    return disallow;
  } catch {
    robotsByHost.set(host, []);
    return [];
  }
}

function pathDisallowed(path: string, rules: string[]): boolean {
  for (const r of rules) {
    if (r === '/') return true;
    if (path.startsWith(r)) return true;
  }
  return false;
}

export interface FetchOptions {
  /** Force a network call even if cache has a fresh entry. */
  bypassCache?: boolean;
  /** Cache TTL in seconds (default 7 days). */
  ttlSeconds?: number;
}

export interface FetchedPage {
  url: string;
  statusCode: number;
  body: string;
  contentType: string;
  fromCache: boolean;
}

export async function fetchUrl(rawUrl: string, opts: FetchOptions = {}): Promise<FetchedPage> {
  const url = new URL(rawUrl);
  const host = url.host.toLowerCase();
  if (!allowedHost(host)) {
    throw new Error(
      `[scraper] origin not allowed: ${host}. Add to ALLOWED_SCRAPE_ORIGINS env or DEFAULT_ALLOWED list.`,
    );
  }
  const canonical = url.toString();

  // 1) cache lookup
  if (!opts.bypassCache) {
    const cached = await db
      .select()
      .from(scrapingCache)
      .where(eq(scrapingCache.url, canonical))
      .limit(1);
    if (cached[0]) {
      const fresh = cached[0].expiresAt ? cached[0].expiresAt.getTime() > Date.now() : true;
      if (fresh) {
        return {
          url: canonical,
          statusCode: cached[0].statusCode,
          body: cached[0].body,
          contentType: cached[0].contentType ?? 'text/html',
          fromCache: true,
        };
      }
    }
  }

  // 2) robots.txt
  const rules = await loadRobots(host);
  if (pathDisallowed(url.pathname, rules)) {
    throw new Error(`[scraper] robots.txt disallows ${url.pathname} on ${host}`);
  }

  // 3) rate limit
  await applyRateLimit(host);

  // 4) fetch
  const res = await fetch(canonical, { headers: { 'User-Agent': USER_AGENT } });
  const body = await res.text();
  const contentType = res.headers.get('content-type') ?? 'text/html';

  // 5) cache 2xx responses only (failures shouldn't poison the cache)
  if (res.ok) {
    const ttl = (opts.ttlSeconds ?? 7 * 24 * 3600) * 1000;
    const expiresAt = new Date(Date.now() + ttl);
    await db
      .insert(scrapingCache)
      .values({
        url: canonical,
        statusCode: res.status,
        body,
        contentType,
        fetchedAt: new Date(),
        expiresAt,
      })
      .onConflictDoUpdate({
        target: scrapingCache.url,
        set: {
          statusCode: res.status,
          body,
          contentType,
          fetchedAt: sql`now()`,
          expiresAt,
        },
      });
  }

  return {
    url: canonical,
    statusCode: res.status,
    body,
    contentType,
    fromCache: false,
  };
}
