#!/usr/bin/env node
import { Command, Option } from 'commander';

import { type GlobalOptions, createContext } from './context.js';
import { configureOutput, reportError, styles } from './ui.js';
import { login, logout, profiles, whoami } from './commands/auth.js';
import { info, search } from './commands/discover.js';
import { doctor } from './commands/doctor.js';
import { install, list, uninstall, update } from './commands/lifecycle.js';
import { publish } from './commands/publish.js';
import { logs, restart, run, runtimeDaemon, status, stop } from './commands/runtime.js';
import {
  contract as contractCommand,
  markets as marketsCommand,
  project as projectCommand,
  token as tokenCommand,
  trending as trendingCommand,
  wallet as walletCommand,
} from './commands/data.js';
import {
  toolInfo,
  toolInstall,
  toolList,
  toolPublish,
  toolRemove,
  toolRun,
  toolSearch,
  toolUpdate,
} from './commands/tool.js';

const VERSION = '0.1.0';

/**
 * Entry point.
 *
 * Every command follows one shape: build a context from global options, run,
 * and let a single handler render failures. Commands never call `process.exit`
 * themselves, so exit codes stay defined in one place:
 *
 *   0 success   1 error   2 bad usage   3 not authenticated
 *   4 not found 5 validation/dependency failure
 *   6 runtime unavailable  7 permission denied
 */

const program = new Command();

program
  .name('norien')
  .description('Publish, discover, and install agents from the Norien registry.')
  .version(VERSION, '-v, --version', 'Print the CLI version.')
  .option('--registry <url>', 'Registry URL (overrides the stored profile).')
  .option('--profile <name>', 'Credential profile to use.')
  .option('--json', 'Emit machine-readable JSON instead of formatted output.')
  .option('-y, --yes', 'Skip confirmation prompts.')
  .option('-q, --quiet', 'Suppress non-essential output.')
  .option('--no-color', 'Disable coloured output.')
  .showHelpAfterError('(run "norien --help" for usage)')
  .configureHelp({ sortSubcommands: true });

/**
 * Wraps a command body: resolves the context, applies output settings, and
 * routes every failure through one renderer.
 */
function action<A extends unknown[]>(
  handler: (context: Awaited<ReturnType<typeof createContext>>, ...args: A) => Promise<number | void>,
) {
  return async (...args: [...A, Command]): Promise<void> => {
    const command = args[args.length - 1] as Command;
    const commandArgs = args.slice(0, -1) as unknown as A;
    const globals = command.optsWithGlobals() as GlobalOptions;

    configureOutput({ json: globals.json === true, quiet: globals.quiet === true });

    try {
      const context = await createContext(globals);
      const code = await handler(context, ...commandArgs);
      if (typeof code === 'number' && code !== 0) process.exitCode = code;
    } catch (error) {
      process.exitCode = reportError(error);
    }
  };
}

// --- Authentication -------------------------------------------------------

program
  .command('login')
  .description('Authenticate against a registry and store the credentials.')
  .option('--registry <url>', 'Registry URL.')
  .option('--handle <name>', 'Handle to publish and install as.')
  .option('--api-key <key>', 'API key. Also readable from NORIEN_API_KEY.')
  .option('--profile <name>', 'Profile to store the credentials under.')
  .addHelpText(
    'after',
    `
Credentials are written to ~/.norien/config.json with 0600 permissions.
For CI, skip this command and set NORIEN_ACTOR, NORIEN_API_KEY, and NORIEN_REGISTRY.`,
  )
  .action(action((context, options) => login(context, options as Parameters<typeof login>[1])));

program
  .command('logout')
  .description('Remove stored credentials.')
  .option('--all', 'Remove every profile, not just the current one.')
  .option('--profile <name>', 'Profile to remove.')
  .action(action((context, options) => logout(context, options as Parameters<typeof logout>[1])));

program
  .command('whoami')
  .description('Show the identity the CLI will act as.')
  .action(action((context) => whoami(context)));

program
  .command('profiles')
  .description('List configured registry profiles.')
  .action(action((context) => profiles(context)));

// --- Discovery ------------------------------------------------------------

program
  .command('search')
  .argument('<keyword>', 'Term to search for.')
  .description('Global search across agents, tools, tokens, and projects.')
  .addOption(
    new Option('-t, --type <type>', 'Restrict to one catalogue.')
      .choices(['all', 'agent', 'tool', 'token', 'project'])
      .default('all'),
  )
  .option('-l, --limit <n>', 'Maximum results.', (value) => Number.parseInt(value, 10), 20)
  .option('--tag <tag...>', 'Filter by tag.')
  .option('--author <handle>', 'Filter by author.')
  .action(
    action((context, keyword: string, options) =>
      search(context, keyword, options as Parameters<typeof search>[2]),
    ),
  );

program
  .command('info')
  .argument('<agent>', 'Agent slug.')
  .description('Show an agent: manifest, tools, permissions, runtime, and environment.')
  .option('--version <version>', 'Exact version or semver range.')
  .option('--readme', 'Print the full README.')
  .action(
    action((context, slug: string, options) =>
      info(context, slug, options as Parameters<typeof info>[2]),
    ),
  );

// --- Lifecycle ------------------------------------------------------------

program
  .command('install')
  .argument('<agent>', 'Agent slug, optionally as slug@version.')
  .description('Install an agent into ./norien_agents.')
  .option('--version <version>', 'Exact version or semver range.')
  .option('--force', 'Reinstall even if already present.')
  .option('--env <name...>', 'Environment variable names you already have set.')
  .option('--no-source', 'Skip fetching the agent code; write the manifest only.')
  .addHelpText(
    'after',
    `
Writes agent.json, README.md, .env.example, and norien.metadata.json into
./norien_agents/<slug>/ and records the version in norien.lock.json.

When the manifest declares a source, the agent's code is cloned into the same
directory (cloning only -- nothing is executed). Use --no-source to inspect the
manifest before pulling code.`,
  )
  .action(
    action((context, slug: string, options) =>
      install(context, slug, options as Parameters<typeof install>[2]),
    ),
  );

program
  .command('uninstall')
  .alias('remove')
  .argument('<agent>', 'Agent slug.')
  .description('Remove an installed agent.')
  .option('--keep-remote', 'Remove locally but keep the registry installation record.')
  .action(
    action((context, slug: string, options) =>
      uninstall(context, slug, options as Parameters<typeof uninstall>[2]),
    ),
  );

program
  .command('list')
  .alias('ls')
  .description('List agents installed in this directory.')
  .option('--remote', 'List installations recorded on the registry instead.')
  .action(action((context, options) => list(context, options as Parameters<typeof list>[1])));

program
  .command('update')
  .argument('[agent]', 'Agent slug. Omit to update everything installed here.')
  .description('Check for newer versions, show the changelog, and update.')
  .option('--check', 'Only report what is outdated; change nothing.')
  .action(
    action((context, slug: string | undefined, options) =>
      update(context, slug, options as Parameters<typeof update>[2]),
    ),
  );

// --- Publishing -----------------------------------------------------------

program
  .command('publish')
  .description('Validate and publish the agent in the current directory.')
  .option('--dry-run', 'Validate and show the plan without uploading.')
  .option('--tag <tag...>', 'Tags to publish with.')
  .addOption(new Option('--visibility <visibility>', 'Listing visibility.').choices(['public', 'private']))
  .option('--slug <slug>', 'Publish under an explicit slug.')
  .addHelpText(
    'after',
    `
Detects agent.json, README.md, and an icon in the working directory, validates
through the registry, then uploads. Icons are referenced by URL: set "icon" in
agent.json to a hosted image.`,
  )
  .action(action((context, options) => publish(context, options as Parameters<typeof publish>[1])));

// --- Runtime --------------------------------------------------------------

program
  .command('run')
  .argument('<agent>', 'Installed agent slug.')
  .description('Run an installed agent under the Norien runtime.')
  .option('--command <command>', 'Override the resolved start command.')
  .option('--env <pair...>', 'Extra environment as KEY=value.')
  .option('--grant <permission...>', 'Grant a declared permission for this and future runs.')
  .option('--grant-all', 'Grant every permission the agent declares.')
  .addOption(
    new Option('--restart-policy <policy>', 'Restart automatically when the agent exits.')
      .choices(['no', 'on-failure', 'always'])
      .default('no'),
  )
  .option('--offline', 'Resolve tools from install metadata instead of the registry.')
  .option('-f, --follow', 'Stream logs after starting.')
  .addHelpText(
    'after',
    `
The agent runs under a supervisor and keeps running after this command exits.
Before launch the runtime resolves tools, validates permissions and required
environment variables, and detects the package manager.`,
  )
  .action(
    action((context, agent: string, options) => run(context, agent, options as Parameters<typeof run>[2])),
  );

program
  .command('stop')
  .argument('<agent>', 'Running agent slug.')
  .description('Gracefully stop a running agent.')
  .option('--timeout <seconds>', 'Seconds to wait before SIGKILL.', (value) => Number.parseInt(value, 10))
  .option('--force', 'Send SIGKILL immediately.')
  .action(
    action((context, agent: string, options) =>
      stop(context, agent, options as Parameters<typeof stop>[2]),
    ),
  );

program
  .command('restart')
  .argument('<agent>', 'Agent slug.')
  .description('Restart an agent, reusing the options it was started with.')
  .option('--grant <permission...>', 'Grant a declared permission.')
  .option('--grant-all', 'Grant every permission the agent declares.')
  .option('--offline', 'Resolve tools from install metadata.')
  .action(
    action((context, agent: string, options) =>
      restart(context, agent, options as Parameters<typeof restart>[2]),
    ),
  );

program
  .command('logs')
  .argument('<agent>', 'Agent slug.')
  .description('Show agent logs. Use --follow to stream live.')
  .option('-f, --follow', 'Stream new output until interrupted.')
  .option('-n, --lines <n>', 'Number of lines to show.', (value) => Number.parseInt(value, 10), 200)
  .addOption(
    new Option('--stream <stream>', 'Show only one stream.').choices(['stdout', 'stderr', 'system']),
  )
  .option('--history', 'Read durable logs from disk, including earlier runs.')
  .action(
    action((context, agent: string, options) =>
      logs(context, agent, options as Parameters<typeof logs>[2]),
    ),
  );

program
  .command('status')
  .argument('[agent]', 'Agent slug. Omit to show every installed agent.')
  .description('Show runtime status: running, stopped, failed, restarting.')
  .option('--host <url>', 'Runtime URL to query instead of the local one.')
  .action(
    action((context, agent: string | undefined, options) =>
      status(context, agent, options as Parameters<typeof status>[2]),
    ),
  );

const runtime = program
  .command('runtime')
  .description('Manage the runtime supervisor itself.');

runtime
  .command('start')
  .description('Start the runtime supervisor for this workspace.')
  .option('--foreground', 'Run in the foreground instead of detaching.')
  .option('--port <port>', 'Port to listen on.', (value) => Number.parseInt(value, 10))
  .action(
    action((context, options) =>
      runtimeDaemon(context, 'start', options as Parameters<typeof runtimeDaemon>[2]),
    ),
  );

runtime
  .command('stop')
  .description('Stop the supervisor and every agent it is running.')
  .action(action((context) => runtimeDaemon(context, 'stop', {})));

runtime
  .command('status')
  .description('Show whether the supervisor is running.')
  .action(action((context) => runtimeDaemon(context, 'status', {})));

// --- Market data ----------------------------------------------------------

program
  .command('markets')
  .description('Live token market list with sorting, filtering, and pagination.')
  .option('--chain <id>', 'Chain id. Defaults to the native chain.', (v) => Number.parseInt(v, 10))
  .option('-l, --limit <n>', 'Rows to show.', (v) => Number.parseInt(v, 10), 20)
  .option('--offset <n>', 'Rows to skip.', (v) => Number.parseInt(v, 10), 0)
  .option('-q, --q <text>', 'Filter by name or symbol.')
  .addOption(
    new Option('-s, --sort <field>', 'Ranking.')
      .choices(['volume24', 'liquidity', 'marketCap', 'change24', 'trendingScore24'])
      .default('volume24'),
  )
  .action(action((context, options) => marketsCommand(context, options as Parameters<typeof marketsCommand>[1])));

program
  .command('trending')
  .description('Tokens ranked by 24h trending score.')
  .option('--chain <id>', 'Chain id.', (v) => Number.parseInt(v, 10))
  .option('-l, --limit <n>', 'Rows to show.', (v) => Number.parseInt(v, 10), 20)
  .action(action((context, options) => trendingCommand(context, options as Parameters<typeof trendingCommand>[1])));

program
  .command('token')
  .argument('<address>', 'Token contract address.')
  .description('Token detail: price, liquidity, holders, supply, links.')
  .option('--chain <id>', 'Chain id. Defaults to the native chain.', (v) => Number.parseInt(v, 10))
  .action(
    action((context, address: string, options) =>
      tokenCommand(context, address, options as Parameters<typeof tokenCommand>[2]),
    ),
  );

program
  .command('wallet')
  .argument('<address>', 'Wallet address.')
  .description('Wallet balance, transactions, and token transfers.')
  .option('-l, --limit <n>', 'History rows.', (v) => Number.parseInt(v, 10), 10)
  .action(
    action((context, address: string, options) =>
      walletCommand(context, address, options as Parameters<typeof walletCommand>[2]),
    ),
  );

program
  .command('contract')
  .argument('<address>', 'Contract address.')
  .description('Contract info, verification status, ABI, and source.')
  .option('--abi', 'Print the full ABI.')
  .option('--source', 'Print the verified source code.')
  .action(
    action((context, address: string, options) =>
      contractCommand(context, address, options as Parameters<typeof contractCommand>[2]),
    ),
  );

program
  .command('project')
  .argument('<slug>', 'Project slug, e.g. aave.')
  .description('Project overview: TVL, chains, and GitHub statistics.')
  .action(action((context, slug: string) => projectCommand(context, slug)));

// --- Tool marketplace -----------------------------------------------------

const tool = program
  .command('tool')
  .description('Search, publish, install, and run marketplace tools.');

tool
  .command('search')
  .argument('<keyword>', 'Term to search for.')
  .description('Search the tool marketplace.')
  .option('--category <category>', 'Filter by category.')
  .addOption(new Option('--runtime <runtime>', 'Filter by runtime.').choices(['node', 'python', 'http']))
  .option('-l, --limit <n>', 'Maximum results.', (value) => Number.parseInt(value, 10), 20)
  .action(
    action((context, keyword: string, options) =>
      toolSearch(context, keyword, options as Parameters<typeof toolSearch>[2]),
    ),
  );

tool
  .command('info')
  .argument('<slug>', 'Tool slug.')
  .description('Show a tool: schemas, permissions, environment, runtime.')
  .option('--docs', 'Print the generated documentation page instead.')
  .option('--output <file>', 'Write the generated docs to a file.')
  .action(
    action((context, slug: string, options) =>
      toolInfo(context, slug, options as Parameters<typeof toolInfo>[2]),
    ),
  );

tool
  .command('install')
  .argument('<tool>', 'Tool slug, or a local path to a tool.json directory.')
  .description('Install a tool into ./norien_tools.')
  .option('--version <version>', 'Exact version or semver range.')
  .addHelpText(
    'after',
    `
Installing by slug pulls the manifest from the registry (runnable immediately
for http tools). Installing from a local path copies the tool's code too, so
node and python tools become runnable.`,
  )
  .action(
    action((context, target: string, options) =>
      toolInstall(context, target, options as Parameters<typeof toolInstall>[2]),
    ),
  );

tool
  .command('publish')
  .description('Validate and publish the tool.json in the current directory.')
  .option('--dry-run', 'Validate and show the plan without uploading.')
  .addOption(new Option('--visibility <visibility>', 'Listing visibility.').choices(['public', 'private']))
  .action(action((context, options) => toolPublish(context, options as Parameters<typeof toolPublish>[1])));

tool
  .command('update')
  .argument('[slug]', 'Tool slug. Omit to update every installed tool.')
  .description('Check for newer tool versions and update.')
  .option('--check', 'Only report what is outdated; change nothing.')
  .action(
    action((context, slug: string | undefined, options) =>
      toolUpdate(context, slug, options as Parameters<typeof toolUpdate>[2]),
    ),
  );

tool
  .command('remove')
  .alias('uninstall')
  .argument('<slug>', 'Tool slug.')
  .description('Remove an installed tool.')
  .option('--registry', 'Also delete the tool from the registry (owner only).')
  .action(
    action((context, slug: string, options) =>
      toolRemove(context, slug, options as Parameters<typeof toolRemove>[2]),
    ),
  );

tool
  .command('list')
  .alias('ls')
  .description('List tools installed in this workspace.')
  .action(action((context) => toolList(context)));

tool
  .command('run')
  .argument('<slug>', 'Installed tool slug.')
  .description('Execute an installed tool with JSON input.')
  .option('--input <json>', 'Input as a JSON string. Reads stdin when omitted.')
  .option('--env <pair...>', 'Environment as KEY=value.')
  .option('--timeout <seconds>', 'Execution timeout.', (value) => Number.parseInt(value, 10))
  .addHelpText(
    'after',
    `
The tool's input is validated against its input_schema before execution and its
output against output_schema afterwards. Pipe JSON in, or pass --input.`,
  )
  .action(
    action((context, slug: string, options) =>
      toolRun(context, slug, options as Parameters<typeof toolRun>[2]),
    ),
  );

// --- Diagnostics ----------------------------------------------------------

program
  .command('doctor')
  .description('Check the API, manifest, dependencies, runtimes, and configuration.')
  .action(action((context) => doctor(context)));

program.addHelpText(
  'after',
  `
${styles.dim('Environment')}
  NORIEN_REGISTRY    Registry URL
  NORIEN_ACTOR       Handle to act as
  NORIEN_API_KEY     API key
  NORIEN_PROFILE     Profile name
  NORIEN_CONFIG_DIR  Config directory (default ~/.norien)

${styles.dim('Examples')}
  norien search trading
  norien info trading-agent --readme
  norien markets --sort liquidity
  norien trending
  norien token 0x5fc5360d0400a0fd4f2af552add042d716f1d168
  norien install research-agent@1.0.0
  norien run research-agent --grant-all
  norien logs research-agent -f
  norien status
  norien publish --dry-run
  norien doctor --json
`,
);

program.parseAsync(process.argv).catch((error: unknown) => {
  process.exitCode = reportError(error);
});
