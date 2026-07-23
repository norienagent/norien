import { Container, PageHeader } from '@/components/marketing';
import { Badge } from '@/components/ui';

export const metadata = {
  title: 'Changelog',
  description: 'What has shipped in Norien, phase by phase.',
};

/**
 * Changelog.
 *
 * Organised by build phase rather than by date, because that is what the
 * project actually records — inventing release dates would be inventing facts.
 */

const RELEASES = [
  {
    phase: 'Phase 8',
    title: 'Frontend & marketing site',
    current: true,
    entries: [
      'Public marketing site: landing, docs, pricing, blog, changelog, about, contact, legal.',
      'Application shell with a persistent sidebar, topbar, and mobile drawer.',
      'Dashboard with eight live widgets across market, ecosystem, and registry data.',
      'Registry, marketplace, runtime, publish, API keys, profile, and settings pages.',
      'Warm cream and brown design system replacing the previous dark theme.',
      'GitHub sign-in via Supabase Auth (backend verifies the session JWT).',
    ],
  },
  {
    phase: 'Phase 7',
    title: 'Product surface & developer experience',
    entries: [
      'Market data commands in the CLI: markets, trending, token, wallet, contract, project.',
      'Unified search spanning the registry and market data.',
      'SDK namespaces for tokens, projects, contracts, wallets, chain, and market search.',
      'First web application, streaming each dashboard panel independently.',
    ],
  },
  {
    phase: 'Phase 6',
    title: 'External data integration',
    entries: [
      'Six providers normalized behind one API: market, on-chain, repository, and TVL data.',
      'Every response carries its provenance; a failing provider degrades rather than errors.',
      'One outbound client owning timeout, retry with backoff, caching, and structured logging.',
      'Stale-on-failure cache: a slightly old answer beats no answer.',
    ],
  },
  {
    phase: 'Phase 5',
    title: 'Tool marketplace',
    entries: [
      'Tools as first-class published records with input and output schemas.',
      'One plugin protocol across node, python, and http runtimes.',
      'Seventeen categories, versioning, search, and dependency resolution.',
      'norien tool commands and client.tools in both SDKs.',
    ],
  },
  {
    phase: 'Phase 4',
    title: 'Agent runtime',
    entries: [
      'A supervisor that runs installed agents: run, stop, restart, logs, status.',
      'Health probing separate from process status, so both can be reported honestly.',
      'Crash recovery with a loop cap, so a failing agent cannot spin forever.',
      'Permission validation and tool injection before a process starts.',
    ],
  },
  {
    phase: 'Phase 3',
    title: 'CLI & SDKs',
    entries: [
      'The norien CLI: login, search, info, install, publish, update, uninstall, list, doctor.',
      'TypeScript and Python SDKs with matching ergonomics.',
      '--json on every command, with stdout kept pure for piping.',
    ],
  },
  {
    phase: 'Phase 2',
    title: 'Runtime inspection',
    entries: [
      'agent.json gains runtime, entrypoint, and commands.',
      'The registry parses, detects, and resolves an agent without executing it.',
      'Install responses carry the manifest, dependencies, runtime, and environment.',
    ],
  },
  {
    phase: 'Phase 1',
    title: 'Registry core',
    entries: [
      'Agents, tools, and installations with validation and slug uniqueness.',
      'Immutable version records alongside a mutable head.',
      'Ranked full-text search, filtering, and pagination.',
      'OpenAPI document generated from the same schemas that validate requests.',
    ],
  },
];

export default function ChangelogPage() {
  return (
    <>
      <PageHeader
        title="Changelog"
        detail="Norien is built in phases. Each one below is complete and running."
      />

      <Container className="pb-20">
        <ol className="space-y-10">
          {RELEASES.map((release) => (
            <li key={release.phase} className="grid gap-5 sm:grid-cols-[10rem_1fr]">
              <div className="sm:sticky sm:top-24 sm:self-start">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{release.phase}</span>
                  {release.current ? <Badge tone="accent">current</Badge> : null}
                </div>
              </div>

              <div className="rounded-xl border border-line bg-card p-6">
                <h2 className="text-base font-semibold tracking-tight text-ink">{release.title}</h2>
                <ul className="mt-3 space-y-2">
                  {release.entries.map((entry) => (
                    <li key={entry} className="flex gap-2.5 text-sm leading-relaxed text-muted">
                      <span aria-hidden className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-accent" />
                      {entry}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </>
  );
}
