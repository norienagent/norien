import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase server client.
 *
 * Reads and refreshes the session from cookies inside server components, route
 * handlers, and the auth callback. Returns null when Supabase is not configured
 * so callers can treat "signed out" and "auth disabled" the same way.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // `setAll` is called from a Server Component, where cookies are
          // read-only. The middleware refreshes the session cookie instead, so
          // this is safe to ignore.
        }
      },
    },
  });
}

/** The signed-in user, or null. Never throws — an unreachable Supabase is "signed out". */
export async function getSessionUser() {
  const supabase = await createClient();
  if (!supabase) return null;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}
