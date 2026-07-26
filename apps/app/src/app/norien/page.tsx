import type { Metadata } from 'next';

import { api } from '@norien-live/web-ui/api';
import { count, price, usd } from '@norien-live/web-ui';

import { CopyAddress } from '../../components/copy-button';
import { PriceChart } from '../../components/price-chart';

/**
 * $NORIEN — the official token page.
 *
 * Live: real market data + chart from Norien's own data API, contract address
 * with copy, and the trade/registry links.
 */

const NORIEN_TOKEN_ADDRESS = '0xc53E73B5AeF6BeE1384C90AE6Eb9216A5C33979f';
const NORIEN_CHAIN_ID = 4663; // Robinhood Chain

const X_URL = 'https://x.com/norienlive';
const GITHUB_URL = 'https://github.com/norienagent/norien';
const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL ?? 'https://docs.norien.live';
const DEFINED_URL = `https://www.defined.fi/robinhood/${NORIEN_TOKEN_ADDRESS.toLowerCase()}`;
const VIRTUALS_URL = 'https://app.virtuals.io/virtuals/123009';

export const metadata: Metadata = {
  title: '$NORIEN — the Norien token',
  description:
    'The official utility token for the Norien network on Robinhood Chain. Live now.',
};

const UTILITY = [
  {
    title: 'Credits & access',
    body: 'Pay for premium data, compute, Signals, and higher API limits — spend $NORIEN across the network.',
  },
  {
    title: 'Publisher priority',
    body: 'Verified-publisher status and ranking boosts for the agents, tools, and skills you ship.',
  },
  {
    title: 'Staking',
    body: 'Stake to feature and help run agents, and to earn from the activity they drive.',
  },
  {
    title: 'Governance',
    body: 'Steer registry policy, listing standards, and what the network builds next.',
  },
  {
    title: 'Premium skills',
    body: 'Unlock advanced, data-grounded Skills and deeper market analytics.',
  },
  {
    title: 'Agent economy',
    body: 'The settlement layer for agents paying agents — tools, data, and services, on-chain.',
  },
];

export default async function NorienTokenPage() {
  const [tokenRes, chartRes] = await Promise.all([
    api.token(NORIEN_TOKEN_ADDRESS, NORIEN_CHAIN_ID),
    api.tokenChart(NORIEN_TOKEN_ADDRESS, { range: '24h', chainId: NORIEN_CHAIN_ID }),
  ]);
  const token = tokenRes?.data ?? null;
  const change = token?.change24h ?? null;

  const stats = [
    { label: 'Price', value: token ? price(token.price) : '—' },
    { label: 'Market cap', value: token ? usd(token.marketCap) : '—' },
    { label: 'Supply', value: token ? count(token.totalSupply ?? null) : '—' },
    { label: 'Holders', value: token ? count(token.holders ?? null) : '—' },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-card to-sunken px-8 py-14 text-center sm:px-12 sm:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 size-[420px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative flex flex-col items-center">
          <TokenCoin className="size-28 drop-shadow-xl sm:size-32" />
          <h1 className="mt-7 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">$NORIEN</h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            The utility token powering the Norien network on Robinhood Chain — the registry, runtime,
            data API, and agent economy.
          </p>

          <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-up/30 bg-up/10 px-4 py-1.5 text-sm font-medium text-up">
            <span className="size-2 animate-pulse rounded-full bg-up" />
            Live on Robinhood Chain
          </span>

          {token ? (
            <div className="mt-6 flex items-baseline justify-center gap-3">
              <span className="text-3xl font-semibold tabular-nums text-ink">{price(token.price)}</span>
              {change != null ? (
                <span
                  className={`text-base font-medium tabular-nums ${change >= 0 ? 'text-up' : 'text-down'}`}
                >
                  {change >= 0 ? '+' : ''}
                  {Math.abs(change) >= 1000 ? `${Math.round(change).toLocaleString()}%` : `${change.toFixed(2)}%`}{' '}
                  24h
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 flex w-full max-w-xl justify-center">
            <CopyAddress address={NORIEN_TOKEN_ADDRESS} />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <SocialButton href={DEFINED_URL} label="Trade on Defined" icon={<ChartIcon />} primary />
            <SocialButton href={VIRTUALS_URL} label="Virtuals" icon={<DotIcon />} />
            <SocialButton href={X_URL} label="X" icon={<XIcon />} />
            <SocialButton href={GITHUB_URL} label="GitHub" icon={<GitHubIcon />} />
            <SocialButton href={DOCS_URL} label="Docs" icon={<DocIcon />} />
          </div>
        </div>
      </section>

      {/* Live market row */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-card px-5 py-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted">{s.label}</div>
            <div className="mt-1.5 text-lg font-semibold tabular-nums text-ink">{s.value}</div>
          </div>
        ))}
      </section>

      {/* Real chart */}
      <section className="mt-6">
        <PriceChart
          address={NORIEN_TOKEN_ADDRESS}
          chainId={NORIEN_CHAIN_ID}
          initial={chartRes?.data ?? null}
        />
      </section>

      {/* Contract details */}
      <section className="mt-6 rounded-2xl border border-line bg-card p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Detail label="Contract" mono value={NORIEN_TOKEN_ADDRESS} />
          <Detail label="Chain" value="Robinhood Chain" />
          <Detail label="Token" value={token?.name ?? 'Norien'} />
          <Detail label="Total supply" value={token ? count(token.totalSupply ?? null) : '—'} />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={DEFINED_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm font-medium text-accent underline underline-offset-2"
          >
            View on Defined ↗
          </a>
          <a
            href={VIRTUALS_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm font-medium text-accent underline underline-offset-2"
          >
            View on Virtuals ↗
          </a>
          <a
            href={`/token/${NORIEN_TOKEN_ADDRESS}`}
            className="text-sm font-medium text-accent underline underline-offset-2"
          >
            Full token page ↗
          </a>
        </div>
      </section>

      {/* Utility */}
      <section className="mt-12">
        <div className="text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Built to be used</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">
            $NORIEN is a utility token — value flows from what the network does. Utility rolls out
            across the platform.
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {UTILITY.map((u) => (
            <div
              key={u.title}
              className="rounded-2xl border border-line bg-card p-6 transition-colors hover:border-accent/40"
            >
              <h3 className="text-base font-semibold tracking-tight text-ink">{u.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{u.body}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-8 text-center text-xs leading-relaxed text-muted">
        Informational only — not financial advice, not an offer. Utility is planned and subject to
        change. Do your own research.
      </p>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 break-all text-sm text-ink ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

/** The $NORIEN coin — the stacked-bars mark struck on a warm token face. */
function TokenCoin({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label="$NORIEN token">
      <defs>
        <radialGradient id="nc-face" cx="50%" cy="36%" r="78%">
          <stop offset="0%" stopColor="#9C7C53" />
          <stop offset="55%" stopColor="#7A5A3A" />
          <stop offset="100%" stopColor="#5A4126" />
        </radialGradient>
        <linearGradient id="nc-gloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.24" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="96" fill="url(#nc-face)" />
      <circle cx="100" cy="100" r="96" fill="url(#nc-gloss)" />
      <circle cx="100" cy="100" r="87" fill="none" stroke="#F6F2EA" strokeOpacity="0.22" strokeWidth="2" />
      <g fill="#F6F2EA">
        <rect x="76" y="62" width="48" height="19" rx="6" opacity="0.5" />
        <rect x="64" y="91" width="72" height="19" rx="6" opacity="0.78" />
        <rect x="52" y="120" width="96" height="19" rx="6" />
      </g>
    </svg>
  );
}

function SocialButton({
  href,
  label,
  icon,
  primary = false,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
        primary
          ? 'bg-accent text-white hover:bg-accent-hover'
          : 'border border-line bg-card text-ink hover:bg-sunken'
      }`}
    >
      {icon}
      {label}
    </a>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[16px]" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-[16px]" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-[16px]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M5 3.5h7l3 3v10H5z" strokeLinejoin="round" />
      <path d="M12 3.5v3h3M7.5 10h5M7.5 13h5" strokeLinecap="round" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-[16px]" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M3 14l4-5 3 3 4-7 3 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DotIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-[16px]" fill="currentColor" aria-hidden>
      <circle cx="10" cy="10" r="5" />
    </svg>
  );
}
