import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * OAuth callback.
 *
 * Supabase redirects here with a `code` after GitHub sign-in. We exchange
 * it for a session (which sets the cookies), then send the user on to wherever
 * they were headed — the app by default.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/app';

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL(next, url.origin));
      }
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth_failed', url.origin));
}
