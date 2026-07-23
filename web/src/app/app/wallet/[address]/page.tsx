import Link from 'next/link';

import { api, type TokenTransfer, type Transaction } from '@/lib/api';
import { count, relativeTime, shortAddress, tokenAmount } from '@/lib/format';
import { Table } from '@/components/table';
import { Badge, Card, DegradedNotice, Empty, ErrorState, SectionHeading, SourceList, Stat } from '@/components/ui';

/**
 * Wallet detail.
 *
 * Holdings are derived from observed token transfers, because the chain has no
 * "list my tokens" primitive: every ERC-20 balance lives in its own contract.
 * The label says "tokens seen", not "portfolio value", since a transfer history
 * proves interaction rather than a current balance.
 */
export default async function WalletPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const result = await api.wallet(address, 25).catch(() => null);

  if (!result) {
    return (
      <>
        <SectionHeading title="Wallet" />
        <Card>
          <ErrorState
            title="Could not load this wallet"
            detail="The chain node or explorer is unreachable."
          />
        </Card>
      </>
    );
  }

  const wallet = result.data;
  const holdings = summariseHoldings(wallet.tokenTransfers, wallet.address);

  return (
    <>
      <SectionHeading title="Wallet" />
      <p className="-mt-3 mb-5 font-mono text-sm break-all text-muted">{wallet.address}</p>

      <DegradedNotice sources={result.sources} degraded={result.degraded} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Balance" value={trim(wallet.balanceFormatted)} hint={wallet.chain.name} />
        <Stat label="Nonce" value={count(wallet.nonce)} hint="transactions sent" />
        <Stat label="Type" value={wallet.isContract ? 'Contract' : 'Wallet'} />
        <Stat label="Tokens seen" value={count(holdings.length)} hint="from transfer history" />
      </div>

      <div className="mt-4">
        <Card title="Portfolio summary" padded={false}>
          <Table
            rows={holdings}
            rowKey={(holding) => holding.address}
            empty={
              <Empty title="No token activity" detail="This address has no recorded token transfers." />
            }
            columns={[
              {
                key: 'token',
                header: 'Token',
                cell: (holding) => (
                  <Link
                    href={`/app/token/${holding.address}`}
                    className="font-medium text-ink hover:text-accent"
                  >
                    {holding.symbol ?? shortAddress(holding.address)}
                  </Link>
                ),
              },
              {
                key: 'received',
                header: 'Received',
                align: 'right',
                cell: (holding) => (
                  <span className="text-up">
                    {tokenAmount(holding.received.toString(), holding.decimals)}
                  </span>
                ),
              },
              {
                key: 'sent',
                header: 'Sent',
                align: 'right',
                cell: (holding) => (
                  <span className="text-down">
                    {tokenAmount(holding.sent.toString(), holding.decimals)}
                  </span>
                ),
              },
              {
                key: 'transfers',
                header: 'Transfers',
                align: 'right',
                hideBelow: 'sm',
                cell: (holding) => count(holding.transfers),
              },
            ]}
          />
        </Card>
      </div>

      <div className="mt-4">
        <Card title={`Transactions (${wallet.transactions.length})`} padded={false}>
          <Table
            rows={wallet.transactions}
            rowKey={(tx: Transaction) => tx.hash}
            empty={
              <Empty title="No transactions" detail="This address has not transacted on this chain." />
            }
            columns={[
              {
                key: 'hash',
                header: 'Hash',
                cell: (tx) => <span className="font-mono text-xs">{shortAddress(tx.hash, 8)}</span>,
              },
              {
                key: 'from',
                header: 'From',
                hideBelow: 'sm',
                cell: (tx) => <AddressLink address={tx.from} />,
              },
              {
                key: 'to',
                header: 'To',
                cell: (tx) =>
                  tx.to ? (
                    <AddressLink address={tx.to} />
                  ) : (
                    <span className="text-muted">contract creation</span>
                  ),
              },
              {
                key: 'block',
                header: 'Block',
                align: 'right',
                hideBelow: 'md',
                cell: (tx) => count(tx.blockNumber),
              },
              {
                key: 'status',
                header: 'Status',
                cell: (tx) => (
                  <Badge tone={tx.success ? 'up' : 'down'}>{tx.success ? 'success' : 'failed'}</Badge>
                ),
              },
              {
                key: 'when',
                header: 'When',
                align: 'right',
                hideBelow: 'lg',
                cell: (tx) => <span className="text-muted">{relativeTime(tx.timestamp)}</span>,
              },
            ]}
          />
        </Card>
      </div>

      <div className="mt-4">
        <Card title={`Token transfers (${wallet.tokenTransfers.length})`} padded={false}>
          <Table
            rows={wallet.tokenTransfers}
            rowKey={(transfer, index) => `${transfer.hash}:${index}`}
            empty={<Empty title="No token transfers" />}
            columns={[
              {
                key: 'token',
                header: 'Token',
                cell: (transfer) => (
                  <Link
                    href={`/app/token/${transfer.tokenAddress}`}
                    className="font-medium text-ink hover:text-accent"
                  >
                    {transfer.tokenSymbol ?? shortAddress(transfer.tokenAddress)}
                  </Link>
                ),
              },
              {
                key: 'amount',
                header: 'Amount',
                align: 'right',
                cell: (transfer) => tokenAmount(transfer.value, transfer.tokenDecimals),
              },
              {
                key: 'from',
                header: 'From',
                hideBelow: 'sm',
                cell: (transfer) => <AddressLink address={transfer.from} />,
              },
              {
                key: 'to',
                header: 'To',
                hideBelow: 'sm',
                cell: (transfer) => <AddressLink address={transfer.to} />,
              },
              {
                key: 'when',
                header: 'When',
                align: 'right',
                hideBelow: 'md',
                cell: (transfer) => <span className="text-muted">{relativeTime(transfer.timestamp)}</span>,
              },
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

function AddressLink({ address }: { address: string }) {
  return (
    <Link href={`/app/address/${address}`} className="font-mono text-xs text-accent hover:underline">
      {shortAddress(address)}
    </Link>
  );
}

interface Holding {
  address: string;
  symbol: string | null;
  decimals: number | null;
  received: bigint;
  sent: bigint;
  transfers: number;
}

/**
 * Aggregates transfer history per token, using bigint to stay exact — token
 * amounts routinely exceed Number precision.
 *
 * Direction is decided per row by comparing against the wallet being viewed:
 * the same address appears on both sides of its own transfers, so a transfer is
 * only "received" when this wallet is the recipient.
 */
function summariseHoldings(transfers: TokenTransfer[], owner: string): Holding[] {
  const wallet = owner.toLowerCase();
  const byToken = new Map<string, Holding>();

  for (const transfer of transfers) {
    const key = transfer.tokenAddress.toLowerCase();
    const existing = byToken.get(key) ?? {
      address: key,
      symbol: transfer.tokenSymbol,
      decimals: transfer.tokenDecimals,
      received: 0n,
      sent: 0n,
      transfers: 0,
    };

    let amount = 0n;
    try {
      amount = BigInt(transfer.value);
    } catch {
      // A non-numeric value contributes nothing rather than failing the page.
      amount = 0n;
    }

    if (transfer.to.toLowerCase() === wallet) existing.received += amount;
    if (transfer.from.toLowerCase() === wallet) existing.sent += amount;

    existing.transfers += 1;
    byToken.set(key, existing);
  }

  return [...byToken.values()].sort((a, b) => b.transfers - a.transfers);
}

/** Trims trailing zeros from a fixed-point balance without losing precision. */
function trim(value: string): string {
  if (!value.includes('.')) return value;
  const trimmed = value.replace(/0+$/, '').replace(/\.$/, '');
  const [whole = '0', fraction] = trimmed.split('.');
  return fraction ? `${whole}.${fraction.slice(0, 8)}` : whole;
}
