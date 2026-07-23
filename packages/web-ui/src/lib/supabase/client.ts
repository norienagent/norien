'use client';

import { createBrowserClient } from '@supabase/ssr';

import { COOKIE_DOMAIN } from '../config';

/**
 * Supabase browser client.
 *
 * Used by client components to start an OAuth sign-in and read the current
 * session. The URL and anon key are public by design — the anon key only
 * permits what Row Level Security allows, and we use Supabase for auth alone.
 *
 * The session cookie is scoped to `COOKIE_DOMAIN` (e.g. `.norien.live`) so a
 * sign-in on the marketing site is recognised on the app subdomain — the two
 * are separate deployments sharing one session.
 *
 * Returns null when Supabase is not configured, so the UI can degrade to its
 * "auth not connected" state instead of throwing.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;
  return createBrowserClient(url, anonKey, {
    ...(COOKIE_DOMAIN ? { cookieOptions: { domain: COOKIE_DOMAIN } } : {}),
  });
}

export const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
