import Link from 'next/link';

import { Container, PageHeader, Prose } from '@/components/marketing';

export const metadata = {
  title: 'Privacy',
  description: 'What Norien collects — which, running locally, is nothing.',
};

/**
 * Privacy.
 *
 * Written to describe the software as it actually behaves rather than as a
 * generic policy template. Every claim here is checkable in the source.
 */
export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        title="Privacy"
        detail="Norien currently runs entirely on your machine. This describes what that means in practice."
      />

      <Container className="pb-20">
        <Prose>
          <h2>No hosted service</h2>
          <p>
            There is no Norien server operated by anyone else. The registry, the runtime supervisor,
            and this web app all run as local processes on your own machine, and the database is a
            file in your project directory. Nothing you publish, install, or search for is
            transmitted to us, because there is no us to transmit it to.
          </p>

          <h2>No analytics, no tracking</h2>
          <p>
            This site loads no analytics script, no tag manager, no advertising pixel, and no
            third-party font. It sets no cookies. Nothing measures your visit.
          </p>

          <h2>Requests that do leave your machine</h2>
          <p>
            The data API reads from external providers, and those requests go out over the internet.
            When you open a token, wallet, contract, or project page, your Norien instance queries the
            providers you have configured, using the API keys you supplied. Those providers see the
            requests, and their own privacy policies apply to them.
          </p>
          <p>
            You control this entirely. Every provider credential is optional — leaving one unset
            disables that provider rather than breaking anything, and the{' '}
            <Link href="/app/settings">settings page</Link> shows exactly which are configured and
            reachable.
          </p>

          <h2>Your credentials</h2>
          <p>
            Provider API keys live in <code>.env.local</code> on your machine and are read only by
            the server process. They are never sent to the browser, never included in a response, and
            never written to logs — the outbound HTTP client strips query strings before logging a
            URL specifically so a key embedded in one cannot leak into a log file.
          </p>
          <p>
            CLI credentials live in <code>~/.norien/config.json</code>, again on your machine.
          </p>

          <h2>When this changes</h2>
          <p>
            A hosted registry and account system are planned. When they exist, this page will be
            replaced with a policy describing what that service stores — account identity, published
            records, and the operational logs any server keeps. It will be written before the service
            launches, not after.
          </p>

          <h2>Questions</h2>
          <p>
            <Link href="/contact">Get in touch</Link> if something here is unclear.
          </p>
        </Prose>
      </Container>
    </>
  );
}
