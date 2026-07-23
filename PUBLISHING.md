# Publishing Norien to npm

A step-by-step guide. Everything that could be prepared in advance already has
been — this covers only the parts that need your npm account.

**Read this before running anything: publishing is permanent.** npm does not
allow re-publishing a version number, ever, even after `npm unpublish`. Getting
it wrong means burning a version and bumping to the next one.

---

## Before you start

**You need:** an npm account ([npmjs.com/signup](https://www.npmjs.com/signup)),
and Node 20+.

**The name is free.** Checked on 2026-07-22: both `norien` and `@norien/cli`
return 404 on the registry — nobody has taken them. That can change, so check
again right before you publish:

```bash
npm view @norien/cli
# 404 = still available
```

**Four packages, one order.** The CLI depends on the other three, so they must
go up first or the install breaks for everyone:

```
@norien/sdk  →  @norien/tools  →  @norien/runtime  →  @norien/cli
```

---

## Step 1 — Create the npm account and log in

```bash
npm login
```

It opens a browser. After it completes:

```bash
npm whoami
```

That must print your username. If it errors with `ENEEDAUTH`, the login did not
take — run it again.

## Step 2 — Enable 2FA (do this now, not later)

npm requires two-factor auth for publishing to any package with real usage, and
turning it on afterwards is more disruptive than starting with it.

[npmjs.com/settings/~/profile](https://www.npmjs.com/settings/~/profile) →
Two-Factor Authentication → **Authorization and Publishing**.

With 2FA on, every `npm publish` prompts for a one-time password. That is
expected.

## Step 3 — Create the `@norien` organisation

Scoped packages (`@norien/cli`) need the scope to exist and to be yours.

[npmjs.com/org/create](https://www.npmjs.com/org/create) → name it **norien** →
choose the **Free** plan.

> The free plan only allows **public** packages. That is what you want, and it
> is already configured — every package has `"publishConfig": {"access":
> "public"}`. Without that line npm defaults scoped packages to *restricted*,
> which fails on a free plan.

## Step 4 — Final pre-flight

From the repository root:

```bash
npm install          # builds all four packages via the root prepare script
npm test             # 267 tests, real processes and real APIs
npm run typecheck
```

All three must pass. Then inspect exactly what would be uploaded — this is the
single most useful check, because it shows the real file list:

```bash
cd packages/cli && npm pack --dry-run
```

Confirm you see `LICENSE`, `README.md`, `package.json`, and `dist/`, and that
you see **no** `.env`, no source, and no test files. Repeat for the other three
if you want to be thorough.

## Step 5 — Publish, in order

One at a time, checking each before moving on. Each `npm publish` will prompt
for your 2FA code.

```bash
npm publish --workspace @norien/sdk
npm view @norien/sdk version        # must print 0.1.0

npm publish --workspace @norien/tools
npm view @norien/tools version

npm publish --workspace @norien/runtime
npm view @norien/runtime version

npm publish --workspace @norien/cli
npm view @norien/cli version
```

If one fails, **stop and fix it before continuing.** Publishing the CLI while
its dependencies are missing produces a package that installs and immediately
crashes.

## Step 6 — Verify like a stranger would

The only test that matters is a clean install somewhere that is not this
repository:

```bash
cd /tmp
npm install -g @norien/cli
norien --version
norien --help
norien --registry https://your-deployed-registry.example search trading
```

If `norien --version` prints `0.1.0` from a directory with no relation to this
project, it genuinely works for other people.

---

## Things that will bite you

**Version numbers are permanent.** Published `0.1.0` with a bug? You cannot
replace it. Publish `0.1.1`. `npm unpublish` is only allowed within 72 hours and
only if nothing depends on it, and even then the version number stays burned.

**Publish a release candidate first if you are unsure.** A prerelease tag is not
installed by default, so it cannot break anyone:

```bash
npm publish --workspace @norien/cli --tag next
npm install -g @norien/cli@next     # opt-in only
```

When it looks right, publish the real version.

**The registry URL is baked into nobody's install.** The CLI defaults to
`http://localhost:3000`. Someone who installs it from npm has no registry
running, so `norien search` will fail for them until they pass `--registry` or
run `norien login` against your deployed instance. See the domain section below
— this is the one line that must change before publishing.

**`npm install -g` needs the dependencies to be public.** If any of the four is
accidentally published as restricted, installs fail for everyone except you, and
the error message does not make the cause obvious.

---

## The domain: norien.live

Suggested split, matching how the two processes already work:

| Host | Serves | Process |
| --- | --- | --- |
| `norien.live` | The web app — marketing site and `/app` | `@norien/web`, port 3001 |
| `api.norien.live` | The registry and the unified data API | the Fastify server, port 3000 |

Both need to be public: the CLI and both SDKs talk to `api.norien.live`
directly, so it cannot sit behind the web app's private network.

`/docs` is a page inside the web app, so it needs no subdomain of its own.
`api.norien.live/docs` separately serves the live Swagger UI — that is the
OpenAPI reference, and it is a different thing from the written documentation.

### The one line to change before publishing

`packages/sdk/src/http.ts`:

```ts
export const DEFAULT_BASE_URL = 'http://localhost:3000';
//                               ^ change to 'https://api.norien.live'
```

**Do this only after `api.norien.live` actually resolves.** Switching earlier
trades a connection-refused for a DNS failure, which is strictly worse — at
least localhost is right for the people developing on it.

It is the last resort in a four-step chain (`--registry` → `NORIEN_REGISTRY` →
stored profile → this), so changing it does not break local development: the
tests pass `NORIEN_REGISTRY` explicitly, and `npm run cli` can too.

### Everything else is already environment-driven

No other file needs editing. Set these on the deployed instances — the full
template is at the bottom of `.env.example`:

```bash
# api.norien.live
PUBLIC_BASE_URL=https://api.norien.live
DATABASE_URL=postgres://…            # switches PGlite → real Postgres
NODE_ENV=production

# norien.live
NORIEN_API_URL=https://api.norien.live
NEXT_PUBLIC_APP_URL=https://norien.live
```

`PUBLIC_BASE_URL` matters more than it looks: the registry writes it into the
`api_endpoint` field of every agent record. Leave it as localhost and every
published agent will advertise a URL that only works on your machine.

The web footer and the settings page now derive their origins from these
variables rather than hardcoding them, so they stop saying "running locally" on
their own once the values are set.

### ⚠️ The web app reads these at BUILD time, not run time

This one is easy to lose an afternoon to, so it is worth stating plainly. I
tested both ways:

| How the variables were set | Result |
| --- | --- |
| `NORIEN_API_URL=… next start` (runtime only) | Footer still said **"Running locally · api: 127.0.0.1:3000"** |
| `NORIEN_API_URL=… next build` then start | Footer showed **`api: api.norien.live`** |

Two separate reasons, both permanent:

- `NEXT_PUBLIC_*` variables are **inlined into the bundle** at build time. That
  is what the prefix means. Setting one at runtime can never work.
- `/` and the other static routes are **prerendered at build**, so any
  `process.env` they read is captured then.

So the deployment must pass these to the build step, not just the container
environment:

```bash
NORIEN_API_URL=https://api.norien.live \
NEXT_PUBLIC_APP_URL=https://norien.live \
  npm run build --workspace @norien/web
```

On Vercel, Netlify, or Railway, set them as **build environment variables**. If
your host only offers runtime variables, they will silently have no effect and
the footer will keep advertising localhost to the public.

The registry has no such constraint — it reads its environment at startup, so
runtime variables are fine there.

The build itself succeeds whether or not `api.norien.live` resolves yet: pages
catch their fetch failures and render empty states rather than failing the
build. That means you can build against the real domain before DNS propagates
without breaking the pipeline — the pages just come up empty until it does.

---

## What I already did for you

| Change | Why |
| --- | --- |
| Added `LICENSE` (MIT) to the root and all four packages | They all declared `"license": "MIT"` but the text existed nowhere. A declared licence without its text is not a valid grant — legally, nobody could use it. |
| Added `"publishConfig": {"access": "public"}` | Scoped packages default to *restricted*, which requires a paid plan. This is what makes them free. |
| Added `"prepublishOnly": "npm run build"` | Guarantees the shipped `dist/` is built from current source, so you cannot publish a stale build. |
| Added `description` and `keywords` | These are what npm search matches on. Without them the packages are effectively undiscoverable. |
| Added `LICENSE` to each `files` array | Belt and braces — npm includes it automatically, but being explicit survives future edits to `files`. |
| Verified tarball contents | `npm pack --dry-run` on all four: 31–45 files each, no `.env`, no secrets, no source. |
| Added `homepage: https://norien.live` and `bugs` | npm shows these on the package page; their absence reads as abandoned. |
| Made the web footer and settings page derive their origins | They hardcoded "registry on :3000" and "port 3001", which would have become false the moment you deployed. |
| Added a production block to `.env.example` | Every variable needed for `norien.live`, commented out, so local development is unaffected. |

## What is still yours to decide

- **A public registry URL** to default the CLI to (see the warning above).
- **The `repository` field.** `homepage` and `bugs` now point at
  `norien.live`, but I left `repository` out rather than invent a git URL. Add
  it before publishing if the source will be public.
- **The version.** `0.1.0` says pre-release, which is honest for where this is.
  Do not start at `1.0.0` unless you intend to keep its API stable.
