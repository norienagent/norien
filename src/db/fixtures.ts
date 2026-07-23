/**
 * Development fixtures: 12 tools and 10 agents spanning both runtimes.
 *
 * These exist so a fresh clone has a registry worth exploring -- search
 * ranking, tag and category filters, runtime detection, dependency resolution,
 * and multi-version history all have real data behind them immediately.
 *
 * Every entry is validated through the same schemas the API uses, so a broken
 * fixture fails at seed time rather than at request time.
 */

interface ToolFixture {
  slug: string;
  name: string;
  description: string;
  version: string;
  category: string;
  tags: string[];
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  authentication?: Record<string, unknown>;
  documentation?: string;
}

interface AgentFixture {
  author: string;
  body: Record<string, unknown>;
}

const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  ...(required.length > 0 ? { required } : {}),
  properties,
});

const str = (description?: string) => ({ type: 'string', ...(description ? { description } : {}) });
const num = (description?: string) => ({ type: 'number', ...(description ? { description } : {}) });
const bool = () => ({ type: 'boolean' });
const arr = (items: unknown) => ({ type: 'array', items });

export const TOOL_FIXTURES: ToolFixture[] = [
  {
    slug: 'web-search',
    name: 'Web Search',
    description: 'Query a web search index and return ranked results.',
    version: '2.1.0',
    category: 'search',
    tags: ['search', 'web', 'research'],
    input_schema: object(
      { query: str('Search terms.'), limit: num('Maximum results, 1-50.') },
      ['query'],
    ),
    output_schema: object({
      results: arr(object({ title: str(), url: str(), snippet: str() })),
    }),
    authentication: { type: 'api_key', location: 'header', name: 'X-Search-Key' },
    documentation: 'Requires a search provider API key. Results are ranked by provider relevance.',
  },
  {
    slug: 'http-fetch',
    name: 'HTTP Fetch',
    description: 'Perform HTTP requests against allow-listed hosts.',
    version: '1.2.0',
    category: 'developer',
    tags: ['http', 'network'],
    input_schema: object(
      {
        url: { type: 'string', format: 'uri' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
        headers: { type: 'object' },
        body: str(),
      },
      ['url'],
    ),
    output_schema: object({ status: num(), headers: { type: 'object' }, body: str() }),
    authentication: { type: 'none' },
    documentation: 'Issues an HTTP request and returns the raw response.',
  },
  {
    slug: 'wallet',
    name: 'Wallet',
    description: 'Read balances and submit signed transactions on EVM chains.',
    version: '1.4.0',
    category: 'finance',
    tags: ['crypto', 'wallet', 'evm'],
    input_schema: object(
      {
        action: { type: 'string', enum: ['balance', 'transfer', 'approve'] },
        chain_id: num('EVM chain id.'),
        address: str(),
        amount: str('Amount in the smallest unit.'),
      },
      ['action', 'chain_id'],
    ),
    output_schema: object({ tx_hash: str(), balance: str(), confirmed: bool() }),
    authentication: { type: 'custom', description: 'Signing key held server-side; never exposed.' },
    documentation: 'Transfers require an explicit spend permission on the calling agent.',
  },
  {
    slug: 'twitter',
    name: 'Twitter',
    description: 'Read timelines and publish posts on Twitter/X.',
    version: '3.0.1',
    category: 'communication',
    tags: ['twitter', 'social', 'posting'],
    input_schema: object(
      {
        action: { type: 'string', enum: ['post', 'timeline', 'search', 'reply'] },
        text: str(),
        query: str(),
        in_reply_to: str(),
      },
      ['action'],
    ),
    output_schema: object({
      id: str(),
      posts: arr(object({ id: str(), text: str(), author: str() })),
    }),
    authentication: { type: 'oauth2', scopes: ['tweet.read', 'tweet.write', 'users.read'] },
  },
  {
    slug: 'discord',
    name: 'Discord',
    description: 'Send messages and manage channels in a Discord guild.',
    version: '2.2.0',
    category: 'communication',
    tags: ['discord', 'chat', 'community'],
    input_schema: object(
      {
        action: { type: 'string', enum: ['send', 'read', 'create_thread'] },
        channel_id: str(),
        content: str(),
      },
      ['action', 'channel_id'],
    ),
    output_schema: object({ message_id: str(), messages: arr(object({ id: str(), content: str() })) }),
    authentication: { type: 'bearer', description: 'Discord bot token.' },
  },
  {
    slug: 'notifications',
    name: 'Notifications',
    description: 'Deliver alerts over email, SMS, and push in one call.',
    version: '1.1.0',
    category: 'communication',
    tags: ['notifications', 'alerts', 'email'],
    input_schema: object(
      {
        channel: { type: 'string', enum: ['email', 'sms', 'push', 'webhook'] },
        to: str(),
        subject: str(),
        body: str(),
        priority: { type: 'string', enum: ['low', 'normal', 'urgent'] },
      },
      ['channel', 'to', 'body'],
    ),
    output_schema: object({ delivered: bool(), provider_id: str() }),
    authentication: { type: 'api_key', location: 'header', name: 'X-Notify-Key' },
  },
  {
    slug: 'market-data',
    name: 'Market Data',
    description: 'Fetch spot prices, OHLC candles, and order book depth.',
    version: '2.0.0',
    category: 'finance',
    tags: ['market', 'prices', 'trading'],
    input_schema: object(
      {
        symbol: str('Trading pair, e.g. ETH-USD.'),
        interval: { type: 'string', enum: ['1m', '5m', '1h', '1d'] },
        depth: num(),
      },
      ['symbol'],
    ),
    output_schema: object({
      price: num(),
      candles: arr(object({ t: num(), o: num(), h: num(), l: num(), c: num() })),
    }),
    authentication: { type: 'api_key', location: 'header', name: 'X-Market-Key' },
  },
  {
    slug: 'exchange',
    name: 'Exchange',
    description: 'Place, cancel, and query orders on supported exchanges.',
    version: '1.5.2',
    category: 'finance',
    tags: ['trading', 'orders', 'exchange'],
    input_schema: object(
      {
        action: { type: 'string', enum: ['place', 'cancel', 'status'] },
        symbol: str(),
        side: { type: 'string', enum: ['buy', 'sell'] },
        quantity: str(),
        limit_price: str(),
      },
      ['action', 'symbol'],
    ),
    output_schema: object({ order_id: str(), status: str(), filled_quantity: str() }),
    authentication: { type: 'api_key', location: 'header', name: 'X-Exchange-Key' },
    documentation: 'Order placement requires the `trading:execute` permission.',
  },
  {
    slug: 'bridge',
    name: 'Bridge',
    description: 'Quote and execute cross-chain asset transfers.',
    version: '0.9.0',
    category: 'finance',
    tags: ['bridge', 'cross-chain', 'crypto'],
    input_schema: object(
      {
        from_chain: num(),
        to_chain: num(),
        token: str(),
        amount: str(),
        quote_only: bool(),
      },
      ['from_chain', 'to_chain', 'token', 'amount'],
    ),
    output_schema: object({
      route: str(),
      estimated_fee: str(),
      estimated_seconds: num(),
      tx_hash: str(),
    }),
    authentication: { type: 'custom', description: 'Uses the wallet tool for signing.' },
  },
  {
    slug: 'news-feed',
    name: 'News Feed',
    description: 'Pull articles from curated news sources with topic filters.',
    version: '1.3.0',
    category: 'media',
    tags: ['news', 'rss', 'media'],
    input_schema: object(
      { topics: arr(str()), since: str('ISO 8601 timestamp.'), limit: num() },
      ['topics'],
    ),
    output_schema: object({
      articles: arr(object({ title: str(), url: str(), source: str(), published_at: str() })),
    }),
    authentication: { type: 'api_key', location: 'query', name: 'api_key' },
  },
  {
    slug: 'vector-store',
    name: 'Vector Store',
    description: 'Persist and query embeddings for retrieval-augmented workflows.',
    version: '1.0.0',
    category: 'data',
    tags: ['embeddings', 'retrieval', 'storage'],
    input_schema: object(
      {
        action: { type: 'string', enum: ['upsert', 'query', 'delete'] },
        namespace: str(),
        vectors: arr(object({ id: str(), values: arr(num()) })),
        top_k: num(),
      },
      ['action', 'namespace'],
    ),
    output_schema: object({ matches: arr(object({ id: str(), score: num() })) }),
    authentication: { type: 'api_key', location: 'header', name: 'X-Vector-Key' },
  },
  {
    slug: 'postgres-query',
    name: 'Postgres Query',
    description: 'Run read-only SQL against a configured Postgres database.',
    version: '1.3.2',
    category: 'data',
    tags: ['database', 'sql', 'analytics'],
    input_schema: object({ sql: str(), params: arr({}) }, ['sql']),
    output_schema: object({ rows: arr({}), row_count: num() }),
    authentication: { type: 'custom', description: 'Uses a server-side DSN.' },
  },
];

/** The 10 sample agents. Slugs are stable; several carry version history. */
export const AGENT_FIXTURES: AgentFixture[] = [
  {
    author: 'norien',
    body: {
      slug: 'research-agent',
      tags: ['research', 'search', 'summarisation'],
      icon: 'https://example.com/icons/research.png',
      readme:
        '# Research Agent\n\nSearches the web, follows the most promising sources, and returns a summary with citations.\n\n## Usage\n\n```bash\nnorien install research-agent\n```\n',
      manifest: {
        name: 'Research Agent',
        version: '1.0.0',
        description: 'Searches the web and summarises findings with citations.',
        runtime: 'node',
        entrypoint: 'dist/index.js',
        tools: ['web-search', 'http-fetch'],
        permissions: ['network:fetch'],
        environment: [
          { name: 'SEARCH_API_KEY', description: 'Search provider key.', required: true, secret: true },
          { name: 'MAX_RESULTS', description: 'Result cap per query.', required: false, default: '10' },
        ],
        commands: { start: 'node dist/index.js', health: '/health' },
      },
    },
  },
  {
    author: 'norien',
    body: {
      slug: 'research-agent',
      manifest: {
        name: 'Research Agent',
        version: '1.1.0',
        description: 'Searches the web and summarises findings, now with source ranking.',
        runtime: 'node',
        entrypoint: 'dist/index.js',
        tools: ['web-search', 'http-fetch', 'vector-store'],
        permissions: ['network:fetch', 'storage:write'],
        environment: [
          { name: 'SEARCH_API_KEY', required: true, secret: true },
          { name: 'VECTOR_API_KEY', required: true, secret: true },
          { name: 'MAX_RESULTS', required: false, default: '10' },
        ],
        commands: { start: 'node dist/index.js', health: '/health' },
      },
    },
  },
  {
    author: 'norien',
    body: {
      slug: 'search-agent',
      tags: ['search', 'retrieval'],
      readme: '# Search Agent\n\nA thin, fast agent that answers lookup questions in one hop.\n',
      manifest: {
        name: 'Search Agent',
        version: '1.0.2',
        description: 'Answers direct lookup questions using a single web search hop.',
        runtime: 'python',
        entrypoint: 'main.py',
        tools: ['web-search'],
        permissions: ['network:fetch'],
        environment: [{ name: 'SEARCH_API_KEY', required: true, secret: true }],
        commands: { start: 'python main.py', health: 'python -m healthcheck' },
      },
    },
  },
  {
    author: 'socialworks',
    body: {
      slug: 'twitter-agent',
      tags: ['twitter', 'social', 'automation'],
      readme: '# Twitter Agent\n\nDrafts, schedules, and publishes posts, and replies to mentions.\n',
      manifest: {
        name: 'Twitter Agent',
        version: '2.0.0',
        description: 'Drafts and publishes posts, and replies to mentions on a schedule.',
        runtime: 'node',
        entrypoint: 'dist/twitter.js',
        tools: ['twitter', 'web-search'],
        permissions: ['network:fetch', 'social:post'],
        environment: [
          { name: 'TWITTER_CLIENT_ID', required: true, secret: true },
          { name: 'TWITTER_CLIENT_SECRET', required: true, secret: true },
          { name: 'POST_INTERVAL_MINUTES', required: false, default: '60' },
        ],
        commands: { start: 'node dist/twitter.js', health: '/healthz' },
      },
    },
  },
  {
    author: 'socialworks',
    body: {
      slug: 'discord-agent',
      tags: ['discord', 'community', 'moderation'],
      readme: '# Discord Agent\n\nAnswers questions in a support channel and escalates what it cannot handle.\n',
      manifest: {
        name: 'Discord Agent',
        version: '1.3.0',
        description: 'Answers community questions in Discord and escalates unresolved threads.',
        runtime: 'node',
        entrypoint: 'dist/bot.js',
        tools: ['discord', 'web-search', 'vector-store'],
        permissions: ['network:fetch', 'chat:write', 'storage:read'],
        environment: [
          { name: 'DISCORD_BOT_TOKEN', required: true, secret: true },
          { name: 'DISCORD_GUILD_ID', required: true },
          { name: 'VECTOR_API_KEY', required: true, secret: true },
        ],
        commands: { start: 'node dist/bot.js', health: '/health' },
      },
    },
  },
  {
    author: 'chainlabs',
    body: {
      slug: 'wallet-agent',
      tags: ['crypto', 'wallet', 'defi'],
      readme: '# Wallet Agent\n\nMonitors balances and executes transfers under an explicit spend policy.\n',
      manifest: {
        name: 'Wallet Agent',
        version: '1.2.0',
        description: 'Monitors balances and executes transfers under a configured spend policy.',
        runtime: 'node',
        entrypoint: 'dist/wallet.js',
        tools: ['wallet', 'market-data'],
        permissions: ['network:fetch', 'wallet:read', 'wallet:transfer'],
        environment: [
          { name: 'WALLET_SIGNER_KEY', required: true, secret: true },
          { name: 'RPC_URL', required: true },
          { name: 'MAX_TRANSFER_USD', required: false, default: '500' },
        ],
        commands: { start: 'node dist/wallet.js', health: '/health' },
      },
    },
  },
  {
    author: 'chainlabs',
    body: {
      slug: 'portfolio-agent',
      tags: ['portfolio', 'finance', 'reporting'],
      readme: '# Portfolio Agent\n\nValues holdings across chains and reports drift against a target allocation.\n',
      manifest: {
        name: 'Portfolio Agent',
        version: '0.8.1',
        description: 'Values holdings across chains and reports drift from a target allocation.',
        runtime: 'python',
        entrypoint: 'portfolio/main.py',
        tools: ['wallet', 'market-data', 'postgres-query'],
        permissions: ['network:fetch', 'wallet:read', 'database:read'],
        environment: [
          { name: 'RPC_URL', required: true },
          { name: 'MARKET_API_KEY', required: true, secret: true },
          { name: 'DATABASE_DSN', required: true, secret: true },
        ],
        commands: { start: 'python -m portfolio.main', health: 'python -m portfolio.health' },
      },
    },
  },
  {
    author: 'chainlabs',
    body: {
      slug: 'trading-agent',
      tags: ['trading', 'finance', 'automation'],
      readme: '# Trading Agent\n\nExecutes a rules-based strategy with hard position limits.\n',
      manifest: {
        name: 'Trading Agent',
        version: '0.5.0',
        description: 'Executes a rules-based trading strategy with configurable position limits.',
        runtime: 'python',
        entrypoint: 'trader/run.py',
        tools: ['exchange', 'market-data', 'notifications'],
        permissions: ['network:fetch', 'trading:execute'],
        environment: [
          { name: 'EXCHANGE_API_KEY', required: true, secret: true },
          { name: 'EXCHANGE_API_SECRET', required: true, secret: true },
          { name: 'MAX_POSITION_USD', required: true },
          { name: 'DRY_RUN', required: false, default: 'true' },
        ],
        commands: { start: 'python -m trader.run', health: 'python -m trader.health' },
      },
    },
  },
  {
    author: 'chainlabs',
    body: {
      slug: 'bridge-agent',
      tags: ['bridge', 'cross-chain', 'crypto'],
      readme: '# Bridge Agent\n\nFinds the cheapest route between chains and executes the transfer.\n',
      manifest: {
        name: 'Bridge Agent',
        version: '0.4.0',
        description: 'Finds the cheapest cross-chain route and executes the transfer.',
        runtime: 'node',
        entrypoint: 'dist/bridge.js',
        tools: ['bridge', 'wallet', 'market-data'],
        permissions: ['network:fetch', 'wallet:transfer'],
        environment: [
          { name: 'WALLET_SIGNER_KEY', required: true, secret: true },
          { name: 'RPC_URL', required: true },
        ],
        commands: { start: 'node dist/bridge.js', health: '/health' },
      },
    },
  },
  {
    author: 'opsworks',
    body: {
      slug: 'notification-agent',
      tags: ['ops', 'notifications', 'alerts'],
      readme: '# Notification Agent\n\nDeduplicates alerts and routes them to the right channel.\n',
      manifest: {
        name: 'Notification Agent',
        version: '2.1.0',
        description: 'Deduplicates incoming alerts and routes them to the right channel.',
        runtime: 'node',
        entrypoint: 'dist/notify.js',
        tools: ['notifications', 'discord'],
        permissions: ['network:fetch', 'chat:write'],
        environment: [
          { name: 'NOTIFY_API_KEY', required: true, secret: true },
          { name: 'DEDUPE_WINDOW_SECONDS', required: false, default: '300' },
        ],
        commands: { start: 'node dist/notify.js', health: '/health' },
      },
    },
  },
  {
    author: 'opsworks',
    body: {
      slug: 'news-agent',
      tags: ['news', 'research', 'media'],
      readme: '# News Agent\n\nTracks topics across sources and produces a daily digest.\n',
      manifest: {
        name: 'News Agent',
        version: '1.0.0',
        description: 'Tracks topics across news sources and produces a daily digest.',
        runtime: 'python',
        entrypoint: 'news/digest.py',
        tools: ['news-feed', 'web-search', 'notifications'],
        permissions: ['network:fetch'],
        environment: [
          { name: 'NEWS_API_KEY', required: true, secret: true },
          { name: 'DIGEST_HOUR_UTC', required: false, default: '7' },
        ],
        commands: { start: 'python -m news.digest', health: 'python -m news.health' },
      },
    },
  },
];
