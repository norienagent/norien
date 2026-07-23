import { Suspense } from 'react';

import { api, runtimeApi, type HealthStatus, type RuntimeState } from '@norien-live/web-ui/api';
import { count } from '@norien-live/web-ui';
import { InstallCommand } from '@/components/registry';
import { Table } from '@/components/table';
import {
  Badge,
  Card,
  Empty,
  ErrorState,
  Row,
  SectionHeading,
  Skeleton,
  SkeletonCards,
  Stat,
} from '@norien-live/web-ui';

export const metadata = { title: 'Runtime' };

/**
 * Runtime.
 *
 * The supervisor is a separate process from the registry — a shared catalogue
 * must never execute user code — and it is frequently not running at all. That
 * is a normal local state, not an error, so the page says so and shows how to
 * start it rather than rendering a failure.
 */
export default function RuntimePage() {
  return (
    <>
      <SectionHeading
        title="Runtime"
        detail="The supervisor that executes installed agents, streams their logs, and recovers them when they crash."
      />

      <Suspense
        fallback={
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SkeletonCards count={4} />
          </div>
        }
      >
        <SupervisorPanel />
      </Suspense>

      <div className="mt-4">
        <Suspense
          fallback={
            <Card title="Chain">
              <Skeleton height={100} />
            </Card>
          }
        >
          <ChainPanel />
        </Suspense>
      </div>
    </>
  );
}

const STATE_TONE: Record<RuntimeState, 'up' | 'down' | 'warn' | 'neutral'> = {
  running: 'up',
  stopped: 'neutral',
  failed: 'down',
  restarting: 'warn',
  starting: 'warn',
  stopping: 'warn',
  installing: 'warn',
};

const HEALTH_TONE: Record<HealthStatus, 'up' | 'down' | 'warn' | 'neutral'> = {
  healthy: 'up',
  unhealthy: 'down',
  failed: 'down',
  starting: 'warn',
  stopped: 'neutral',
};

async function SupervisorPanel() {
  const status = await runtimeApi.status();

  if (!status) {
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Supervisor" value={<span className="text-muted">Offline</span>} hint="not reachable" />
          <Stat label="Running" value="—" />
          <Stat label="Stopped" value="—" />
          <Stat label="Failed" value="—" />
        </div>

        <div className="mt-4">
          <Card title="Supervisor is not running">
            <p className="text-sm leading-relaxed text-muted">
              The runtime supervisor is a separate local process from the registry, listening on{' '}
              <span className="font-mono text-xs text-ink">{runtimeApi.url}</span>. Nothing is wrong —
              it simply is not started. Start it from a terminal:
            </p>
            <div className="mt-4 space-y-2">
              <InstallCommand command="norien runtime start" />
              <InstallCommand command="norien run <agent>" />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              This page reads the supervisor directly and will populate once it is up. Agents must be
              installed locally first — the registry publishes them, the supervisor runs them.
            </p>
          </Card>
        </div>
      </>
    );
  }

  const { summary, data } = status;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Supervisor"
          value={<span className="text-up">Online</span>}
          hint={runtimeApi.url}
        />
        <Stat label="Running" value={count(summary.running)} />
        <Stat label="Stopped" value={count(summary.stopped)} />
        <Stat label="Failed" value={count(summary.failed)} />
      </div>

      <div className="mt-4">
        <Card title={`Agents (${status.meta.total})`} padded={false}>
          <Table
            rows={data}
            rowKey={(instance) => instance.agent}
            empty={
              <Empty
                title="No agents installed"
                detail="Install one with `norien install <agent>`, then run it with `norien run <agent>`."
              />
            }
            columns={[
              {
                key: 'agent',
                header: 'Agent',
                cell: (instance) => <span className="font-medium text-ink">{instance.agent}</span>,
              },
              {
                key: 'version',
                header: 'Version',
                hideBelow: 'sm',
                cell: (instance) => <span className="font-mono text-xs">{instance.version}</span>,
              },
              {
                key: 'status',
                header: 'Status',
                cell: (instance) => (
                  <Badge tone={STATE_TONE[instance.status]}>{instance.status}</Badge>
                ),
              },
              {
                key: 'health',
                header: 'Health',
                cell: (instance) => (
                  <Badge tone={HEALTH_TONE[instance.health] ?? 'neutral'}>{instance.health}</Badge>
                ),
              },
              {
                key: 'pid',
                header: 'PID',
                align: 'right',
                hideBelow: 'md',
                cell: (instance) => (instance.pid === null ? '—' : instance.pid),
              },
              {
                key: 'uptime',
                header: 'Uptime',
                align: 'right',
                hideBelow: 'md',
                cell: (instance) => uptime(instance.uptime_seconds),
              },
              {
                key: 'restarts',
                header: 'Restarts',
                align: 'right',
                hideBelow: 'lg',
                cell: (instance) => count(instance.restarts),
              },
            ]}
          />
        </Card>
      </div>
    </>
  );
}

/** Chain connectivity — the other half of "is the local stack healthy?". */
async function ChainPanel() {
  const [chain, health] = await Promise.all([
    api.chain().catch(() => null),
    api.health().catch(() => null),
  ]);

  if (!chain && !health) {
    return (
      <Card title="Registry & chain">
        <ErrorState
          title="Registry unreachable"
          detail="Norien's API is not responding. Start it with `npm run dev` in the repository root."
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Registry">
        {health ? (
          <dl>
            <Row label="Status">
              <Badge tone={health.status === 'ok' ? 'up' : 'down'}>{health.status}</Badge>
            </Row>
            <Row label="Version">
              <span className="font-mono text-xs">{health.version}</span>
            </Row>
            <Row label="Environment">{health.environment}</Row>
            <Row label="Uptime">{uptime(health.uptime_seconds)}</Row>
            <Row label="Database">
              {health.checks.database.driver} · {health.checks.database.latency_ms}ms
            </Row>
          </dl>
        ) : (
          <ErrorState title="Registry unreachable" />
        )}
      </Card>

      <Card title="Chain">
        {chain ? (
          <dl>
            <Row label="Network">{chain.data.chain.name}</Row>
            <Row label="Chain ID">
              <span className="font-mono text-xs">{chain.data.chain.id}</span>
            </Row>
            <Row label="Block height">{count(chain.data.blockNumber)}</Row>
            <Row label="Gas price">{chain.data.gasPriceGwei.toFixed(4)} gwei</Row>
            <Row label="Native currency">{chain.data.nativeCurrency}</Row>
          </dl>
        ) : (
          <ErrorState title="Chain unreachable" detail="The RPC node did not respond." />
        )}
      </Card>
    </div>
  );
}

function uptime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86_400)}d ${Math.floor((seconds % 86_400) / 3600)}h`;
}
