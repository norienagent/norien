import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ToolError,
  ToolExecutor,
  ToolInstaller,
  generateToolDoc,
  readToolsLockfile,
  validateAgainstSchema,
  validateToolManifest,
} from '@norien/tools';
import type { Tool } from '@norien/sdk';

/**
 * Tool plugin-system tests.
 *
 * The executor tests spawn real node processes against real tool folders --
 * the whole point of the package is executing plugins, so mocking the process
 * layer would test nothing that matters.
 */

let workspace: string;

/** A runnable node tool: echoes its input back through the plugin protocol. */
const ECHO_TOOL = {
  manifest: {
    name: 'Echo',
    slug: 'echo',
    version: '1.0.0',
    description: 'Echoes its input.',
    category: 'utility',
    runtime: 'node',
    entrypoint: 'index.js',
    input_schema: {
      type: 'object',
      required: ['message'],
      properties: { message: { type: 'string' }, times: { type: 'integer', minimum: 1, maximum: 5 } },
    },
    output_schema: {
      type: 'object',
      required: ['echoed'],
      properties: { echoed: { type: 'string' }, tool: { type: 'string' } },
    },
    permissions: ['demo:echo'],
    environment: [{ name: 'ECHO_PREFIX', required: false, secret: false, default: '' }],
  },
  code: `
async function main(input, context) {
  process.stderr.write('echo tool running\\n');
  const prefix = process.env.ECHO_PREFIX ?? '';
  const echoed = prefix + input.message.repeat(input.times ?? 1);
  return { echoed, tool: context.tool };
}
run(main);
function run(fn) {
  const chunks = [];
  process.stdin.on('data', (c) => chunks.push(c));
  process.stdin.on('end', async () => {
    let payload = {};
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch {}
    try {
      const output = await fn(payload.input ?? {}, payload.context ?? {});
      process.stdout.write(JSON.stringify({ output }));
    } catch (error) {
      process.stdout.write(JSON.stringify({ error: { message: String(error && error.message || error) } }));
      process.exitCode = 1;
    }
  });
}
`,
};

/** A tool that violates its own output_schema, to prove output validation. */
const LIAR_TOOL = {
  manifest: {
    name: 'Liar',
    slug: 'liar',
    version: '1.0.0',
    description: 'Returns the wrong shape.',
    category: 'utility',
    runtime: 'node',
    entrypoint: 'index.js',
    input_schema: { type: 'object' },
    output_schema: {
      type: 'object',
      required: ['count'],
      properties: { count: { type: 'integer' } },
    },
  },
  code: `process.stdin.on('data', () => {}); process.stdin.on('end', () => process.stdout.write(JSON.stringify({ output: { count: 'not-a-number' } })));`,
};

async function createToolDir(
  slug: string,
  tool: { manifest: Record<string, unknown>; code?: string },
): Promise<string> {
  const dir = path.join(workspace, 'src', slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'tool.json'), JSON.stringify(tool.manifest, null, 2));
  if (tool.code) await writeFile(path.join(dir, 'index.js'), tool.code);
  return dir;
}

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'norien-tools-'));
});

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('schema validator', () => {
  it('accepts a conforming value', () => {
    const result = validateAgainstSchema(
      { type: 'object', required: ['a'], properties: { a: { type: 'string' } } },
      { a: 'hi' },
    );
    expect(result.valid).toBe(true);
  });

  it('reports the path of each violation', () => {
    const schema = {
      type: 'object',
      required: ['name', 'age'],
      properties: {
        name: { type: 'string', minLength: 2 },
        age: { type: 'integer', minimum: 0 },
        role: { type: 'string', enum: ['admin', 'user'] },
      },
    };

    const result = validateAgainstSchema(schema, { name: 'x', age: -1, role: 'ghost' });
    expect(result.valid).toBe(false);
    const paths = result.errors.map((issue) => issue.path);
    expect(paths).toContain('/name');
    expect(paths).toContain('/age');
    expect(paths).toContain('/role');
  });

  it('validates nested arrays and objects', () => {
    const schema = {
      type: 'object',
      properties: { items: { type: 'array', items: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } } } },
    };
    expect(validateAgainstSchema(schema, { items: [{ id: 1 }, { id: 'no' }] }).valid).toBe(false);
    expect(validateAgainstSchema(schema, { items: [{ id: 1 }] }).valid).toBe(true);
  });
});

describe('manifest validation', () => {
  it('accepts a valid manifest', () => {
    expect(() => validateToolManifest(ECHO_TOOL.manifest)).not.toThrow();
  });

  it('rejects a manifest missing required fields', () => {
    expect(() => validateToolManifest({ name: 'Broken' })).toThrow(ToolError);
  });

  it('requires an entrypoint for every runtime', () => {
    const { entrypoint, ...withoutEntrypoint } = ECHO_TOOL.manifest;
    try {
      validateToolManifest(withoutEntrypoint);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      expect((error as ToolError).details.some((d) => d.field === 'entrypoint')).toBe(true);
    }
  });

  it('rejects an unknown category', () => {
    expect(() => validateToolManifest({ ...ECHO_TOOL.manifest, category: 'nonsense' })).toThrow(
      ToolError,
    );
  });
});

describe('installer', () => {
  it('installs a local tool and records it in the lockfile', async () => {
    const source = await createToolDir('echo', ECHO_TOOL);
    const installer = new ToolInstaller(workspace);

    const installed = await installer.installFromLocal(source, { registry: 'http://x' });

    expect(installed.slug).toBe('echo');
    expect(installed.executable).toBe(true);
    expect(installed.files).toContain('tool.json');
    expect(installed.files).toContain('.env.example');

    const lockfile = await readToolsLockfile(workspace);
    expect(lockfile.tools.echo?.version).toBe('1.0.0');

    // The entrypoint came along, so it is runnable.
    const copied = await readFile(path.join(installed.directory, 'index.js'), 'utf8');
    expect(copied).toContain('run(main)');
  });

  it('uninstalls a tool', async () => {
    const installer = new ToolInstaller(workspace);
    await createToolDir('temp', {
      manifest: { ...ECHO_TOOL.manifest, slug: 'temp' },
      code: ECHO_TOOL.code,
    });
    await installer.installFromLocal(path.join(workspace, 'src', 'temp'), { registry: 'http://x' });

    expect(await installer.uninstall('temp')).toBe(true);
    expect((await readToolsLockfile(workspace)).tools.temp).toBeUndefined();
    expect(await installer.uninstall('temp')).toBe(false);
  });
});

describe('executor', () => {
  let executor: ToolExecutor;

  beforeAll(async () => {
    const installer = new ToolInstaller(workspace);
    await createToolDir('echo', ECHO_TOOL);
    await installer.installFromLocal(path.join(workspace, 'src', 'echo'), { registry: 'http://x' });
    await createToolDir('liar', LIAR_TOOL);
    await installer.installFromLocal(path.join(workspace, 'src', 'liar'), { registry: 'http://x' });
    executor = new ToolExecutor(workspace);
  });

  it('runs a node tool over the plugin protocol', async () => {
    const result = await executor.execute('echo', { message: 'hi', times: 3 });

    expect(result.output).toEqual({ echoed: 'hihihi', tool: 'echo' });
    expect(result.runtime).toBe('node');
    // Anything the tool logged is captured, not merged into the result.
    expect(result.logs).toContain('echo tool running');
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('injects environment values', async () => {
    const result = await executor.execute('echo', { message: 'x' }, { env: { ECHO_PREFIX: '>>' } });
    expect(result.output).toMatchObject({ echoed: '>>x' });
  });

  it('rejects input that violates the input schema before running', async () => {
    await expect(executor.execute('echo', { times: 2 })).rejects.toMatchObject({
      code: 'INPUT_INVALID',
    });
  });

  it('rejects output that violates the output schema', async () => {
    // The tool returns { count: "not-a-number" }; the executor catches it.
    await expect(executor.execute('liar', {})).rejects.toMatchObject({ code: 'OUTPUT_INVALID' });
  });

  it('enforces tool permissions when the caller grants a subset', async () => {
    await expect(
      executor.execute('echo', { message: 'x' }, { grantedPermissions: [] }),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });

    const allowed = await executor.execute(
      'echo',
      { message: 'x' },
      { grantedPermissions: ['demo:echo'] },
    );
    expect(allowed.output).toBeDefined();
  });

  it('reports a missing installed tool', async () => {
    await expect(executor.execute('nonexistent', {})).rejects.toMatchObject({
      code: 'TOOL_NOT_INSTALLED',
    });
  });
});

describe('http tool execution', () => {
  it('proxies to the endpoint and validates the result', async () => {
    // A local server standing in for a remote tool endpoint.
    const { createServer } = await import('node:http');
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const input = JSON.parse(body || '{}');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ doubled: (input.value ?? 0) * 2 }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');

    const installer = new ToolInstaller(workspace);
    await createToolDir('doubler', {
      manifest: {
        name: 'Doubler',
        slug: 'doubler',
        version: '1.0.0',
        description: 'Doubles a number over HTTP.',
        category: 'http',
        runtime: 'http',
        entrypoint: `http://127.0.0.1:${address.port}/`,
        input_schema: { type: 'object', properties: { value: { type: 'integer' } } },
        output_schema: { type: 'object', required: ['doubled'], properties: { doubled: { type: 'integer' } } },
      },
    });
    await installer.installFromLocal(path.join(workspace, 'src', 'doubler'), { registry: 'http://x' });

    try {
      const result = await new ToolExecutor(workspace).execute('doubler', { value: 21 });
      expect(result.output).toEqual({ doubled: 42 });
      expect(result.runtime).toBe('http');
    } finally {
      server.close();
    }
  });
});

describe('doc generation', () => {
  it('generates a page with installation, schemas, and examples', () => {
    const tool: Tool = {
      id: '00000000-0000-0000-0000-000000000001',
      slug: 'echo',
      name: 'Echo',
      description: 'Echoes input.',
      version: '1.0.0',
      category: 'utility',
      author: 'demo',
      tags: [],
      runtime: 'node',
      entrypoint: 'index.js',
      input_schema: ECHO_TOOL.manifest.input_schema as Record<string, unknown>,
      output_schema: ECHO_TOOL.manifest.output_schema as Record<string, unknown>,
      authentication: { type: 'none' },
      environment: [],
      permissions: ['demo:echo'],
      dependencies: [],
      license: 'MIT',
      homepage: null,
      repository: null,
      documentation: null,
      visibility: 'public',
      install_command: 'norien tool install echo@1.0.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const doc = generateToolDoc(tool, { registry: 'http://localhost:3000' });

    expect(doc).toContain('# Echo');
    expect(doc).toContain('## Installation');
    expect(doc).toContain('norien tool install echo@1.0.0');
    expect(doc).toContain('## Input schema');
    expect(doc).toContain("client.tools.install('echo')");
    expect(doc).toContain('client.tools.install("echo")');
    expect(doc).toContain('/tools/install');
  });
});
