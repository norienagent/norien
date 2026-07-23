// Generates the Norien Twitter/X banner (1500×500).
//
// The light counterpart to the profile mark: cream background, brown mark and
// wordmark, same tokens. Content is centred so the profile avatar (bottom-left)
// and mobile cropping never cover it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CREAM = '#F6F2EA';
const BROWN = '#7A5A3A';
const INK = '#2E261F';
const MUTED = '#6C6257';
const LINE = '#DDD2C2';

const W = 1500;
const H = 500;
const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

// The mark, drawn at an arbitrary size at a given top-left, brown on cream.
function mark(x, y, size) {
  const scale = size / 20;
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="${BROWN}">
    <rect x="6" y="2.5" width="8" height="4" rx="1.25" opacity="0.5"/>
    <rect x="3.5" y="8" width="13" height="4" rx="1.25" opacity="0.78"/>
    <rect x="1" y="13.5" width="18" height="4" rx="1.25"/>
  </g>`;
}

const markSize = 96;
const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${CREAM}"/>

  <!-- centred mark -->
  ${mark(W / 2 - markSize / 2, 132, markSize)}

  <!-- wordmark: "nor" in ink, "ien" in accent brown -->
  <text x="${W / 2}" y="330" text-anchor="middle" font-family="${FONT}" font-size="88" font-weight="700" letter-spacing="-2">
    <tspan fill="${INK}">nor</tspan><tspan fill="${BROWN}">ien</tspan>
  </text>

  <!-- tagline -->
  <text x="${W / 2}" y="382" text-anchor="middle" font-family="${FONT}" font-size="27" font-weight="400" letter-spacing="0.5" fill="${MUTED}">
    The registry for AI agents
  </text>

  <!-- url, quiet, bottom-right -->
  <text x="${W - 56}" y="${H - 44}" text-anchor="end" font-family="${FONT}" font-size="22" font-weight="500" letter-spacing="0.5" fill="${BROWN}">
    norien.live
  </text>

  <!-- thin baseline rule for a touch of structure -->
  <rect x="${W / 2 - 90}" y="418" width="180" height="2" rx="1" fill="${LINE}"/>
</svg>`;

const out = path.join(root, 'web/public/banner.png');
await sharp(Buffer.from(banner)).resize(W, H).png().toFile(out);
console.log('+ web/public/banner.png', `(${W}×${H})`);
