async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function verifyAccessToken(accessToken, env) {
  if (!accessToken || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  let response;
  try {
    response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: env.SUPABASE_ANON_KEY,
      },
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error('crm session check failed', error?.message || error);
    return null;
  }
  if (!response.ok) return null;
  const user = await readJson(response);
  if (!user?.email) return null;
  return { id: user.id, email: user.email };
}

export async function refreshSession(refreshToken, env) {
  if (!refreshToken || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  let response;
  try {
    response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.SUPABASE_ANON_KEY,
        authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error('crm refresh failed', error?.message || error);
    return null;
  }
  if (!response.ok) return null;
  const data = await readJson(response);
  if (!data?.access_token || !data?.refresh_token) return null;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in || 3600,
    email: data.user?.email || null,
  };
}

export async function revokeAccess(accessToken, env) {
  if (!accessToken || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return;
  await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/logout`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(5000),
  });
}
