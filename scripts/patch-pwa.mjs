// Stamp the PWA fittings into the exported web shell.
//
// `expo export -p web` (output: single) emits a bare SPA index.html; this
// adds what "Add to Home Screen" needs — manifest, Apple meta, touch icon —
// plus the touch-feel CSS an installed app expects (no rubber-banding, no
// double-tap zoom, no long-press text selection under the notes gesture).
// Runs as part of `npm run build:web`.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const file = join(dist, 'index.html');
let html = readFileSync(file, 'utf8');

const HEAD = `
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="DS,P">
<meta name="theme-color" content="#120a05">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<style>
  html, body {
    background: #000;
    overscroll-behavior: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
    touch-action: manipulation;
  }
</style>
`;

// An installed app must not pinch-zoom or honor double-tap zoom.
html = html.replace(
  /<meta name="viewport"[^>]*>/,
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">'
);
html = html.replace('</head>', `${HEAD}</head>`);
writeFileSync(file, html);
console.log('PWA head stamped into dist/index.html');
