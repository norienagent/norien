import Link from 'next/link';

import type { Token } from '@norien-live/web-ui/api';
import { count, price, usd } from '@norien-live/web-ui';
import { type Column, Table } from '@/components/table';
import { Change, Empty, TokenCell } from '@norien-live/web-ui';

/**
 * The market table, shared by the dashboard, markets, and tokens pages.
 *
 * Columns are opt-in so a compact panel and the full grid use the same
 * component without either duplicating row rendering.
 */
export type TokenColumn = 'price' | 'change' | 'volume' | 'liquidity' | 'marketCap' | 'holders' | 'chain';

const DEFAULT_COLUMNS: TokenColumn[] = ['price', 'change', 'volume', 'liquidity', 'marketCap', 'holders'];

const COLUMNS: Record<TokenColumn, Omit<Column<Token>, 'key'>> = {
  price: { header: 'Price', align: 'right', cell: (token) => price(token.price) },
  change: { header: '24h', align: 'right', cell: (token) => <Change value={token.change24h} /> },
  volume: { header: 'Volume 24h', align: 'right', hideBelow: 'sm', cell: (token) => usd(token.volume24h) },
  liquidity: { header: 'Liquidity', align: 'right', hideBelow: 'md', cell: (token) => usd(token.liquidity) },
  marketCap: { header: 'Market cap', align: 'right', hideBelow: 'md', cell: (token) => usd(token.marketCap) },
  holders: { header: 'Holders', align: 'right', hideBelow: 'lg', cell: (token) => count(token.holders) },
  chain: {
    header: 'Chain',
    hideBelow: 'lg',
    cell: (token) => <span className="text-muted">{token.chain.name}</span>,
  },
};

export function TokenTable({
  tokens,
  columns = DEFAULT_COLUMNS,
  emptyTitle = 'No tokens found',
  emptyDetail,
}: {
  tokens: Token[];
  columns?: TokenColumn[];
  emptyTitle?: string;
  emptyDetail?: string;
}) {
  return (
    <Table
      rows={tokens}
      rowKey={(token) => `${token.chain.id}:${token.address}`}
      empty={<Empty title={emptyTitle} {...(emptyDetail ? { detail: emptyDetail } : {})} />}
      columns={[
        { key: 'token', header: 'Token', cell: (token) => <TokenCell token={token} /> },
        ...columns.map((column) => ({ key: column, ...COLUMNS[column] })),
      ]}
    />
  );
}

/** A compact list for dashboard panels, where a full table is too heavy. */
export function TokenList({
  tokens,
  metric,
}: {
  tokens: Token[];
  metric: 'change' | 'volume' | 'liquidity';
}) {
  if (tokens.length === 0) return <Empty title="Nothing to show" />;

  return (
    <div>
      <ol>
        {tokens.map((token, index) => (
          <li
            key={`${token.chain.id}:${token.address}`}
            className="flex items-center justify-between gap-3 border-t border-line py-2.5 first:border-0"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="w-4 shrink-0 text-xs text-muted">{index + 1}</span>
              <TokenCell token={token} />
            </div>
            <div className="shrink-0 text-right whitespace-nowrap">
              {metric === 'change' ? (
                <>
                  <div className="text-sm text-ink">{price(token.price)}</div>
                  <div className="text-xs">
                    <Change value={token.change24h} />
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm text-ink">
                    {usd(metric === 'volume' ? token.volume24h : token.liquidity)}
                  </div>
                  <div className="text-xs text-muted">{price(token.price)}</div>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
      <Link
        href="/markets"
        className="mt-3 inline-block text-xs text-muted transition-colors hover:text-accent"
      >
        View all markets →
      </Link>
    </div>
  );
}
