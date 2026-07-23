import Link from 'next/link';

import type { Agent, Tool } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { Badge, Empty } from '@/components/ui';

/**
 * Registry and marketplace presentation.
 *
 * The dashboard panels, the registry list, and the marketplace grid all render
 * through these, so an agent looks like an agent everywhere it appears.
 */

export function RuntimeBadge({ runtime }: { runtime: string | null }) {
  if (!runtime) return <span className="text-muted">—</span>;
  return <Badge>{runtime}</Badge>;
}

/** Compact row for dashboard panels. */
export function EntityRow({
  href,
  name,
  version,
  description,
  meta,
}: {
  href: string;
  name: string;
  version: string;
  description: string;
  meta?: string;
}) {
  return (
    <li className="border-t border-line py-2.5 first:border-0">
      <Link href={href} className="group block">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium text-ink group-hover:text-accent">
            {name}
          </span>
          <span className="shrink-0 font-mono text-xs text-muted">{version}</span>
        </div>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted">{description}</p>
        {meta ? <p className="mt-1 text-xs text-muted">{meta}</p> : null}
      </Link>
    </li>
  );
}

export function AgentPanelList({ agents }: { agents: Agent[] }) {
  if (agents.length === 0) return <Empty title="No agents published yet" />;

  return (
    <ul>
      {agents.map((agent) => (
        <EntityRow
          key={agent.slug}
          href={`/app/registry/${agent.slug}`}
          name={agent.name}
          version={agent.version}
          description={agent.description}
          meta={`${agent.runtime} · ${agent.author} · ${relativeTime(agent.updated_at)}`}
        />
      ))}
    </ul>
  );
}

export function ToolPanelList({ tools }: { tools: Tool[] }) {
  if (tools.length === 0) return <Empty title="No tools published yet" />;

  return (
    <ul>
      {tools.map((tool) => (
        <EntityRow
          key={tool.slug}
          href={`/app/tools/${tool.slug}`}
          name={tool.name}
          version={tool.version}
          description={tool.description}
          meta={`${tool.category} · ${tool.author} · ${relativeTime(tool.updated_at)}`}
        />
      ))}
    </ul>
  );
}

/** Full card for the registry and marketplace grids. */
export function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link
      href={`/app/registry/${agent.slug}`}
      className="group flex flex-col rounded-xl border border-line bg-card p-5 transition-colors hover:border-accent/40"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight text-ink group-hover:text-accent">
          {agent.name}
        </h3>
        <span className="shrink-0 font-mono text-xs text-muted">{agent.version}</span>
      </div>
      <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-muted">{agent.description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <RuntimeBadge runtime={agent.runtime} />
        {agent.required_tools.length > 0 ? (
          <Badge>
            {agent.required_tools.length} tool{agent.required_tools.length === 1 ? '' : 's'}
          </Badge>
        ) : null}
        <span className="ml-auto text-xs text-muted">{agent.author}</span>
      </div>
    </Link>
  );
}

export function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Link
      href={`/app/tools/${tool.slug}`}
      className="group flex flex-col rounded-xl border border-line bg-card p-5 transition-colors hover:border-accent/40"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight text-ink group-hover:text-accent">
          {tool.name}
        </h3>
        <span className="shrink-0 font-mono text-xs text-muted">{tool.version}</span>
      </div>
      <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-muted">{tool.description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone="accent">{tool.category}</Badge>
        <RuntimeBadge runtime={tool.runtime} />
        <span className="ml-auto text-xs text-muted">{tool.author}</span>
      </div>
    </Link>
  );
}

/** A copyable install command. Rendered wherever an install is possible. */
export function InstallCommand({ command }: { command: string }) {
  return (
    <div className="scroll-x rounded-lg border border-line bg-sunken px-4 py-3">
      <code className="font-mono text-sm whitespace-nowrap text-ink">
        <span className="select-none text-muted">$ </span>
        {command}
      </code>
    </div>
  );
}
