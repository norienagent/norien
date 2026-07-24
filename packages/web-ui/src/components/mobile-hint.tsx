'use client';

import { useEffect, useState } from 'react';

const KEY = 'norien-mobile-hint';

/**
 * A gentle nudge for touch devices stuck in "Desktop site" mode.
 *
 * A phone with desktop mode on reports a coarse pointer but a desktop-width
 * viewport — that combination is the tell. We suggest turning it off (the layout
 * is built mobile-first), once, and remember the dismissal.
 */
export function MobileHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (localStorage.getItem(KEY) === 'dismissed') return;
    } catch {
      // no storage — still fine to show once per load
    }
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const wide = window.innerWidth >= 900;
    if (coarse && wide) setShow(true);
  }, []);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(KEY, 'dismissed');
    } catch {
      // ignore
    }
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl border border-line bg-card px-4 py-3 shadow-lg">
      <span aria-hidden className="mt-0.5 text-accent">
        <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="6" y="2.5" width="8" height="15" rx="2" />
          <path d="M9 15h2" strokeLinecap="round" />
        </svg>
      </span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-ink">
        Norien is built for mobile. Turn off <span className="font-medium">“Desktop site”</span> in
        your browser for the best experience.
        <button
          type="button"
          onClick={dismiss}
          className="ml-2 whitespace-nowrap font-medium text-accent underline underline-offset-2"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
