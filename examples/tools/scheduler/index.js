// Scheduler tool. Pure computation: returns upcoming run timestamps.
async function main(input) {
  const count = Math.min(input.count ?? 5, 100);
  const start = input.from ? new Date(input.from) : new Date();
  if (Number.isNaN(start.getTime())) throw new Error('invalid `from` time');
  const runs = [];

  if (input.every_seconds) {
    let t = start.getTime();
    for (let i = 0; i < count; i += 1) { t += input.every_seconds * 1000; runs.push(new Date(t).toISOString()); }
  } else if (input.at) {
    const m = /^(\d{2}):(\d{2})$/.exec(input.at);
    if (!m) throw new Error('`at` must be HH:MM');
    const [h, min] = [Number(m[1]), Number(m[2])];
    let day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), h, min, 0));
    if (day <= start) day = new Date(day.getTime() + 86400000);
    for (let i = 0; i < count; i += 1) runs.push(new Date(day.getTime() + i * 86400000).toISOString());
  } else {
    throw new Error('provide either `every_seconds` or `at`');
  }

  return { runs };
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
