# @norien/cli

The official command-line interface for the Norien agent registry.

```bash
npm install -g @norien/cli
norien --help
```

Everything the CLI does goes through the registry's public REST API — there is
no private surface. Anything the CLI can do, the SDK and `curl` can do too.

---

## Local development

The package is not published yet, so `norien` comes from a link into this
repository rather than from the registry.

```bash
npm install          # builds the packages, then:
npm run cli:link     # → npm link --workspace @norien/cli
norien --help        # now works from any directory
```

`npm install` builds `dist/` through the root `prepare` script, so the linked
binary exists before you link it. Rebuild after editing:

```bash
npm run build:packages
```

The link points at `packages/cli/dist`, so a rebuild is picked up immediately —
no relinking. `npm run cli:unlink` removes it. To run from TypeScript source
without linking at all, use `npm run cli -- <args>`.

### pnpm

```bash
pnpm setup                                   # once, puts pnpm's bin dir on PATH
pnpm link --global                           # from packages/, pnpm ≤ 9
pnpm add --global ./packages/cli             # pnpm 10+, which dropped --global from link
```

[`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) mirrors the npm `workspaces`
field — pnpm does not read that field — and sets `linkWorkspacePackages: true`
so `@norien/sdk`, `@norien/tools`, and `@norien/runtime` resolve from this
repository instead of being looked up in the public registry, where they do not
exist.

### Why it works on Windows

`bin` points at a file whose first line is `#!/usr/bin/env node`. npm and pnpm
both read that shebang and generate `norien.cmd` and `norien.ps1` shims next to
`norien`, so PowerShell, `cmd.exe`, and Git Bash all launch it the same way and
all propagate its exit code. [`.gitattributes`](../../.gitattributes) pins the
entrypoint to LF endings; a CRLF shebang reads as the interpreter `node\r` and
fails to launch on macOS and Linux.

---

## Getting started

```bash
norien login                    # store credentials
norien search trading           # find something
norien info trading-agent       # inspect it
norien install trading-agent    # install it here
norien doctor                   # check everything works
```

## Commands

| Command | What it does |
| --- | --- |
| `norien login` | Authenticate against a registry and store credentials |
| `norien logout` | Remove stored credentials (`--all` for every profile) |
| `norien whoami` | Show the identity the CLI will act as |
| `norien profiles` | List configured registry profiles |
| `norien search <keyword>` | Ranked search across agents and tools |
| `norien info <agent>` | Manifest, tools, permissions, runtime, environment |
| `norien install <agent>` | Install into `./norien_agents` |
| `norien uninstall <agent>` | Remove an installed agent |
| `norien list` | List installed agents (`--remote` for registry records) |
| `norien update [agent]` | Check versions, show the changelog, update |
| `norien publish` | Validate and publish the agent in this directory |
| `norien doctor` | Diagnose API, manifest, dependencies, runtimes, config |
| `norien run <agent>` | Run an installed agent under the runtime supervisor |
| `norien stop <agent>` | Gracefully stop a running agent |
| `norien restart <agent>` | Restart, reusing the original run options |
| `norien logs <agent>` | Show or stream stdout/stderr (`-f` to follow) |
| `norien status [agent]` | Running / stopped / failed / restarting |
| `norien runtime start\|stop\|status` | Manage the supervisor itself |
| `norien tool <sub>` | `search`, `info`, `install`, `publish`, `update`, `remove`, `list` |

Market data — the same unified API the web app uses:

| Command | What it does |
| --- | --- |
| `norien markets` | Live token table (`--sort`, `--limit`, `--min-liquidity`) |
| `norien trending` | Tokens with the most movement right now |
| `norien token <address>` | Price, market cap, liquidity, holders, volume, contract |
| `norien wallet <address>` | Balance, holdings, transactions, token transfers |
| `norien contract <address>` | Verification, creator, ABI summary (`--abi` for the full ABI) |
| `norien project <slug>` | TVL by chain, repository health, releases |

`norien search` spans both catalogues — agents, tools, tokens, and projects —
and `--type agent|tool|token|project` narrows it to one.

Global flags: `--registry <url>`, `--profile <name>`, `--json`, `-y/--yes`,
`-q/--quiet`, `--no-color`.

## Authentication

```bash
norien login
#   Registry URL   http://localhost:3000
#   Handle         acme
#   API key        •••••• (optional)
```

Credentials are written to `~/.norien/config.json` with `0600` permissions —
the same approach as `~/.npmrc`, `~/.docker/config.json`, and the GitHub CLI.

> **Note:** the registry does not verify API keys yet; it identifies callers by
> handle via the `x-norien-actor` header. The CLI sends both that header and
> `Authorization: Bearer <key>`, so nothing changes here when key verification
> lands. Treat the current setup as identification, not as a security boundary.

For CI, skip `login` entirely:

```bash
export NORIEN_REGISTRY=https://registry.example.com
export NORIEN_ACTOR=ci-bot
export NORIEN_API_KEY=nrn_...
norien publish --yes --json
```

| Variable | Purpose |
| --- | --- |
| `NORIEN_REGISTRY` | Registry URL |
| `NORIEN_ACTOR` | Handle to act as |
| `NORIEN_API_KEY` | API key |
| `NORIEN_PROFILE` | Profile name |
| `NORIEN_CONFIG_DIR` | Config directory (default `~/.norien`) |

Environment variables always win over the stored profile, so CI never has to
write a credential to disk.

## Installing

```bash
norien install research-agent           # latest
norien install research-agent@1.0.0     # pinned
norien install research-agent --version '^1.0.0'
```

Writes into the current directory:

```
norien_agents/research-agent/
  agent.json              the published manifest
  README.md               the published README (or a generated stub)
  .env.example            required variables blank, optional ones commented
  norien.metadata.json    resolved tools, runtime, permissions, install info
norien.lock.json          what is installed, at which version
```

Install fails if the agent's tools cannot be resolved — writing files for an
agent that cannot run would be misleading. Missing *environment values* are
different: those are yours to fill in, which is what `.env.example` is for.

## Publishing

```bash
norien publish --dry-run    # validate and print the plan
norien publish              # upload
```

Detects `agent.json`, `README.md`, and an icon in the working directory, then
validates through the registry's own `/runtime/inspect` — so the CLI can never
disagree with the server about what is valid.

> Icons are referenced by URL. The registry has no binary upload endpoint, so a
> local `icon.png` cannot be uploaded; host it and set `"icon"` in `agent.json`.
> The CLI warns rather than silently dropping it.

Publishing does **not** require the agent's environment variables to be set
locally: you are declaring what the agent needs, not running it.

## Running agents

```bash
norien run research-agent --grant-all   # start under the supervisor
norien logs research-agent -f           # stream stdout/stderr live
norien status                           # what is running, failed, restarting
norien restart research-agent
norien stop research-agent
```

Agents run under a supervisor and keep running after the command exits, so the
terminal is free. Before launch the runtime resolves tools, validates
permissions and required environment variables, and detects the package manager
(`npm`, `pnpm`, `yarn`, `bun`, `uv`, `pip`).

An agent must be granted the permissions it declares in `agent.json` before it
can run — deny by default, recorded in `norien.policy.json`:

```bash
$ norien run ticker
✗ 'ticker' declares 1 permission(s) this workspace has not granted.
  - permissions: 'network:fetch' is declared in agent.json but not granted.
  - Review them, then grant with: norien run ticker --grant network:fetch
```

A crash is captured, not swallowed:

```bash
$ norien status crasher
  status  failed
Last exit
  reason  exited with code 42
```

`--restart-policy on-failure` adds automatic restarts with capped exponential
backoff. Full details in [@norien/runtime](../runtime/README.md).

## Scripting

Every command supports `--json`, and stdout stays pure JSON — spinners,
warnings, and errors go to stderr.

```bash
norien search trading --json | jq -r '.data[].item.slug'
norien doctor --json | jq '.checks[] | select(.status=="fail")'
norien update --check --json | jq '.outdated'
norien status --json | jq '.summary'
norien logs my-agent --json | jq -r '.data[] | select(.stream=="stderr") | .line'
```

Exit codes:

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Error |
| `2` | Bad usage |
| `3` | Not authenticated |
| `4` | Not found |
| `5` | Validation or dependency failure |
| `6` | Runtime supervisor unavailable |
| `7` | Permission denied |
