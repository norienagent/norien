import Link from 'next/link';

import { Container, PageHeader, Prose } from '@/components/marketing';

export const metadata = {
  title: 'Terms',
  description: 'The terms that apply to Norien.',
};

export default function TermsPage() {
  return (
    <>
      <PageHeader
        title="Terms"
        detail="Norien is software you run yourself. These terms describe that arrangement."
      />

      <Container className="pb-20">
        <Prose>
          <h2>What you are agreeing to</h2>
          <p>
            Norien is provided as software, not as a service. You run it on your own hardware, under
            your own control. There is no account to create, no service level to promise, and no
            hosted component that could go down.
          </p>

          <h2>No warranty</h2>
          <p>
            The software is provided as is, without warranty of any kind, express or implied,
            including but not limited to the warranties of merchantability, fitness for a particular
            purpose, and noninfringement. You run it at your own risk.
          </p>

          <h2>Agents execute real code</h2>
          <p>
            The runtime supervisor starts processes on your machine. An agent you install from the
            registry is code written by someone else, and running it grants it whatever access the
            operating system grants that process. The supervisor validates declared permissions before
            starting an agent, but a declaration is a statement of intent by its author, not a
            sandbox.
          </p>
          <p>
            Read what you run. The{' '}
            <Link href="/app/registry">registry pages</Link> show every agent&apos;s manifest,
            entrypoint, commands, required tools, and requested permissions before you install it, and{' '}
            <code>norien info</code> shows the same in a terminal.
          </p>

          <h2>Publishing</h2>
          <p>
            What you publish is yours, and you are responsible for it. Do not publish code you do not
            have the right to distribute, and do not publish anything designed to damage or deceive
            the people who install it.
          </p>
          <p>
            Publishing is currently identified by handle rather than authenticated. That is
            identification, not proof of identity, and it is documented as such on the{' '}
            <Link href="/app/api-keys">API keys page</Link>. Treat the current registry as a local
            development tool.
          </p>

          <h2>External data</h2>
          <p>
            Market, chain, repository, and TVL data is aggregated from third-party providers using
            credentials you supply. Norien normalizes and caches it; it does not guarantee it. Each
            provider&apos;s own terms govern your use of their API, and every response reports which
            sources answered so you can judge it yourself.
          </p>
          <p>
            None of it is financial advice.
          </p>

          <h2>Changes</h2>
          <p>
            A hosted service will need terms that cover a service. These will be updated before that
            exists. Until then, what is written above is the whole arrangement.
          </p>
        </Prose>
      </Container>
    </>
  );
}
