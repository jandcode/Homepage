import { timingSafeEqual } from 'node:crypto';

export function parseAllowlist(raw) {
  return [...new Set(
    String(raw || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )];
}

export function isAllowlisted(email, allowlist) {
  if (!email) return false;
  return allowlist.includes(String(email).trim().toLowerCase());
}

export function safeEqual(left, right) {
  const a = Buffer.from(String(left ?? ''), 'utf8');
  const b = Buffer.from(String(right ?? ''), 'utf8');
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function readBearer(header) {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(String(header));
  return match ? match[1] : null;
}

export function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim().slice(0, 80) || 'unknown';
  return 'unknown';
}

export function sameOriginWrite(request) {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export function createRateLimiter({ limit, windowMs }) {
  const hits = new Map();
  return function allow(key, now = new Date()) {
    const time = now.getTime();
    const recent = (hits.get(key) || []).filter((stamp) => time - stamp < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(time);
    hits.set(key, recent);
    return true;
  };
}

export function flagEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}
