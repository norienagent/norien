import { Suspense } from 'react';

import { api } from '@/lib/api';
import { InstallCommand } from '@/components/registry';
import { AgentPanelList } from '@/components/registry';
import { ButtonLink, Card, Empty, SectionHeading, Skeleton } from '@/components/ui';

export const metadata = { title: 'Profile' };

/**
 * Profile.
 *
 * No session exists yet, so the page does not invent one. It shows the signed-out
 * state and, because publishing is already attributed by handle, what the
 * registry does record about authors today.
 */
export default function ProfilePage() {
  return (
    <>
      <SectionHeading title="Profile" detail="Your account, publications, and installations." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Account">
          <Empty
            title="Not signed in"
            detail="Authentication is not wired up yet. Signing in with GitHub or Google will attach your publications, installations, and API keys to an account."
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
