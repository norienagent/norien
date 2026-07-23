import { InstallCommand } from '@/components/registry';
import { Card, SectionHeading } from '@/components/ui';
import { PublishForm } from './form';

export const metadata = { title: 'Publish' };

/**
 * Publish.
 *
 * Validation runs live against the registry; the publish itself runs from the
 * CLI, which carries the identity this page does not have yet. Rather than
 * offering a button that cannot work, the page does the useful half for real
 * and hands off the rest with the exact command.
 */
export default function PublishPage() {
  return (
    <>
      <SectionHeading
        title="Publish"
        detail="Validate an agent manifest against the live registry before you publish it."
      />

      <PublishForm />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="How publishing works">
          <ol className="space-y-3 text-sm leading-relaxed text-muted">
            <li>
              <span className="font-medium text-ink">1. Validate.</span> The registry parses the
              manifest, detects the runtime, and resolves every declared tool against the real
              catalogue — that is what the form does.
            </li>
            <li>
              <span className="font-medium text-ink">2. Publish.</span> From the directory holding your
              agent.json, run the command below. The CLI repeats the same pre-flight, then uploads.
            </li>
            <li>
              <span className="font-medium text-ink">3. Version.</span> Each publish writes an immutable
              version row. Republishing the same version is rejected — bump it instead.
            </li>
          </ol>

          <div className="mt-4 space-y-2">
            <InstallCommand command="norien publish --dry-run" />
            <InstallCommand command="norien publish" />
          </div>
        </Card>

        <Card title="Manifest fields">
          <dl className="space-y-3 text-sm">
            {[
              ['name', 'Human-readable name. The slug is derived from it.'],
              ['version', 'Semver. Must be higher than the current latest.'],
              ['description', 'One sentence — it is what search ranks and lists show.'],
              ['runtime', '"node" or "python".'],
              ['entrypoint', 'The file the supervisor executes.'],
              ['commands', 'start is required; health is optional but recommended.'],
              ['tools', 'Slugs of marketplace tools this agent needs. All must resolve.'],
              ['permissions', 'What the agent is allowed to do. The runtime enforces these.'],
              ['environment', 'Declared variables. Required ones block a run until set.'],
            ].map(([field, detail]) => (
              <div key={field} className="border-b border-line pb-3 last:border-0 last:pb-0">
                <dt className="font-mono text-xs text-accent">{field}</dt>
                <dd className="mt-0.5 text-muted">{detail}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
