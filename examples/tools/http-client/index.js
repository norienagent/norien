// HTTP Client tool. Reads {input:{url,method,headers,body}} on stdin,
// writes {output:{status,headers,body}} on stdout.
async function main(input) {
  const method = (input.method ?? 'GET').toUpperCase();
  const init = { method, headers: input.headers ?? {} };
  if (input.body !== undefined && method !== 'GET' && method !== 'HEAD') init.body = input.body;

  const response = await fetch(input.url, init);
  const body = await response.text();
  const headers = {};
  for (const [key, value] of response.headers.entries()) headers[key] = value;

  return { status: response.status, headers, body };
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
