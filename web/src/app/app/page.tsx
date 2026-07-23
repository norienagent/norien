import Link from 'next/link';
import { Suspense } from 'react';

import { api, type Token } from '@/lib/api';
import { count, usd } from '@/lib/format';
import { TokenList } from '@/components/token-table';
import { AgentPanelList, ToolPanelList } from '@/components/registry';
import {
  Card,
  DegradedNotice,
  ErrorState,
  SectionHeading,
  SkeletonCards,
  SkeletonRows,
  Stat,
} from '@/components/ui';

export const metadata = { title: 'Dashboard' };

/**
 * Dashboard.
 *
 * Eight widgets, each its own suspended server component. A slow provider
 * delays only its own panel rather than the whole page, and each streams in
 * behind its own skeleton.
 */
export default function DashboardPage() {
  return (
    <>
      <SectionHeading
        title="Dashboard"
        detail="Live market, ecosystem, and registry activity — aggregated by Norien."
      />

      <Suspense
        fallback={
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SkeletonCards count={4} />
          </div>
        }
      >
        <NetworkStatus />
      </Suspense>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Suspense fallback={<PanelSkeleton title="Trending tokens" />}>
          <TrendingPanel />
        </Suspense>
        <Suspense fallback={<PanelSkeleton title="Highest volume" />}>
          <VolumePanel />
        </Suspense>
        <Suspense fallback={<PanelSkeleton title="Biggest gainers" />}>
          <GainersPanel />
        </Suspense>
        <Suspense fallback={<PanelSkeleton title="New launches" />}>
          <NewLaunchesPanel />
        </Suspense>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Suspense fallback={<PanelSkeleton title="Latest projects" />}>
          <LatestProjectsPanel />
        </Suspense>
        <Suspense fallback={<PanelSkeleton title="Latest registry" />}>
          <LatestRegistryPanel />
        </Suspense>
        <Suspense fallback={<PanelSkeleton title="Latest tools" />}>
          <LatestToolsPanel />
        </Suspense>
      </div>
    </>
  );
}

function PanelSkeleton({ title }: { title: string }) {
  return (
    <Card title={title} padded={false}>
      <SkeletonRows rows={5} cols={2} />
    </Card>
  );
}

function ViewAll({ href }: { href: string }) {
  return (
    <Link href={href} className="text-xs font-medium text-muted transition-colors hover:text-accent">
      View all →
    </Link>
  );
}

/* --- 1. Network status ---------------------------------------------------- */

async function NetworkStatus() {
  const [chain, tokens] = await Promise.all([
    api.chain().catch(() => null),
    api.tokens({ limit: 50, sort: 'volume24' }).catch(() => null),
  ]);

  const items: Token[] = tokens?.data.items ?? [];
  const totalVolume = items.reduce((sum, token) => sum + (token.volume24h ?? 0), 0);
  const totalLiquidity = items.reduce((sum, token) => sum + (token.liquidity ?? 0), 0);
  const holders = items.reduce((sum, token) => sum + (token.holders ?? 0), 0);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="Block height"
        value={chain ? count(chain.data.blockNumber) : '—'}
        hint={chain?.data.chain.name ?? 'chain unreachable'}
      />
      <Stat
        label="Gas price"
        value={chain ? `${chain.data.gasPriceGwei.toFixed(4)} gwei` : '—'}
        hint={chain?.data.nativeCurrency}
      />
      <Stat label="24h volume" value={usd(totalVolume)} hint={`across ${items.length} tokens`} />
      <Stat label="Total liquidity" value={usd(totalLiquidity)} hint={`${count(holders)} holders`} />
    </div>
  );
}

/* --- 2-5. Market panels --------------------------------------------------- */

async function TrendingPanel() {
  const result = await api.trending({ limit: 5 }).catch(() => null);
  if (!result) {
    return (
      <Card title="Trending tokens">
        <ErrorState title="Could not load trending tokens" />
      </Card>
    );
  }

  return (
    <Card title="Trending tokens" action={<ViewAll href="/app/markets?sort=change24" />}>
      <DegradedNotice sources={result.sources} degraded={result.degraded} />
      <TokenList tokens={result.data.items} metric="change" />
    </Card>
  );
}

async function VolumePanel() {
  const result = await api.tokens({ limit: 5, sort: 'volume24' }).catch(() => null);
  if (!result) {
    return (
      <Card title="Highest volume">
        <ErrorState title="Could not load volume leaders" />
      </Card>
    );
  }

  return (
    <Card title="Highest volume" action={<ViewAll href="/app/markets?sort=volume24" />}>
      <DegradedNotice sources={result.sources} degraded={result.degraded} />
      <TokenList tokens={result.data.items} metric="volume" />
    </Card>
  );
}

async function GainersPanel() {
  const result = await api.tokens({ limit: 5, sort: 'change24' }).catch(() => null);
  if (!result) {
    return (
      <Card title="Biggest gainers">
        <ErrorState title="Could not load gainers" />
      </Card>
    );
  }

  return (
    <Card title="Biggest gainers" action={<ViewAll href="/app/markets?sort=change24" />}>
      <DegradedNotice sources={result.sources} degraded={result.degraded} />
      <TokenList tokens={result.data.items} metric="change" />
    </Card>
  );
}

/**
 * New launches.
 *
 * The market API exposes no listing timestamp, so this ranks by liquidity on
 * the native chain — the closest honest proxy. The hint says so rather than
 * implying an age we cannot verify.
 */
async function NewLaunchesPanel() {
  const result = await api.tokens({ limit: 5, sort: 'liquidity' }).catch(() => null);
  if (!result) {
    return (
      <Card title="New launches">
        <ErrorState title="Could not load tokens" />
      </Card>
    );
  }

  return (
    <Card title="New launches" action={<ViewAll href="/app/markets?sort=liquidity" />}>
      <DegradedNotice sources={result.sources} degraded={result.degraded} />
      <p className="mb-2 text-xs text-muted">
        Ranked by liquidity — the market API exposes no listing date.
      </p>
      <TokenList tokens={result.data.items} metric="liquidity" />
    </Card>
  );
}

/* --- 6. Latest projects --------------------------------------------------- */

async function LatestProjectsPanel() {
  const result = await api.projects({ limit: 6 }).catch(() => null);
  if (!result) {
    return (
      <Card title="Latest projects">
        <ErrorState title="Could not load projects" />
      </Card>
    );
  }

  const projects = result.data.items;

  return (
    <Card title="Latest projects" action={<ViewAll href="/app/projects" />}>
      <DegradedNotice sources={result.sources} degraded={result.degraded} />
      <ul>
        {projects.map((project) => (
          <li key={project.slug} className="border-t border-line py-2.5 first:border-0">
            <Link href={`/app/project/${project.slug}`} className="group flex items-center gap-2.5">
              {project.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- provider CDNs vary
                <img
                  src={project.logo}
                  alt=""
                  loading="lazy"
                  className="size-6 shrink-0 rounded-full border border-line bg-sunken object-cover"
                />
              ) : (
                <span aria-hidden className="size-6 shrink-0 rounded-full border border-line bg-sunken" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink group-hover:text-accent">
                {project.name}
              </span>
              <span className="shrink-0 text-sm text-muted">{usd(project.tvl)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* --- 7. Latest registry --------------------------------------------------- */

async function LatestRegistryPanel() {
  const result = await api.agents({ limit: 6 }).catch(() => null);
  if (!result) {
    return (
      <Card title="Latest registry">
        <ErrorState title="Could not load the registry" />
      </Card>
    );
  }

  return (
    <Card title="Latest registry" action={<ViewAll href="/app/registry" />}>
      <AgentPanelList agents={result.data} />
    </Card>
  );
}

/* --- 8. Latest tools ------------------------------------------------------ */

async function LatestToolsPanel() {
  const result = await api.tools({ limit: 6 }).catch(() => null);
  if (!result) {
    return (
      <Card title="Latest tools">
        <ErrorState title="Could not load tools" />
      </Card>
    );
  }

  return (
    <Card title="Latest tools" action={<ViewAll href="/app/tools" />}>
      <ToolPanelList tools={result.data} />
    </Card>
  );
}
