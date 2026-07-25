import Link from 'next/link';

import { API_URL, APP_URL, CodeBlock, Prose } from '@norien-live/web-ui';

import { DocPage, Note } from '../../doc-page';

export const metadata = { title: 'Skills' };

export default function SkillsFeaturePage() {
  return (
    <DocPage
      href="/features/skills"
      title="Skills"
      lead="Runnable capabilities, grounded in Norien's live data. Publish a skill once; anyone can run it and get a real, data-backed result."
    >
      <Prose>
        <p>
          A <strong>skill</strong> pairs a plain-language playbook with a Norien{' '}
          <em>data source</em>. When you run it, the backend resolves that data — a wallet&apos;s
          portfolio, the market list, one token, or the registry — and hands it to a fast model as
          grounded context. The output is about real state, not an ungrounded guess.
        </p>
        <p>
          Where a <Link href="/concepts/tools">tool</Link> is a single function and an{' '}
          <Link href="/concepts/registry">agent</Link> is a whole program, a skill sits between:
          one packaged capability you invoke on demand, from the app or the CLI.
        </p>

        <h2>Starter skills</h2>
        <ul>
          <li>
            <strong>market-recap</strong> — a crisp summary of today&apos;s Robinhood Chain movers.
          </li>
          <li>
            <strong>review-wallet</strong> — analyzes any wallet&apos;s multi-chain portfolio.
          </li>
          <li>
            <strong>explain-token</strong> — explains a token from its live market data.
          </li>
          <li>
            <strong>find-agent</strong> — recommends agents and tools for what you want to do.
          </li>
          <li>
            <strong>draft-agent</strong> — turns a description into a valid <code>agent.json</code>.
          </li>
        </ul>

        <h2>Run a skill</h2>
        <p>
          From the app, open <a href={`${APP_URL}/skills`}>Skills</a>, pick one, and run it in the
          browser. From the terminal:
        </p>
      </Prose>
      <CodeBlock>{`norien skill run market-recap
norien skill run review-wallet 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
norien skill run explain-token <token-address>`}</CodeBlock>

      <Prose>
        <p>Or over the API — it streams the result as server-sent events:</p>
      </Prose>
      <CodeBlock>{`curl -N -X POST ${API_URL}/api/skills/market-recap/run \\
  -H "Content-Type: application/json" \\
  -d '{ "input": "top movers today" }'`}</CodeBlock>

      <Prose>
        <h2>Publish your own</h2>
        <p>
          Write a <code>skill.json</code> and publish it — it becomes runnable by anyone, no code to
          deploy. Pick a <code>data_source</code> and the platform grounds every run for you.
        </p>
      </Prose>
      <CodeBlock>{`{
  "slug": "gas-check",
  "name": "Gas Check",
  "description": "Explains whether now is a cheap time to transact.",
  "instructions": "From the market data, comment on activity and suggest whether conditions look calm or busy. Keep it to two sentences.",
  "data_source": "markets",
  "input_hint": "optional focus",
  "examples": ["is it busy right now?"]
}`}</CodeBlock>
      <CodeBlock>{`norien skill publish`}</CodeBlock>

      <Prose>
        <h2>Data sources</h2>
        <ul>
          <li>
            <code>markets</code> — live top gainers and highest-volume tokens.
          </li>
          <li>
            <code>portfolio</code> — the input is a wallet address; its holdings are resolved.
          </li>
          <li>
            <code>token</code> — the input is a token address; its market data is resolved.
          </li>
          <li>
            <code>registry</code> — searches agents and tools for the input.
          </li>
          <li>
            <code>none</code> — a pure instruction skill, no data resolved.
          </li>
        </ul>
      </Prose>

      <Note>
        A skill&apos;s data source is a fixed, safe set — never arbitrary code — so running someone
        else&apos;s skill is as safe as reading their instructions. Answers are grounded in the data
        provided; they are not financial advice.
      </Note>
    </DocPage>
  );
}
