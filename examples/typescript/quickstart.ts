/**
 * TypeScript SDK quickstart.
 *
 *   npm run build:packages
 *   npx tsx examples/typescript/quickstart.ts
 *
 * Set NORIEN_REGISTRY, NORIEN_ACTOR, and NORIEN_API_KEY to point elsewhere.
 */
import { Norien, NorienError } from '@norien/sdk';

const client = new Norien({
  baseUrl: process.env.NORIEN_REGISTRY ?? 'http://localhost:3000',
  actor: process.env.NORIEN_ACTOR ?? 'example-user',
  ...(process.env.NORIEN_API_KEY ? { apiKey: process.env.NORIEN_API_KEY } : {}),
});

async function main(): Promise<void> {
  const health = await client.health();
  console.log(`registry ${health.status} (v${health.version})\n`);

  // --- Search ------------------------------------------------------------
  const results = await client.search({ q: 'trading', limit: 5 });
  console.log(`search "trading" -> ${results.meta.total} result(s)`);
  for (const hit of results.data) {
    console.log(`  ${hit.type.padEnd(5)} ${hit.item.slug.padEnd(18)} v${hit.item.version}`);
  }

  // --- Info --------------------------------------------------------------
  const agent = await client.info('trading-agent');
  console.log(`\n${agent.name} @${agent.version} by ${agent.author}`);
  console.log(`  runtime: ${agent.runtime}`);
  console.log(`  tools:   ${agent.required_tools.join(', ')}`);

  // --- Runtime: could this run here? -------------------------------------
  const runtime = await client.agents.runtime('trading-agent', {
    environment: ['EXCHANGE_API_KEY'],
  });
  console.log(`\nready: ${runtime.ready}`);
  if (runtime.environment.missing.length > 0) {
    console.log(`  still needs: ${runtime.environment.missing.join(', ')}`);
  }

  // --- Install -----------------------------------------------------------
  // `^1.0.0` means >=1.0.0 <2.0.0, so this resolves to the highest 1.x.
  const installed = await client.install({ agent: 'research-agent', version: '^1.0.0' });
  console.log(`\ninstalled ${installed.installation.agent}@${installed.installation.installed_version}`);
  console.log(`  start: ${installed.runtime.commands.start}`);

  // --- Validate before publishing ----------------------------------------
  const manifest = {
    name: 'Example Quickstart Agent',
    version: '1.0.0',
    description: 'Created by the TypeScript SDK quickstart example.',
    runtime: 'node' as const,
    entrypoint: 'dist/index.js',
    tools: ['web-search'],
    permissions: ['network:fetch'],
    environment: [{ name: 'EXAMPLE_KEY', required: true, secret: true }],
    commands: { start: 'node dist/index.js', health: '/health' },
  };

  const inspection = await client.runtime.inspect(manifest);
  console.log(`\ninspect -> ${inspection.slug}@${inspection.version}`);
  console.log(`  action:       ${inspection.version_check.action}`);
  console.log(`  dependencies: ${inspection.dependencies.satisfied ? 'satisfied' : 'missing'}`);

  // --- Publish -----------------------------------------------------------
  if (inspection.version_check.acceptable) {
    const published = await client.publish({ manifest, tags: ['example'] });
    if (published.type === 'agent') {
      console.log(`\npublished ${published.agent.slug}@${published.agent.version}`);
      console.log(`  ${published.agent.install_command}`);
    }
  } else {
    console.log(`\nskipping publish: ${inspection.version_check.conflict_reason}`);
  }

  // --- Paginate ----------------------------------------------------------
  let pythonAgents = 0;
  for await (const item of client.paginate((page) => client.agents.list({ ...page, runtime: 'python' }))) {
    pythonAgents += 1;
    void item;
  }
  console.log(`\npython agents in the registry: ${pythonAgents}`);
}

main().catch((error: unknown) => {
  if (error instanceof NorienError) {
    // Branch on the stable code rather than the message text.
    console.error(`[${error.code}] ${error.format()}`);
    if (error.requestId) console.error(`request id: ${error.requestId}`);
    process.exit(1);
  }
  throw error;
});
