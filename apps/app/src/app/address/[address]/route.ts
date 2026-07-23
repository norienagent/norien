import { NextResponse } from 'next/server';

import { API_URL } from '@norien-live/web-ui';

/**
 * Address router.
 *
 * A raw address does not say what it is, so one lookup decides: bytecode means
 * a contract, no bytecode means a wallet.
 *
 * Implemented as a route handler rather than a page because handlers are not
 * streamed — this returns a real 307 with a Location header, which a page
 * calling `redirect()` cannot do once App Router has begun streaming.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ address: string }> },
): Promise<NextResponse> {
  const { address } = await context.params;
  const normalized = address.toLowerCase();

  if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
    return NextResponse.redirect(
      new URL(`/search?q=${encodeURIComponent(address)}`, request.url),
      307,
    );
  }

  let isContract = false;
  try {
    const response = await fetch(`${API_URL}/api/contracts/${normalized}`, {
      next: { revalidate: 300 },
      headers: { accept: 'application/json' },
    });
    if (response.ok) {
      const body = (await response.json()) as { data?: { isContract?: boolean } };
      isContract = body.data?.isContract === true;
    }
  } catch {
    // An unreachable API should still route somewhere useful rather than error.
  }

  const target = isContract ? `/contract/${normalized}` : `/wallet/${normalized}`;
  return NextResponse.redirect(new URL(target, request.url), 307);
}
