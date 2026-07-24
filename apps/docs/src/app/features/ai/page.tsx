import Link from 'next/link';

import { API_URL, APP_URL, CodeBlock, Prose } from '@norien-live/web-ui';

import { DocPage, Note } from '../../doc-page';

export const metadata = { title: 'AI manifest generator' };

export default function AiFeaturePage() {
  return (
    <DocPage
      href="/features/ai"
      title="AI manifest generator"
      lead="Describe an agent in plain English and get a draft agent.json — a starting point you refine, then validate, before publishing."
    >
      <Prose>
        <p>
          Writing a manifest by hand is a small barrier to publishing. Describe what your agent does
          and a fast LLM drafts a valid <Link href="/concepts/manifest">agent.json</Link>: it picks a
          runtime, an entrypoint, sensible tools and permissions, and the environment variables the
          agent will need. You then edit and validate it — the draft is never published for you.
        </p>

        <h2>In the app</h2>
        <p>
          On the <a href={`${APP_URL}/publish`}>Publish</a> page, use{' '}
          <strong>Generate from a description</strong>. Type a sentence or tap an example, hit{' '}
          <strong>Generate ✨</strong>, and the <code>agent.json</code> editor below fills in. Refine
          it, then <strong>Validate manifest</strong> to check it against the live registry.
        </p>
      </Prose>

      <Note>
        The draft is a starting point, not a finished agent. Review the tools, permissions, and
        environment — and write the actual code — before publishing.
      </Note>

      <Prose>
        <h2>From the API</h2>
        <p>Send a description; get a manifest object back.</p>
      </Prose>
      <CodeBlock>{`POST ${API_URL}/api/ai/manifest`}</CodeBlock>
      <CodeBlock>{`curl -X POST ${API_URL}/api/ai/manifest \\
  -H "Content-Type: application/json" \\
  -d '{ "description": "A Node.js agent that alerts Discord on large wallet transfers" }'`}</CodeBlock>
      <CodeBlock>{`{
  "manifest": {
    "name": "Wallet Watcher",
    "version": "0.1.0",
    "description": "Alerts a Discord channel on large wallet transfers",
    "runtime": "node",
    "entrypoint": "index.js",
    "commands": { "start": "node index.js", "health": "node health.js" },
    "tools": ["discord-webhook", "ethereum-rpc"],
    "permissions": ["network:fetch"],
    "environment": [
      { "name": "DISCORD_WEBHOOK_URL", "required": true, "secret": true }
    ]
  }
}`}</CodeBlock>

      <Prose>
        <h2>Then publish</h2>
        <p>
          Once the draft is right and validated, publish it the usual way — see{' '}
          <Link href="/guides/publishing">Publishing agents</Link>.
        </p>
      </Prose>
    </DocPage>
  );
}
