# @norien/runtime

The Norien agent runtime: a supervisor that executes, monitors, and recovers
installed agents. Think `systemd` + `docker` for autonomous agents.

It runs as a **separate service from the registry**. The registry is a shared
catalogue and must never execute user code; this process runs on the machine
that owns the agents and binds to loopback by default.

```
norien CLI ──HTTP──> runtime daemon (127.0.0.1:4123)
                       └ owns child processes

norien CLI ──HTTP──> registry (catalogue only)
```

That split is what makes remote execution a change of URL rather than a change
of code.

---

## Usage

Usually driven through the CLI:

```bash
norien run <agent>          norien logs <agent> -f
norien stop <agent>         norien status
norien restart <agent>      norien runtime start|stop|status
```

Or embedded:

```ts
import { RuntimeManager } from '@norien/runtime';

const manager = new RuntimeManager({ workspace: process.cwd() });

await manager.start('research-agent', { grant: ['network:fetch'] });
await manager.describe('research-agent');   // full instance state
await manager.stop('research-agent');
```

## What happens on `run`

Each step can refuse the launch, so a misconfigured agent fails **before**
anything is spawned rather than half-starting:

1. **Manifest** — read and validate `agent.json`; reject an unknown runtime.
2. **Permissions** — every declared permission must be granted in
   `norien.policy.json`. Deny by default.
3. **Tools** — resolve declared tools to full metadata (offline from install
   metadata, or from the registry).
4. **Execution plan** — detect the package manager and build the command.
5. **Port** — allocate one only if an HTTP health probe needs it.
6. **Environment** — layer manifest defaults → workspace `.env` → agent `.env`
   → overrides, then inject runtime context. Refuse if a required variable is
   missing.
7. **Spawn** — start in its own process group and stream output to the logs.

The whole trace is written to the agent's system log, so a run is always
explainable:

```
sys preparing ticker@1.0.0
sys permissions granted: network:fetch
sys tools resolved from install-metadata: search@2.1.0
sys execution plan (package-script): npm.cmd run start
sys started: npm.cmd run start (pid 34452)
out tick 1 hello
err stderr sample 3
sys exited: exited with code 42
```

## Execution detection

| Runtime | Detected from | Launcher |
| --- | --- | --- |
| Node | `bun.lockb`, `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json` | `bun`/`pnpm`/`yarn`/`npm run start` |
| Python | `uv.lock`, `pyproject.toml`, `requirements.txt` | `uv run …`, else the interpreter |

Precedence: explicit `--command` → package `start` script → `commands.start`
from `agent.json` → `<interpreter> <entrypoint>`. Detection only fills gaps; it
never overrides an explicit instruction. The chosen plan and its `source` are
reported by `norien status` and `GET /runtime/{agent}`.

> On Windows, `npm`/`pnpm`/`yarn`/`bun` are `.cmd` shims. Node cannot spawn
> those without a shell, so the planner resolves the real filename
> (`npm.cmd`) and the process manager enables a shell for that case only.

## Status and health

Two independent axes, because a process can be `running` but `unhealthy`:

| Status | Meaning |
| --- | --- |
| `installing` `starting` `running` `restarting` `stopping` `stopped` `failed` | what the supervisor is doing |

| Health | Meaning |
| --- | --- |
| `starting` `healthy` `unhealthy` `stopped` `failed` | what the agent reports |

`commands.health` is probed as HTTP when it looks like a path or URL
(`/health`), otherwise as a command (`python health.py`). An agent that
declares no health command is reported healthy while its process is alive —
that is genuinely all the supervisor knows.

Probing waits out a start grace period and requires consecutive failures before
flipping to `unhealthy`, so a slow boot or a transient blip does not flap.

## Crash recovery

An unexpected exit records the code, signal, reason, and timestamp, marks the
agent `failed`, and keeps the logs:

```
$ norien status crasher
  status  failed
Last exit
  reason  exited with code 42
  code    42
```

`--restart-policy on-failure|always` adds automatic restarts with capped
exponential backoff (1s → 2s → 5s → 10s → 30s, max 5 attempts). A process that
stays up past 60s is treated as a fresh start, not part of the same crash loop.
Default is `no`, so nothing restarts behind your back.

## Permissions

`agent.json` declares what an agent needs; `norien.policy.json` records what the
workspace allows. Deny by default — installing an agent never confers capability.

```bash
norien run ticker                       # refused, exit 7
norien run ticker --grant network:fetch # granted and recorded
```

```json
{ "version": 1, "agents": { "ticker": { "granted": ["network:fetch"] } } }
```

Grants support namespace wildcards (`network:*`). The file is plain JSON so a
capability change shows up in code review.

## Tool injection

Resolved tools arrive as environment variables, so an agent needs no SDK to be
launchable:

| Variable | Contents |
| --- | --- |
| `NORIEN_TOOLS` | JSON array: slug, version, auth, input/output schemas |
| `NORIEN_TOOL_SLUGS` | comma-separated slugs |
| `NORIEN_AGENT`, `NORIEN_AGENT_VERSION`, `NORIEN_RUNTIME` | identity |
| `NORIEN_PERMISSIONS` | granted permissions |
| `NORIEN_AGENT_DIR`, `NORIEN_WORKSPACE`, `NORIEN_REGISTRY` | locations |
| `PORT`, `NORIEN_PORT` | allocated port, when one was needed |

Tools resolve from `norien.metadata.json` written at install time, so launching
works with no network. `--offline` forces that path.

## Logs

A bounded in-memory ring buffer for instant `tail`, plus append-only JSONL per
run for durable history:

```
norien_agents/<slug>/.norien/logs/<runId>.jsonl
{"ts":1784700139493,"stream":"stdout","line":"tick 24","runId":"…"}
```

Structured rather than plain text: every line carries a timestamp, stream, and
run id, so restarts stay distinguishable and history survives a supervisor
restart. `norien logs --history` reads from disk, including earlier runs.

## HTTP API

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/runtime` | Every installed agent's full instance state |
| `GET` | `/runtime/status` | Compact rows plus counts by state |
| `GET` | `/runtime/{agent}` | One instance |
| `GET` | `/runtime/logs` | `?follow=true` streams server-sent events |
| `POST` | `/runtime/run` | Start |
| `POST` | `/runtime/stop` | Graceful stop, `force` for SIGKILL |
| `POST` | `/runtime/restart` | Stop then start, reusing prior options |
| `GET` | `/health` | Supervisor liveness |

Errors use the same envelope as the registry:

```json
{ "error": { "code": "AGENT_NOT_INSTALLED", "message": "…",
             "hint": "Install it with: norien install nope", "request_id": "…" } }
```

## Modules

| Module | Responsibility |
| --- | --- |
| `RuntimeManager` | Orchestrates the lifecycle; delegates every mechanism |
| `ProcessManager` | Spawn, signal, process groups, exit reporting |
| `LogManager` | Ring buffer, JSONL persistence, live subscriptions |
| `HealthManager` | HTTP and command probes, failure thresholds |
| `EnvironmentLoader` | `.env` parsing, layering, injection, validation |
| `PermissionValidator` | Policy file, grants, wildcard matching |
| `DependencyResolver` | Tool metadata, offline-first |
| `ExecutionPlanner` | Package manager and interpreter detection |

The manager never spawns, probes, or parses directly. That is what keeps each
concern independently testable — and what lets a remote executor be substituted
by swapping `ProcessManager` alone.

## Built for what comes next

Not implemented, but seamed for:

| Future work | Where it attaches |
| --- | --- |
| Remote runtimes | `NORIEN_RUNTIME_HOST`; the CLI already speaks HTTP |
| Cloud execution, distributed workers | Swap `ProcessManager` behind the same interface |
| Hosted agents | The daemon already binds a configurable host/port |
| Schedules | `RuntimeManager.start` is the unit a scheduler triggers |
| Webhooks | The manager emits `status`, `health`, and `exit` events |
| Secrets | `EnvironmentLoader` is the single place values enter |
