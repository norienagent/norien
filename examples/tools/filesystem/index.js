// Filesystem tool. Confines every operation to a sandbox root so a tool cannot
// escape its directory: paths are resolved and checked against the root.
import { readFile, writeFile, readdir, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';

async function main(input) {
  const root = path.resolve(process.env.NORIEN_FS_ROOT ?? process.cwd());
  const target = path.resolve(root, input.path);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`path escapes the sandbox root: ${input.path}`);
  }

  if (input.action === 'read') {
    const content = await readFile(target, 'utf8');
    return { action: 'read', path: input.path, content };
  }
  if (input.action === 'write') {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, input.content ?? '', 'utf8');
    return { action: 'write', path: input.path, bytes: Buffer.byteLength(input.content ?? '') };
  }
  if (input.action === 'list') {
    const entries = await readdir(target);
    return { action: 'list', path: input.path, entries };
  }
  if (input.action === 'delete') {
    await rm(target, { recursive: true, force: true });
    return { action: 'delete', path: input.path };
  }
  throw new Error(`unknown action: ${input.action}`);
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
      process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
      process.stdout.write(JSON.stringify({ error: { message: String(error && error.message || error) } }));
      process.exitCode = 1;
    }
  });
}
