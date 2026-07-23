// Generates the Norien brand assets from one source SVG.
//
// The mark is the stacked-bars logo from web/src/components/brand.tsx — three
// rounded bars, widest at the base, "a registry of layered things" — rendered
// cream on brown per the design system. Cropped to a circle (Twitter, GitHub)
// or shown square (favicon, token logo), it reads the same.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- Colours (design tokens) ---------------------------------------------
const CREAM = '#F6F2EA';
const BROWN = '#7A5A3A';
const BROWN_DEEP = '#654829';

/**
 * The square logo at a given size. A soft radial gives the brown a little depth
 * without a heavy gradient; the mark keeps the original per-bar opacity so it
 * reads as layered even in one colour.
 */
function logoSvg(size, { background = true } = {}) {
  const S = size;
  // The mark lives on a 20-unit grid; scale it to ~56% of the canvas, centred.
  const markSize = S * 0.56;
  const scale = markSize / 20;
  const offset = (S - markSize) / 2;
  const r = S * 0.22; // rounded-square radius for the app-icon look

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <radialGradient id="bg" cx="38%" cy="30%" r="90%">
      <stop offset="0%" stop-color="#8a6942"/>
      <stop offset="100%" stop-color="${BROWN_DEEP}"/>
    </radialGradient>
  </defs>
  ${background ? `<rect width="${S}" height="${S}" rx="${r}" fill="url(#bg)"/>` : ''}
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="${background ? CREAM : BROWN}">
    <rect x="6" y="2.5" width="8" height="4" rx="1.25" opacity="0.5"/>
    <rect x="3.5" y="8" width="13" height="4" rx="1.25" opacity="0.78"/>
    <rect x="1" y="13.5" width="18" height="4" rx="1.25"/>
  </g>
</svg>`;
}

async function render(svg, outPath, size) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
  console.log('  +', path.relative(root, outPath), `(${size}×${size})`);
}

// Each app is deployed independently, so each serves its own copy of the brand.
const APPS = ['apps/marketing', 'apps/app', 'apps/docs'];

console.log('Rendering Norien brand assets:');
for (const app of APPS) {
  const perApp = [
    // Main brand logo — Twitter profile, token logo, GitHub org avatar, OG.
    [`${app}/public/logo.png`, 512],
    [`${app}/public/logo@1024.png`, 1024],
    // App icons served from /public.
    [`${app}/public/icon-192.png`, 192],
    [`${app}/public/icon-512.png`, 512],
    // Next.js favicon + Apple touch icon (auto-detected from src/app/).
    [`${app}/src/app/icon.png`, 256],
    [`${app}/src/app/apple-icon.png`, 180],
  ];
  for (const [rel, size] of perApp) {
    await render(logoSvg(size), path.join(root, rel), size);
  }

  // A transparent (no-background) mark, handy for light surfaces / press.
  await render(logoSvg(512, { background: false }), path.join(root, `${app}/public/logo-mark.png`), 512);

  // Keep the source SVG alongside the PNGs so the brand can be re-rendered.
  await writeFile(path.join(root, `${app}/public/logo.svg`), logoSvg(512), 'utf8');
  console.log('  +', `${app}/public/logo.svg (source)`);
}
console.log('Done.');
