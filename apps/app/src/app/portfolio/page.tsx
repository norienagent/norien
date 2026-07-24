import { Card, SectionHeading } from '@norien-live/web-ui';

import { PortfolioForm } from './form';

export const metadata = { title: 'Portfolio' };

/**
 * Cross-chain portfolio lookup.
 *
 * Enter any wallet address to see its priced token holdings and native balances
 * across the major EVM chains — Norien's native data is Robinhood Chain, this
 * widens it via Alchemy.
 */
export default function PortfolioPage() {
  return (
    <>
      <SectionHeading
        title="Portfolio"
        detail="A wallet’s holdings across Ethereum, Base, Arbitrum, Optimism, and Polygon."
      />

      <Card>
        <PortfolioForm />
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Paste any wallet address. You’ll get its total net worth, a per-chain breakdown, native
          balances, and every priced token it holds — aggregated across five chains.
        </p>
      </Card>
    </>
  );
}
