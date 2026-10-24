export function json(status, body, extra = {}) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store',
    'x-robots-tag': 'noindex, nofollow, noarchive',
    'x-content-type-options': 'nosniff',
  });
  for (const [key, value] of Object.entries(extra)) {
    if (key.toLowerCase() === 'set-cookie') continue;
    headers.set(key, value);
  }
  const cookies = extra['set-cookie'];
  if (Array.isArray(cookies)) {
    for (const cookie of cookies) headers.append('set-cookie', cookie);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export function errorBody(code, message, fields) {
  const error = { code, message };
  if (fields && Object.keys(fields).length) error.fields = fields;
  return { error };
}

export function httpError(status, code, message, fields) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.expose = true;
  if (fields) error.fields = fields;
  return error;
}

export async function readJson(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > 100_000) throw httpError(413, 'payload_too_large', 'Request body is too large.');
  const text = await request.text();
  if (text.length > 100_000) throw httpError(413, 'payload_too_large', 'Request body is too large.');
  if (!text.trim()) return {};
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw httpError(400, 'invalid_json', 'Malformed JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'validation_error', 'Expected a JSON object.');
  }
  return body;
}

export function requireJson(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.toLowerCase().includes('application/json')) {
    throw httpError(415, 'unsupported_media_type', 'Content-Type must be application/json.');
  }
}

export function redirect(location, cookies = []) {
  const headers = new Headers({
    location,
    'cache-control': 'private, no-store',
    'x-robots-tag': 'noindex, nofollow, noarchive',
  });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(null, { status: 302, headers });
}
