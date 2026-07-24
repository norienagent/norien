import Link from 'next/link';

import { CodeBlock, Prose } from '@norien-live/web-ui';

import { DocPage, Note } from '../../doc-page';

export const metadata = { title: 'Unified data API' };

export default function ApiConceptPage() {
  return (
    <DocPage
      href="/concepts/api"
      title="Unified data API"
      lead="One normalized surface over market and on-chain data — with provenance attached, and partial answers that are visibly partial."
    >
      <Prose>
        <p>
          An agent that acts on markets or a chain needs data from several providers, each with its
          own shape, auth, rate limit, and outages. Norien aggregates them behind one surface. The
          app, the CLI, and the SDKs all read these <code>/api/*</code> endpoints — nothing outside
          the aggregator reaches a third party.
        </p>

        <h2>Provenance on every response</h2>
        <p>
          Every response carries <code>sources</code> and <code>degraded</code>. If a provider fails,
          the request still succeeds with whatever the others returned — a partial answer is labeled
          partial, never presented as complete.
        </p>
        <CodeBlock>{`{
  "data": { "symbol": "USDG", "price": 1.0002, "holders": 31579 },
  "sources": [
    { "provider": "market-data", "status": "ok", "ms": 210 },
    { "provider": "price-feed",  "status": "skipped", "reason": "no platform mapping" }
  ],
  "degraded": false
}`}</CodeBlock>

        <h2>What it covers</h2>
        <CodeBlock>{`GET /api/tokens                GET /api/contracts/:address
GET /api/trending              GET /api/wallets/:address
GET /api/token/:address        GET /api/search
GET /api/projects              GET /api/chain
GET /api/project/:slug         GET /api/providers`}</CodeBlock>
      </Prose>

      <Note>
        Full request and response shapes are in the <Link href="/api-reference">REST API reference</Link>{' '}
        and the live OpenAPI document at <code>api.norien.live/docs</code>.
      </Note>
    </DocPage>
  );
}
