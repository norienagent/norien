'use client';

import { useEffect, useState } from 'react';

const KEY = 'norien-desktop-hint';

/**
 * A gentle nudge for phones to switch on "Desktop site".
 *
 * Norien is data-dense — registry tables, market rows, multi-chain portfolios —
 * and that reads far better with the full desktop layout. A touch device in a
 * narrow viewport is a phone in its normal mobile view, so we suggest turning on
 * "Desktop site", once, and remember the dismissal.
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
    const narrow = window.innerWidth < 820;
    if (coarse && narrow) setShow(true);
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
        Norien is data-dense. Turn on <span className="font-medium">“Desktop site”</span> in your
        browser for the best experience on mobile.
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
