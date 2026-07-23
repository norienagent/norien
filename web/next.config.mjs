/**
 * The web app never talks to an external provider; it talks only to Norien.
 * Server components fetch the registry directly over NORIEN_API_URL, and any
 * browser-side call goes through the rewrite below so there is no CORS setup
 * and no API origin baked into client bundles.
 */
const API_URL = process.env.NORIEN_API_URL ?? 'http://127.0.0.1:3000';

export default {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};
