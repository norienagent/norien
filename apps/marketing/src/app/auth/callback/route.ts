import { NextResponse } from 'next/server';

import { APP_URL } from '@norien-live/web-ui';
import { createClient } from '@norien-live/web-ui/supabase/server';

/**
 * OAuth callback.
 *
 * Supabase redirects here with a `code` after GitHub sign-in. We exchange it for
 * a session — which sets the cookie on the shared parent domain — then send the
 * user on to wherever they were headed: the app subdomain by default. `next` may
 * be an absolute URL (a different subdomain), which `new URL` honours over the
 * base origin.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? APP_URL;

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        // Land on the app with a one-shot flag so it can confirm "Login successful".
        const target = new URL(next, url.origin);
        target.searchParams.set('signedin', '1');
        return NextResponse.redirect(target);
      }
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth_failed', url.origin));
}
