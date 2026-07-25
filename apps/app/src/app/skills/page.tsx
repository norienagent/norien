import Link from 'next/link';
import { Suspense } from 'react';

import { api, type Skill } from '@norien-live/web-ui/api';
import { Badge, Card, Empty, ErrorState, SectionHeading, Skeleton } from '@norien-live/web-ui';

export const metadata = { title: 'Skills' };

/**
 * Skills.
 *
 * Runnable capabilities grounded in Norien's live data. The grid links into a
 * detail page where the skill actually runs.
 */
export default function SkillsPage() {
  return (
    <>
      <SectionHeading
        title="Skills"
        detail="Runnable AI capabilities, grounded in Norien's live on-chain and market data. Run one, or publish your own."
      />
      <Suspense fallback={<GridSkeleton />}>
        <SkillGrid />
      </Suspense>
    </>
  );
}

async function SkillGrid() {
  const result = await api.skills({ limit: 60 }).catch(() => null);

  if (!result) {
    return (
      <Card>
        <ErrorState title="Skills are unavailable" detail="This usually resolves on its own." />
      </Card>
    );
  }
  if (result.data.length === 0) {
    return (
      <Card>
        <Empty title="No skills yet" detail="Publish the first one with `norien skill publish`." />
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {result.data.map((skill) => (
        <SkillCard key={skill.slug} skill={skill} />
      ))}
    </div>
  );
}

function SkillCard({ skill }: { skill: Skill }) {
  return (
    <Link
      href={`/skills/${skill.slug}`}
      className="group flex flex-col rounded-xl border border-line bg-card p-5 transition-colors hover:border-accent/40"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight text-ink group-hover:text-accent">
          {skill.name}
        </h3>
        <Badge>{skill.data_source === 'none' ? 'skill' : skill.data_source}</Badge>
      </div>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{skill.description}</p>
      <div className="mt-4 font-mono text-xs text-muted">
        norien skill run <span className="text-accent">{skill.slug}</span>
      </div>
    </Link>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-line bg-card p-5">
          <Skeleton width="55%" height={16} />
          <div className="h-3" />
          <Skeleton width="90%" height={10} />
          <div className="h-1.5" />
          <Skeleton width="70%" height={10} />
        </div>
      ))}
    </div>
  );
}
