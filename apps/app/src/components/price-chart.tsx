'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { ChartPoint, ChartRange, TokenChart } from '@norien-live/web-ui/api';
import { price } from '@norien-live/web-ui';

/**
 * A real OHLCV price chart for a token.
 *
 * Server-rendered with an initial window so the first paint has data, then
 * re-fetches client-side when the range changes. Pure SVG — no chart library,
 * so it stays inside the app's CSP and matches the design system exactly. A
 * crosshair reads out the price and time under the pointer.
 */

const RANGES: { key: ChartRange; label: string }[] = [
  { key: '24h', label: '24H' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
];

const HEIGHT = 240;
const PAD_Y = 16;

export function PriceChart({
  address,
  chainId,
  initial,
}: {
  address: string;
  chainId: number;
  initial: TokenChart | null;
}) {
  const [range, setRange] = useState<ChartRange>(initial?.range ?? '7d');
  const [chart, setChart] = useState<TokenChart | null>(initial);
  const [loading, setLoading] = useState(false);

  // Cache fetched windows so flipping between ranges is instant after the first.
  const cache = useRef<Map<ChartRange, TokenChart>>(new Map());
  useEffect(() => {
    if (initial) cache.current.set(initial.range, initial);
  }, [initial]);

  useEffect(() => {
    const cached = cache.current.get(range);
    if (cached) {
      setChart(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/token/${address}/chart?range=${range}&chainId=${chainId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { data: TokenChart } | null) => {
        if (cancelled || !body?.data) return;
        cache.current.set(range, body.data);
        setChart(body.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, address, chainId]);

  const points = chart?.points ?? [];
  const hasData = points.length >= 2;

  return (
    <div className="rounded-xl border border-line bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-ink">Price</span>
          {chart?.change !== null && chart?.change !== undefined ? (
            <span
              className={`text-xs font-medium tabular-nums ${
                chart.change >= 0 ? 'text-up' : 'text-down'
              }`}
            >
              {chart.change >= 0 ? '+' : ''}
              {(chart.change * 100).toFixed(2)}%
            </span>
          ) : null}
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                range === r.key
                  ? 'bg-accent text-white'
                  : 'text-muted hover:bg-sunken hover:text-ink'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-2 pb-2 pt-3">
        {hasData ? (
          <Plot points={points} up={(chart?.change ?? 0) >= 0} loading={loading} />
        ) : (
          <div className="flex h-[240px] items-center justify-center text-sm text-muted">
            {loading ? 'Loading…' : 'No price history for this window yet.'}
          </div>
        )}
      </div>
    </div>
  );
}

function Plot({ points, up, loading }: { points: ChartPoint[]; up: boolean; loading: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.max(240, Math.round(w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { line, area, min, max, coords } = useMemo(() => {
    const closes = points.map((p) => p.c);
    const lo = Math.min(...closes);
    const hi = Math.max(...closes);
    const span = hi - lo || hi || 1;
    const n = points.length;
    const xs = (i: number) => (n === 1 ? width / 2 : (i / (n - 1)) * width);
    const ys = (c: number) => HEIGHT - PAD_Y - ((c - lo) / span) * (HEIGHT - PAD_Y * 2);
    const pts = points.map((p, i) => ({ x: xs(i), y: ys(p.c), c: p.c, t: p.t }));
    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    const areaPath = `${linePath} L${width} ${HEIGHT} L0 ${HEIGHT} Z`;
    return { line: linePath, area: areaPath, min: lo, max: hi, coords: pts };
  }, [points, width]);

  const color = up ? 'var(--color-up)' : 'var(--color-down)';
  const active = hover !== null ? coords[hover] : null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < coords.length; i += 1) {
      const d = Math.abs((coords[i]?.x ?? 0) - x);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setHover(nearest);
  }

  return (
    <div ref={wrapRef} className="relative" style={{ opacity: loading ? 0.5 : 1 }}>
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        className="block touch-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#chart-fill)" />
        <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
        {active ? (
          <g>
            <line x1={active.x} y1="0" x2={active.x} y2={HEIGHT} stroke="var(--color-line)" strokeWidth="1" />
            <circle cx={active.x} cy={active.y} r="3.5" fill={color} stroke="var(--color-card)" strokeWidth="1.5" />
          </g>
        ) : null}
      </svg>

      {/* Min / max guide labels */}
      <span className="pointer-events-none absolute right-1 top-0 text-[0.7rem] tabular-nums text-muted">
        {price(max)}
      </span>
      <span className="pointer-events-none absolute bottom-0 right-1 text-[0.7rem] tabular-nums text-muted">
        {price(min)}
      </span>

      {/* Hover readout */}
      {active ? (
        <div className="pointer-events-none absolute left-2 top-0 rounded-md border border-line bg-card px-2 py-1 text-xs shadow-sm">
          <span className="font-medium tabular-nums text-ink">{price(active.c)}</span>
          <span className="ml-2 text-muted">
            {new Date(active.t * 1000).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      ) : null}
    </div>
  );
}
