// Browser tool. A minimal page "render": fetch and summarise, no headless
// engine required.
async function main(input) {
  const response = await fetch(input.url, { headers: { 'user-agent': 'norien-browser/1.0' } });
  const html = await response.text();

  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').trim();
  const description = (/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ?? '').trim();
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  return { url: input.url, status: response.status, title, description, text_length: text.length };
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
