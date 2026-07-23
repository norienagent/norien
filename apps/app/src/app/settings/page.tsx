import { Suspense } from 'react';

import { api, runtimeApi } from '@norien-live/web-ui/api';
import { API_URL, APP_URL } from '@norien-live/web-ui';
import { count, providerLabel, scrubProviders } from '@norien-live/web-ui';
import { InstallCommand } from '@/components/registry';
import { Table } from '@/components/table';
import { Badge, Card, ErrorState, Row, SectionHeading, Skeleton, Stat } from '@norien-live/web-ui';

export const metadata = { title: 'Settings' };

/**
 * Settings.
 *
 * Everything here reflects the running system rather than stored preferences —
 * there is no account yet to attach preferences to. Connection endpoints and
 * provider health are read live, so this doubles as the diagnostic page for a
 * local install.
 */
export default function SettingsPage() {
  return (
    <>
      <SectionHeading
        title="Settings"
        detail="How this frontend is wired to Norien, and the live health of everything behind it."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Connection">
          <dl>
            <Row label="Registry API">
              <span className="font-mono text-xs break-all">{API_URL}</span>
            </Row>
            <Row label="Runtime supervisor">
              <span className="font-mono text-xs break-all">{runtimeApi.url}</span>
            </Row>
            <Row label="Web app">
              <span className="font-mono text-xs break-all">{APP_URL}</span>
            </Row>
          </dl>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            These come from <span className="font-mono text-xs text-ink">NORIEN_API_URL</span> and{' '}
            <span className="font-mono text-xs text-ink">NORIEN_RUNTIME_URL</span>. Set them in{' '}
            <span className="font-mono text-xs text-ink">.env.local</span> to point this frontend at a
            different install — nothing in the UI hardcodes an origin.
          </p>
        </Card>

        <Suspense
          fallback={
            <Card title="Registry health">
              <Skeleton height={140} />
            </Card>
          }
        >
          <RegistryHealth />
        </Suspense>
      </div>

      <div className="mt-4">
        <Suspense
          fallback={
            <Card title="Data providers">
              <Skeleton height={200} />
            </Card>
          }
        >
          <ProviderHealthPanel />
        </Suspense>
      </div>

      <div className="mt-4">
        <Card title="Preferences">
          <p className="text-sm leading-relaxed text-muted">
            Per-account preferences arrive with authentication. Until an account exists there is
            nothing to attach them to, so no preference is stored — the UI would be pretending
            otherwise.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The CLI does store local configuration, and it is the same registry these pages read:
          </p>
          <div className="mt-4 space-y-2">
            <InstallCommand command="norien profiles" />
            <InstallCommand command="norien doctor" />
          </div>
        </Card>
      </div>
    </>
  );
}

async function RegistryHealth() {
  const health = await api.health().catch(() => null);

  if (!health) {
    return (
      <Card title="Registry health">
        <ErrorState
          title="Registry unreachable"
          detail={`No response from ${API_URL}. Start it with \`npm run dev\` in the repository root.`}
        />
      </Card>
    );
  }

  return (
    <Card title="Registry health">
      <dl>
        <Row label="Status">
          <Badge tone={health.status === 'ok' ? 'up' : 'down'}>{health.status}</Badge>
        </Row>
        <Row label="Version">
          <span className="font-mono text-xs">{health.version}</span>
        </Row>
        <Row label="Environment">{health.environment}</Row>
        <Row label="Uptime">{Math.round(health.uptime_seconds).toLocaleString('en-US')}s</Row>
        <Row label="Database">
          {health.checks.database.driver}
          {health.checks.database.ok ? '' : ' (failing)'} · {health.checks.database.latency_ms}ms
        </Row>
      </dl>
    </Card>
  );
}

/**
 * Provider connectivity.
 *
 * A provider that is not configured is a normal state — it disables that
 * provider rather than breaking anything — so it is shown distinctly from one
 * that is configured but unreachable.
 */
async function ProviderHealthPanel() {
  const providers = await api.providers().catch(() => null);

  if (!providers) {
    return (
      <Card title="Data providers">
        <ErrorState title="Could not read provider health" />
      </Card>
    );
  }

  const { cache } = providers;
  const total = cache.hits + cache.misses;
  const hitRate = total === 0 ? 0 : Math.round((cache.hits / total) * 100);

  return (
    <>
      <Card title={`Data providers (${providers.data.length})`} padded={false}>
        <Table
          rows={providers.data}
          rowKey={(provider) => provider.provider}
          columns={[
            {
              key: 'provider',
              header: 'Source',
              cell: (provider) => (
                <span className="font-medium text-ink">{providerLabel(provider.provider)}</span>
              ),
            },
            {
              key: 'configured',
              header: 'Configured',
              cell: (provider) =>
                provider.configured ? <Badge tone="up">yes</Badge> : <Badge>not configured</Badge>,
            },
            {
              key: 'reachable',
              header: 'Reachable',
              cell: (provider) =>
                !provider.configured ? (
                  <span className="text-muted">—</span>
                ) : provider.reachable ? (
                  <Badge tone="up">ok</Badge>
                ) : (
                  <Badge tone="down">unreachable</Badge>
                ),
            },
            {
              key: 'latency',
              header: 'Latency',
              align: 'right',
              hideBelow: 'sm',
              cell: (provider) => (provider.ms === undefined ? '—' : `${provider.ms}ms`),
            },
            {
              key: 'reason',
              header: 'Detail',
              hideBelow: 'md',
              cell: (provider) => <span className="text-muted">{scrubProviders(provider.reason)}</span>,
            },
          ]}
        />
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Cache hit rate" value={`${hitRate}%`} hint={`${count(total)} lookups`} />
        <Stat label="Cached entries" value={count(cache.size)} />
        <Stat label="Stale served" value={count(cache.staleServed)} hint="on provider failure" />
        <Stat label="Evictions" value={count(cache.evictions)} />
      </div>
    </>
  );
}
