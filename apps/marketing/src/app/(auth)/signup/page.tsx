import Link from 'next/link';

import { APP_URL } from '@norien-live/web-ui';
import { AuthShell } from '@norien-live/web-ui';
import { OAuthButtons } from '@norien-live/web-ui';
import { ButtonLink } from '@norien-live/web-ui';

export const metadata = { title: 'Create an account' };

export default function SignupPage() {
  return (
    <AuthShell
      title="Create an account"
      detail="Publish to the registry and the tool marketplace under your own handle."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="text-accent underline underline-offset-2">
            Sign in
          </Link>
        </>
      }
    >
      <OAuthButtons verb="Sign up" />

      <div className="mt-6 border-t border-line pt-6">
        <p className="text-sm leading-relaxed text-muted">
          You can publish today without an account — the CLI identifies you by handle. See{' '}
          <Link href={`${APP_URL}/api-keys`} className="text-accent underline underline-offset-2">
            API Keys
          </Link>{' '}
          for how that works.
        </p>
        <ButtonLink href={APP_URL} tone="secondary" className="mt-4 w-full">
          Explore the app first
        </ButtonLink>
      </div>
    </AuthShell>
  );
}
