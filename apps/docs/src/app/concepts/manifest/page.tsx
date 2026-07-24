import Link from 'next/link';

import { APP_URL, CodeBlock, Prose } from '@norien-live/web-ui';

import { DocPage, Note } from '../../doc-page';

export const metadata = { title: 'The manifest' };

export default function ManifestConceptPage() {
  return (
    <DocPage
      href="/concepts/manifest"
      title="The manifest"
      lead="An agent.json declares what an agent is and what it needs — the only contract between an author, the registry, and the runtime."
    >
      <Prose>
        <p>
          Everything Norien knows about an agent comes from its manifest. It is small, declarative,
          and the single source of truth: the registry validates and stores it, and the runtime reads
          it to know what to inject and enforce.
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
        <h2>Fields</h2>
        <ul>
          <li>
            <strong>runtime</strong> — <code>node</code> or <code>python</code>; how the supervisor
            launches it.
          </li>
          <li>
            <strong>commands</strong> — <code>start</code> to run, <code>health</code> to report
            health. Status and health are <Link href="/concepts/runtime">separate axes</Link>.
          </li>
          <li>
            <strong>tools</strong> — slugs resolved against the registry at install time.
          </li>
          <li>
            <strong>permissions</strong> — the capabilities the agent is granted; anything undeclared
            is denied.
          </li>
          <li>
            <strong>environment</strong> — required and optional variables, with secrets marked so
            they are never logged.
          </li>
        </ul>
      </Prose>

      <Note>
        Validate a manifest against the live registry on the{' '}
        <a href={`${APP_URL}/publish`}>publish page</a> before shipping — it resolves your declared
        tools against the real catalogue and tells you whether publishing would succeed.
      </Note>
    </DocPage>
  );
}
