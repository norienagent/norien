import Link from 'next/link';

import { APP_URL } from '@norien-live/web-ui';
import { AuthShell } from '@norien-live/web-ui';
import { OAuthButtons } from '@norien-live/web-ui';
import { ButtonLink } from '@norien-live/web-ui';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <AuthShell
      title="Sign in"
      detail="Publish agents and tools, and keep your installations in one place."
      footer={
        <>
          No account?{' '}
          <Link href="/signup" className="text-accent underline underline-offset-2">
            Create one
          </Link>
        </>
      }
    >
      <OAuthButtons verb="Continue" />

      <div className="mt-6 border-t border-line pt-6">
        <p className="text-sm leading-relaxed text-muted">
          Everything in the app is readable without an account. Sign-in will only be required for
          publishing and for API keys.
        </p>
        <ButtonLink href={APP_URL} tone="secondary" className="mt-4 w-full">
          Continue without an account
        </ButtonLink>
      </div>
    </AuthShell>
  );
}
