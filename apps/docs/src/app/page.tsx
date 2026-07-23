import Link from 'next/link';

import { API_URL, APP_URL, SITE_URL } from '@norien-live/web-ui';
import { CodeBlock, Container, PageHeader, Prose, Terminal } from '@norien-live/web-ui';
import { Card } from '@norien-live/web-ui';

export const metadata = {
  title: 'Documentation',
  description: 'Install the CLI, publish an agent, run it, and read the API.',
};

const SECTIONS = [
  { id: 'quickstart', label: 'Quickstart' },
  { id: 'manifest', label: 'The manifest' },
  { id: 'cli', label: 'CLI' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'tools', label: 'Tools' },
  { id: 'api', label: 'REST API' },
  { id: 'sdks', label: 'SDKs' },
];

export default function DocsPage() {
  return (
    <>
      <PageHeader
        title="Documentation"
        detail="Everything needed to publish an agent, run it locally, and read Norien's API."
      />

      <Container className="pb-20">
        <div className="grid gap-10 lg:grid-cols-[13rem_1fr]">
          <nav aria-label="Contents" className="lg:sticky lg:top-24 lg:self-start">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink">Contents</h2>
            <ul className="space-y-1.5">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="text-sm text-muted transition-colors hover:text-accent"
                  >
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>

            <div className="mt-6 border-t border-line pt-4">
              <a
                href={`${API_URL}/docs`}
                target="_blank"
                rel="noreferrer noopener"
                className="text-sm text-accent underline underline-offset-2"
              >
                OpenAPI reference ↗
              </a>
            </div>
          </nav>

          <div className="min-w-0 space-y-12">
            <Doc id="quickstart" title="Quickstart">
              <Prose>
                <p>
                  Norien runs entirely locally. The registry needs no database server — with{' '}
                  <code>DATABASE_URL</code> unset it runs an embedded Postgres, applies migrations,
                  and seeds a sample catalogue on first boot.
                </p>
              </Prose>
              <Terminal
                lines={[
                  '$ npm install',
                  '$ npm run dev',
                  '  registry listening on http://localhost:3000',
                  '',
                  '$ npm run cli:link',
                  '$ norien --help',
                ]}
              />
              <Prose>
                <p>
                  The web is three apps, each its own process on its own port:{' '}
                  <code>npm run dev:marketing</code> (3001), <code>npm run dev:app</code> (3002), and{' '}
                  <code>npm run dev:docs</code> (3003).
                </p>
              </Prose>
            </Doc>

            <Doc id="manifest" title="The manifest">
              <Prose>
                <p>
                  An <code>agent.json</code> declares what an agent is and what it needs. It is the
                  only contract between an author, the registry, and the runtime.
                </p>
              </Prose>
              <CodeBlock>{`{
  "name": "Research Agent",
  "version": "1.0.0",
  "description": "Summarises sources on a topic.",
  "runtime": "node",
  "entrypoint": "index.js",
  "commands": { "start": "node index.js", "health": "node health.js" },
  "tools": ["web-search"],
  "permissions": ["network:fetch"],
  "environment": [
    { "name": "OPENAI_API_KEY", "required": true, "secret": true }
  ]
}`}</CodeBlock>
              <Prose>
                <p>
                  Validate one against the live registry on the{' '}
                  <Link href={`${APP_URL}/publish`}>publish page</Link> — it resolves your declared
                  tools
                  against the real catalogue and tells you whether publishing would succeed.
                </p>
              </Prose>
            </Doc>

            <Doc id="cli" title="CLI">
              <Prose>
                <p>
                  Every command supports <code>--json</code>, and stdout stays pure JSON while
                  spinners and diagnostics go to stderr — so the CLI composes with <code>jq</code> and
                  CI without special-casing.
                </p>
              </Prose>
              <Terminal
                lines={[
                  '$ norien search trading',
                  '$ norien info trading-agent',
                  '$ norien install trading-agent',
                  '$ norien run trading-agent',
                  '$ norien logs trading-agent -f',
                  '$ norien doctor',
                ]}
              />
              <Prose>
                <p>
                  Exit codes: <code>0</code> success, <code>1</code> error, <code>2</code> bad usage,{' '}
                  <code>3</code> not authenticated, <code>4</code> not found, <code>5</code>{' '}
                  validation or dependency failure.
                </p>
              </Prose>
            </Doc>

            <Doc id="runtime" title="Runtime">
              <Prose>
                <p>
                  The supervisor is a separate process from the registry — a shared catalogue must
                  never execute user code. It detects the runtime, validates declared permissions,
                  injects tools and environment, probes health, and restarts crashes with a loop cap
                  so a failing agent cannot spin forever.
                </p>
                <p>
                  Status and health are separate axes: status is what the supervisor is doing with the
                  process, health is what the agent reports about itself. A process can be{' '}
                  <code>running</code> and <code>unhealthy</code>.
                </p>
              </Prose>
              <Terminal
                lines={[
                  '$ norien runtime start',
                  '$ norien run research-agent',
                  '$ norien status',
                  '$ norien restart research-agent',
                  '$ norien stop research-agent',
                ]}
              />
            </Doc>

            <Doc id="tools" title="Tools">
              <Prose>
                <p>
                  A tool is a plugin, never a special case in the runtime. It declares its input and
                  output as JSON Schema, its runtime (<code>node</code>, <code>python</code>, or{' '}
                  <code>http</code>), its permissions, and the environment it needs.
                </p>
                <p>
                  The protocol is one thing: JSON arrives on stdin as{' '}
                  <code>{'{ input, context }'}</code>, JSON leaves on stdout as{' '}
                  <code>{'{ output }'}</code> or <code>{'{ error }'}</code>, and logs go to stderr. An{' '}
                  <code>http</code> tool proxies to a URL with placeholder substitution instead — the
                  caller cannot tell the difference.
                </p>
              </Prose>
              <Terminal
                lines={[
                  '$ norien tool search wallet',
                  '$ norien tool info http-client',
                  '$ norien tool install http-client',
                  '$ norien tool publish',
                ]}
              />
            </Doc>

            <Doc id="api" title="REST API">
              <Prose>
                <p>
                  Two surfaces, one server. The registry endpoints serve Norien's own records; the{' '}
                  <code>/api/*</code> endpoints serve normalized external data with provenance
                  attached.
                </p>
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
GET  /api/token/:address        GET  /api/search
GET  /api/projects              GET  /api/chain
GET  /api/project/:slug         GET  /api/providers`}</CodeBlock>
              <Prose>
                <p>
                  Every <code>/api/*</code> response carries <code>sources</code> and{' '}
                  <code>degraded</code>. If a provider fails the request still succeeds with whatever
                  the others returned — a partial answer is visibly partial rather than quietly
                  incomplete.
                </p>
              </Prose>
              <CodeBlock>{`{
  "data": { "symbol": "USDG", "price": 1.0002, "holders": 31579 },
  "sources": [
    { "provider": "codex",      "status": "ok", "ms": 210 },
    { "provider": "coingecko",  "status": "skipped", "reason": "no platform mapping" }
  ],
  "degraded": false
}`}</CodeBlock>
            </Doc>

            <Doc id="sdks" title="SDKs">
              <Prose>
                <p>
                  TypeScript and Python, with matching ergonomics. Both wrap the same REST API, walk
                  pages via <code>paginate</code>, retry transient GET failures with backoff, and
                  raise a typed error carrying the registry's envelope.
                </p>
              </Prose>
              <div className="grid gap-4 lg:grid-cols-2">
                <CodeBlock>{`import { Norien } from '@norien-live/sdk';

const client = new Norien(API_KEY);

await client.search('trading');
await client.install('trading-agent');
await client.tokens.list({ limit: 20 });
await client.projects.get('aave');`}</CodeBlock>
                <CodeBlock>{`from norien import Norien

client = Norien(API_KEY)

client.search("trading")
client.install("trading-agent")
client.tokens.list(limit=20)
client.projects.get("aave")`}</CodeBlock>
              </div>
              <Prose>
                <p>
                  The Python SDK has zero dependencies; the TypeScript SDK has one.
                </p>
              </Prose>
            </Doc>

            <Card>
              <h2 className="text-base font-semibold tracking-tight text-ink">Still stuck?</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-xs text-ink">
                  norien doctor
                </code>{' '}
                checks the API, your manifest, dependencies, installed runtimes, and configuration,
                and tells you which one is wrong. If that does not resolve it,{' '}
                <Link href={`${SITE_URL}/contact`} className="text-accent underline underline-offset-2">
                  get in touch
                </Link>
                .
              </p>
            </Card>
          </div>
        </div>
      </Container>
    </>
  );
}

function Doc({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
      {children}
    </section>
  );
}

