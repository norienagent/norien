import Link from 'next/link';

import { Container, DOCS_URL, PageHeader } from '@norien-live/web-ui';
import { Badge, ButtonLink, Card } from '@norien-live/web-ui';

export const metadata = {
  title: 'Pricing',
  description: 'What Norien costs, and what is free while it runs locally.',
};

/**
 * Pricing.
 *
 * Billing does not exist yet, and the page says so at the top rather than
 * implying a checkout behind the buttons. The tiers describe the intended
 * shape; nothing here can charge anyone.
 */

const TIERS = [
  {
    name: 'Local',
    price: 'Free',
    cadence: 'forever',
    detail: 'Everything, running on your own machine.',
    highlight: false,
    features: [
      'Unlimited agents and tools',
      'Full registry, runtime, and marketplace',
      'Unified data API with your own provider keys',
      'CLI, TypeScript SDK, and Python SDK',
      'Embedded database — no server to run',
    ],
    cta: { label: 'Get started', href: DOCS_URL },
  },
  {
    name: 'Team',
    price: '—',
    cadence: 'not yet priced',
    detail: 'A shared registry for a group, hosted rather than local.',
    highlight: true,
    features: [
      'Everything in Local',
      'Hosted registry with a shared catalogue',
      'Organisations and per-team visibility',
      'Private agents and tools',
      'Verified API keys and audit history',
    ],
    cta: { label: 'Register interest', href: '/contact' },
  },
  {
    name: 'Enterprise',
    price: '—',
    cadence: 'not yet priced',
    detail: 'Self-hosted or dedicated, with support.',
    highlight: false,
    features: [
      'Everything in Team',
      'Bring your own Postgres',
      'Remote and distributed runtimes',
      'SSO and role-based access',
      'Support agreement',
    ],
    cta: { label: 'Get in touch', href: '/contact' },
  },
];

export default function PricingPage() {
  return (
    <>
      <PageHeader
        title="Pricing"
        detail="Norien runs locally today, and everything it does is free. The tiers below describe where it is going."
      />

      <Container className="pb-20">
        <div className="mb-10 rounded-lg border border-warn/30 bg-warn/10 px-5 py-4">
          <p className="text-sm leading-relaxed text-ink">
            <strong className="font-semibold">Billing is not live.</strong> There is no payment
            system, no subscription, and nothing on this page can charge you. Paid tiers are shown so
            the direction is clear — the buttons lead to documentation and contact, not a checkout.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`flex flex-col rounded-xl border bg-card p-7 ${
                tier.highlight ? 'border-accent/45' : 'border-line'
              }`}
            >
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight text-ink">{tier.name}</h2>
                {tier.highlight ? <Badge tone="accent">planned</Badge> : null}
              </div>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight text-ink">{tier.price}</span>
                <span className="text-sm text-muted">{tier.cadence}</span>
              </div>

              <p className="mt-2 text-sm leading-relaxed text-muted">{tier.detail}</p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5 text-sm text-muted">
                    <span aria-hidden className="mt-[0.4rem] size-1.5 shrink-0 rounded-full bg-accent" />
                    {feature}
                  </li>
                ))}
              </ul>

              <ButtonLink
                href={tier.cta.href}
                tone={tier.highlight ? 'primary' : 'secondary'}
                className="mt-7 w-full"
              >
                {tier.cta.label}
              </ButtonLink>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <Card title="What does the free tier actually include?">
            <p className="text-sm leading-relaxed text-muted">
              All of it. The registry, the runtime supervisor, the tool marketplace, the unified data
              API, both SDKs, and the CLI are the same code regardless of tier. Running locally, there
              is nothing to meter.
            </p>
          </Card>
          <Card title="Do I need provider API keys?">
            <p className="text-sm leading-relaxed text-muted">
              Only for the data API, and only for the providers you want. Every credential is
              optional — an unset one disables that provider rather than breaking start-up, and the
              response tells you which sources answered.
            </p>
          </Card>
        </div>

        <p className="mt-10 text-center text-sm text-muted">
          Questions about a tier?{' '}
          <Link href="/contact" className="text-accent underline underline-offset-2">
            Get in touch
          </Link>
          .
        </p>
      </Container>
    </>
  );
}
