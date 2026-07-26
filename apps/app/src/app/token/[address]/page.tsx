import Link from 'next/link';

import { api } from '@norien-live/web-ui/api';
import { count, dash, price, shortAddress, usd } from '@norien-live/web-ui';
import { Badge, Card, Change, DegradedNotice, MissingResource, Row, SourceList, Stat, TokenLogo } from '@norien-live/web-ui';

import { PriceChart } from '../../../components/price-chart';
import { WatchButton } from '../../../components/watch-button';

/**
 * Token detail.
 *
 * One normalized record assembled server-side from market data, metadata, and
 * on-chain identity — the page never knows which provider supplied which field.
 */
export default async function TokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ chainId?: string }>;
}) {
  const { address } = await params;
  const { chainId } = await searchParams;

  const result = await api.token(address, chainId ? Number.parseInt(chainId, 10) : undefined);
  if (!result) return <MissingResource kind="Token" identifier={address} />;

  const token = result.data;
  const links = token.links;
  const chart = await api.tokenChart(token.address, { range: '7d', chainId: token.chain.id });

  return (
    <>
      <header className="mb-6 flex items-center gap-4">
        <TokenLogo src={token.logo} symbol={token.symbol} className="size-12" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">
            {token.name} <span className="font-normal text-muted">{token.symbol}</span>
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {token.chain.name} ·{' '}
            <span className="font-mono">{shortAddress(token.address, 8)}</span>
          </p>
        </div>
        <WatchButton
          variant="labelled"
          token={{
            address: token.address,
            chainId: token.chain.id,
            symbol: token.symbol,
            name: token.name,
          }}
        />
      </header>

      <DegradedNotice sources={result.sources} degraded={result.degraded} />

      <div className="mb-4">
        <PriceChart
          address={token.address}
          chainId={token.chain.id}
          initial={chart?.data ?? null}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Price" value={price(token.price)} hint={<Change value={token.change24h} />} />
        <Stat
          label="Market cap"
          value={usd(token.marketCap)}
          hint={token.fdv ? `FDV ${usd(token.fdv)}` : undefined}
        />
        <Stat label="Liquidity" value={usd(token.liquidity)} />
        <Stat
          label="Holders"
          value={count(token.holders)}
          hint={token.txns24h ? `${count(token.txns24h)} txns 24h` : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Market">
          <dl>
            <Row label="Volume 24h">{usd(token.volume24h)}</Row>
            <Row label="24h change">
              <Change value={token.change24h} />
            </Row>
            <Row label="Market cap">{usd(token.marketCap)}</Row>
            <Row label="Fully diluted">{usd(token.fdv)}</Row>
            <Row label="Liquidity">{usd(token.liquidity)}</Row>
            <Row label="Transactions 24h">{count(token.txns24h)}</Row>
          </dl>
        </Card>

        <Card title="Supply & contract">
          <dl>
            <Row label="Circulating">{count(token.circulatingSupply ?? token.totalSupply ?? null)}</Row>
            <Row label="Max supply">{count(token.maxSupply)}</Row>
            <Row label="Decimals">{token.decimals ?? dash}</Row>
            <Row label="Chain">
              {token.chain.name} <span className="text-muted">({token.chain.id})</span>
            </Row>
            <Row label="Contract">
              <Link
                href={`/contract/${token.address}`}
                className="font-mono text-xs break-all text-accent underline underline-offset-2"
              >
                {token.address}
              </Link>
            </Row>
          </dl>
        </Card>
      </div>

      {token.categories && token.categories.length > 0 ? (
        <div className="mt-4">
          <Card title="Categories">
            <div className="flex flex-wrap gap-2">
              {token.categories.map((category) => (
                <Badge key={category}>{category}</Badge>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {token.description ? (
        <div className="mt-4">
          <Card title="About">
            <p className="max-w-3xl text-sm leading-relaxed text-muted">{token.description}</p>
          </Card>
        </div>
      ) : null}

      {links && (links.website || links.twitter || links.telegram || links.explorer) ? (
        <div className="mt-4">
          <Card title="Links">
            <div className="flex flex-wrap gap-2">
              {links.website ? <ExternalLink href={links.website} label="Website" /> : null}
              {links.twitter ? <ExternalLink href={links.twitter} label="Twitter" /> : null}
              {links.telegram ? <ExternalLink href={links.telegram} label="Telegram" /> : null}
              {links.explorer ? <ExternalLink href={links.explorer} label="Explorer" /> : null}
            </div>
          </Card>
        </div>
      ) : null}

      <div className="mt-5">
        <SourceList sources={result.sources} />
      </div>
    </>
  );
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-sunken"
    >
      {label} ↗
    </a>
  );
}
