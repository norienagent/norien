'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

/**
 * Global search entry point.
 *
 * A 0x address is routed straight to the right page rather than through a
 * search round trip — pasting a contract should land on that contract. Anything
 * else goes to the results page, which queries the unified search endpoint.
 */
export function SearchBox({
  initial = '',
  placeholder = 'Search tokens, projects, agents, or paste an address',
  autoFocus = false,
}: {
  initial?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);

  function submit(event: FormEvent) {
    event.preventDefault();
    const query = value.trim();
    if (!query) return;

    if (/^0x[0-9a-fA-F]{40}$/.test(query)) {
      router.push(`/address/${query.toLowerCase()}`);
      return;
    }

    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <form onSubmit={submit} role="search" className="flex w-full items-center gap-2">
      <div className="relative flex-1">
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <circle cx="9" cy="9" r="5.5" />
          <path d="M13 13l4 4" strokeLinecap="round" />
        </svg>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          aria-label="Search"
          spellCheck={false}
          autoFocus={autoFocus}
          className="w-full rounded-lg border border-line bg-card py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="hidden shrink-0 rounded-lg border border-line bg-card px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-sunken sm:inline-flex"
      >
        Search
      </button>
    </form>
  );
}
