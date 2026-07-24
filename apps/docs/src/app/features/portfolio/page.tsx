import Link from 'next/link';

import { API_URL, APP_URL, CodeBlock, Prose } from '@norien-live/web-ui';

import { DocPage, Note } from '../../doc-page';

export const metadata = { title: 'Multi-chain portfolio' };

export default function PortfolioFeaturePage() {
  return (
    <DocPage
      href="/features/portfolio"
      title="Multi-chain portfolio"
      lead="Any wallet's priced holdings — native coins and ERC-20s — across Ethereum, Base, Arbitrum, Optimism, and Polygon, with a total and a per-chain breakdown."
    >
      <Prose>
        <p>
          Norien's native data is Robinhood Chain. The portfolio widens that: paste any address and
          get its full picture across the major EVM chains in one view — net worth, what it holds on
          each chain, native balances, and every priced token. Spam and sub-cent dust are filtered
          out automatically.
        </p>

        <h2>In the app</h2>
        <p>
          Open <a href={`${APP_URL}/portfolio`}>Portfolio</a> in the sidebar, paste a{' '}
          <code>0x…</code> address, and hit <strong>View portfolio</strong>. You get:
        </p>
        <ul>
          <li>
            <strong>Net worth</strong> — the total USD value across all five chains.
          </li>
          <li>
            <strong>By chain</strong> — a bar breakdown of value per chain.
          </li>
          <li>
            <strong>Native balances</strong> — ETH / POL held on each chain, priced.
          </li>
          <li>
            <strong>Tokens</strong> — every priced ERC-20, with balance, price, and value.
          </li>
        </ul>
      </Prose>

      <Note>
        A direct link works too: <code>{APP_URL}/portfolio/0x…</code> jumps straight to an address.
      </Note>

      <Prose>
        <h2>From the API</h2>
        <p>
          One public, unauthenticated endpoint. Every value is USD; the response carries its usual{' '}
          <Link href="/concepts/api">sources / degraded</Link> envelope.
        </p>
      </Prose>
      <CodeBlock>{`GET ${API_URL}/api/portfolio/:address`}</CodeBlock>
      <CodeBlock>{`curl ${API_URL}/api/portfolio/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`}</CodeBlock>
      <CodeBlock>{`{
  "data": {
    "address": "0x…",
    "totalUsd": 19048.12,
    "chains": [ { "label": "Ethereum", "usd": 12478.5 }, … ],
    "native": [ { "chainLabel": "Ethereum", "symbol": "ETH", "balance": "6.63", "usd": 12478.5 }, … ],
    "tokens": [ { "networkLabel": "Base", "symbol": "USDC", "balance": "1200", "usd": 1200.4 }, … ]
  },
  "sources": [ { "provider": "market-data", "status": "ok" } ],
  "degraded": false
}`}</CodeBlock>

      <Prose>
        <h2>Chains covered</h2>
        <p>
          Ethereum, Base, Arbitrum, Optimism, and Polygon. Only positions with a real USD price are
          shown, so the list stays meaningful rather than flooded with airdrop spam.
        </p>
      </Prose>

      <Note type="warn">
        A wallet with thousands of tokens may not show every ERC-20 — the priced, non-dust holdings
        come first. Native balances and the total are always complete.
      </Note>
    </DocPage>
  );
}
