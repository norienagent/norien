import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/**
 * Logo image proxy.
 *
 * Token and project logos live on third-party image CDNs. Rendering them
 * directly would print those vendors' domains into every page's source, so the
 * frontend routes them through here instead: the browser only ever sees
 * Norien's own origin.
 *
 * The source URL is base64url-encoded in `s` and restricted to a small
 * allowlist of known image hosts — this is a logo proxy, never an open proxy, so
 * it cannot be turned into an SSRF primitive. The body is read under a hard size
 * cap (streamed, so a hostile payload can't exhaust the heap) and cached hard,
 * since a logo effectively never changes.
 */

const ALLOWED_HOST_SUFFIXES = [
  'coingecko.com',
  'defined.fi',
  'llama.fi',
  'blockscout.com',
  'githubusercontent.com',
];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const FETCH_TIMEOUT_MS = 8_000;

/** Decodes `s` to a source URL, or null if it is malformed or off the allowlist. */
function decodeSource(s: string | undefined): URL | null {
  if (!s) return null;
  try {
    const decoded = Buffer.from(s, 'base64url').toString('utf8');
    const url = new URL(decoded);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const allowed = ALLOWED_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
    return allowed ? url : null;
  } catch {
    return null;
  }
}

export const imageRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/api/img', { schema: { hide: true } }, async (request, reply) => {
    const source = decodeSource((request.query as { s?: string }).s);
    if (!source) return reply.code(404).send();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const upstream = await fetch(source, {
        signal: controller.signal,
        headers: { accept: 'image/*', 'user-agent': 'norien/0.1' },
      });

      const type = upstream.headers.get('content-type') ?? '';
      if (!upstream.ok || !type.startsWith('image/')) return reply.code(404).send();

      const declared = Number(upstream.headers.get('content-length') ?? '');
      if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return reply.code(404).send();

      const reader = upstream.body?.getReader();
      if (!reader) return reply.code(404).send();

      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
          await reader.cancel().catch(() => {});
          return reply.code(404).send();
        }
        chunks.push(value);
      }

      return reply
        .header('content-type', type)
        .header('cache-control', 'public, max-age=86400, immutable')
        .send(Buffer.concat(chunks, total));
    } catch {
      return reply.code(404).send();
    } finally {
      clearTimeout(timer);
    }
  });
};
