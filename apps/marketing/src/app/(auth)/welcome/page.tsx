import { APP_URL, Brand } from '@norien-live/web-ui';
import { getSessionUser } from '@norien-live/web-ui/supabase/server';

import { WelcomeRedirect } from './redirect';

export const metadata = { title: 'Signed in' };

/**
 * Post-sign-in confirmation.
 *
 * The OAuth callback lands here once the session is set, rather than dropping
 * the user straight into the app: a clear "you're in" beat, a greeting, and a
 * button on to the product. It reads the session directly, so the name is real.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = next && /^https?:\/\//.test(next) ? next : APP_URL;

  const user = await getSessionUser().catch(() => null);
  const name =
    (user?.user_metadata?.full_name as string) ||
    (user?.user_metadata?.name as string) ||
    (user?.user_metadata?.user_name as string) ||
    user?.email ||
    null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Brand size="lg" />
        </div>

        <div className="rounded-xl border border-line bg-card p-8 text-center">
          <span
            className="mx-auto flex size-14 items-center justify-center rounded-full bg-up/12 text-up"
            style={{ animation: 'welcome-pop 0.5s cubic-bezier(0.16, 1, 0.3, 1) both' }}
          >
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>

          <h1 className="mt-5 text-xl font-semibold tracking-tight text-ink">Login successful</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            {name ? (
              <>
                Signed in as <span className="font-medium text-ink">{name}</span>.
              </>
            ) : (
              'You are signed in.'
            )}
          </p>

          <WelcomeRedirect to={destination} />
        </div>
      </div>
    </div>
  );
}
