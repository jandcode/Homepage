export const ACCESS_COOKIE = 'crm_access';
export const REFRESH_COOKIE = 'crm_refresh';

const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

export function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

function secureAttr(secure) {
  return secure ? '; Secure' : '';
}

export function sessionCookies({ accessToken, refreshToken, expiresIn, secure }) {
  const base = 'HttpOnly; SameSite=Lax; Path=/';
  const lock = secureAttr(secure);
  const accessAge = Math.max(60, Number(expiresIn) || 3600);
  return [
    `${ACCESS_COOKIE}=${encodeURIComponent(accessToken)}; ${base}; Max-Age=${accessAge}${lock}`,
    `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; ${base}; Max-Age=${REFRESH_MAX_AGE}${lock}`,
  ];
}

export function clearSessionCookies(secure) {
  const base = 'HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
  const lock = secureAttr(secure);
  return [
    `${ACCESS_COOKIE}=; ${base}${lock}`,
    `${REFRESH_COOKIE}=; ${base}${lock}`,
  ];
}

export function isSecureRequest(request) {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0].trim() === 'https';
  return new URL(request.url).protocol === 'https:';
}
