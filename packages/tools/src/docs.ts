import type { Tool } from '@norien/sdk';

/**
 * Tool documentation generator.
 *
 * Every tool page is generated from the manifest, so documentation can never
 * drift from the tool's actual contract. Produces the sections the marketplace
 * needs: installation, schemas, and worked examples for the CLI, REST API, and
 * both SDKs.
 */

export interface ToolDocOptions {
  /** Registry base URL used in the REST examples. */
  registry?: string;
}

function sampleFromSchema(schema: Record<string, unknown>): unknown {
  const type = schema.type as string | undefined;

  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if ('const' in schema) return schema.const;

  switch (type) {
    case 'string':
      return schema.format === 'uri' ? 'https://example.com' : 'example';
    case 'number':
    case 'integer':
      return typeof schema.minimum === 'number' ? schema.minimum : 1;
    case 'boolean':
      return true;
    case 'array': {
      const items = schema.items as Record<string, unknown> | undefined;
      return items ? [sampleFromSchema(items)] : [];
    }
    case 'object':
    default: {
      const properties = (schema.properties as Record<string, Record<string, unknown>>) ?? {};
      const required = new Set((schema.required as string[]) ?? Object.keys(properties));
      const sample: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(properties)) {
        if (required.has(key)) sample[key] = sampleFromSchema(child);
      }
      return sample;
    }
  }
}

/** Renders a complete Markdown page for a tool. */
export function generateToolDoc(tool: Tool, options: ToolDocOptions = {}): string {
  const registry = (options.registry ?? 'http://localhost:3000').replace(/\/+$/, '');
  const sampleInput = sampleFromSchema(tool.input_schema);
  const inputJson = JSON.stringify(sampleInput, null, 2);

  const environmentRows =
    (tool.environment ?? []).length > 0
      ? (tool.environment ?? [])
          .map(
            (entry) =>
              `| \`${entry.name}\` | ${entry.required ? 'yes' : 'no'} | ${entry.secret ? 'secret' : ''} | ${entry.description ?? ''} |`,
          )
          .join('\n')
      : null;

  const sections: string[] = [];

  sections.push(
    `# ${tool.name}`,
    '',
    tool.description,
    '',
    `- **Slug**: \`${tool.slug}\``,
    `- **Version**: ${tool.version}`,
    `- **Category**: ${tool.category}`,
    `- **Runtime**: ${tool.runtime ?? 'n/a'}`,
    `- **Author**: ${tool.author}`,
    ...(tool.license ? [`- **License**: ${tool.license}`] : []),
    ...(tool.homepage ? [`- **Homepage**: ${tool.homepage}`] : []),
    ...(tool.repository ? [`- **Repository**: ${tool.repository}`] : []),
    '',
  );

  sections.push('## Installation', '', '```bash', tool.install_command ?? `norien tool install ${tool.slug}`, '```', '');

  if ((tool.permissions ?? []).length > 0) {
    sections.push(
      '## Permissions',
      '',
      'This tool requires the following permissions from the calling agent:',
      '',
      ...(tool.permissions ?? []).map((permission) => `- \`${permission}\``),
      '',
    );
  }

  if (environmentRows) {
    sections.push(
      '## Environment',
      '',
      '| Variable | Required | | Description |',
      '| --- | --- | --- | --- |',
      environmentRows,
      '',
    );
  }

  sections.push(
    '## Input schema',
    '',
    '```json',
    JSON.stringify(tool.input_schema, null, 2),
    '```',
    '',
    '## Output schema',
    '',
    '```json',
    JSON.stringify(tool.output_schema, null, 2),
    '```',
    '',
  );

  sections.push(
    '## Examples',
    '',
    '### CLI',
    '',
    '```bash',
    `norien tool info ${tool.slug}`,
    `norien tool install ${tool.slug}`,
    `echo '${JSON.stringify(sampleInput)}' | norien tool run ${tool.slug}`,
    '```',
    '',
    '### REST',
    '',
    '```bash',
    `curl ${registry}/tools/${tool.slug}`,
    '',
    `curl -X POST ${registry}/tools/install \\`,
    `  -H 'content-type: application/json' \\`,
    `  -d '{"tool":"${tool.slug}"}'`,
    '```',
    '',
    '### SDK — TypeScript',
    '',
    '```ts',
    `import { Norien } from '@norien/sdk';`,
    '',
    `const client = new Norien(API_KEY);`,
    `const tool = await client.tools.info('${tool.slug}');`,
    `await client.tools.install('${tool.slug}');`,
    '```',
    '',
    '### SDK — Python',
    '',
    '```python',
    `from norien import Norien`,
    '',
    `client = Norien(API_KEY)`,
    `tool = client.tools.info("${tool.slug}")`,
    `client.tools.install("${tool.slug}")`,
    '```',
    '',
  );

  if (sampleInput && typeof sampleInput === 'object' && Object.keys(sampleInput).length > 0) {
    sections.push('### Example input', '', '```json', inputJson, '```', '');
  }

  return `${sections.join('\n').trimEnd()}\n`;
}
