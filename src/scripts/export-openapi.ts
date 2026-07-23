import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildApp } from '../app.js';
import { closeDb } from '../db/client.js';

/**
 * Writes the OpenAPI document to disk so it can be committed, diffed in review,
 * and fed to SDK/CLI generators in a later phase.
 */
async function main(): Promise<void> {
  const app = await buildApp();
  const document = app.swagger();

  const outputDir = path.resolve(process.cwd(), 'openapi');
  await mkdir(outputDir, { recursive: true });

  const target = path.join(outputDir, 'openapi.json');
  await writeFile(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  process.stdout.write(`wrote ${target}\n`);

  await app.close();
  await closeDb();
}

main().catch((error: unknown) => {
  process.stderr.write(`openapi export failed: ${String(error)}\n`);
  process.exit(1);
});
