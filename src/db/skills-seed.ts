import type { Database } from './client.js';
import type { NewSkillRow } from './schema/skills.js';
import { SkillRepository } from '../repositories/skill.repository.js';

/**
 * The skills Norien ships with. Idempotent: each is upserted by slug at boot,
 * so a fresh database (or a new deployment) always has the starter set, and
 * editing one here updates it on the next start.
 */
const DEFAULT_SKILLS: Omit<NewSkillRow, 'authorHandle'>[] = [
  {
    slug: 'market-recap',
    name: 'Market Recap',
    description: 'A crisp daily summary of Robinhood Chain markets — biggest movers and most active tokens.',
    category: 'market',
    tags: ['market', 'summary'],
    dataSource: 'markets',
    inputHint: "optional focus, e.g. 'gainers' or 'stablecoins'",
    examples: ["today's top movers", 'what is most active'],
    instructions:
      'Write a short, engaging market recap for Robinhood Chain from the live data. Lead with the standout movers, note the most-traded tokens, and close with one neutral, one-line takeaway. Keep it under ~150 words. Do not give financial advice or price predictions.',
  },
  {
    slug: 'review-wallet',
    name: 'Wallet Review',
    description: "Analyzes any wallet's multi-chain portfolio — value, allocation, concentration, and notable holdings.",
    category: 'portfolio',
    tags: ['wallet', 'portfolio', 'analysis'],
    dataSource: 'portfolio',
    inputHint: 'a wallet address (0x…)',
    examples: ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'],
    instructions:
      "From the wallet's portfolio data, write a clear, objective review: total value, how it splits across chains, the largest positions, and any concentration risk. Use a short intro plus bullets. Be concise. This is analysis, not financial advice.",
  },
  {
    slug: 'explain-token',
    name: 'Explain Token',
    description: "Explains any token from its live market data — what it is and how it's doing right now.",
    category: 'market',
    tags: ['token', 'explainer'],
    dataSource: 'token',
    inputHint: 'a token address',
    examples: ['explain this token'],
    instructions:
      "Using the token's live data, explain in plain language what the token appears to be (from its name and symbol) and summarize its current state: price, 24h change, liquidity, and holders. If liquidity is very low, flag that it may be illiquid or risky. Keep it to a short paragraph plus a couple of bullets.",
  },
  {
    slug: 'find-agent',
    name: 'Find an Agent',
    description: 'Recommends agents and tools from the Norien registry for whatever you want to build or do.',
    category: 'registry',
    tags: ['registry', 'discovery'],
    dataSource: 'registry',
    inputHint: 'what you want to build or do',
    examples: ['I want to trade automatically', 'monitor a wallet for large transfers'],
    instructions:
      'Given the goal and the registry search results, recommend the best-matching agents or tools. For each: the name, one line on why it fits, and the install command (`norien install <slug>` for an agent, `norien tool install <slug>` for a tool). If nothing fits well, say so honestly and suggest what to search for instead.',
  },
  {
    slug: 'draft-agent',
    name: 'Draft an Agent',
    description: 'Turns a plain-English description into a valid Norien agent.json manifest, ready to refine.',
    category: 'build',
    tags: ['agent', 'manifest', 'scaffold'],
    dataSource: 'none',
    inputHint: 'describe the agent you want',
    examples: ['A Python agent that summarizes crypto news hourly and posts to Discord'],
    instructions:
      'From the description, draft a complete, valid Norien agent.json: name, version "0.1.0", description, runtime ("node" or "python"), entrypoint, a commands object with a start command, a sensible tools array (slugs), permissions, and an environment array. Output ONLY the JSON in a fenced code block, then a single line suggesting what to adjust next.',
  },
];

export async function ensureDefaultSkills(db: Database, log: (line: string) => void = () => {}): Promise<void> {
  const repo = new SkillRepository(db);
  let written = 0;
  for (const skill of DEFAULT_SKILLS) {
    await repo.upsertBySlug({ ...skill, authorHandle: 'norien' });
    written += 1;
  }
  log(`ensured ${written} default skills`);
}
