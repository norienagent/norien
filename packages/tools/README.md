# @norien/tools

The Norien tool plugin system: validate a `tool.json`, install a tool locally,
and **execute** it. Think npm packages + MCP tools + Docker images, for
autonomous-agent tools.

A tool is a reusable capability any agent can install and run. The executor
never knows what a particular tool does — every tool is a plugin behind one
generic protocol.

---

## tool.json

```json
{
  "name": "HTTP Client",
  "slug": "http-client",
  "version": "1.0.0",
  "description": "Perform an HTTP request and return status, headers, and body.",
  "category": "http",
  "runtime": "node",
  "entrypoint": "index.js",
  "input_schema": { "type": "object", "required": ["url"], "properties": { "url": { "type": "string" } } },
  "output_schema": { "type": "object", "properties": { "status": { "type": "integer" } } },
  "permissions": ["network:fetch"],
  "environment": [],
  "license": "MIT"
}
```

`runtime` is `node`, `python`, or `http`. Every runtime needs an `entrypoint`:
a script for `node`/`python`, a URL for `http`.

## The plugin protocol

`node` and `python` tools speak one JSON protocol. A tool reads one document
from **stdin**:

```json
{ "input": { ... }, "context": { "tool": "...", "version": "...", "permissions": [ ... ] } }
```

and writes one document to **stdout**:

```json
{ "output": { ... } }          // success
{ "error": { "message": "" } } // failure
```

Everything the tool logs goes to **stderr**. `http` tools need no protocol —
the executor builds the request from the manifest, filling `{placeholders}` in
the URL from the input and injecting auth from environment.

This is what "never hardcode tool implementations" means: the executor speaks
the protocol; each tool implements it.

## Using it

```ts
import { ToolInstaller, ToolExecutor, validateToolManifest } from '@norien/tools';

// Install a tool's code into ./norien_tools/<slug>/
await new ToolInstaller(process.cwd()).installFromLocal('./my-tool', { registry });

// Run it: input is validated against input_schema, output against output_schema.
const result = await new ToolExecutor(process.cwd()).execute('my-tool', { url: 'https://…' });
result.output; // typed by the tool's output_schema
```

The executor enforces four things before and after a run:

1. **Input** matches `input_schema` (before) — `INPUT_INVALID` otherwise.
2. **Permissions** — with `grantedPermissions`, the tool's must be a subset.
3. **Environment** — required variables must be present.
4. **Output** matches `output_schema` (after) — `OUTPUT_INVALID` otherwise (a
   bug in the tool, not the caller).

## Distribution model

The registry distributes tool **manifests**, not code bundles — hosting and
serving arbitrary bundles is not a shared catalogue's job. So:

- `http` tools run straight from a registry install — the entrypoint is a URL.
- `node`/`python` tools get their code one of two ways:
  - a **declared source** — a `source` block in `tool.json` that
    `installFromRegistry` clones at install time (`fetchSource`, cloning only,
    never executing);
  - a **local path** that already carries the code:
    `ToolInstaller.installFromLocal(dir)` copies the whole directory.

The installer records the mode in `norien.tools.lock.json` and marks each tool
`executable` or manifest-only. A `node`/`python` tool with neither a source nor
a local path installs manifest-only, and says so.

## Modules

| Export | Responsibility |
| --- | --- |
| `validateToolManifest` | Validate a `tool.json`, reporting every issue at once |
| `validateAgainstSchema` | Focused JSON Schema validator for input/output |
| `ToolInstaller` | Materialise a tool into `norien_tools/`, lockfile, `.env.example` |
| `ToolExecutor` | Run a tool as a plugin (node/python/http) with I/O validation |
| `generateToolDoc` | Generate a Markdown tool page from a manifest |
| `resolveBinary`, `spawnJson` | Cross-platform process primitives (shared with the runtime) |

The agent runtime (`@norien/runtime`) imports `resolveBinary`/`spawnJson` from
here, so binary resolution and the Windows `.cmd` handling live in exactly one
place.

## Built for what comes next

Not implemented, but seamed for: paid tools and billing (the executor is the
metering point), verified publishers, ratings and downloads, usage metrics,
remote and private tools (the installer already distinguishes sources).
