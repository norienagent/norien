/**
 * The marketing site fetches a little live registry data (trending tokens on the
 * landing page, the contact form's API link) directly over NORIEN_API_URL in
 * server components, and proxies any browser-side call through the rewrite below
 * so there is no CORS setup and no API origin baked into client bundles.
 *
 * `@norien-live/web-ui` ships TypeScript source rather than a build, so Next
 * transpiles it as part of this app.
 */
const API_URL = process.env.NORIEN_API_URL ?? 'http://127.0.0.1:3000';

export default {
  reactStrictMode: true,
  transpilePackages: ['@norien-live/web-ui'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};
