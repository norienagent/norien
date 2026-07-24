// Generates the Norien GitHub banner (1280×640, GitHub's social-preview ratio).
//
// Distinct from the centred Twitter banner: this one is built on a diagonal —
// an angled brown band cutting across a cream field — so the two brand surfaces
// read as a set without being the same image. Same tokens throughout.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CREAM = '#F6F2EA';
const BROWN = '#7A5A3A';
const BROWN_DEEP = '#654829';
const INK = '#2E261F';
const MUTED = '#6C6257';
const LINE = '#DDD2C2';

const W = 1280;
const H = 640;
const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

// The stacked-bars mark, brown on cream, at an arbitrary size/position.
function mark(x, y, size, fill = BROWN) {
  const scale = size / 20;
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="${fill}">
    <rect x="6" y="2.5" width="8" height="4" rx="1.25" opacity="0.5"/>
    <rect x="3.5" y="8" width="13" height="4" rx="1.25" opacity="0.78"/>
    <rect x="1" y="13.5" width="18" height="4" rx="1.25"/>
  </g>`;
}

// A diagonal band (parallelogram) tilted by `angle` degrees about the canvas
// centre — the defining element of this banner.
const angle = -13;
const band = `
  <g transform="rotate(${angle} ${W / 2} ${H / 2})">
    <rect x="-200" y="392" width="${W + 400}" height="150" fill="url(#bandGrad)"/>
    <rect x="-200" y="382" width="${W + 400}" height="4" fill="${LINE}" opacity="0.6"/>
  </g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bandGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${BROWN_DEEP}"/>
      <stop offset="100%" stop-color="${BROWN}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${CREAM}"/>

  <!-- diagonal brand band -->
  ${band}

  <!-- mark + wordmark, upper-left, sitting on the cream -->
  ${mark(96, 120, 72)}
  <text x="200" y="185" font-family="${FONT}" font-size="76" font-weight="700" letter-spacing="-3">
    <tspan fill="${INK}">nor</tspan><tspan fill="${BROWN}">ien</tspan>
  </text>

  <!-- headline -->
  <text x="96" y="300" font-family="${FONT}" font-size="46" font-weight="600" letter-spacing="-1" fill="${INK}">
    The registry for AI agents
  </text>
  <text x="98" y="352" font-family="${FONT}" font-size="26" font-weight="400" letter-spacing="0.3" fill="${MUTED}">
    on Robinhood Chain
  </text>

  <!-- tagline reversed out of the diagonal band -->
  <g transform="rotate(${angle} ${W / 2} ${H / 2})">
    <text x="96" y="486" font-family="${FONT}" font-size="27" font-weight="500" letter-spacing="0.4" fill="${CREAM}">
      Registry · Runtime · Tools · Unified data API
    </text>
    <text x="${W - 96}" y="486" text-anchor="end" font-family="${FONT}" font-size="25" font-weight="600" letter-spacing="0.5" fill="#E9DFCF">
      norien.live
    </text>
  </g>
</svg>`;

const out = path.join(root, 'apps/marketing/public/github-banner.png');
await sharp(Buffer.from(svg)).resize(W, H).png().toFile(out);
console.log('+ apps/marketing/public/github-banner.png', `(${W}×${H})`);

// Also drop a copy at the repo root so the README can reference it simply.
const repoCopy = path.join(root, '.github/banner.png');
await sharp(Buffer.from(svg)).resize(W, H).png().toFile(repoCopy);
console.log('+ .github/banner.png', `(${W}×${H})`);
