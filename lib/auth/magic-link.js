export async function sendMagicLink(env, { email, redirectTo }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw Object.assign(new Error('not_configured'), { status: 503, expose: true });
  }
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  let response;
  try {
    response = await fetch(`${base}/auth/v1/otp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.SUPABASE_ANON_KEY,
        authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        email,
        options: {
          email_redirect_to: redirectTo,
          should_create_user: true,
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    console.error('portal magic link failed', error?.message || error);
    throw Object.assign(new Error('Sign-in is unavailable right now.'), { status: 503, expose: true });
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    console.error('portal magic link rejected', response.status, body?.msg || body?.error_description);
    throw Object.assign(new Error('Could not send sign-in email. Check the address or try again later.'), {
      status: 400,
      expose: true,
    });
  }
  return { ok: true };
}

export async function verifyMagicLinkToken(env, { token_hash, type = 'magiclink' }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  let response;
  try {
    response = await fetch(`${base}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.SUPABASE_ANON_KEY,
        authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ type, token_hash }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    console.error('portal verify failed', error?.message || error);
    return null;
  }
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  if (!data?.access_token || !data?.refresh_token) return null;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in || 3600,
    email: data.user?.email || data.email || null,
    user_id: data.user?.id || null,
  };
}
