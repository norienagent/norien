import { env } from '../../config/env.js';
import { type ProviderClient, providerClient } from '../../core/provider-client.js';

/**
 * Alchemy — the multi-chain backbone.
 *
 * Norien's native data is Robinhood Chain; Alchemy widens it to the major EVM
 * chains. One Data-API call returns a wallet's holdings — native coin and
 * priced ERC-20s — across every supported chain, so there is a single request
 * and a single point of failure. Disabled without `ALCHEMY_API_KEY`.
 */

/** The chains we surface, with display label and native-coin symbol. */
const NETWORKS: { network: string; label: string; nativeSymbol: string }[] = [
  { network: 'eth-mainnet', label: 'Ethereum', nativeSymbol: 'ETH' },
  { network: 'base-mainnet', label: 'Base', nativeSymbol: 'ETH' },
  { network: 'arb-mainnet', label: 'Arbitrum', nativeSymbol: 'ETH' },
  { network: 'opt-mainnet', label: 'Optimism', nativeSymbol: 'ETH' },
  // Alchemy's Data API canonicalises Polygon to `matic-mainnet` in responses.
  { network: 'matic-mainnet', label: 'Polygon', nativeSymbol: 'POL' },
];

const META = new Map(NETWORKS.map((n) => [n.network, n]));

export interface PortfolioToken {
  network: string;
  networkLabel: string;
  isNative: boolean;
  address: string;
  symbol: string;
  name: string;
  logo: string | null;
  balance: string;
  usdPrice: number | null;
  usd: number | null;
}

/** The native-coin position shape the portfolio exposes separately. */
export interface NativeBalance {
  chain: string;
  chainLabel: string;
  symbol: string;
  balance: string;
  usdPrice: number | null;
  usd: number | null;
}

const TTL_MS = 60_000;

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
      tokenMetadata?: { symbol?: string | null; decimals?: number | null; name?: string | null; logo?: string | null };
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

  /**
   * Every position a wallet holds across the supported chains — native and
   * priced ERC-20 — in one call. Dust and unpriced ERC-20s (usually spam) are
   * dropped; the native coin is always kept.
   */
  async getWalletTokens(address: string): Promise<PortfolioToken[]> {
    if (!this.configured) return [];

    const url = `https://api.g.alchemy.com/data/v1/${this.key}/assets/tokens/by-address`;
    const raw = await this.client.request<RawDataTokens | null>('alchemy', url, {
      method: 'POST',
      body: {
        addresses: [{ address, networks: NETWORKS.map((n) => n.network) }],
        withMetadata: true,
        withPrices: true,
      },
      cacheKey: `alchemy:tokens:${address.toLowerCase()}`,
      cacheTtlMs: TTL_MS,
    });

    const tokens = raw?.data?.tokens ?? [];

    return tokens
      .map((t): PortfolioToken => {
        const meta = META.get(t.network ?? '');
        const isNative = !t.tokenAddress;
        const decimals = isNative ? 18 : (t.tokenMetadata?.decimals ?? 18);
        const balance = t.tokenBalance ? formatUnits(t.tokenBalance, decimals) : '0';
        const price = toNumber((t.tokenPrices ?? []).find((p) => p.currency === 'usd')?.value ?? null);
        const amount = Number(balance);
        return {
          network: t.network ?? '',
          networkLabel: meta?.label ?? t.network ?? '',
          isNative,
          address: t.tokenAddress ?? 'native',
          symbol: isNative ? (meta?.nativeSymbol ?? 'ETH') : (t.tokenMetadata?.symbol ?? ''),
          name: isNative ? `${meta?.label ?? ''} native coin`.trim() : (t.tokenMetadata?.name ?? ''),
          logo: t.tokenMetadata?.logo ?? null,
          balance,
          usdPrice: price,
          usd: price !== null && Number.isFinite(amount) ? amount * price : null,
        };
      })
      .filter((t) => Number(t.balance) > 0)
      .filter((t) => t.isNative || (t.usd !== null && t.usd >= 0.01));
  }
}

export const alchemyService = new AlchemyService();
