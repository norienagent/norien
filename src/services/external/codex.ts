import { env } from '../../config/env.js';
import { ProviderError, type ProviderClient, providerClient } from '../../core/provider-client.js';

/**
 * Codex (graph.codex.io) — the primary market-data source.
 *
 * Price, market cap, liquidity, volume, 24h change, and holder counts all come
 * from here; CoinGecko is metadata only. Field selections below were verified
 * against the live schema rather than assumed: introspection is disabled on the
 * API, so the shapes were confirmed by probing.
 *
 * Note: the standalone `holders(...)` query requires a paid plan, but the
 * `holders` field on `filterTokens` results does not — so holder counts are
 * read from there.
 */

/** Values arrive as decimal strings; `null` when the provider has no figure. */
function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface CodexNetwork {
  id: number;
  name: string;
}

export interface CodexTokenRow {
  address: string;
  networkId: number;
  name: string;
  symbol: string;
  decimals: number | null;
  totalSupply: number | null;
  imageUrl: string | null;
  description: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  price: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidity: number | null;
  volume24h: number | null;
  change24h: number | null;
  holders: number | null;
  txns24h: number | null;
}

export type CodexRanking =
  | 'trendingScore24'
  | 'volume24'
  | 'liquidity'
  | 'marketCap'
  | 'change24';

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

/** Shape of one `filterTokens` result, exactly as the API returns it. */
interface RawFilterResult {
  token: {
    address: string;
    networkId: number;
    name: string | null;
    symbol: string | null;
    decimals: number | null;
    totalSupply: string | null;
    info: {
      imageLargeUrl: string | null;
      imageSmallUrl: string | null;
      imageThumbUrl: string | null;
      description: string | null;
    } | null;
    socialLinks: {
      website: string | null;
      twitter: string | null;
      telegram: string | null;
    } | null;
  };
  priceUSD: string | null;
  marketCap: string | null;
  fdv: string | null;
  liquidity: string | null;
  volume24: string | null;
  change24: string | null;
  holders: number | null;
  txnCount24: string | null;
}

const TOKEN_SELECTION = `
  token {
    address
    networkId
    name
    symbol
    decimals
    totalSupply
    info { imageLargeUrl imageSmallUrl imageThumbUrl description }
    socialLinks { website twitter telegram }
  }
  priceUSD
  marketCap
  fdv
  liquidity
  volume24
  change24
  holders
  txnCount24
`;

function normalizeRow(raw: RawFilterResult): CodexTokenRow {
  const info = raw.token.info;
  const links = raw.token.socialLinks;

  return {
    address: raw.token.address,
    networkId: raw.token.networkId,
    name: raw.token.name ?? raw.token.symbol ?? raw.token.address,
    symbol: raw.token.symbol ?? '',
    decimals: raw.token.decimals,
    totalSupply: toNumber(raw.token.totalSupply),
    imageUrl: info?.imageLargeUrl ?? info?.imageSmallUrl ?? info?.imageThumbUrl ?? null,
    description: info?.description && info.description.trim() !== '' ? info.description : null,
    website: links?.website ?? null,
    twitter: links?.twitter ?? null,
    telegram: links?.telegram ?? null,
    price: toNumber(raw.priceUSD),
    marketCap: toNumber(raw.marketCap),
    fdv: toNumber(raw.fdv),
    liquidity: toNumber(raw.liquidity),
    volume24h: toNumber(raw.volume24),
    // Codex reports change as a ratio (-0.0075); expose it as a percentage.
    change24h: (() => {
      const ratio = toNumber(raw.change24);
      return ratio === null ? null : ratio * 100;
    })(),
    holders: raw.holders ?? null,
    txns24h: toNumber(raw.txnCount24),
  };
}

export interface ListTokensOptions {
  networkIds?: number[];
  limit?: number;
  offset?: number;
  ranking?: CodexRanking;
  /** Free-text match against name and symbol. */
  phrase?: string;
}

export class CodexService {
  readonly name = 'codex' as const;

  constructor(private readonly client: ProviderClient = providerClient) {}

  get configured(): boolean {
    return env.CODEX_API_KEY !== undefined;
  }

  /** Executes a GraphQL document, turning GraphQL errors into ProviderError. */
  private async query<T>(
    query: string,
    options: { cacheKey?: string; cacheTtlMs?: number } = {},
  ): Promise<T> {
    if (!this.configured) {
      throw new ProviderError('codex', 'CODEX_API_KEY is not configured.', { status: null });
    }

    const response = await this.client.request<GraphQLResponse<T>>(
      'codex',
      env.CODEX_GRAPHQL_URL,
      {
        method: 'POST',
        headers: { authorization: env.CODEX_API_KEY as string },
        body: { query },
        ...(options.cacheKey ? { cacheKey: options.cacheKey } : {}),
        ...(options.cacheTtlMs !== undefined ? { cacheTtlMs: options.cacheTtlMs } : {}),
      },
    );

    if (response.errors && response.errors.length > 0) {
      const message = response.errors.map((error) => error.message).join('; ');
      // GraphQL errors arrive with HTTP 200, so they are surfaced explicitly.
      throw new ProviderError('codex', `codex GraphQL error: ${message}`, { status: 200 });
    }

    if (!response.data) {
      throw new ProviderError('codex', 'codex returned no data.', { status: 200 });
    }

    return response.data;
  }

  /** Every network Codex indexes. Cached hard: this list changes rarely. */
  async listNetworks(): Promise<CodexNetwork[]> {
    const data = await this.query<{ getNetworks: CodexNetwork[] }>(
      `{ getNetworks { id name } }`,
      { cacheKey: 'codex:networks', cacheTtlMs: 3_600_000 },
    );
    return data.getNetworks;
  }

  /**
   * The workhorse: filtered, ranked token listing. Backs `/api/tokens`,
   * `/api/trending`, and the token half of `/api/search`.
   */
  async listTokens(options: ListTokensOptions = {}): Promise<CodexTokenRow[]> {
    const limit = Math.min(options.limit ?? 20, 200);
    const offset = options.offset ?? 0;
    const ranking = options.ranking ?? 'volume24';

    const args: string[] = [`limit: ${limit}`, `offset: ${offset}`];

    if (options.networkIds && options.networkIds.length > 0) {
      args.push(`filters: { network: [${options.networkIds.join(', ')}] }`);
    }
    if (options.phrase) {
      args.push(`phrase: ${JSON.stringify(options.phrase)}`);
    }
    args.push(`rankings: [{ attribute: ${ranking}, direction: DESC }]`);

    const document = `{ filterTokens(${args.join(', ')}) { results { ${TOKEN_SELECTION} } } }`;

    const data = await this.query<{ filterTokens: { results: RawFilterResult[] | null } }>(
      document,
      {
        cacheKey: `codex:tokens:${ranking}:${limit}:${offset}:${options.networkIds?.join(',') ?? 'all'}:${options.phrase ?? ''}`,
      },
    );

    return (data.filterTokens.results ?? []).map(normalizeRow);
  }

  /**
   * One token's market data. Uses `filterTokens` with an address filter rather
   * than the `token(...)` query, because only the former carries market
   * statistics (price, liquidity, holders).
   */
  async getToken(address: string, networkId: number): Promise<CodexTokenRow | null> {
    const document = `{
      filterTokens(
        filters: { network: [${networkId}] }
        tokens: [${JSON.stringify(`${address}:${networkId}`)}]
        limit: 1
      ) { results { ${TOKEN_SELECTION} } }
    }`;

    const data = await this.query<{ filterTokens: { results: RawFilterResult[] | null } }>(
      document,
      { cacheKey: `codex:token:${networkId}:${address.toLowerCase()}` },
    );

    const row = data.filterTokens.results?.[0];
    return row ? normalizeRow(row) : null;
  }
}

export const codexService = new CodexService();
