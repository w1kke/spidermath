#!/usr/bin/env node
// Bundles the game into one self-contained spider-math.html (easy to email).
// Inlines the stylesheet, every local script, and the two fonts (as data URIs)
// into index.html — the result needs no network at all.
// Usage: node tools/build-single-file.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'spider-math.html');

const font = (file) => readFileSync(join(ROOT, 'assets', 'fonts', file)).toString('base64');
const FONT_CSS = [
  `@font-face{font-family:'Bangers';font-style:normal;font-weight:400;font-display:swap;src:url(data:font/woff2;base64,${font('bangers-400-latin.woff2')}) format('woff2');}`,
  `@font-face{font-family:'Baloo 2';font-style:normal;font-weight:400 900;font-display:swap;src:url(data:font/woff2;base64,${font('baloo2-700-latin.woff2')}) format('woff2');}`,
].join('\n');

let html = readFileSync(join(ROOT, 'index.html'), 'utf8');

// The fonts are embedded, so drop the Google Fonts requests entirely.
html = html.replace(/^\s*<link rel="preconnect"[^>]*>\n/gm, '');
html = html.replace(/^\s*<link href="https:\/\/fonts\.googleapis\.com[^>]*>\n/gm, '');

html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, href) => {
  const css = readFileSync(join(ROOT, href), 'utf8');
  return `<style>\n${FONT_CSS}\n${css}</style>`;
});

html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, src) => {
  const js = readFileSync(join(ROOT, src), 'utf8');
  if (js.includes('</script')) throw new Error(`${src} contains </script — cannot inline safely`);
  return `<script>\n${js}</script>`;
});

if (/<script src=|<link rel="stylesheet"/.test(html)) {
  throw new Error('Some local scripts or stylesheets were not inlined');
}

writeFileSync(OUT, html);
process.stdout.write(`Written ${OUT} (${(html.length / 1024).toFixed(0)} kB)\n`);
