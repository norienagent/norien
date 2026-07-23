/**
 * Display formatting.
 *
 * Defined once and shared by every page, so a market cap is rendered the same
 * way in a table row, a stat tile, and a detail header.
 */

const EM_DASH = '—';

/**
 * User-facing names for the data sources behind the unified API.
 *
 * The product presents one aggregated data layer, not a list of third-party
 * vendors — callers integrate with Norien, not with whoever Norien happens to
 * read. So every surface renders these functional labels, never the underlying
 * provider's brand.
 */
const PROVIDER_LABELS: Record<string, string> = {
  codex: 'Market data',
  coingecko: 'Price feed',
  defillama: 'Protocol data',
  blockscout: 'Chain explorer',
  github: 'Repository data',
  rpc: 'Chain node',
};

/** The display label for a data source id, never the vendor's brand name. */
export function providerLabel(id: string): string {
  const key = id.toLowerCase();
  if (PROVIDER_LABELS[key]) return PROVIDER_LABELS[key];
  // Unknown source: title-case the id rather than leak a raw slug.
  return key.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Removes vendor brand names from free-text (a provider's status detail can read
 * "missing COINGECKO_API_KEY"), so diagnostics never reveal the sources either.
 */
export function scrubProviders(text: string | null | undefined): string {
  if (!text) return EM_DASH;
  let out = text;
  for (const [id, label] of Object.entries(PROVIDER_LABELS)) {
    out = out.replace(new RegExp(id, 'gi'), label);
  }
  return out;
}

/** base64url without padding, in either the browser or Node. */
function toBase64Url(input: string): string {
  const b64 =
    typeof window === 'undefined'
      ? Buffer.from(input, 'utf8').toString('base64')
      : btoa(String.fromCharCode(...new TextEncoder().encode(input)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Rewrites a remote logo URL to go through Norien's own image proxy, so the
 * source CDN's domain never lands in the page. Same-origin (`/api/*` is
 * rewritten to the registry) and cached hard downstream. Non-http sources (a
 * `data:` URI) and empty values pass through untouched.
 */
export function proxiedLogo(src: string | null | undefined): string | null {
  if (!src) return null;
  if (!/^https?:\/\//i.test(src)) return src;
  return `/api/img?s=${toBase64Url(src)}`;
}

/** Compact currency; full precision is unreadable in a dense table. */
export function usd(value: number | null | undefined): string {
  if (value === null || value === undefined) return EM_DASH;

  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

/** Prices span many orders of magnitude, so precision adapts to size. */
export function price(value: number | null | undefined): string {
  if (value === null || value === undefined) return EM_DASH;
  if (value === 0) return '$0';

  const abs = Math.abs(value);
  if (abs >= 1000) return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (abs >= 1) return `$${value.toFixed(4)}`;
  if (abs >= 0.0001) return `$${value.toFixed(6)}`;
  return `$${value.toExponential(2)}`;
}

export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined) return EM_DASH;
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function count(value: number | null | undefined): string {
  return value === null || value === undefined ? EM_DASH : value.toLocaleString('en-US');
}

export function shortAddress(address: string, size = 6): string {
  return address.length > size * 2 + 2
    ? `${address.slice(0, size + 2)}…${address.slice(-size)}`
    : address;
}

/** Integer-safe: token balances routinely exceed Number precision. */
export function tokenAmount(value: string, decimals: number | null): string {
  if (decimals === null) return value;

  try {
    const negative = value.startsWith('-');
    const digits = (negative ? value.slice(1) : value).padStart(decimals + 1, '0');
    const whole = digits.slice(0, digits.length - decimals);
    const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '').slice(0, 6);
    const formatted = Number(whole).toLocaleString('en-US');
    return `${negative ? '-' : ''}${formatted}${fraction ? `.${fraction}` : ''}`;
  } catch {
    return value;
  }
}

export function relativeTime(iso: string | null): string {
  if (!iso) return EM_DASH;

  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return EM_DASH;

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2_592_000) return `${Math.floor(seconds / 86_400)}d ago`;
  if (seconds < 31_536_000) return `${Math.floor(seconds / 2_592_000)}mo ago`;
  return `${Math.floor(seconds / 31_536_000)}y ago`;
}

export const dash = EM_DASH;
