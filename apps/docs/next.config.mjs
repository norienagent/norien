/**
 * The documentation site is mostly static, but the "Ask Norien" assistant posts
 * to the registry, so `/api/*` is proxied through to it (no CORS, no API origin
 * in client bundles). `@norien-live/web-ui` ships TypeScript source rather than
 * a build, so Next transpiles it as part of this app.
 */
const API_URL = process.env.NORIEN_API_URL ?? 'http://127.0.0.1:3000';

export default {
  reactStrictMode: true,
  transpilePackages: ['@norien-live/web-ui'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};
