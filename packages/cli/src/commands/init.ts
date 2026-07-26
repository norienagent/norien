import { constants as fsConstants } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import inquirer from 'inquirer';

import type { CommandContext } from '../context.js';
import { CliError, emitJson, heading, line, styles, success } from '../ui.js';

/**
 * `norien init`
 *
 * Scaffolds a runnable Norien agent in one step: a valid `agent.json`, a
 * zero-dependency entrypoint that already serves the health endpoint the
 * supervisor probes, a README, and the env/ignore files. The result publishes
 * as-is (`norien publish`) and runs as-is (`norien run`).
 */

type Runtime = 'node' | 'python';

export interface InitOptions {
  name?: string;
  slug?: string;
  description?: string;
  runtime?: Runtime;
  tool?: string[];
  yes?: boolean;
  force?: boolean;
}

/** Lower-cases, strips punctuation, and hyphenates — the registry's slug shape. */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'my-agent'
  );
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function init(
  context: CommandContext,
  directory: string | undefined,
  options: InitOptions,
): Promise<void> {
  const targetDir = directory ? path.resolve(context.cwd, directory) : context.cwd;
  const dirName = path.basename(targetDir);

  const interactive = !options.yes && process.stdout.isTTY && !context.json;

  // Seed answers from flags, then fill the gaps — interactively or with defaults.
  const defaults = {
    name: options.name ?? (directory ? dirName.replace(/[-_]+/g, ' ') : 'My Agent'),
    runtime: options.runtime ?? 'node',
    description: options.description ?? '',
  };

  let answers = { ...defaults };
  if (interactive) {
    answers = await inquirer.prompt([
      { type: 'input', name: 'name', message: 'Agent name', default: defaults.name },
      {
        type: 'list',
        name: 'runtime',
        message: 'Runtime',
        choices: ['node', 'python'],
        default: defaults.runtime,
      },
      {
        type: 'input',
        name: 'description',
        message: 'Description',
        default: defaults.description || undefined,
      },
    ]);
  }

  const runtime = (answers.runtime as Runtime) ?? 'node';
  const name = answers.name.trim() || defaults.name;
  const slug = options.slug ? slugify(options.slug) : slugify(name);
  const description =
    answers.description.trim() || `A Norien agent on Robinhood Chain.`;
  const tools = (options.tool ?? []).map((t) => t.trim()).filter(Boolean);

  const entrypoint = runtime === 'node' ? 'index.js' : 'main.py';
  const manifestPath = path.join(targetDir, 'agent.json');

  if (!options.force && (await exists(manifestPath))) {
    throw new CliError(
      `agent.json already exists in ${targetDir}. Use --force to overwrite, or pick an empty directory.`,
      { exitCode: 2 },
    );
  }

  const manifest = {
    name,
    version: '1.0.0',
    description,
    runtime,
    entrypoint,
    commands: { start: runtime === 'node' ? 'node index.js' : 'python main.py', health: '/health' },
    tools,
    permissions: ['network:fetch'],
    environment: [
      {
        name: 'GREETING',
        required: false,
        secret: false,
        default: 'hello from ' + slug,
        description: 'Example variable — replace with your own.',
      },
    ],
    tags: [] as string[],
  };

  const files: { file: string; body: string }[] = [
    { file: 'agent.json', body: JSON.stringify(manifest, null, 2) + '\n' },
    { file: 'README.md', body: readme(name, slug, runtime) },
    { file: '.env.example', body: 'GREETING=hello\n' },
    {
      file: '.gitignore',
      body: [
        'node_modules/',
        '.env',
        '__pycache__/',
        '*.pyc',
        'norien_agents/',
        'norien.lock.json',
        '',
      ].join('\n'),
    },
  ];

  if (runtime === 'node') {
    files.push({ file: 'index.js', body: nodeEntry() });
    files.push({ file: 'package.json', body: nodePackageJson(slug) });
  } else {
    files.push({ file: 'main.py', body: pythonEntry() });
    files.push({ file: 'requirements.txt', body: '# No third-party dependencies required.\n' });
  }

  await mkdir(targetDir, { recursive: true });

  const written: string[] = [];
  const skipped: string[] = [];
  for (const { file, body } of files) {
    const full = path.join(targetDir, file);
    // agent.json is gated above; other files never clobber unless --force.
    if (!options.force && file !== 'agent.json' && (await exists(full))) {
      skipped.push(file);
      continue;
    }
    await writeFile(full, body, 'utf8');
    written.push(file);
  }

  if (context.json) {
    emitJson({ directory: targetDir, slug, runtime, written, skipped });
    return;
  }

  success(`Scaffolded ${styles.title(name)} (${runtime})`);
  line();
  heading('Files');
  for (const file of written) line(`  ${styles.ok('+')} ${file}`);
  for (const file of skipped) line(`  ${styles.dim('·')} ${file} ${styles.dim('(kept)')}`);
  line();
  heading('Next');
  const cd = directory ? `cd ${directory}\n  ` : '';
  if (runtime === 'node') {
    line(`  ${cd}norien run ${slug}        ${styles.dim('# or: node index.js')}`);
  } else {
    line(`  ${cd}norien run ${slug}        ${styles.dim('# or: python main.py')}`);
  }
  line(`  norien publish --dry-run   ${styles.dim('# validate against the registry')}`);
  line(`  norien publish             ${styles.dim('# needs: norien login')}`);
  line();
}

function readme(name: string, slug: string, runtime: Runtime): string {
  const runCmd = runtime === 'node' ? 'node index.js' : 'python main.py';
  return `# ${name}

A Norien agent for Robinhood Chain, scaffolded with \`norien init\`.

## Run it

\`\`\`sh
norien run ${slug}
# or directly:
${runCmd}
\`\`\`

It serves \`/health\` on the port the supervisor allocates (\`PORT\`), and reads
its configuration from the environment (see \`.env.example\`).

## Publish it

\`\`\`sh
norien login          # once, paste an API key from app.norien.live/api-keys
norien publish --dry-run
norien publish
\`\`\`

## Edit

- \`agent.json\` — the manifest: name, runtime, tools, permissions, environment.
- \`${runtime === 'node' ? 'index.js' : 'main.py'}\` — your agent's code.

Docs: https://docs.norien.live
`;
}

function nodePackageJson(slug: string): string {
  return (
    JSON.stringify(
      {
        name: slug,
        version: '1.0.0',
        private: true,
        type: 'module',
        scripts: { start: 'node index.js' },
      },
      null,
      2,
    ) + '\n'
  );
}

function nodeEntry(): string {
  return `// A real, running Norien agent — zero dependencies, Node builtins only.
//
// The runtime injects everything it needs as environment variables:
//   PORT             the port to serve /health on
//   NORIEN_AGENT     this agent's slug
//   NORIEN_REGISTRY  the Norien API to read data from
//   NORIEN_TOOLS     resolved tool metadata, as JSON

import { createServer } from 'node:http';

const AGENT = process.env.NORIEN_AGENT ?? 'my-agent';
const PORT = Number(process.env.PORT ?? 8787);
const GREETING = process.env.GREETING ?? 'hello';

const state = { ready: true, startedAt: new Date().toISOString(), ticks: 0 };

// Health endpoint the supervisor probes.
createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: state.ready ? 'healthy' : 'starting', ...state }));
    return;
  }
  res.writeHead(404).end();
}).listen(PORT, () => console.log(\`[\${AGENT}] listening on :\${PORT}\`));

// Your agent's work goes here. This one just proves it's alive.
setInterval(() => {
  state.ticks += 1;
  console.log(\`[\${AGENT}] \${GREETING} — tick \${state.ticks}\`);
}, 10_000);

console.log(\`[\${AGENT}] started\`);
`;
}

function pythonEntry(): string {
  return `# A real, running Norien agent — standard library only.
#
# The runtime injects everything it needs as environment variables:
#   PORT             the port to serve /health on
#   NORIEN_AGENT     this agent's slug
#   NORIEN_REGISTRY  the Norien API to read data from
#   NORIEN_TOOLS     resolved tool metadata, as JSON

import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

AGENT = os.environ.get("NORIEN_AGENT", "my-agent")
PORT = int(os.environ.get("PORT", "8787"))
GREETING = os.environ.get("GREETING", "hello")

state = {"ready": True, "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"), "ticks": 0}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path == "/health":
            body = json.dumps({"status": "healthy" if state["ready"] else "starting", **state})
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(body.encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args):  # silence default logging
        pass


def serve():
    HTTPServer(("", PORT), Handler).serve_forever()


threading.Thread(target=serve, daemon=True).start()
print(f"[{AGENT}] listening on :{PORT}", flush=True)
print(f"[{AGENT}] started", flush=True)

# Your agent's work goes here. This one just proves it's alive.
while True:
    state["ticks"] += 1
    print(f"[{AGENT}] {GREETING} — tick {state['ticks']}", flush=True)
    time.sleep(10)
`;
}
