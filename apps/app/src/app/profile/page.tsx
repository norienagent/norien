import { Suspense } from 'react';

import { api } from '@norien-live/web-ui/api';
import { getSessionUser } from '@norien-live/web-ui/supabase/server';
import { InstallCommand } from '@/components/registry';
import { AgentPanelList } from '@/components/registry';
import { SignOutButton } from '@norien-live/web-ui';
import { Badge, ButtonLink, Card, Empty, Row, SectionHeading, Skeleton } from '@norien-live/web-ui';

export const metadata = { title: 'Profile' };

/**
 * Profile.
 *
 * Shows the signed-in account when a Supabase session exists, and the signed-out
 * state otherwise. Publishing is attributed by handle either way — the account
 * just makes that identity verified rather than merely claimed.
 */
export default function ProfilePage() {
  return (
    <>
      <SectionHeading title="Profile" detail="Your account, publications, and installations." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Suspense fallback={<Card title="Account"><Skeleton height={120} /></Card>}>
          <AccountCard />
        </Suspense>

        <Card title="How authorship works today">
          <p className="text-sm leading-relaxed text-muted">
            The registry attributes every publication to a handle sent with the request. It is
            identification rather than authentication — nothing is verified yet — so a handle claims
            authorship but does not prove it.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Check which identity your CLI is acting as:
          </p>
          <div className="mt-4 space-y-2">
            <InstallCommand command="norien whoami" />
            <InstallCommand command="norien list" />
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Suspense
          fallback={
            <Card title="Recent publications">
              <Skeleton height={160} />
            </Card>
          }
        >
          <RecentPublications />
        </Suspense>
      </div>
    </>
  );
}

/**
 * The signed-in account, or an invitation to sign in.
 *
 * Reads the Supabase session server-side. The handle shown here is the same one
 * the backend derives from the OAuth identity, so a user's publications line up
 * with their account.
 */
async function AccountCard() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <Card title="Account">
        <Empty
          title="Not signed in"
          detail="Sign in with GitHub to attach your publications and installations to a verified account."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink href="/login">Sign in</ButtonLink>
              <ButtonLink href="/signup" tone="secondary">
                Create account
              </ButtonLink>
            </div>
          }
        />
      </Card>
    );
  }

  const metadata = user.user_metadata ?? {};
  const name = metadata.name ?? metadata.full_name ?? metadata.user_name ?? 'Signed in';
  const handle = metadata.user_name ?? metadata.preferred_username ?? user.email?.split('@')[0] ?? user.id;
  const avatar = metadata.avatar_url as string | undefined;
  const provider = user.app_metadata?.provider;

  return (
    <Card title="Account">
      <div className="flex items-center gap-4">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- provider avatar CDN
          <img
            src={avatar}
            alt=""
            className="size-14 shrink-0 rounded-full border border-line bg-sunken object-cover"
          />
        ) : (
          <span aria-hidden className="size-14 shrink-0 rounded-full border border-line bg-sunken" />
        )}
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-ink">{String(name)}</div>
          <div className="truncate text-sm text-muted">{user.email}</div>
        </div>
      </div>

      <dl className="mt-5">
        <Row label="Handle">
          <span className="font-mono text-xs">{String(handle)}</span>
        </Row>
        <Row label="Signed in with">
          {provider ? <Badge tone="accent">{String(provider)}</Badge> : '—'}
        </Row>
        <Row label="User ID">
          <span className="font-mono text-xs break-all">{user.id}</span>
        </Row>
      </dl>

      <div className="mt-5 border-t border-line pt-4">
        <SignOutButton />
      </div>
    </Card>
  );
}

/** Real, live registry activity — attributed by handle, since that is what exists. */
async function RecentPublications() {
  const agents = await api.agents({ limit: 8 }).catch(() => null);

  if (!agents) {
    return (
      <Card title="Recent publications">
        <Empty title="Registry unreachable" />
      </Card>
    );
  }

  return (
    <Card title="Recent publications">
      <p className="mb-3 text-sm text-muted">
        Everything published to this registry, by every author. Once you sign in, this narrows to
        yours.
      </p>
      <AgentPanelList agents={agents.data} />
    </Card>
  );
}
