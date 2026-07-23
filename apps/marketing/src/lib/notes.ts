/**
 * Engineering notes.
 *
 * Write-ups of decisions actually made in this codebase, kept here as data so
 * the index and the article pages render from one source. There are no author
 * or date fields: the project does not record them, and inventing them would
 * make the page claim something untrue.
 */

export interface Note {
  slug: string;
  title: string;
  summary: string;
  topic: string;
  /** Paragraphs and code blocks, in order. */
  body: ({ kind: 'p'; text: string } | { kind: 'code'; text: string } | { kind: 'h'; text: string })[];
}

export const NOTES: Note[] = [
  {
    slug: 'coingecko-never-sets-the-price',
    title: 'CoinGecko never sets the price',
    summary:
      'Two providers can answer the same question. Deciding in advance which one is authoritative is what keeps a merged record coherent.',
    topic: 'Data',
    body: [
      {
        kind: 'p',
        text: 'Norien reads from six external providers, and several of them overlap. Both the market data provider and CoinGecko can tell you what a token costs. Both are, in some sense, correct.',
      },
      {
        kind: 'p',
        text: 'The rule is that CoinGecko never supplies a price. It supplies the logo, the description, the categories, and the supply figures — metadata that changes slowly and that nothing else provides as well. Price, market cap, liquidity, volume, and holder counts come from the market provider, always.',
      },
      {
        kind: 'h',
        text: 'Why fix it in advance',
      },
      {
        kind: 'p',
        text: 'The alternative is a fallback chain: try one, use the other if it fails. That sounds resilient and is actually corrosive. Two providers price the same asset from different venues at different refresh rates, so a fallback silently changes what a number means depending on which service happened to answer. A chart assembled that way has discontinuities nobody can explain.',
      },
      {
        kind: 'p',
        text: 'Fixing ownership per field means a missing provider produces a missing field, which the response reports honestly, rather than a substituted one that looks fine and is not comparable.',
      },
      {
        kind: 'code',
        text: `{
  "data": { "symbol": "USDG", "price": 1.0002, "logo": "https://…" },
  "sources": [
    { "provider": "codex",     "status": "ok" },
    { "provider": "coingecko", "status": "skipped",
      "reason": "no platform mapping for chain 4663" }
  ],
  "degraded": false
}`,
      },
      {
        kind: 'p',
        text: 'That response is not degraded. CoinGecko was skipped because it has no mapping for this chain, the fields it owns are absent, and the price is exactly as authoritative as it would have been otherwise.',
      },
    ],
  },
  {
    slug: 'a-stale-answer-beats-no-answer',
    title: 'A stale answer beats no answer',
    summary:
      'What a cache should do when the thing behind it goes down — and why an expiry is two dates, not one.',
    topic: 'Reliability',
    body: [
      {
        kind: 'p',
        text: 'A conventional cache entry has one date on it: the moment it stops being valid. After that the entry is gone and the next reader waits for the provider.',
      },
      {
        kind: 'p',
        text: 'That is the wrong behaviour precisely when it matters most. If a provider is down, every cached answer expires and every reader gets an error — the cache evaporates exactly when it would have been most useful.',
      },
      {
        kind: 'h',
        text: 'Two dates instead',
      },
      {
        kind: 'p',
        text: 'Norien gives every entry an expiry and a discard time. Past the expiry the entry is no longer served to a healthy request; the provider is asked again. But it is not deleted. If that request fails, the stale entry is served instead, and the response says so.',
      },
      {
        kind: 'p',
        text: 'A price from ninety seconds ago, labelled as such, is worth far more to someone reading a dashboard than a red error box. The discard time is what stops that from becoming dishonest: past it, the entry really is gone, because at some point old data stops resembling the truth.',
      },
      {
        kind: 'p',
        text: 'The same reasoning shapes the failure mode of the whole aggregation layer. A request that touches four providers and gets three answers returns three answers with degraded set, not a 500. Partial data, visibly partial, beats nothing.',
      },
    ],
  },
  {
    slug: 'immutable-versions-mutable-head',
    title: 'Immutable versions, mutable head',
    summary:
      'A registry has to answer two different questions about the same package, and one row cannot do both.',
    topic: 'Architecture',
    body: [
      {
        kind: 'p',
        text: 'A registry gets asked two questions that pull in opposite directions. "What is the latest version of this agent?" wants a record that changes. "Give me exactly what 1.2.0 was" wants a record that never does.',
      },
      {
        kind: 'p',
        text: 'Norien stores both. Every publish writes an immutable version row capturing the full manifest as submitted, and updates a mutable head row pointing at the newest one. Reading a pinned version reads the version row and gets precisely what was published; reading a slug reads the head.',
      },
      {
        kind: 'h',
        text: 'What this buys',
      },
      {
        kind: 'p',
        text: 'Republishing an existing version is rejected rather than accepted-and-overwritten, so an install that worked yesterday works today. Deleting an agent soft-deletes the head and permanently reserves the slug — an abandoned name can never be claimed by someone else and quietly become a different thing.',
      },
      {
        kind: 'p',
        text: 'It also makes the history free. Version listings, changelogs, and diffs are queries against rows that already exist rather than a separate audit system layered on afterwards.',
      },
    ],
  },
  {
    slug: 'tools-are-plugins',
    title: 'Tools are plugins, not special cases',
    summary:
      'The moment a runtime knows the name of a tool, every new tool becomes a change to the runtime.',
    topic: 'Architecture',
    body: [
      {
        kind: 'p',
        text: 'The easy way to give agents a web-search capability is to implement web search in the runtime and expose it. Then someone needs a database query, so that goes in too. Within a few months the runtime is a pile of integrations and adding a capability means editing it.',
      },
      {
        kind: 'p',
        text: 'Norien never hardcodes a tool. A tool is a published record with a JSON Schema for its input, a JSON Schema for its output, a runtime, its permissions, and the environment it needs. The supervisor knows the protocol, not the tools.',
      },
      {
        kind: 'h',
        text: 'One protocol',
      },
      {
        kind: 'code',
        text: `stdin   { "input": { … }, "context": { … } }
stdout  { "output": { … } }   or   { "error": { … } }
stderr  logs`,
      },
      {
        kind: 'p',
        text: 'That is the whole contract for a node or python tool. An http tool declares a URL with placeholders instead, and the runtime substitutes and calls it — from the agent side the two are indistinguishable.',
      },
      {
        kind: 'p',
        text: 'Storing the schemas verbatim rather than reinterpreting them has a second payoff: they are already valid JSON Schema, which is what a Model Context Protocol server expects, so that compatibility is a translation layer rather than a rewrite.',
      },
    ],
  },
  {
    slug: 'why-the-supervisor-is-a-separate-process',
    title: 'Why the supervisor is a separate process',
    summary: 'The registry is a shared catalogue. Shared catalogues must not execute what they list.',
    topic: 'Architecture',
    body: [
      {
        kind: 'p',
        text: 'Norien publishes agents and Norien runs agents, and it would be convenient for one process to do both. It does not.',
      },
      {
        kind: 'p',
        text: 'The registry is a catalogue meant to be shared — eventually hosted, serving many people. An agent is arbitrary code written by someone else. A process that is both a shared service and an executor of untrusted code is a process where one bad agent affects everyone reading the catalogue.',
      },
      {
        kind: 'h',
        text: 'The split',
      },
      {
        kind: 'p',
        text: 'The registry validates, stores, resolves, and describes. It will happily tell you whether an agent could run — parsing the manifest, detecting the runtime, resolving every tool, checking which variables are set — without running anything.',
      },
      {
        kind: 'p',
        text: 'The supervisor runs on your machine, owns process lifecycle, and is the only component that ever spawns anything. It is why the Runtime page in this app frequently shows "offline": it is genuinely a different process, and it not running is a normal state rather than a fault.',
      },
      {
        kind: 'p',
        text: 'The boundary is also what makes remote execution a later addition rather than a rewrite. Pointing a client at a different supervisor is a configuration change, because the registry never assumed it was the one doing the work.',
      },
    ],
  },
];

export function findNote(slug: string): Note | undefined {
  return NOTES.find((note) => note.slug === slug);
}
