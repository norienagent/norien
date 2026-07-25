# @norien-live/mcp

The **Norien MCP server** — exposes Norien's public surface (Robinhood Chain
market data, wallet portfolios, the agent/tool registry, and runnable skills) as
[Model Context Protocol](https://modelcontextprotocol.io) tools, so any MCP
client — Claude Desktop, Cursor, ChatGPT, Codex — can use Norien as an agent's
data and skills layer.

It pairs naturally with Robinhood's official Agentic Trading MCP: **Norien is the
intel, Robinhood is the execution.**

It talks to the public REST API at `api.norien.live` — reads need no key.

## Run

```sh
npx @norien-live/mcp
```

Or install the `norien-mcp` binary globally:

```sh
npm i -g @norien-live/mcp
norien-mcp
```

## Connect a client

Add Norien to your client's MCP config — `claude_desktop_config.json` (Claude
Desktop → Settings → Developer → Edit Config) or `~/.cursor/mcp.json` (Cursor):

```jsonc
{
  "mcpServers": {
    "norien": {
      "command": "npx",
      "args": ["-y", "@norien-live/mcp"]
    }
  }
}
```

Restart the client and the Norien tools appear. Ask it "what are today's biggest
gainers on Robinhood Chain?" and it calls `get_markets`.

## Tools

| Tool | Does |
| --- | --- |
| `get_markets` | Live token list: price, 24h change, volume, liquidity, market cap, holders. Sort by volume, gainers, liquidity, market cap, trending. |
| `get_token` | Market data and metadata for one token, by contract address. |
| `get_portfolio` | A wallet's priced holdings across Ethereum, Base, Arbitrum, Optimism, and Polygon. |
| `search_registry` | Find agents and tools to install. |
| `list_skills` | List runnable, data-grounded Norien skills. |
| `run_skill` | Run a skill and return its grounded result. |
| `ask_norien` | Ask the Norien assistant anything about the product. |

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `NORIEN_API_URL` | `https://api.norien.live` | Which backend the server reads from. Set it to point at a local registry. |

```jsonc
{
  "mcpServers": {
    "norien": {
      "command": "npx",
      "args": ["-y", "@norien-live/mcp"],
      "env": { "NORIEN_API_URL": "http://localhost:8080" }
    }
  }
}
```

The server exposes read-only data and skills — no keys, no writes, no code
execution. Answers built on this data are grounded in it; they are not financial
advice.

Docs: [docs.norien.live/mcp](https://docs.norien.live/mcp)
