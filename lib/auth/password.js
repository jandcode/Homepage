import { createClient } from '@supabase/supabase-js';

export async function signInWithPassword(env, { email, password }) {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.session) return { session: null, user: null };
  return { session: data.session, user: data.user };
}
