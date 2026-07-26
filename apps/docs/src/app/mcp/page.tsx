import Link from 'next/link';

import { CodeBlock, Prose } from '@norien-live/web-ui';

import { DocPage, Note } from '../doc-page';

export const metadata = { title: 'MCP server' };

export default function McpPage() {
  return (
    <DocPage
      href="/mcp"
      title="MCP server"
      lead="Use Norien from any MCP client — Claude Desktop, Cursor, ChatGPT, or Codex. Live Robinhood Chain market data, wallet portfolios, the agent registry, and runnable skills, as tools your assistant can call."
    >
      <Prose>
        <p>
          The Norien <strong>MCP server</strong> speaks the{' '}
          <a href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer">
            Model Context Protocol
          </a>
          , so any MCP-capable client can use Norien as an agent&apos;s data and{' '}
          <Link href="/features/skills">skills</Link> layer. It talks to the public REST API — reads
          need no key.
        </p>
        <p>
          It pairs naturally with Robinhood&apos;s official Agentic Trading MCP: point your assistant
          at both and <strong>Norien is the intel, Robinhood is the execution.</strong>
        </p>

        <h2>Tools it exposes</h2>
        <ul>
          <li>
            <code>get_markets</code> — live token list: price, 24h change, volume, liquidity, market
            cap, holders. Sort by volume, biggest gainers, liquidity, market cap, or trending.
          </li>
          <li>
            <code>get_token</code> — market data and metadata for one token, by address.
          </li>
          <li>
            <code>get_portfolio</code> — a wallet&apos;s priced holdings across Ethereum, Base,
            Arbitrum, Optimism, and Polygon.
          </li>
          <li>
            <code>get_token_chart</code> — OHLCV price history over 24h / 7d / 30d / 90d.
          </li>
          <li>
            <code>search_registry</code> — find agents and tools to install.
          </li>
          <li>
            <code>search_tools</code> / <code>get_tool</code> — browse the tool marketplace with
            each tool&apos;s input schema.
          </li>
          <li>
            <code>get_agent</code> — one agent&apos;s manifest, tools, and requirements.
          </li>
          <li>
            <code>list_skills</code> / <code>run_skill</code> — list and run data-grounded skills.
          </li>
          <li>
            <code>ask_norien</code> — ask the Norien assistant anything about the product.
          </li>
        </ul>

        <h2>Run it</h2>
        <p>No install needed — run it straight from npm:</p>
      </Prose>
      <CodeBlock>{`npx @norien-live/mcp`}</CodeBlock>
      <Prose>
        <p>Or install it globally to get the {`\`norien-mcp\``} binary:</p>
      </Prose>
      <CodeBlock>{`npm i -g @norien-live/mcp
norien-mcp`}</CodeBlock>

      <Prose>
        <h2>Connect Claude Desktop</h2>
        <p>
          Add Norien to your <code>claude_desktop_config.json</code> (Settings → Developer → Edit
          Config):
        </p>
      </Prose>
      <CodeBlock>{`{
  "mcpServers": {
    "norien": {
      "command": "npx",
      "args": ["-y", "@norien-live/mcp"]
    }
  }
}`}</CodeBlock>
      <Prose>
        <p>
          Restart Claude Desktop. You&apos;ll see the Norien tools appear — ask it &ldquo;what are
          today&apos;s biggest gainers on Robinhood Chain?&rdquo; and it will call{' '}
          <code>get_markets</code>.
        </p>

        <h2>Connect Cursor</h2>
        <p>
          Add the same block to <code>~/.cursor/mcp.json</code> (or a project&apos;s{' '}
          <code>.cursor/mcp.json</code>). The config shape is identical.
        </p>

        <h2>Point at a different backend</h2>
        <p>
          By default the server talks to <code>api.norien.live</code>. Override it with an
          environment variable — useful for local development:
        </p>
      </Prose>
      <CodeBlock>{`{
  "mcpServers": {
    "norien": {
      "command": "npx",
      "args": ["-y", "@norien-live/mcp"],
      "env": { "NORIEN_API_URL": "http://localhost:8080" }
    }
  }
}`}</CodeBlock>

      <Note>
        The MCP server exposes read-only data and skills — no keys, no writes, no code execution.
        It&apos;s safe to hand to any assistant. Answers built on this data are grounded in it; they
        are not financial advice.
      </Note>
    </DocPage>
  );
}
