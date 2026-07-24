// Generates the Norien GitHub profile banner -> .github/profil.png
//
// Shares the banner's cream background but not its layout: a wide, short,
// left-aligned header for the org/profile README — distinct from both the
// diagonal social banner and the centred Twitter header. Same design tokens.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CREAM = '#F6F2EA';
const BROWN = '#7A5A3A';
const INK = '#2E261F';
const MUTED = '#6C6257';
const LINE = '#DDD2C2';

const W = 1280;
const H = 360;
const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

function mark(x, y, size, fill = BROWN) {
  const scale = size / 20;
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="${fill}">
    <rect x="6" y="2.5" width="8" height="4" rx="1.25" opacity="0.5"/>
    <rect x="3.5" y="8" width="13" height="4" rx="1.25" opacity="0.78"/>
    <rect x="1" y="13.5" width="18" height="4" rx="1.25"/>
  </g>`;
}

const PAD = 88;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${CREAM}"/>

  <!-- three quiet brown bars in the far corner, echoing the mark -->
  <g fill="${BROWN}" opacity="0.10">
    <rect x="${W - 150}" y="70" width="70" height="10" rx="5"/>
    <rect x="${W - 190}" y="96" width="110" height="10" rx="5"/>
    <rect x="${W - 230}" y="122" width="150" height="10" rx="5"/>
  </g>

  <!-- mark + wordmark -->
  ${mark(PAD, 70, 60)}
  <text x="${PAD + 86}" y="123" font-family="${FONT}" font-size="66" font-weight="700" letter-spacing="-2.5">
    <tspan fill="${INK}">nor</tspan><tspan fill="${BROWN}">ien</tspan>
  </text>

  <!-- headline -->
  <text x="${PAD}" y="216" font-family="${FONT}" font-size="34" font-weight="600" letter-spacing="-0.6" fill="${INK}">
    The registry for AI agents on Robinhood Chain
  </text>

  <!-- subline -->
  <text x="${PAD}" y="256" font-family="${FONT}" font-size="22" font-weight="400" letter-spacing="0.2" fill="${MUTED}">
    Registry · Runtime · Tools · Unified data API — one API, one CLI, one SDK.
  </text>

  <!-- baseline rule + url -->
  <rect x="${PAD}" y="292" width="${W - PAD * 2}" height="1.5" fill="${LINE}"/>
  <text x="${PAD}" y="322" font-family="${FONT}" font-size="19" font-weight="500" letter-spacing="0.4" fill="${BROWN}">
    norien.live
  </text>
  <text x="${W - PAD}" y="322" text-anchor="end" font-family="${FONT}" font-size="19" font-weight="400" letter-spacing="0.3" fill="${MUTED}">
    github.com/norienagent
  </text>
</svg>`;

const out = path.join(root, '.github/profil.png');
await sharp(Buffer.from(svg)).resize(W, H).png().toFile(out);
console.log('+ .github/profil.png', `(${W}×${H})`);

// A copy the marketing site can serve too.
const copy = path.join(root, 'apps/marketing/public/github-profile.png');
await sharp(Buffer.from(svg)).resize(W, H).png().toFile(copy);
console.log('+ apps/marketing/public/github-profile.png', `(${W}×${H})`);
