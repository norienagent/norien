import { env } from '../../config/env.js';
import { type ProviderClient, providerClient } from '../../core/provider-client.js';

/**
 * DeFiLlama — TVL, protocols, and ecosystem data.
 *
 * A public API with no key. `/protocols` returns the entire catalogue (~7.9k
 * entries, several MB), so it is fetched once and cached, then filtered and
 * paginated in memory rather than re-fetched per request.
 */

const PROTOCOLS_TTL_MS = 900_000;
const PROTOCOL_TTL_MS = 600_000;

export interface LlamaProtocol {
  slug: string;
  name: string;
  symbol: string | null;
  description: string | null;
  logo: string | null;
  category: string | null;
  url: string | null;
  chain: string | null;
  chains: string[];
  tvl: number | null;
  twitter: string | null;
  github: string | null;
  geckoId: string | null;
  address: string | null;
}

interface RawProtocol {
  slug?: string;
  name: string;
  symbol?: string | null;
  description?: string | null;
  logo?: string | null;
  category?: string | null;
  url?: string | null;
  chain?: string | null;
  chains?: string[];
  tvl?: number | null;
  twitter?: string | null;
  github?: string[] | string | null;
  gecko_id?: string | null;
  address?: string | null;
}

interface RawProtocolDetail extends RawProtocol {
  currentChainTvls?: Record<string, number>;
}

/** `-` and `null` are DeFiLlama's ways of saying "absent". */
function clean(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' || trimmed === '-' ? null : trimmed;
}

/**
 * `github` is sometimes a string and sometimes an array, and its entries are
 * usually **organisation** names (`["aave", "aave-dao"]`) rather than
 * `owner/repo` paths. It is returned as-is; resolving an org to a concrete
 * repository is GitHub's job, not this provider's.
 */
function firstGithub(value: string[] | string | null | undefined): string | null {
  if (Array.isArray(value)) return clean(value[0]);
  return clean(value);
}

/**
 * `currentChainTvls` mixes real chains with accounting breakdowns, both
 * suffixed (`Ethereum-borrowed`) and bare (`borrowed`, `staking`, `pool2`).
 * Counting those as chains would invent chains that do not exist.
 */
const NON_CHAIN_KEYS = new Set([
  'borrowed',
  'staking',
  'pool2',
  'treasury',
  'vesting',
  'offers',
  'masterchef',
  'dexs',
]);

export function isChainKey(key: string): boolean {
  return !key.includes('-') && !NON_CHAIN_KEYS.has(key.toLowerCase());
}

function normalize(raw: RawProtocol): LlamaProtocol {
  return {
    slug: raw.slug ?? raw.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    name: raw.name,
    symbol: clean(raw.symbol),
    description: clean(raw.description),
    logo: clean(raw.logo),
    category: clean(raw.category),
    url: clean(raw.url),
    chain: clean(raw.chain),
    chains: Array.isArray(raw.chains) ? raw.chains : [],
    tvl: typeof raw.tvl === 'number' ? raw.tvl : null,
    twitter: clean(raw.twitter),
    github: firstGithub(raw.github),
    geckoId: clean(raw.gecko_id),
    address: clean(raw.address),
  };
}

export interface ListProtocolsOptions {
  chain?: string;
  category?: string;
  query?: string;
  limit?: number;
  offset?: number;
}

export class DefiLlamaService {
  readonly name = 'defillama' as const;

  constructor(private readonly client: ProviderClient = providerClient) {}

  /** No credential required, so this provider is always configured. */
  get configured(): boolean {
    return true;
  }

  /** The full protocol catalogue, cached. */
  private async allProtocols(): Promise<LlamaProtocol[]> {
    const raw = await this.client.request<RawProtocol[]>(
      'defillama',
      `${env.DEFILLAMA_API_URL}/protocols`,
      { cacheKey: 'defillama:protocols', cacheTtlMs: PROTOCOLS_TTL_MS },
    );

    return raw.map(normalize);
  }

  /**
   * Filtered, TVL-ranked protocols. Filtering happens here rather than at the
   * provider because DeFiLlama offers no query parameters on `/protocols`.
   */
  async listProtocols(
    options: ListProtocolsOptions = {},
  ): Promise<{ items: LlamaProtocol[]; total: number }> {
    const all = await this.allProtocols();
    const limit = Math.min(options.limit ?? 20, 200);
    const offset = options.offset ?? 0;

    const chain = options.chain?.toLowerCase();
    const category = options.category?.toLowerCase();
    const query = options.query?.toLowerCase();

    const filtered = all.filter((protocol) => {
      if (chain && !protocol.chains.some((c) => c.toLowerCase() === chain)) return false;
      if (category && protocol.category?.toLowerCase() !== category) return false;
      if (query) {
        const haystack = `${protocol.name} ${protocol.symbol ?? ''} ${protocol.slug}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0));

    return { items: filtered.slice(offset, offset + limit), total: filtered.length };
  }

  /** One protocol, with its per-chain TVL breakdown. */
  async getProtocol(
    slug: string,
  ): Promise<{ protocol: LlamaProtocol; chainTvl: { chain: string; tvl: number }[] } | null> {
    const raw = await this.client.request<RawProtocolDetail | null>(
      'defillama',
      `${env.DEFILLAMA_API_URL}/protocol/${encodeURIComponent(slug)}`,
      {
        cacheKey: `defillama:protocol:${slug}`,
        cacheTtlMs: PROTOCOL_TTL_MS,
        // DeFiLlama answers an unknown slug with 400 "Protocol not found"
        // rather than 404, so both are treated as absent.
        nullOnStatus: [400, 404],
      },
    );

    if (!raw || !raw.name) return null;

    const current = raw.currentChainTvls ?? {};
    const chainTvl = Object.entries(current)
      .filter(([key]) => isChainKey(key))
      .map(([chain, tvl]) => ({ chain, tvl }))
      .sort((a, b) => b.tvl - a.tvl);

    const total = chainTvl.reduce((sum, entry) => sum + entry.tvl, 0);
    const protocol = normalize({ ...raw, slug: raw.slug ?? slug });

    return {
      protocol: {
        ...protocol,
        tvl: protocol.tvl ?? (total > 0 ? total : null),
        // The detail endpoint often returns an empty `chains` array, so the
        // real chain list is derived from the per-chain TVL breakdown.
        chains: protocol.chains.length > 0 ? protocol.chains : chainTvl.map((entry) => entry.chain),
      },
      chainTvl,
    };
  }

  /** Liveness probe used by `/api/providers`. */
  async ping(): Promise<boolean> {
    await this.allProtocols();
    return true;
  }
}

export const defiLlamaService = new DefiLlamaService();
