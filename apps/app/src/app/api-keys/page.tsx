import { API_URL, DOCS_URL, SITE_URL } from '@norien-live/web-ui';
import { getAccessToken } from '@norien-live/web-ui/supabase/server';
import { InstallCommand } from '@/components/registry';
import { ButtonLink, Card, Empty, SectionHeading } from '@norien-live/web-ui';

import type { KeySummary } from './actions';
import { ApiKeysManager } from './manager';

export const metadata = { title: 'API Keys' };

/**
 * API keys.
 *
 * A signed-in user mints keys here to authenticate the CLI, the SDKs, or their
 * own scripts as themselves. Reads stay public and free; a key is only needed
 * to be identified — for publishing and for higher, per-account treatment.
 */
export default async function ApiKeysPage() {
  const token = await getAccessToken();

  return (
    <>
      <SectionHeading
        title="API Keys"
        detail="Create a key to authenticate the CLI, SDKs, and your own scripts as you. Every read stays public and free."
      />

      {token ? <SignedIn token={token} /> : <SignedOut />}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Use your key">
          <p className="text-sm leading-relaxed text-muted">
            Send it as a Bearer token — the CLI, both SDKs, and plain{' '}
            <span className="font-mono text-xs text-ink">curl</span> all accept it:
          </p>
          <div className="mt-4 space-y-2">
            <InstallCommand command={`curl -H "Authorization: Bearer norien_…" ${API_URL}/agents`} />
            <InstallCommand command="norien login   # paste your key when prompted" />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            The same key lets you <span className="font-mono text-xs text-ink">norien publish</span>{' '}
            an agent or tool under your handle.
          </p>
        </Card>

        <Card title="Calling the API">
          <p className="text-sm leading-relaxed text-muted">
            Every read is public and needs no key at all:
          </p>
          <div className="mt-4 space-y-2">
            <InstallCommand command={`curl ${API_URL}/api/tokens?limit=5`} />
            <InstallCommand command={`curl ${API_URL}/agents`} />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            The full surface is in the{' '}
            <a
              href={`${API_URL}/docs`}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent underline underline-offset-2"
            >
              OpenAPI reference ↗
            </a>{' '}
            or the{' '}
            <a href={DOCS_URL} className="text-accent underline underline-offset-2">
              documentation
            </a>
            .
          </p>
        </Card>
      </div>
    </>
  );
}

async function SignedIn({ token }: { token: string }) {
  const keys = await fetchKeys(token);
  return (
    <Card title="Your keys">
      <ApiKeysManager initialKeys={keys} />
    </Card>
  );
}

function SignedOut() {
  return (
    <Card title="Your keys">
      <Empty
        title="Sign in to create keys"
        detail="API keys are tied to your account, so nothing is issued to an anonymous caller. Sign in and your keys appear here."
        action={<ButtonLink href={`${SITE_URL}/login`}>Sign in</ButtonLink>}
      />
    </Card>
  );
}

async function fetchKeys(token: string): Promise<KeySummary[]> {
  const response = await fetch(`${API_URL}/api/keys`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => null);

  if (!response || !response.ok) return [];
  const body = (await response.json()) as { data: KeySummary[] };
  return body.data ?? [];
}
