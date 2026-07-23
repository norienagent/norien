#!/bin/sh
# Norien CLI installer.
#
#   curl -fsSL https://raw.githubusercontent.com/norienagent/norien/main/install.sh | sh
#
# What it does, in order:
#   1. Checks for Node.js 20+ and git.
#   2. If @norien/cli is published to npm, installs it from there (the fast path).
#   3. Otherwise clones this repo, builds it, and links the CLI.
#
# The same command upgrades a source install to the npm one the day the package
# is published — nothing to change on your end.
set -eu

REPO_URL="https://github.com/norienagent/norien.git"
NORIEN_HOME="${NORIEN_HOME:-$HOME/.norien}"
SRC_DIR="$NORIEN_HOME/src"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }
die() { printf '\033[31mnorien:\033[0m %s\n' "$1" >&2; exit 1; }

bold "Installing the Norien CLI"

# --- 1. Prerequisites -------------------------------------------------------
command -v node >/dev/null 2>&1 || die "Node.js 20+ is required. Install it from https://nodejs.org and re-run."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
[ "$NODE_MAJOR" -ge 20 ] || die "Node.js 20+ is required; found $(node -v). Upgrade and re-run."

command -v npm >/dev/null 2>&1 || die "npm is required (it ships with Node.js)."

# --- 2. Fast path: the npm registry -----------------------------------------
if npm view @norien/cli version >/dev/null 2>&1; then
  info "Installing @norien/cli from npm..."
  npm install -g @norien/cli
  bold "Done. Run: norien --help"
  exit 0
fi

# --- 3. Source path: clone, build, link -------------------------------------
command -v git >/dev/null 2>&1 || die "git is required to install from source."

info "The npm package is not published yet; installing from source."
info "Source: $SRC_DIR"

if [ -d "$SRC_DIR/.git" ]; then
  info "Updating existing checkout..."
  git -C "$SRC_DIR" pull --ff-only --quiet
else
  rm -rf "$SRC_DIR"
  mkdir -p "$NORIEN_HOME"
  git clone --depth 1 --quiet "$REPO_URL" "$SRC_DIR"
fi

cd "$SRC_DIR"
info "Building (this also builds the SDK, tools, and runtime)..."
npm install --silent
npm link --workspace @norien/cli >/dev/null 2>&1 || npm link --workspace @norien/cli

bold "Done. Run: norien --help"
printf '\n'
info "The CLI talks to a Norien registry. With none deployed yet, point it at a"
info "local one (npm run dev in the source) or pass --registry <url>."
