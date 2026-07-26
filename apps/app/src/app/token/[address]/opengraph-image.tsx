import { api } from '@norien-live/web-ui/api';
import { price, usd } from '@norien-live/web-ui';

import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from '../../../lib/og-card';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Token on Robinhood Chain — Norien';

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const result = await api.token(address);
  const token = result?.data;

  if (!token) {
    return ogCard({ eyebrow: 'Robinhood Chain', title: 'Token', subtitle: address });
  }

  return ogCard({
    eyebrow: token.chain.name,
    title: token.name,
    subtitle: token.symbol,
    stats: [
      { label: 'Price', value: price(token.price) },
      { label: 'Market cap', value: usd(token.marketCap) },
      {
        label: '24h',
        value: token.change24h != null ? `${token.change24h >= 0 ? '+' : ''}${token.change24h.toFixed(2)}%` : '—',
      },
    ],
  });
}
