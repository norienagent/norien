import { api } from '@norien-live/web-ui/api';
import { Badge, Card, MissingResource, SectionHeading } from '@norien-live/web-ui';
import { SkillRunPanel } from '@/components/skill-run';

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-0">
      <dt className="shrink-0 text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-xs text-ink">{value}</dd>
    </div>
  );
}

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const skill = await api.skill(slug).catch(() => null);
  return { title: skill ? skill.name : 'Skill' };
}

const SOURCE_LABEL: Record<string, string> = {
  none: 'Instruction only',
  markets: 'Live market data',
  portfolio: 'Wallet portfolio',
  token: 'Token data',
  registry: 'Registry search',
};

/**
 * One skill: what it does, and a panel to run it. The run streams a grounded
 * result — the same capability the CLI's `norien skill run` exposes.
 */
export default async function SkillPage({ params }: Params) {
  const { slug } = await params;
  const skill = await api.skill(slug).catch(() => null);

  if (!skill) return <MissingResource kind="Skill" identifier={slug} />;

  const requiresInput = skill.data_source === 'portfolio' || skill.data_source === 'token';

  return (
    <>
      <SectionHeading title={skill.name} detail={skill.description} />

      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-muted">
        <Badge>{SOURCE_LABEL[skill.data_source] ?? skill.data_source}</Badge>
        <span>·</span>
        <span>
          by <span className="text-ink">{skill.author}</span>
        </span>
        <span>·</span>
        <span className="font-mono">v{skill.version}</span>
      </div>

      <div className="mb-5">
        <SkillRunPanel
          slug={skill.slug}
          inputHint={skill.input_hint}
          examples={skill.examples}
          requiresInput={requiresInput}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="What it does">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{skill.instructions}</p>
        </Card>
        <Card title="Run from the CLI">
          <dl>
            <Row label="Install" value="npm i -g @norien-live/cli" />
            <Row label="Run" value={`norien skill run ${skill.slug}${requiresInput ? ' <input>' : ''}`} />
            <Row label="Grounded in" value={SOURCE_LABEL[skill.data_source] ?? skill.data_source} />
            <Row label="Tags" value={skill.tags.length > 0 ? skill.tags.join(', ') : null} />
          </dl>
        </Card>
      </div>
    </>
  );
}
