import Link from 'next/link';

import { api, type Agent, type Skill, type Tool } from '@norien-live/web-ui/api';
import { count } from '@norien-live/web-ui';
import { Badge, Card, Empty, SectionHeading, Stat } from '@norien-live/web-ui';
import { AgentCard, ToolCard } from '@/components/registry';

/**
 * A publisher's public profile.
 *
 * Everything a handle has shipped — agents, tools, and skills — in one place, so
 * a creator has a page to point people at. Reads only public rows, so it works
 * for anyone without auth.
 */
export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle: raw } = await params;
  const handle = raw.replace(/^@/, '');

  const [agentsPage, toolsPage, skillsPage] = await Promise.all([
    api.agents({ author: handle, limit: 60 }),
    api.tools({ author: handle, limit: 60 }),
    api.skills({ author: handle, limit: 60 }),
  ]);

  const agents = agentsPage?.data ?? [];
  const tools = toolsPage?.data ?? [];
  const skills = skillsPage?.data ?? [];
  const total = agents.length + tools.length + skills.length;
  const installs =
    agents.reduce((n, a) => n + (a.downloads ?? 0), 0) +
    tools.reduce((n, t) => n + (t.downloads ?? 0), 0);

  return (
    <>
      <header className="mb-6 flex items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-full bg-accent text-lg font-semibold text-white">
          {handle.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">@{handle}</h1>
          <p className="mt-0.5 text-sm text-muted">Publisher on Norien</p>
        </div>
      </header>

      {total === 0 ? (
        <Card>
          <Empty
            title="Nothing published yet"
            detail={`@${handle} hasn't published any public agents, tools, or skills.`}
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Agents" value={agents.length} />
            <Stat label="Tools" value={tools.length} />
            <Stat label="Skills" value={skills.length} />
            <Stat label="Total installs" value={installs > 0 ? count(installs) : '—'} />
          </div>

          {agents.length > 0 ? (
            <section className="mb-8">
              <SectionHeading title="Agents" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {agents.map((agent: Agent) => (
                  <AgentCard key={agent.slug} agent={agent} />
                ))}
              </div>
            </section>
          ) : null}

          {tools.length > 0 ? (
            <section className="mb-8">
              <SectionHeading title="Tools" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tools.map((tool: Tool) => (
                  <ToolCard key={tool.slug} tool={tool} />
                ))}
              </div>
            </section>
          ) : null}

          {skills.length > 0 ? (
            <section className="mb-8">
              <SectionHeading title="Skills" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {skills.map((skill: Skill) => (
                  <Link
                    key={skill.slug}
                    href={`/skills/${skill.slug}`}
                    className="group flex flex-col rounded-xl border border-line bg-card p-5 transition-colors hover:border-accent/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold tracking-tight text-ink group-hover:text-accent">
                        {skill.name}
                      </h3>
                      <Badge>{skill.data_source === 'none' ? 'skill' : skill.data_source}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-muted">
                      {skill.description}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
