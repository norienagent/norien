import Link from 'next/link';

import { API_URL } from '@/lib/config';
import { InstallCommand } from '@/components/registry';
import { Badge, Card, Empty, Row, SectionHeading } from '@/components/ui';

export const metadata = { title: 'API Keys' };

/**
 * API keys.
 *
 * There is no key store yet — issuing one would mean inventing a credential
 * that authorises nothing. Instead this documents the identification mechanism
 * that is actually in place, and what changes when verification lands.
 */
export default function ApiKeysPage() {
  return (
    <>
      <SectionHeading
        title="API Keys"
        detail="How requests to Norien are identified today, and what arrives with authentication."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Your keys">
          <Empty
            title="No keys issued"
            detail="Key management arrives with authentication. Until then the registry identifies callers by handle rather than by a verified secret — issuing a key here would hand you a credential that authorises nothing."
          />
        </Card>

        <Card title="Current behaviour">
          <dl>
            <Row label="Mechanism">
              <span className="font-mono text-xs">x-norien-actor</span>
            </Row>
            <Row label="Verification">
              <Badge tone="warn">not enforced</Badge>
            </Row>
            <Row label="Bearer token">
              <span className="text-muted">declared in OpenAPI, not checked</span>
            </Row>
            <Row label="Scope">public read, identified write</Row>
          </dl>

          <p className="mt-4 text-sm leading-relaxed text-muted">
            The CLI and both SDKs already send an{' '}
            <span className="font-mono text-xs text-ink">Authorization: Bearer</span> header alongside
            the handle, so nothing in a client changes when the server starts verifying it. Treat the
            current setup as identification, not as a security boundary.
          </p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Authenticating from the CLI">
          <p className="text-sm leading-relaxed text-muted">
            Credentials are stored per profile in{' '}
            <span className="font-mono text-xs text-ink">~/.norien/config.json</span>:
          </p>
          <div className="mt-4 space-y-2">
            <InstallCommand command="norien login" />
            <InstallCommand command="norien whoami" />
            <InstallCommand command="norien profiles" />
          </div>
        </Card>

        <Card title="Calling the API directly">
          <p className="text-sm leading-relaxed text-muted">
            Every read is public and needs no credential at all:
          </p>
          <div className="mt-4 space-y-2">
            <InstallCommand command={`curl ${API_URL}/api/tokens?limit=5`} />
            <InstallCommand command={`curl ${API_URL}/agents`} />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            The full surface is documented in the{' '}
            <a
              href={`${API_URL}/docs`}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent underline underline-offset-2"
            >
              OpenAPI reference ↗
            </a>{' '}
            or in the{' '}
            <Link href="/docs" className="text-accent underline underline-offset-2">
              documentation
            </Link>
            .
          </p>
        </Card>
      </div>
    </>
  );
}
