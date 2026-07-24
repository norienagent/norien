import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { env } from '../config/env.js';

/**
 * A branded landing page at the API root.
 *
 * `api.norien.live/` is the first thing a curious developer hits; a raw 404
 * JSON is a poor welcome. This serves a small, self-contained page in the
 * Norien design system that points at the interactive reference and the rest of
 * the product — consistent with the marketing site, app, and docs.
 */
export const rootRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { schema: { hide: true } }, async (_request, reply) => {
    reply.type('text/html; charset=utf-8').send(page(env.PUBLIC_BASE_URL));
  });
};

function page(base: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Norien API</title>
<meta name="description" content="The unified registry, runtime, and data API for AI agents on Robinhood Chain." />
<style>
  :root {
    --canvas:#F6F2EA; --card:#fff; --line:#DDD2C2; --ink:#2E261F; --muted:#6C6257;
    --accent:#7A5A3A; --accent-hover:#634829; --code:#2E261F; --code-fg:#E9E0D2; --code-prompt:#B99B73;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; background:var(--canvas); color:var(--ink);
    font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
    -webkit-font-smoothing:antialiased; line-height:1.5;
  }
  .wrap { max-width:44rem; margin:0 auto; padding:16px; }
  header { display:flex; align-items:center; gap:10px; padding:28px 0 8px; }
  .mark { width:26px; height:26px; }
  .word { font-size:1.15rem; font-weight:600; letter-spacing:-.02em; }
  .word span { color:var(--accent); }
  h1 { font-size:2rem; line-height:1.1; letter-spacing:-.02em; margin:36px 0 0; }
  @media (min-width:640px){ h1 { font-size:2.5rem; } }
  .lead { color:var(--muted); font-size:1.05rem; margin:14px 0 0; max-width:34rem; }
  .row { display:flex; flex-wrap:wrap; gap:10px; margin:26px 0 0; }
  a.btn {
    display:inline-flex; align-items:center; gap:8px; min-height:40px; padding:9px 16px; border-radius:10px;
    font-size:.9rem; font-weight:500; text-decoration:none; border:1px solid var(--line); transition:.15s;
  }
  a.primary { background:var(--accent); color:#fff; border-color:var(--accent); }
  a.primary:hover { background:var(--accent-hover); }
  a.secondary { background:var(--card); color:var(--ink); }
  a.secondary:hover { border-color:var(--accent); }
  pre {
    margin:26px 0 0; background:var(--code); color:var(--code-fg); border-radius:12px;
    padding:16px; overflow-x:auto; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    font-size:.85rem; line-height:1.6;
  }
  pre .p { color:var(--code-prompt); }
  .grid { display:grid; gap:12px; margin:28px 0 0; }
  @media (min-width:640px){ .grid { grid-template-columns:1fr 1fr; } }
  .item { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; }
  .item h3 { margin:0; font-size:.95rem; }
  .item p { margin:6px 0 0; color:var(--muted); font-size:.85rem; }
  .item code { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:.8rem; color:var(--accent); }
  footer { margin:40px 0 28px; padding-top:20px; border-top:1px solid var(--line); color:var(--muted); font-size:.82rem;
           display:flex; flex-wrap:wrap; gap:14px; }
  footer a { color:var(--accent); text-decoration:none; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <svg class="mark" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="6" y="2.5" width="8" height="4" rx="1.25" fill="#7A5A3A" opacity=".45"/>
        <rect x="3.5" y="8" width="13" height="4" rx="1.25" fill="#7A5A3A" opacity=".72"/>
        <rect x="1" y="13.5" width="18" height="4" rx="1.25" fill="#7A5A3A"/>
      </svg>
      <span class="word">nor<span>ien</span> · API</span>
    </header>

    <h1>The Norien API</h1>
    <p class="lead">One unified surface — the agent registry, the tool marketplace, and normalized market &amp; on-chain data for Robinhood Chain. Reads are public and free.</p>

    <div class="row">
      <a class="btn primary" href="/docs">Interactive reference →</a>
      <a class="btn secondary" href="https://docs.norien.live">Documentation</a>
      <a class="btn secondary" href="https://norien.live">Main site</a>
    </div>

    <pre><span class="p">$</span> curl ${base}/api/tokens?limit=5
<span class="p">$</span> curl ${base}/agents
<span class="p">$</span> curl ${base}/health</pre>

    <div class="grid">
      <div class="item"><h3>Registry</h3><p>Agents &amp; tools by slug and version. <code>/agents</code> · <code>/tools</code></p></div>
      <div class="item"><h3>Unified data</h3><p>Tokens, projects, wallets, contracts. <code>/api/*</code></p></div>
      <div class="item"><h3>Search</h3><p>Across both catalogues. <code>/search</code></p></div>
      <div class="item"><h3>Health</h3><p>Liveness &amp; database check. <code>/health</code></p></div>
    </div>

    <footer>
      <a href="/docs">OpenAPI reference</a>
      <a href="/docs/json">OpenAPI document</a>
      <a href="https://app.norien.live">App</a>
      <a href="https://github.com/norienagent/norien">GitHub</a>
      <span>© ${new Date().getFullYear()} Norien</span>
    </footer>
  </div>
</body>
</html>`;
}
