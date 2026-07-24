import Link from 'next/link';

import { CodeBlock, Prose } from '@norien-live/web-ui';

import { Cols, DocPage, Note } from '../doc-page';

export const metadata = { title: 'SDKs' };

export default function SdkReferencePage() {
  return (
    <DocPage
      href="/sdk"
      title="SDKs"
      lead="TypeScript and Python, with matching ergonomics — both thin, typed wrappers over the same REST API."
    >
      <Prose>
        <p>
          Both SDKs wrap the same endpoints, walk pages via <code>paginate</code>, retry transient GET
          failures with backoff, and raise a typed error carrying the registry&apos;s envelope. The
          Python SDK has zero dependencies; the TypeScript SDK has one.
        </p>
      </Prose>

      <Cols>
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
      </Cols>

      <Prose>
        <h2>Install</h2>
      </Prose>
      <Cols>
        <CodeBlock>{`npm install @norien-live/sdk`}</CodeBlock>
        <CodeBlock>{`pip install norien`}</CodeBlock>
      </Cols>

      <Note>
        The <code>API_KEY</code> is optional for reads and required for writes — create one on the API
        Keys page. Endpoints and shapes are in the <Link href="/api-reference">REST API reference</Link>.
      </Note>
    </DocPage>
  );
}
