#!/usr/bin/env node
/**
 * Build script: copies and minifies src/ → www/
 * No bundler dependencies needed – uses built-in Node.js
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root  = resolve(__dirname, '..');
const srcDir = resolve(root, 'src');
const outDir = resolve(root, 'www');

mkdirSync(outDir, { recursive: true });

// ── Safe JS minifier (no deps, preserves string literals) ──────────────────
function minifyJS(code) {
  // Remove multi-line comments that are standalone
  code = code.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove lines that are only comments
  const lines = code.split('\n').filter(line => !/^\s*\/\//.test(line));
  return lines.join('\n').trim();
}

// ── Minimal CSS minifier ───────────────────────────────────────────────────
function minifyCSS(code) {
  code = code.replace(/\/\*[\s\S]*?\*\//g, '');
  code = code.replace(/\s+/g, ' ');
  code = code.replace(/ *([{};:,>+~]) */g, '$1');
  code = code.replace(/;}/g, '}');
  return code.trim();
}

// ── Process files ─────────────────────────────────────────────────────────
console.log('Building www/ from src/...');

const css  = minifyCSS(readFileSync(`${srcDir}/style.css`, 'utf8'));
const eng  = minifyJS(readFileSync(`${srcDir}/engine.js`, 'utf8'));
const app  = minifyJS(readFileSync(`${srcDir}/app.js`, 'utf8'));
let   html = readFileSync(`${srcDir}/index.html`, 'utf8');

// Write minified CSS and JS
writeFileSync(`${outDir}/style.css`, css);
writeFileSync(`${outDir}/engine.js`, eng);
writeFileSync(`${outDir}/app.js`, app);

// Minify HTML
html = html.replace(/<!--[\s\S]*?-->/g, '');
html = html.replace(/\s+/g, ' ');
html = html.replace(/> </g, '><');
writeFileSync(`${outDir}/index.html`, html);

// Copy icon
copyFileSync(`${srcDir}/icon.svg`, `${outDir}/icon.svg`);

// Size report
const sizes = ['index.html','style.css','engine.js','app.js'].map(f => {
  const s = readFileSync(`${outDir}/${f}`).length;
  return `  ${f.padEnd(12)} ${(s/1024).toFixed(1)} KB`;
});
console.log('Output sizes:\n' + sizes.join('\n'));
console.log('Build complete → www/');
