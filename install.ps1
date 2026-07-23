# Norien CLI installer for Windows.
#
#   irm https://raw.githubusercontent.com/norienagent/norien/main/install.ps1 | iex
#
# What it does, in order:
#   1. Checks for Node.js 20+ and git.
#   2. If @norien-live/cli is published to npm, installs it from there (the fast path).
#   3. Otherwise clones this repo, builds it, and links the CLI.
$ErrorActionPreference = 'Stop'

$RepoUrl = 'https://github.com/norienagent/norien.git'
$NorienHome = if ($env:NORIEN_HOME) { $env:NORIEN_HOME } else { Join-Path $HOME '.norien' }
$SrcDir = Join-Path $NorienHome 'src'

function Info($m) { Write-Host "  $m" }
function Die($m) { Write-Host "norien: $m" -ForegroundColor Red; exit 1 }

Write-Host 'Installing the Norien CLI' -ForegroundColor Cyan

# --- 1. Prerequisites -------------------------------------------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Die 'Node.js 20+ is required. Install it from https://nodejs.org and re-run.'
}
$nodeMajor = [int](node -p 'process.versions.node.split(".")[0]')
if ($nodeMajor -lt 20) { Die "Node.js 20+ is required; found $(node -v). Upgrade and re-run." }

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Die 'npm is required (it ships with Node.js).' }

# --- 2. Fast path: the npm registry -----------------------------------------
$published = $false
try { npm view '@norien-live/cli' version *> $null; $published = $LASTEXITCODE -eq 0 } catch {}
if ($published) {
  Info 'Installing @norien-live/cli from npm...'
  npm install -g '@norien-live/cli'
  Write-Host 'Done. Run: norien --help' -ForegroundColor Cyan
  exit 0
}

# --- 3. Source path: clone, build, link -------------------------------------
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Die 'git is required to install from source.' }

Info 'The npm package is not published yet; installing from source.'
Info "Source: $SrcDir"

if (Test-Path (Join-Path $SrcDir '.git')) {
  Info 'Updating existing checkout...'
  git -C $SrcDir pull --ff-only --quiet
} else {
  if (Test-Path $SrcDir) { Remove-Item -Recurse -Force $SrcDir }
  New-Item -ItemType Directory -Force -Path $NorienHome | Out-Null
  git clone --depth 1 --quiet $RepoUrl $SrcDir
}

Set-Location $SrcDir
Info 'Building (this also builds the SDK, tools, and runtime)...'
npm install --silent
npm link --workspace '@norien-live/cli'

Write-Host 'Done. Run: norien --help' -ForegroundColor Cyan
Write-Host ''
Info 'The CLI talks to a Norien registry. With none deployed yet, point it at a'
Info 'local one (npm run dev in the source) or pass --registry <url>.'
