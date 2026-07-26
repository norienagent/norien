'use client';

import { toggleWatch, useIsWatched, type WatchedToken } from '@/lib/watchlist';

/**
 * A star toggle that adds/removes a token from the local watchlist.
 * Two sizes: an icon-only button (rows) and a labelled one (detail headers).
 */
export function WatchButton({
  token,
  variant = 'icon',
}: {
  token: WatchedToken;
  variant?: 'icon' | 'labelled';
}) {
  const watched = useIsWatched(token.address);

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    toggleWatch(token);
  }

  if (variant === 'labelled') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={watched}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
          watched
            ? 'border-accent bg-accent-soft text-accent'
            : 'border-line bg-card text-ink hover:bg-sunken'
        }`}
      >
        <Star filled={watched} />
        {watched ? 'Watching' : 'Watch'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={watched}
      aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
      title={watched ? 'Watching' : 'Watch'}
      className={`rounded-md p-1.5 transition-colors ${
        watched ? 'text-accent' : 'text-muted hover:bg-sunken hover:text-ink'
      }`}
    >
      <Star filled={watched} />
    </button>
  );
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M10 2.5l2.35 4.76 5.25.76-3.8 3.7.9 5.23L10 14.98l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76L10 2.5z" />
    </svg>
  );
}
