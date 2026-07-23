// Logger tool. Appends one JSON line per call to a log file.
import { appendFile } from 'node:fs/promises';
import path from 'node:path';

async function main(input) {
  const file = path.resolve(process.env.NORIEN_LOG_FILE ?? 'norien.tool.log');
  const entry = {
    ts: new Date().toISOString(),
    level: input.level ?? 'info',
    message: input.message,
    ...(input.fields ? { fields: input.fields } : {}),
  };
  await appendFile(file, JSON.stringify(entry) + '\n', 'utf8');
  process.stderr.write(`[${entry.level}] ${entry.message}\n`);
  return { written: true, file, entry };
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
