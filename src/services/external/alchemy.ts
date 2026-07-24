import { env } from '../../config/env.js';
import { type ProviderClient, providerClient } from '../../core/provider-client.js';

/**
 * Alchemy — the multi-chain backbone.
 *
 * Norien's native data is Robinhood Chain; Alchemy widens it to the major EVM
 * chains. Three of its APIs, one key:
 *  - Data API (`/data/v1`) — a wallet's ERC-20 holdings across chains, with
 *    metadata and USD prices, in one call.
 *  - JSON-RPC — the authoritative native-coin balance per chain.
 *  - Prices API (`/prices/v1`) — USD for the native coins so they count too.
 *
 * Disabled without `ALCHEMY_API_KEY`; the rest of the API is unaffected.
 */

/** Chain id → Alchemy network subdomain, display label, native symbol. */
const NETWORKS: Record<string, { network: string; label: string; symbol: string }> = {
  eth: { network: 'eth-mainnet', label: 'Ethereum', symbol: 'ETH' },
  base: { network: 'base-mainnet', label: 'Base', symbol: 'ETH' },
  arbitrum: { network: 'arb-mainnet', label: 'Arbitrum', symbol: 'ETH' },
  optimism: { network: 'opt-mainnet', label: 'Optimism', symbol: 'ETH' },
  polygon: { network: 'polygon-mainnet', label: 'Polygon', symbol: 'POL' },
};

const NETWORK_LIST = Object.entries(NETWORKS).map(([id, v]) => ({ id, ...v }));
const LABEL_BY_NETWORK = new Map(NETWORK_LIST.map((n) => [n.network, n.label]));

export interface PortfolioToken {
  network: string;
  networkLabel: string;
  address: string;
  symbol: string;
  name: string;
  logo: string | null;
  balance: string;
  usdPrice: number | null;
  usd: number | null;
}

export interface NativeBalance {
  chain: string;
  chainLabel: string;
  symbol: string;
  balance: string;
  usdPrice: number | null;
  usd: number | null;
}

const TTL_MS = 60_000;
const PRICE_TTL_MS = 120_000;

/** Hex integer → decimal string with up to 6 trimmed fractional digits. */
function formatUnits(hex: string, decimals: number): string {
  let value: bigint;
  try {
    value = BigInt(hex);
  } catch {
    return '0';
  }
  if (decimals <= 0) return value.toString();
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = value % base;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

interface RawDataTokens {
  data?: {
    tokens?: {
      network?: string;
      tokenAddress?: string | null;
      tokenBalance?: string;
      tokenMetadata?: { symbol?: string; decimals?: number; name?: string; logo?: string | null };
      tokenPrices?: { currency?: string; value?: string }[];
    }[];
  };
}

export class AlchemyService {
  readonly name = 'alchemy' as const;

  constructor(private readonly client: ProviderClient = providerClient) {}

  get configured(): boolean {
    return env.ALCHEMY_API_KEY !== undefined;
  }

  private get key(): string {
    return env.ALCHEMY_API_KEY as string;
  }

  /** Every priced ERC-20 the address holds, across the supported chains. */
  async getWalletTokens(address: string): Promise<PortfolioToken[]> {
    if (!this.configured) return [];

    const url = `https://api.g.alchemy.com/data/v1/${this.key}/assets/tokens/by-address`;
    const raw = await this.client.request<RawDataTokens | null>('alchemy', url, {
      method: 'POST',
      body: {
        addresses: [{ address, networks: NETWORK_LIST.map((n) => n.network) }],
        withMetadata: true,
        withPrices: true,
      },
      cacheKey: `alchemy:tokens:${address.toLowerCase()}`,
      cacheTtlMs: TTL_MS,
    });

    const tokens = raw?.data?.tokens ?? [];
    return tokens
      .filter((t) => t.tokenAddress && t.tokenBalance && t.tokenBalance !== '0x0')
      .map((t) => {
        const decimals = t.tokenMetadata?.decimals ?? 18;
        const balance = formatUnits(t.tokenBalance as string, decimals);
        const price = toNumber(
          (t.tokenPrices ?? []).find((p) => p.currency === 'usd')?.value ?? null,
        );
        const amount = Number(balance);
        return {
          network: t.network ?? '',
          networkLabel: LABEL_BY_NETWORK.get(t.network ?? '') ?? t.network ?? '',
          address: t.tokenAddress as string,
          symbol: t.tokenMetadata?.symbol ?? '',
          name: t.tokenMetadata?.name ?? '',
          logo: t.tokenMetadata?.logo ?? null,
          balance,
          usdPrice: price,
          usd: price !== null && Number.isFinite(amount) ? amount * price : null,
        };
      })
      .filter((t) => Number(t.balance) > 0);
  }

  /** USD for a set of native symbols, e.g. ETH, POL. */
  async getPrices(symbols: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!this.configured || symbols.length === 0) return out;

    const url = `https://api.g.alchemy.com/prices/v1/${this.key}/tokens/by-symbol`;
    const raw = await this.client.request<{
      data?: { symbol?: string; prices?: { currency?: string; value?: string }[] }[];
    } | null>('alchemy', url, {
      method: 'POST',
      body: { symbols },
      cacheKey: `alchemy:prices:${symbols.slice().sort().join(',')}`,
      cacheTtlMs: PRICE_TTL_MS,
    });

    for (const entry of raw?.data ?? []) {
      const price = toNumber((entry.prices ?? []).find((p) => p.currency === 'usd')?.value ?? null);
      if (entry.symbol && price !== null) out.set(entry.symbol, price);
    }
    return out;
  }

  /** Native-coin balance for one chain via RPC, or null. */
  private async nativeBalance(address: string, id: string): Promise<{ chain: string; balance: string } | null> {
    const net = NETWORKS[id];
    if (!net) return null;
    const url = `https://${net.network}.g.alchemy.com/v2/${this.key}`;

    const raw = await this.client.request<{ result?: string } | null>('alchemy', url, {
      method: 'POST',
      body: { jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] },
      cacheKey: `alchemy:native:${id}:${address.toLowerCase()}`,
      cacheTtlMs: TTL_MS,
    });
    if (!raw?.result) return null;
    return { chain: id, balance: formatUnits(raw.result, 18) };
  }

  /** Native balances across every chain, priced, non-zero only. */
  async getNativeBalances(address: string): Promise<NativeBalance[]> {
    if (!this.configured) return [];

    const raw = await Promise.all(
      NETWORK_LIST.map((n) => this.nativeBalance(address, n.id).catch(() => null)),
    );
    const found = raw.filter((r): r is { chain: string; balance: string } => r !== null && Number(r.balance) > 0);
    if (found.length === 0) return [];

    const symbols = [...new Set(found.map((f) => NETWORKS[f.chain]?.symbol).filter(Boolean) as string[])];
    const prices = await this.getPrices(symbols).catch(() => new Map<string, number>());

    return found.map((f) => {
      const net = NETWORKS[f.chain];
      const price = net ? (prices.get(net.symbol) ?? null) : null;
      const amount = Number(f.balance);
      return {
        chain: f.chain,
        chainLabel: net?.label ?? f.chain,
        symbol: net?.symbol ?? '',
        balance: f.balance,
        usdPrice: price,
        usd: price !== null && Number.isFinite(amount) ? amount * price : null,
      };
    });
  }
}

export const alchemyService = new AlchemyService();
