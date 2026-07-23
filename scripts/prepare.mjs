// Root `prepare` hook.
//
// Locally, `npm install` builds the workspace packages (sdk, tools, runtime,
// cli) so the CLI can be linked and run from source. In a CI or deploy
// environment none of that is needed:
//
//   - Vercel builds only the web app, which is standalone and imports no
//     @norien-live/* package. It also omits devDependencies, so `tsc` is absent and
//     `build:packages` would fail with "tsc: command not found" — which is
//     exactly the error this guard prevents.
//   - Railway builds only the registry (src -> dist), which is likewise
//     standalone.
//
// So skip the workspace build when a known CI/deploy marker is present.
import { execSync } from 'node:child_process';

const markers = ['CI', 'VERCEL', 'RAILWAY_ENVIRONMENT', 'NETLIFY', 'GITHUB_ACTIONS'];
const inCi = markers.some((name) => process.env[name]);

if (inCi) {
  const which = markers.find((name) => process.env[name]);
  console.log(`prepare: ${which} detected — skipping build:packages (not needed for deploy)`);
  process.exit(0);
}

execSync('npm run build:packages', { stdio: 'inherit' });
