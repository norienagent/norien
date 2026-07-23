import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the Supabase session cookie on every request.
 *
 * Server Components cannot write cookies, so a rotated session token would be
 * lost without this. When Supabase is not configured the middleware is a no-op,
 * so the app runs identically with or without auth.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let response = NextResponse.next({ request });
  if (!url || !anonKey) return response;

  // Scope the refreshed cookie to the parent domain so the session is shared
  // across the marketing and app subdomains. Unset locally.
  const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;

  const supabase = createServerClient(url, anonKey, {
    ...(cookieDomain ? { cookieOptions: { domain: cookieDomain } } : {}),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Touches the auth server, which rotates the token when needed.
  await supabase.auth.getUser().catch(() => undefined);

  return response;
}

export const config = {
  // Everything except static assets and images.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
