import type { Metadata } from 'next';

import { PriceChart } from '../../components/price-chart';

/**
 * $NORIEN — the official token page.
 *
 * Pre-launch: everything is "coming soon", but the page is production-grade so
 * launch is a one-line flip. Set NORIEN_TOKEN_ADDRESS to the deployed contract
 * and the real chart + live market data light up automatically.
 */

// Flip this to the deployed contract at launch — the chart and market row go live.
const NORIEN_TOKEN_ADDRESS: string | null = null;
const NORIEN_CHAIN_ID = 4663; // Robinhood Chain

const X_URL = 'https://x.com/norienlive';
const GITHUB_URL = 'https://github.com/norienagent/norien';
const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL ?? 'https://docs.norien.live';

export const metadata: Metadata = {
  title: '$NORIEN — the Norien token',
  description:
    'The official utility token for the Norien network on Robinhood Chain. Coming soon.',
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

export default function NorienTokenPage() {
  const live = NORIEN_TOKEN_ADDRESS !== null;

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
          <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-4 py-1.5 text-sm font-medium text-accent">
            <span className="size-2 animate-pulse rounded-full bg-accent" />
            Coming soon
          </span>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <SocialButton href={X_URL} label="Follow on X" icon={<XIcon />} primary />
            <SocialButton href={GITHUB_URL} label="GitHub" icon={<GitHubIcon />} />
            <SocialButton href={DOCS_URL} label="Docs" icon={<DocIcon />} />
          </div>
        </div>
      </section>

      {/* Market row (coming soon until live) */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Price', value: null },
          { label: 'Market cap', value: null },
          { label: 'Supply', value: null },
          { label: 'Holders', value: null },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-card px-5 py-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted">{s.label}</div>
            <div className="mt-1.5 text-lg font-semibold text-ink">
              {s.value ?? <span className="text-muted">Soon</span>}
            </div>
          </div>
        ))}
      </section>

      {/* Chart — real when live, elegant placeholder until then */}
      <section className="mt-6">
        {live ? (
          <PriceChart address={NORIEN_TOKEN_ADDRESS as string} chainId={NORIEN_CHAIN_ID} initial={null} />
        ) : (
          <ComingSoonChart />
        )}
      </section>

      {/* Utility */}
      <section className="mt-12">
        <div className="text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Built to be used
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">
            $NORIEN is a utility token — value flows from what the network does. Planned utility,
            rolling out after launch.
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

      {/* Launch strip */}
      <section className="mt-8 rounded-2xl border border-line bg-card p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <div className="text-base font-semibold text-ink">Launching on Robinhood Chain</div>
          <div className="mt-1 text-sm text-muted">
            Contract address and the live chart go here on launch. Follow{' '}
            <a href={X_URL} target="_blank" rel="noreferrer noopener" className="text-accent underline underline-offset-2">
              @norienlive
            </a>{' '}
            so you don&apos;t miss it.
          </div>
        </div>
        <div className="mt-4 flex gap-3 sm:mt-0 sm:shrink-0">
          <SocialButton href={X_URL} label="Follow on X" icon={<XIcon />} primary />
          <SocialButton href={GITHUB_URL} label="GitHub" icon={<GitHubIcon />} />
        </div>
      </section>

      <p className="mt-6 text-center text-xs leading-relaxed text-muted">
        Informational only — not financial advice, not an offer, and not a promise of value. Utility
        is planned and subject to change. Do your own research.
      </p>
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

/** Placeholder that reads as the real chart, so launch is a seamless swap. */
function ComingSoonChart() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-card">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <span className="text-sm font-medium text-ink">Price</span>
        <div className="flex gap-1">
          {['24H', '7D', '30D', '90D'].map((r, i) => (
            <span
              key={r}
              className={`rounded-md px-2 py-1 text-xs font-medium ${i === 1 ? 'bg-accent text-white' : 'text-muted'}`}
            >
              {r}
            </span>
          ))}
        </div>
      </div>
      <div className="relative h-[240px]">
        <svg viewBox="0 0 700 240" preserveAspectRatio="none" className="h-full w-full opacity-40">
          <defs>
            <linearGradient id="cs-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 170 C 80 150, 120 120, 180 130 S 300 90, 360 110 S 480 60, 560 80 S 660 40, 700 55"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M0 170 C 80 150, 120 120, 180 130 S 300 90, 360 110 S 480 60, 560 80 S 660 40, 700 55 L700 240 L0 240 Z"
            fill="url(#cs-fill)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span className="rounded-full border border-line bg-canvas/80 px-4 py-1.5 text-sm font-medium text-ink backdrop-blur-sm">
            Live chart · coming soon
          </span>
          <span className="text-xs text-muted">Powered by Norien&apos;s real OHLCV data at launch</span>
        </div>
      </div>
    </div>
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
