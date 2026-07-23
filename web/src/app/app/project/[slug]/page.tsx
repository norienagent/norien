import { api } from '@/lib/api';
import { count, dash, relativeTime, usd } from '@/lib/format';
import { Table } from '@/components/table';
import {
  Card,
  DegradedNotice,
  Empty,
  MissingResource,
  Row,
  SourceList,
  Stat,
} from '@/components/ui';

/**
 * Project detail.
 *
 * TVL and ecosystem facts come from one provider, repository health from
 * another; both arrive merged, and a missing repository degrades that section
 * only.
 */
export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await api.project(slug);
  if (!result) return <MissingResource kind="Project" identifier={slug} />;

  const project = result.data;
  const repo = project.repository;
  const topChain = project.chainTvl[0]?.tvl ?? 1;

  return (
    <>
      <header className="mb-6 flex items-center gap-4">
        {project.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- provider CDNs vary
          <img
            src={project.logo}
            alt=""
            className="size-12 shrink-0 rounded-lg border border-line bg-sunken object-cover"
          />
        ) : (
          <span aria-hidden className="size-12 shrink-0 rounded-lg border border-line bg-sunken" />
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{project.name}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {project.category ?? 'Protocol'}
            {project.symbol ? ` · ${project.symbol}` : ''}
          </p>
        </div>
      </header>

      <DegradedNotice sources={result.sources} degraded={result.degraded} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="TVL" value={usd(project.tvl)} />
        <Stat label="Chains" value={count(project.chains.length)} hint={project.chains[0] ?? undefined} />
        <Stat label="Stars" value={repo ? count(repo.stars) : dash} hint={repo?.fullName} />
        <Stat
          label="Latest release"
          value={repo?.latestRelease?.tag ?? dash}
          hint={
            repo?.latestRelease?.publishedAt ? relativeTime(repo.latestRelease.publishedAt) : undefined
          }
        />
      </div>

      {project.description ? (
        <div className="mt-4">
          <Card title="Overview">
            <p className="max-w-3xl text-sm leading-relaxed text-muted">{project.description}</p>
          </Card>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="TVL by chain" padded={false}>
          <Table
            rows={project.chainTvl.slice(0, 12)}
            rowKey={(entry) => entry.chain}
            empty={<Empty title="No chain breakdown" />}
            columns={[
              { key: 'chain', header: 'Chain', cell: (entry) => entry.chain },
              { key: 'tvl', header: 'TVL', align: 'right', cell: (entry) => usd(entry.tvl) },
              {
                key: 'share',
                header: 'Share',
                hideBelow: 'sm',
                cell: (entry) => (
                  <div className="h-1.5 w-24 rounded-full bg-sunken">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(2, (entry.tvl / topChain) * 100)}%` }}
                    />
                  </div>
                ),
              },
            ]}
          />
        </Card>

        <Card title="Links & documentation">
          <dl>
            <Row label="Website">{project.url ? <External href={project.url} /> : dash}</Row>
            <Row label="Twitter">{project.twitter ? <External href={project.twitter} /> : dash}</Row>
            <Row label="GitHub">
              {repo ? <External href={repo.url} label={repo.fullName} /> : (project.github ?? dash)}
            </Row>
            <Row label="Docs">
              {repo ? (
                <External href={`${repo.url}#readme`} label="Repository README" />
              ) : project.url ? (
                <External href={project.url} label="Project site" />
              ) : (
                dash
              )}
            </Row>
            <Row label="Chains">{project.chains.length > 0 ? project.chains.join(', ') : dash}</Row>
          </dl>
        </Card>
      </div>

      <div className="mt-4">
        {repo ? (
          <>
            <Card title="GitHub statistics">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric label="Stars" value={count(repo.stars)} />
                <Metric label="Forks" value={count(repo.forks)} />
                <Metric label="Open issues" value={count(repo.openIssues)} />
                <Metric label="Watchers" value={count(repo.watchers)} />
              </div>

              <dl className="mt-6">
                <Row label="Repository">
                  <External href={repo.url} label={repo.fullName} />
                </Row>
                <Row label="License">{repo.license ?? dash}</Row>
                <Row label="Default branch">
                  <span className="font-mono text-xs">{repo.defaultBranch}</span>
                </Row>
                <Row label="Last push">{relativeTime(repo.pushedAt)}</Row>
              </dl>

              {repo.languages.length > 0 ? (
                <div className="mt-6">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                    Languages
                  </div>
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-sunken">
                    {repo.languages.slice(0, 6).map((language, index) => (
                      <div
                        key={language.name}
                        title={`${language.name} ${language.share}%`}
                        className={LANGUAGE_TONES[index % LANGUAGE_TONES.length]}
                        style={{ width: `${language.share}%` }}
                      />
                    ))}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                    {repo.languages.slice(0, 6).map((language, index) => (
                      <span key={language.name} className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className={`size-2 rounded-sm ${LANGUAGE_TONES[index % LANGUAGE_TONES.length]}`}
                        />
                        <span className="text-muted">
                          {language.name} {language.share}%
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </Card>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card title={`Contributors (${repo.topContributors.length})`} padded={false}>
                <Table
                  rows={repo.topContributors}
                  rowKey={(person) => person.login}
                  empty={<Empty title="No contributor data" />}
                  columns={[
                    {
                      key: 'person',
                      header: 'Contributor',
                      cell: (person) => (
                        <a
                          href={person.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-2.5 font-medium text-ink hover:text-accent"
                        >
                          {person.avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element -- GitHub CDN
                            <img
                              src={person.avatar}
                              alt=""
                              loading="lazy"
                              className="size-6 rounded-full border border-line bg-sunken object-cover"
                            />
                          ) : (
                            <span aria-hidden className="size-6 rounded-full border border-line bg-sunken" />
                          )}
                          {person.login}
                        </a>
                      ),
                    },
                    {
                      key: 'commits',
                      header: 'Commits',
                      align: 'right',
                      cell: (person) => (
                        <span className="text-muted">{count(person.contributions)}</span>
                      ),
                    },
                  ]}
                />
              </Card>

              <Card title="Recent commits" padded={false}>
                {repo.recentCommits.length === 0 ? (
                  <div className="p-4">
                    <Empty title="No recent commits" />
                  </div>
                ) : (
                  <ul>
                    {repo.recentCommits.map((commit) => (
                      <li key={commit.sha} className="border-b border-line px-4 py-3 last:border-0">
                        <a
                          href={commit.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="block text-sm text-ink hover:text-accent"
                        >
                          {commit.message}
                        </a>
                        <div className="mt-1 text-xs text-muted">
                          <span className="font-mono">{commit.sha}</span> · {commit.author ?? 'unknown'} ·{' '}
                          {relativeTime(commit.date)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        ) : (
          <Card title="GitHub statistics">
            <Empty
              title="No repository linked"
              detail={
                project.github
                  ? `The project lists "${project.github}" but no repository could be resolved.`
                  : 'This project does not publish a GitHub repository.'
              }
            />
          </Card>
        )}
      </div>

      <div className="mt-5">
        <SourceList sources={result.sources} />
      </div>
    </>
  );
}

/**
 * Language swatches.
 *
 * Drawn from the accent ramp rather than GitHub's language colours, so the
 * chart stays inside the palette instead of importing six unrelated hues.
 */
const LANGUAGE_TONES = [
  'bg-accent',
  'bg-accent/70',
  'bg-accent/50',
  'bg-ink/40',
  'bg-ink/25',
  'bg-line',
];

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold text-ink">{value}</div>
    </div>
  );
}

function External({ href, label }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent underline underline-offset-2"
    >
      {label ?? href.replace(/^https?:\/\//, '')} ↗
    </a>
  );
}
