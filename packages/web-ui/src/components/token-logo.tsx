'use client';

import { useState } from 'react';

import { proxiedLogo } from '../lib/format';

/**
 * A token's logo, with a graceful fallback.
 *
 * Provider logos are missing for many tokens and, when present, point at CDNs
 * that occasionally 404. Either way a broken `<img>` glyph looks like a bug, so
 * this shows the symbol's initial on the same surface instead — and swaps to it
 * on load failure, which needs the client, hence this small component. The URL
 * is routed through Norien's image proxy so the source CDN never appears.
 */
export function TokenLogo({
  src,
  symbol,
  className = 'size-6',
}: {
  src: string | null | undefined;
  symbol: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const base = `${className} shrink-0 rounded-full border border-line bg-sunken`;
  const proxied = proxiedLogo(src);

  if (proxied && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote logos come
      // from many provider CDNs; configuring each host is not worth it here.
      <img
        src={proxied}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${base} object-cover`}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`${base} flex items-center justify-center text-[0.65em] font-semibold uppercase text-muted`}
    >
      {(symbol || '?').slice(0, 1)}
    </span>
  );
}
