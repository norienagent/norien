import { Suspense } from 'react';

import { api, type Portfolio } from '@norien-live/web-ui/api';
import { TokenLogo, usd } from '@norien-live/web-ui';
import { Table } from '@/components/table';
import {
  Badge,
  Card,
  DegradedNotice,
  Empty,
  ErrorState,
  SectionHeading,
  SkeletonRows,
  SourceList,
  Stat,
} from '@norien-live/web-ui';

export const metadata = { title: 'Portfolio' };

export default async function PortfolioAddressPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;

  return (
    <>
      <SectionHeading
        title="Portfolio"
        detail={
          <span className="font-mono text-xs break-all">{address}</span>
        }
      />

      <Suspense
        fallback={
          <Card padded={false}>
            <SkeletonRows rows={8} cols={3} />
          </Card>
        }
      >
        <PortfolioView address={address} />
      </Suspense>
    </>
  );
}

async function PortfolioView({ address }: { address: string }) {
  const result = await api.portfolio(address).catch(() => null);

  if (!result) {
    return (
      <Card>
        <ErrorState
          title="Portfolio is unavailable"
          detail="The multi-chain data provider could not be reached."
        />
      </Card>
    );
  }

  const notConfigured = result.sources.every((s) => s.status === 'not_configured');
  if (notConfigured) {
    return (
      <Card title="Multi-chain data not enabled">
        <Empty
          title="Alchemy is not configured"
          detail="Set ALCHEMY_API_KEY on the registry to enable cross-chain token and balance data."
        />
      </Card>
    );
  }

  const { totalUsd, chains, native, tokens }: Portfolio = result.data;
  const hasHoldings = tokens.length > 0 || native.length > 0;

  if (!hasHoldings) {
    return (
      <>
        <DegradedNotice sources={result.sources} degraded={result.degraded} />
        <Card>
          <Empty
            title="No holdings found"
            detail="This address holds no priced tokens or native balance on Ethereum, Base, Arbitrum, Optimism, or Polygon."
          />
        </Card>
      </>
    );
  }

  const maxChain = Math.max(...chains.map((c) => c.usd), 1);

  return (
    <>
      <DegradedNotice sources={result.sources} degraded={result.degraded} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Net worth" value={usd(totalUsd)} hint="across 5 chains" />
        <Stat label="Tokens" value={tokens.length} />
        <Stat label="Chains held" value={chains.length} />
        <Stat label="Native positions" value={native.length} />
      </div>

      {chains.length > 0 ? (
        <div className="mt-4">
          <Card title="By chain">
            <ul className="space-y-3">
              {chains.map((chain) => (
                <li key={chain.label} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-sm font-medium text-ink">{chain.label}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(2, (chain.usd / maxChain) * 100)}%` }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right text-sm tabular-nums text-ink">
                    {usd(chain.usd)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {native.length > 0 ? (
        <div className="mt-4">
          <Card title="Native balances" padded={false}>
            <Table
              rows={native}
              rowKey={(n) => n.chain}
              columns={[
                { key: 'chain', header: 'Chain', cell: (n) => <span className="font-medium text-ink">{n.chainLabel}</span> },
                { key: 'symbol', header: 'Asset', cell: (n) => n.symbol },
                { key: 'balance', header: 'Balance', align: 'right', cell: (n) => <span className="tabular-nums">{n.balance}</span> },
                { key: 'usd', header: 'Value', align: 'right', cell: (n) => <span className="tabular-nums">{usd(n.usd)}</span> },
              ]}
            />
          </Card>
        </div>
      ) : null}

      <div className="mt-4">
        <Card title={`Tokens (${tokens.length})`} padded={false}>
          <Table
            rows={tokens}
            rowKey={(t) => `${t.network}:${t.address}`}
            empty={<Empty title="No tokens" />}
            columns={[
              {
                key: 'token',
                header: 'Token',
                cell: (t) => (
                  <span className="inline-flex min-w-0 items-center gap-2.5">
                    <TokenLogo src={t.logo} symbol={t.symbol} className="size-6" />
                    <span className="min-w-0 truncate">
                      <strong className="font-semibold text-ink">{t.symbol || '—'}</strong>{' '}
                      <span className="text-muted">{t.name}</span>
                    </span>
                  </span>
                ),
              },
              { key: 'chain', header: 'Chain', hideBelow: 'sm', cell: (t) => <Badge>{t.networkLabel}</Badge> },
              { key: 'balance', header: 'Balance', align: 'right', hideBelow: 'md', cell: (t) => <span className="tabular-nums">{t.balance}</span> },
              { key: 'price', header: 'Price', align: 'right', hideBelow: 'lg', cell: (t) => <span className="tabular-nums">{usd(t.usdPrice)}</span> },
              { key: 'usd', header: 'Value', align: 'right', cell: (t) => <span className="font-medium tabular-nums text-ink">{usd(t.usd)}</span> },
            ]}
          />
        </Card>
      </div>

      <div className="mt-5">
        <SourceList sources={result.sources} />
      </div>
    </>
  );
}
