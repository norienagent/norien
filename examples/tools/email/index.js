// Email tool. Posts to a configurable HTTP email provider so it stays
// provider-agnostic and dependency-free.
async function main(input) {
  const url = process.env.EMAIL_API_URL;
  const key = process.env.EMAIL_API_KEY;
  if (!url || !key) throw new Error('EMAIL_API_URL and EMAIL_API_KEY must be set');

  const from = input.from ?? process.env.EMAIL_FROM;
  if (!from) throw new Error('provide `from` or set EMAIL_FROM');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ from, to: input.to, subject: input.subject, text: input.body }),
  });
  if (!response.ok) throw new Error(`email provider returned ${response.status}: ${await response.text()}`);
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
