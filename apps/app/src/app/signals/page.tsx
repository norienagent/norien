import Link from 'next/link';

import { api, type Signal, type SignalTag } from '@norien-live/web-ui/api';
import { count, price, usd } from '@norien-live/web-ui';
import { Card, Empty, SectionHeading } from '@norien-live/web-ui';

import { SignalsBrief } from '@/components/signals-brief';

export const metadata = {
  title: 'Signals',
  description: 'AI market signals from live Robinhood Chain data.',
};

const TAG: Record<SignalTag, { label: string; cls: string }> = {
  'momentum-up': { label: 'Momentum ↑', cls: 'bg-up/10 text-up' },
  'momentum-down': { label: 'Momentum ↓', cls: 'bg-down/10 text-down' },
  'high-activity': { label: 'High activity', cls: 'bg-accent-soft text-accent' },
  'fresh-launch': { label: 'New', cls: 'bg-accent-soft text-accent' },
  'thin-risky': { label: 'Thin · risky', cls: 'bg-warn/10 text-warn' },
};

/**
 * AI Signals.
 *
 * Deterministic, data-derived signals from live Robinhood Chain markets, plus an
 * optional AI read. Observations, not financial advice.
 */
export default async function SignalsPage() {
  const result = await api.signals();
  const signals = result?.data.signals ?? [];

  return (
    <>
      <SectionHeading
        title="Signals"
        detail="Notable movements on Robinhood Chain — momentum, activity, and fresh launches — computed from live data. Observations, not financial advice."
      />

      <div className="mb-5">
        <SignalsBrief />
      </div>

      {signals.length === 0 ? (
        <Card>
          <Empty title="No notable signals right now" detail="Check back in a bit — the chain moves fast." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {signals.map((s: Signal) => (
            <Link
              key={s.address}
              href={`/token/${s.address}`}
              className="group flex flex-col rounded-xl border border-line bg-card p-5 transition-colors hover:border-accent/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold tracking-tight text-ink group-hover:text-accent">
                    {s.symbol}
                  </div>
                  <div className="truncate text-xs text-muted">{s.name}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm tabular-nums text-ink">{price(s.price)}</div>
                  {s.change24h != null ? (
                    <div
                      className={`text-xs tabular-nums ${s.change24h >= 0 ? 'text-up' : 'text-down'}`}
                    >
                      {s.change24h >= 0 ? '+' : ''}
                      {Math.abs(s.change24h) >= 1000
                        ? `${Math.round(s.change24h).toLocaleString()}%`
                        : `${s.change24h.toFixed(1)}%`}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.tags.map((tag) => (
                  <span
                    key={tag}
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${TAG[tag].cls}`}
                  >
                    {TAG[tag].label}
                  </span>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>Liq {usd(s.liquidity)}</span>
                <span>Vol {usd(s.volume24h)}</span>
                {s.holders != null ? <span>{count(s.holders)} holders</span> : null}
                {s.ageHours != null && s.ageHours <= 48 ? (
                  <span>{s.ageHours < 1 ? '<1h' : `${Math.round(s.ageHours)}h`} old</span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="mt-5 text-xs text-muted">
        Signals are computed from live market data and summarised by AI. They are observations, not
        financial advice, and can be wrong. Always do your own research.
      </p>
    </>
  );
}
