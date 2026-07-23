/**
 * The documentation site is static content that links out to the app and the
 * API; it holds no data of its own. `@norien-live/web-ui` ships TypeScript
 * source rather than a build, so Next transpiles it as part of this app.
 */
export default {
  reactStrictMode: true,
  transpilePackages: ['@norien-live/web-ui'],
};
