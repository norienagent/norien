import type {
  ChainContract,
  ChainWallet,
  MarketProject,
  MarketToken,
  SourceReport,
} from '@norien-live/sdk';

import type { CommandContext } from '../context.js';
import {
  CliError,
  definitions,
  emitJson,
  heading,
  line,
  relativeTime,
  spinner,
  styles,
  table,
  warn,
} from '../ui.js';

/**
 * Market-data commands.
 *
 * Every one reads from Norien's unified `/api/*` surface through the SDK. The
 * CLI never contacts an external provider directly — the aggregation already
 * happened server-side, which is what keeps the CLI, the frontend, and the SDK
 * showing the same numbers.
 */

// --- Formatting ------------------------------------------------------------

/** Compact currency, because a market table is unreadable at full precision. */
export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';

  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

/** Prices span many orders of magnitude, so precision adapts to size. */
export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (value === 0) return '$0';

  const abs = Math.abs(value);
  if (abs >= 1) return `$${value.toFixed(4)}`;
  if (abs >= 0.0001) return `$${value.toFixed(6)}`;
  return `$${value.toExponential(2)}`;
}

export function formatChange(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';

  const text = `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  return value >= 0 ? styles.ok(text) : styles.error(text);
}

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : value.toLocaleString('en-US');
}

/**
 * Renders which providers answered. Only shown when something was degraded or
 * skipped, so a healthy response stays quiet.
 */
function renderSources(sources: SourceReport[], degraded: boolean): void {
  const notable = sources.filter((source) => source.status !== 'ok');
  if (notable.length === 0) return;

  line();
  line(
    styles.dim(
      `sources: ${notable
        .map((source) => `${source.provider}=${source.status}`)
        .join(', ')}${degraded ? ' — data may be incomplete' : ''}`,
    ),
  );
}

function tokenColumns() {
  return [
    { header: 'symbol', value: (t: MarketToken) => styles.title(t.symbol || '—') },
    { header: 'name', value: (t: MarketToken) => truncate(t.name, 22) },
    { header: 'price', value: (t: MarketToken) => formatPrice(t.price), align: 'right' as const },
    { header: '24h', value: (t: MarketToken) => formatChange(t.change24h), align: 'right' as const },
    { header: 'volume', value: (t: MarketToken) => formatUsd(t.volume24h), align: 'right' as const },
    { header: 'liquidity', value: (t: MarketToken) => formatUsd(t.liquidity), align: 'right' as const },
    { header: 'mcap', value: (t: MarketToken) => formatUsd(t.marketCap), align: 'right' as const },
    { header: 'holders', value: (t: MarketToken) => formatCount(t.holders), align: 'right' as const },
    { header: 'chain', value: (t: MarketToken) => styles.dim(t.chain.name) },
  ];
}

// --- Commands --------------------------------------------------------------

/** `norien markets` */
export async function markets(
  context: CommandContext,
  options: { chain?: number; limit?: number; sort?: string; q?: string; offset?: number },
): Promise<void> {
  const progress = spinner('Loading markets').start();

  const result = await context.client.tokens
    .list({
      ...(options.chain !== undefined ? { chainId: options.chain } : {}),
      limit: options.limit ?? 20,
      offset: options.offset ?? 0,
      ...(options.sort ? { sort: options.sort as 'volume24' } : {}),
      ...(options.q ? { q: options.q } : {}),
    })
    .finally(() => progress.stop());

  if (context.json) return emitJson({ ok: true, ...result });

  if (result.data.items.length === 0) {
    warn('No tokens matched.');
    return;
  }

  heading(`Markets ${styles.dim(`· sorted by ${options.sort ?? 'volume24'}`)}`);
  line();
  table(result.data.items, tokenColumns());
  renderSources(result.sources, result.degraded);
  line();
}

/** `norien trending` */
export async function trending(
  context: CommandContext,
  options: { chain?: number; limit?: number },
): Promise<void> {
  const progress = spinner('Loading trending tokens').start();

  const result = await context.client.tokens
    .trending({
      ...(options.chain !== undefined ? { chainId: options.chain } : {}),
      limit: options.limit ?? 20,
    })
    .finally(() => progress.stop());

  if (context.json) return emitJson({ ok: true, ...result });

  if (result.data.items.length === 0) {
    warn('Nothing trending right now.');
    return;
  }

  heading('Trending');
  line();
  table(result.data.items, tokenColumns());
  renderSources(result.sources, result.degraded);
  line();
}

/** `norien token <address>` */
export async function token(
  context: CommandContext,
  address: string,
  options: { chain?: number },
): Promise<void> {
  const progress = spinner(`Loading ${address}`).start();

  const result = await context.client.tokens
    .get(address, { ...(options.chain !== undefined ? { chainId: options.chain } : {}) })
    .catch((error: unknown) => {
      progress.fail('Not found');
      throw error;
    })
    .finally(() => progress.stop());

  if (context.json) return emitJson({ ok: true, ...result });

  const t: MarketToken = result.data;

  heading(`${t.name} ${styles.dim(`(${t.symbol})`)}`);
  line();

  definitions([
    ['price', formatPrice(t.price)],
    ['24h change', formatChange(t.change24h)],
    ['market cap', formatUsd(t.marketCap)],
    ['fdv', formatUsd(t.fdv)],
    ['liquidity', formatUsd(t.liquidity)],
    ['volume 24h', formatUsd(t.volume24h)],
    ['holders', formatCount(t.holders)],
    ['txns 24h', formatCount(t.txns24h)],
    ['chain', `${t.chain.name} (${t.chain.id})`],
    ['contract', t.address],
    ['decimals', t.decimals === null || t.decimals === undefined ? null : String(t.decimals)],
    ['supply', formatCount(t.circulatingSupply ?? t.totalSupply ?? null)],
  ]);

  if (t.categories && t.categories.length > 0) {
    heading('Categories');
    line(`  ${t.categories.join(', ')}`);
  }

  if (t.description) {
    heading('About');
    line(indent(wrapText(t.description, 76), 2));
  }

  if (t.links) {
    heading('Links');
    definitions([
      ['website', t.links.website],
      ['twitter', t.links.twitter],
      ['telegram', t.links.telegram],
      ['explorer', t.links.explorer],
    ]);
  }

  renderSources(result.sources, result.degraded);
  line();
}

/** `norien wallet <address>` */
export async function wallet(
  context: CommandContext,
  address: string,
  options: { limit?: number },
): Promise<void> {
  const progress = spinner(`Loading ${address}`).start();

  const result = await context.client.wallets
    .get(address, { limit: options.limit ?? 10 })
    .finally(() => progress.stop());

  if (context.json) return emitJson({ ok: true, ...result });

  const w: ChainWallet = result.data;

  heading(`Wallet ${styles.dim(w.address)}`);
  line();
  definitions([
    ['balance', `${w.balanceFormatted} ${w.chain.name === 'Robinhood Chain' ? 'ETH' : ''}`.trim()],
    ['nonce', w.nonce === null ? null : String(w.nonce)],
    ['type', w.isContract ? 'contract' : 'externally owned account'],
    ['chain', `${w.chain.name} (${w.chain.id})`],
  ]);

  heading(`Transactions ${styles.dim(`(${w.transactions.length})`)}`);
  if (w.transactions.length === 0) {
    line(styles.dim('  none'));
  } else {
    table(w.transactions, [
      { header: 'hash', value: (tx) => styles.dim(`${tx.hash.slice(0, 14)}…`) },
      { header: 'block', value: (tx) => String(tx.blockNumber), align: 'right' as const },
      { header: 'from', value: (tx) => shortAddress(tx.from) },
      { header: 'to', value: (tx) => (tx.to ? shortAddress(tx.to) : styles.dim('contract create')) },
      { header: 'status', value: (tx) => (tx.success ? styles.ok('ok') : styles.error('failed')) },
      { header: 'when', value: (tx) => (tx.timestamp ? styles.dim(relativeTime(tx.timestamp)) : '') },
    ]);
  }

  heading(`Token transfers ${styles.dim(`(${w.tokenTransfers.length})`)}`);
  if (w.tokenTransfers.length === 0) {
    line(styles.dim('  none'));
  } else {
    table(w.tokenTransfers, [
      { header: 'token', value: (tr) => styles.title(tr.tokenSymbol ?? shortAddress(tr.tokenAddress)) },
      { header: 'amount', value: (tr) => formatTokenAmount(tr.value, tr.tokenDecimals), align: 'right' as const },
      { header: 'from', value: (tr) => shortAddress(tr.from) },
      { header: 'to', value: (tr) => shortAddress(tr.to) },
      { header: 'when', value: (tr) => (tr.timestamp ? styles.dim(relativeTime(tr.timestamp)) : '') },
    ]);
  }

  renderSources(result.sources, result.degraded);
  line();
}

/** `norien contract <address>` */
export async function contract(
  context: CommandContext,
  address: string,
  options: { abi?: boolean; source?: boolean },
): Promise<void> {
  const progress = spinner(`Loading ${address}`).start();

  const result = await context.client.contracts
    .get(address)
    .catch((error: unknown) => {
      progress.fail('Not found');
      throw error;
    })
    .finally(() => progress.stop());

  if (context.json) return emitJson({ ok: true, ...result });

  const c: ChainContract = result.data;

  heading(`${c.name ?? 'Contract'} ${styles.dim(c.address)}`);
  line();
  definitions([
    ['type', c.isContract ? 'contract' : 'externally owned account'],
    ['verified', c.verified ? styles.ok('yes') : styles.warn('no')],
    ['compiler', c.compilerVersion],
    ['optimization', c.optimizationEnabled === null ? null : c.optimizationEnabled ? 'enabled' : 'disabled'],
    ['license', c.license],
    ['creator', c.creator],
    ['creation tx', c.creationTxHash],
    ['bytecode', c.bytecodeSize > 0 ? `${c.bytecodeSize} bytes` : null],
    ['abi entries', c.abi ? String(c.abi.length) : null],
  ]);

  if (c.token) {
    heading('Token');
    definitions([
      ['name', c.token.name],
      ['symbol', c.token.symbol],
      ['decimals', c.token.decimals === null ? null : String(c.token.decimals)],
      ['holders', formatCount(c.token.holders)],
    ]);
  }

  if (options.abi) {
    heading('ABI');
    line(c.abi ? indent(JSON.stringify(c.abi, null, 2), 2) : styles.dim('  not available'));
  } else if (c.abi) {
    // Read-only functions are the useful summary; the full ABI is opt-in.
    const reads = c.abi.filter(isReadFunction).map((entry) => entry.name);
    if (reads.length > 0) {
      heading('Read functions');
      line(`  ${reads.join(', ')}`);
      line();
      line(styles.dim(`  Full ABI: norien contract ${address} --abi`));
    }
  }

  if (options.source) {
    heading('Source');
    line(c.sourceCode ? indent(c.sourceCode, 2) : styles.dim('  not verified'));
  } else if (c.sourceCode) {
    line();
    line(styles.dim(`  Source available — rerun with --source to print it.`));
  }

  renderSources(result.sources, result.degraded);
  line();
}

/** `norien project <slug>` */
export async function project(context: CommandContext, slug: string): Promise<void> {
  const progress = spinner(`Loading ${slug}`).start();

  const result = await context.client.projects
    .get(slug)
    .catch((error: unknown) => {
      progress.fail('Not found');
      throw error;
    })
    .finally(() => progress.stop());

  if (context.json) return emitJson({ ok: true, ...result });

  const p: MarketProject = result.data;

  heading(p.name);
  if (p.description) line(`  ${truncate(p.description, 90)}`);
  line();

  definitions([
    ['slug', p.slug],
    ['symbol', p.symbol],
    ['category', p.category],
    ['tvl', formatUsd(p.tvl)],
    ['chains', p.chains.length > 0 ? `${p.chains.length} — ${p.chains.slice(0, 5).join(', ')}` : null],
    ['website', p.url],
    ['twitter', p.twitter],
  ]);

  if (p.chainTvl.length > 0) {
    heading('TVL by chain');
    table(p.chainTvl.slice(0, 8), [
      { header: 'chain', value: (c) => c.chain },
      { header: 'tvl', value: (c) => formatUsd(c.tvl), align: 'right' as const },
    ]);
  }

  if (p.repository) {
    const r = p.repository;
    heading('Repository');
    definitions([
      ['repo', r.fullName],
      ['stars', formatCount(r.stars)],
      ['forks', formatCount(r.forks)],
      ['open issues', formatCount(r.openIssues)],
      ['license', r.license],
      ['last push', r.pushedAt ? relativeTime(r.pushedAt) : null],
      ['latest release', r.latestRelease ? `${r.latestRelease.tag}` : null],
    ]);

    if (r.languages.length > 0) {
      heading('Languages');
      line(`  ${r.languages.slice(0, 6).map((l) => `${l.name} ${l.share}%`).join(' · ')}`);
    }

    if (r.topContributors.length > 0) {
      heading('Top contributors');
      for (const person of r.topContributors) {
        line(`  ${styles.title(person.login.padEnd(20))} ${formatCount(person.contributions)} commits`);
      }
    }

    if (r.recentCommits.length > 0) {
      heading('Recent commits');
      for (const commit of r.recentCommits) {
        line(`  ${styles.dim(commit.sha)} ${truncate(commit.message, 60)}`);
      }
    }
  } else if (p.github) {
    line();
    warn(`Linked GitHub org "${p.github}" but no repository could be resolved.`);
  }

  renderSources(result.sources, result.degraded);
  line();
}

// --- Shared helpers --------------------------------------------------------

interface AbiFunction {
  type?: string;
  name?: string;
  stateMutability?: string;
}

function isReadFunction(entry: unknown): entry is AbiFunction & { name: string } {
  const fn = entry as AbiFunction;
  return (
    fn?.type === 'function' &&
    typeof fn.name === 'string' &&
    (fn.stateMutability === 'view' || fn.stateMutability === 'pure')
  );
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/** Integer-safe token amount formatting; balances exceed Number precision. */
export function formatTokenAmount(value: string, decimals: number | null): string {
  if (decimals === null) return value;

  try {
    const negative = value.startsWith('-');
    const digits = (negative ? value.slice(1) : value).padStart(decimals + 1, '0');
    const whole = digits.slice(0, digits.length - decimals);
    const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '').slice(0, 6);
    return `${negative ? '-' : ''}${Number(whole).toLocaleString('en-US')}${fraction ? `.${fraction}` : ''}`;
  } catch {
    return value;
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function wrapText(text: string, width: number): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if ((current + word).length > width) {
      if (current) lines.push(current.trimEnd());
      current = `${word} `;
    } else {
      current += `${word} `;
    }
  }

  if (current.trim()) lines.push(current.trimEnd());
  return lines.slice(0, 8).join('\n');
}

function indent(text: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((row) => (row.length > 0 ? prefix + row : row))
    .join('\n');
}

export { CliError };
