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
        // Land on a confirmation page — a clear "you're in" beat with a button
        // on to the app — rather than dropping the user straight into it. The
        // intended destination rides along so the button goes to the right place.
        const target = new URL('/welcome', url.origin);
        if (next && next !== APP_URL) target.searchParams.set('next', next);
        return NextResponse.redirect(target);
      }
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth_failed', url.origin));
}
