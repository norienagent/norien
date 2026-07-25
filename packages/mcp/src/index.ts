#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

/**
 * The Norien MCP server.
 *
 * Exposes Norien's public surface — Robinhood Chain market data, wallet
 * portfolios, the agent/tool registry, and runnable skills — as MCP tools, so
 * any MCP client (Claude Desktop, Cursor, ChatGPT, Codex, …) can use Norien as
 * an agent's data + skills layer. Pairs naturally with Robinhood's official
 * Agentic Trading MCP: Norien is the intel, Robinhood is the execution.
 *
 * Talks to the public REST API — no key required for reads.
 */

const API_BASE = (process.env.NORIEN_API_URL ?? 'https://api.norien.live').replace(/\/+$/, '');

type Content = { content: { type: 'text'; text: string }[]; isError?: boolean };

const ok = (value: unknown): Content => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});
const fail = (message: string): Content => ({ content: [{ type: 'text', text: `Error: ${message}` }], isError: true });

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

/** Runs a skill by consuming its SSE stream and returning the full text. */
async function runSkill(slug: string, input: string): Promise<string> {
  const response = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(slug)}/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `skill run failed (${response.status})`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let out = '';
  let streamError: string | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith('data:')) continue;
      try {
        const event = JSON.parse(line.slice(5).trim()) as { text?: string; error?: string };
        if (typeof event.text === 'string') out += event.text;
        else if (event.error) streamError = event.error;
      } catch {
        /* keep-alive */
      }
    }
  }
  if (streamError && !out) throw new Error(streamError);
  return out;
}

const server = new McpServer({ name: 'norien', version: '0.1.0' });

// The SDK's registerTool generics infer extremely deep and trip TS2589; a loose
// local binding sidesteps it without changing any runtime behaviour.
const reg = server.registerTool.bind(server) as (
  name: string,
  config: { description: string; inputSchema?: z.ZodRawShape },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cb: (args: any) => Content | Promise<Content>,
) => void;

reg(
  'get_markets',
  {
    description:
      'Live token market list for Robinhood Chain: price, 24h change, volume, liquidity, market cap, holders. Sort by volume, biggest gainers, liquidity, market cap, or trending.',
    inputSchema: {
      sort: z
        .enum(['volume24', 'change24', 'liquidity', 'marketCap', 'trendingScore24'])
        .optional()
        .describe('Ranking. change24 = biggest gainers.'),
      limit: z.number().int().min(1).max(50).optional().describe('Rows (default 15).'),
    },
  },
  async ({ sort, limit }) => {
    try {
      const result = await getJson<{ data: { items: Record<string, unknown>[] } }>(
        `/api/tokens?sort=${sort ?? 'volume24'}&limit=${limit ?? 15}`,
      );
      const rows = result.data.items.map((t) => ({
        symbol: t.symbol,
        name: t.name,
        price: t.price,
        change24h: t.change24h,
        volume24h: t.volume24h,
        liquidity: t.liquidity,
        marketCap: t.marketCap,
        holders: t.holders,
        address: t.address,
      }));
      return ok(rows);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
);

reg(
  'get_token',
  {
    description: 'Market data and metadata for one token on Robinhood Chain, by contract address.',
    inputSchema: { address: z.string().describe('Token contract address.') },
  },
  async ({ address }) => {
    try {
      const result = await getJson<{ data: unknown }>(`/api/token/${encodeURIComponent(address)}`);
      return ok(result.data);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
);

reg(
  'get_portfolio',
  {
    description:
      "A wallet's priced holdings across Ethereum, Base, Arbitrum, Optimism, and Polygon: total value, per-chain split, and native balances.",
    inputSchema: { address: z.string().describe('Wallet address (0x…).') },
  },
  async ({ address }) => {
    try {
      const result = await getJson<{ data: unknown }>(`/api/portfolio/${encodeURIComponent(address)}`);
      return ok(result.data);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
);

reg(
  'search_registry',
  {
    description: 'Search the Norien registry for agents and tools to install.',
    inputSchema: { query: z.string().describe('What to search for.') },
  },
  async ({ query }) => {
    try {
      const result = await getJson<{ data: unknown[] }>(`/search?q=${encodeURIComponent(query)}&type=all&limit=15`);
      return ok(result.data);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
);

reg(
  'list_skills',
  {
    description: 'List Norien skills — runnable, data-grounded capabilities you can invoke with run_skill.',
    inputSchema: {},
  },
  async () => {
    try {
      const result = await getJson<{ data: { slug: string; name: string; description: string; data_source: string; input_hint: string | null }[] }>(
        '/api/skills?limit=60',
      );
      return ok(
        result.data.map((s) => ({
          slug: s.slug,
          name: s.name,
          description: s.description,
          grounded_in: s.data_source,
          input: s.input_hint,
        })),
      );
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
);

reg(
  'run_skill',
  {
    description:
      'Run a Norien skill and get its grounded result. The skill resolves live Norien data (markets, a wallet, a token, or the registry) and returns an analysis. Use list_skills to see options.',
    inputSchema: {
      slug: z.string().describe('Skill slug, e.g. market-recap, review-wallet, explain-token.'),
      input: z.string().optional().describe('Input for the skill (e.g. a wallet or token address).'),
    },
  },
  async ({ slug, input }) => {
    try {
      const text = await runSkill(slug, input ?? '');
      return ok(text || '(no output)');
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
);

reg(
  'ask_norien',
  {
    description: 'Ask the Norien assistant anything about Norien — what it is, how to use it, its features, the CLI, or the API.',
    inputSchema: { question: z.string().describe('Your question about Norien.') },
  },
  async ({ question }) => {
    try {
      const result = await (async () => {
        const response = await fetch(`${API_BASE}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: question }] }),
        });
        if (!response.ok) throw new Error(`${response.status}`);
        return (await response.json()) as { reply: string };
      })();
      return ok(result.reply);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Diagnostics go to stderr so they never corrupt the stdio JSON-RPC channel.
  process.stderr.write(`Norien MCP server ready — ${API_BASE}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`Norien MCP failed to start: ${String(error)}\n`);
  process.exit(1);
});
