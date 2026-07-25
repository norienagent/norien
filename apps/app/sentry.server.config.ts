/**
 * Sentry for the Node.js server runtime (RSC, route handlers, server actions).
 * Loaded from `src/instrumentation.ts`. No DSN → disabled, so local dev is silent.
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
