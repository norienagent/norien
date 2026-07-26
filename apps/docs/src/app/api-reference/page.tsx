import { API_URL, CodeBlock, Prose } from '@norien-live/web-ui';

import { DocPage, Note } from '../doc-page';

export const metadata = { title: 'REST API' };

export default function ApiReferencePage() {
  return (
    <DocPage
      href="/api-reference"
      title="REST API"
      lead="Two surfaces, one server: registry endpoints for Norien's own records, and /api/* for normalized external data with provenance."
    >
      <Prose>
        <p>
          Everything in Norien is a thin client over this API. Reads are public and need no
          credential; writes (publishing) need a Bearer key. The base URL is{' '}
          <code>{API_URL}</code>.
        </p>

        <h2>Endpoints</h2>
      </Prose>
      <CodeBlock>{`# Registry
GET  /agents                    GET  /tools
GET  /agents/:slug              GET  /tools/:slug
GET  /agents/:slug/versions     GET  /tools/:slug/versions
GET  /agents/:slug/runtime      POST /runtime/inspect
GET  /search                    POST /publish

# Unified data
GET  /api/tokens                GET  /api/contracts/:address
GET  /api/trending              GET  /api/wallets/:address
GET  /api/new                   GET  /api/search
GET  /api/signals               GET  /api/chain
GET  /api/token/:address        GET  /api/providers
GET  /api/token/:address/chart
GET  /api/projects              POST /api/signals/brief  (SSE)
GET  /api/project/:slug

# Account
GET  /api/keys                  POST /api/keys
DELETE /api/keys/:id`}</CodeBlock>

      <Prose>
        <h2>The envelope</h2>
        <p>
          Every <code>/api/*</code> response carries <code>sources</code> and <code>degraded</code>.
          If a provider fails the request still succeeds with whatever the others returned — a partial
          answer is visibly partial rather than quietly incomplete.
        </p>
      </Prose>
      <CodeBlock>{`{
  "data": { "symbol": "USDG", "price": 1.0002, "holders": 31579 },
  "sources": [
    { "provider": "market-data", "status": "ok", "ms": 210 },
    { "provider": "price-feed",  "status": "skipped", "reason": "no platform mapping" }
  ],
  "degraded": false
}`}</CodeBlock>

      <Prose>
        <h2>Authentication</h2>
        <p>
          Send a key as a Bearer token: <code>Authorization: Bearer norien_…</code>. Create and revoke
          keys on the app&apos;s API Keys page.
        </p>
      </Prose>

      <Note>
        The live, always-current OpenAPI document and Swagger UI are served at{' '}
        <a href={`${API_URL}/docs`} target="_blank" rel="noreferrer noopener">
          {API_URL}/docs
        </a>
        .
      </Note>
    </DocPage>
  );
}
