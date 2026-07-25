import Link from 'next/link';

import { API_URL, APP_URL, CodeBlock, Prose } from '@norien-live/web-ui';

import { DocPage, Note } from '../../doc-page';

export const metadata = { title: 'Chat with an agent' };

export default function ChatFeaturePage() {
  return (
    <DocPage
      href="/features/chat"
      title="Chat with an agent"
      lead="Talk to any published agent in character. Its manifest becomes the persona; a fast LLM supplies the conversation."
    >
      <Prose>
        <p>
          Every agent in the registry can be talked to. The agent&apos;s{' '}
          <Link href="/concepts/manifest">manifest</Link> — its name, description, and declared tools
          — is turned into a persona, and the model answers as that agent. It reasons about the tools
          it has and stays in character.
        </p>
      </Prose>

      <Note type="warn">
        This is a <strong>preview</strong>. The chat talks and reasons as the agent, but it does not
        run the agent&apos;s published code or perform any on-chain transaction — running an agent for
        real is the local <Link href="/concepts/runtime">runtime&apos;s</Link> job.
      </Note>

      <Prose>
        <h2>In the app</h2>
        <p>
          Open any agent — for example{' '}
          <a href={`${APP_URL}/registry/trading-agent`}>Trading Agent</a> — and use the{' '}
          <strong>Chat with …</strong> panel on its page. Type a message or tap a suggestion; use{' '}
          <strong>New chat</strong> to start over. Replies stream in as they form. The floating{' '}
          <strong>Ask Norien</strong> button, on every page, is the same thing with no agent — an
          assistant that answers questions about Norien itself.
        </p>

        <h2>From the CLI</h2>
        <p>
          <code>norien chat</code> brings the conversation to your terminal, streaming token by token.
          Give it an agent slug to talk in character, or omit it to ask the Norien assistant. Use{' '}
          <code>-m</code> for a single, pipe-friendly reply.
        </p>
      </Prose>
      <CodeBlock>{`norien chat trading-agent          # chat with an agent, in character
norien chat                        # ask the Norien assistant anything
norien chat trading-agent -m "hi"  # one-shot, no prompt`}</CodeBlock>

      <Prose>
        <h2>From the API</h2>
        <p>
          A public endpoint. Send the agent context and the conversation so far; the persona is built
          server-side, so the framing can&apos;t be overridden by the caller.
        </p>
      </Prose>
      <CodeBlock>{`POST ${API_URL}/api/chat`}</CodeBlock>
      <CodeBlock>{`curl -X POST ${API_URL}/api/chat \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent": {
      "name": "Trading Agent",
      "description": "Analyzes token markets and suggests trades.",
      "tools": ["web-search", "token-price"]
    },
    "messages": [
      { "role": "user", "content": "What can you do?" }
    ]
  }'`}</CodeBlock>
      <CodeBlock>{`{ "reply": "I analyze token markets and suggest trades using web search and price data…" }`}</CodeBlock>

      <Prose>
        <h2>Streaming</h2>
        <p>
          For a live, token-by-token reply, post the same body to{' '}
          <code>/api/chat/stream</code>. It responds with{' '}
          <a href="https://developer.mozilla.org/docs/Web/API/Server-sent_events">server-sent events</a>:{' '}
          <code>data: {'{ "text": "…" }'}</code> frames as the reply forms, then a final{' '}
          <code>data: {'{ "done": true }'}</code>. An error mid-stream arrives as{' '}
          <code>data: {'{ "error": "…" }'}</code>. This is what the app and the CLI use.
        </p>
      </Prose>
      <CodeBlock>{`curl -N -X POST ${API_URL}/api/chat/stream \\
  -H "Content-Type: application/json" \\
  -d '{ "messages": [{ "role": "user", "content": "What is Norien?" }] }'

data: {"text": "Norien is the registry, runtime, and unified data API "}
data: {"text": "for AI agents on Robinhood Chain."}
data: {"done": true}`}</CodeBlock>

      <Prose>
        <h2>Fields</h2>
        <ul>
          <li>
            <strong>agent</strong> — optional. <code>name</code>, optional <code>description</code>,
            optional <code>tools</code> (slugs). Defines the persona; omit it entirely to talk to the
            Norien assistant instead.
          </li>
          <li>
            <strong>messages</strong> — the conversation, each <code>{'{ role, content }'}</code> with
            role <code>user</code> or <code>assistant</code>. Send the recent turns for context.
          </li>
        </ul>

        <h2>What it won&apos;t reveal</h2>
        <p>
          The reply is the agent&apos;s — never the underlying model or provider. If a reply would
          disclose the infrastructure it runs on, that part is stripped before it reaches you, so the
          agent stays the agent.
        </p>
      </Prose>

      <Note>
        Answers are short by design and each call has a cost on the operator&apos;s side, so keep the
        message history tight (the app sends the last few turns).
      </Note>
    </DocPage>
  );
}
