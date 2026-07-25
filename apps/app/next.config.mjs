/**
 * The app talks only to Norien. Server components fetch the registry directly
 * over NORIEN_API_URL, and any browser-side call goes through the rewrite below
 * so there is no CORS setup and no API origin baked into client bundles.
 *
 * `@norien-live/web-ui` ships TypeScript source rather than a build, so Next
 * transpiles it as part of this app.
 */
import { withSentryConfig } from '@sentry/nextjs';

const API_URL = process.env.NORIEN_API_URL ?? 'http://127.0.0.1:3000';

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@norien-live/web-ui'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

// Wrapped so Sentry can instrument the build. Source maps are uploaded only when
// SENTRY_AUTH_TOKEN is set; without it the build simply skips that step.
export default withSentryConfig(nextConfig, {
  org: 'norien',
  project: 'javascript-nextjs',
  silent: !process.env.CI,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  disableLogger: true,
});
