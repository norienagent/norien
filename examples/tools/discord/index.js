// Discord tool. Posts to an incoming webhook -- a real Discord API call.
async function main(input) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) throw new Error('DISCORD_WEBHOOK_URL is not set');

  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: input.content, ...(input.username ? { username: input.username } : {}) }),
  });
  if (!response.ok) throw new Error(`discord returned ${response.status}: ${await response.text()}`);
  return { delivered: true, status: response.status };
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
