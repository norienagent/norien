/**
 * The marketing site fetches a little live registry data (trending tokens on the
 * landing page, the contact form's API link) directly over NORIEN_API_URL in
 * server components, and proxies any browser-side call through the rewrite below
 * so there is no CORS setup and no API origin baked into client bundles.
 *
 * `@norien-live/web-ui` ships TypeScript source rather than a build, so Next
 * transpiles it as part of this app.
 */
import { withSentryConfig } from '@sentry/nextjs';

const API_URL = process.env.NORIEN_API_URL ?? 'http://127.0.0.1:3000';

// The canonical installers live at the repo root; norien.live/install.{sh,ps1}
// redirect there so `curl -fsSL … | sh` (and `irm … | iex`) resolve to the real
// script instead of the app's HTML 404. `-L` / irm both follow the redirect, and
// there is a single source of truth on `main` — nothing to keep in sync.
const RAW = 'https://raw.githubusercontent.com/norienagent/norien/main';

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@norien-live/web-ui'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
  async redirects() {
    return [
      { source: '/install.sh', destination: `${RAW}/install.sh`, permanent: false },
      { source: '/install.ps1', destination: `${RAW}/install.ps1`, permanent: false },
    ];
  },
};

// Wrapped so Sentry can instrument the build. Source maps are uploaded only when
// SENTRY_AUTH_TOKEN is set; without it the build simply skips that step.
export default withSentryConfig(nextConfig, {
  org: 'norien',
  project: 'javascript-nextjs',
  silent: !process.env.CI,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
