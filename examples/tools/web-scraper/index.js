// Web Scraper tool. Fetches HTML and extracts structured pieces with regex --
// dependency-free, good enough for titles, links, and readable text.
async function main(input) {
  const response = await fetch(input.url, { headers: { 'user-agent': 'norien-web-scraper/1.0' } });
  const html = await response.text();
  const extract = input.extract ?? 'title';

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? titleMatch[1].trim() : '';

  if (extract === 'title') return { url: input.url, title };

  if (extract === 'links') {
    const links = [...html.matchAll(/href=["']([^"']+)["']/gi)]
      .map((m) => m[1])
      .filter((href) => href.startsWith('http'));
    return { url: input.url, title, links: [...new Set(links)].slice(0, 200) };
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);
  return { url: input.url, title, text };
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
