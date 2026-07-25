/**
 * Sentry initialisation — imported before anything else in `server.ts`.
 *
 * The SDK patches Node's `http`/`https` and other core modules on `init`, so it
 * must run before Fastify (or any provider client) is imported for request and
 * outbound-call instrumentation to attach. That is the only reason this lives in
 * its own file instead of inside the app.
 *
 * The DSN is read straight from `process.env` rather than through `config/env`,
 * because that module hasn't loaded yet at this point (and loading it would pull
 * in the very code we want Sentry to wrap). In practice only deployed instances
 * set `SENTRY_DSN` as a real environment variable, so local development stays
 * out of Sentry with no extra gating: no DSN, no reporting.
 */
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // A modest slice of requests is traced for latency insight without adding
    // meaningful overhead. Error capture is unaffected by this rate.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    // Strip anything that looks like a bearer token before an event leaves the
    // process, so a stray Authorization header never reaches Sentry.
    beforeSend(event) {
      const auth = event.request?.headers?.['authorization'];
      if (auth) event.request!.headers!['authorization'] = '[redacted]';
      return event;
    },
  });
}

export { Sentry };
