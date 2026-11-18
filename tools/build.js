#!/usr/bin/env node
'use strict';
/* Builds the single file  index.html  (open it directly in any browser — phone, iPad, desktop; no server, no install).
   Usage:  node tools/build.js
   Source layout:  src/engine/*.js    the analysis engine (pure functions, no network, no DOM)
                   src/backend/*.js   market-data connectors, signal registry / tracker, lifecycle, persistence helpers
                   src/frontend/*     page body, styles, UI code
   The page has no external script — only the Google Fonts stylesheet, which is optional (the app works without it). */
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));

const ORDER = [].concat(M.engine.map(f => ['engine', f]), M.backend.map(f => ['backend', f]), M.engine2.map(f => ['engine', f]), M.backend2.map(f => ['backend', f]), M.frontend.map(f => ['frontend', f]));
function sourceFiles() { return ORDER.map(([d, f]) => path.join(root, 'src', d, f)); }

function build() {
  const missing = sourceFiles().filter(f => !fs.existsSync(f));
  if (missing.length) throw new Error('missing source files: ' + missing.map(f => path.relative(root, f)).join(', '));
  const code = sourceFiles().map(f => '/* ===== ' + path.relative(root, f).replace(/\\/g, '/') + ' ===== */\n' + fs.readFileSync(f, 'utf8')).join('\n');
  if (/<\/script/i.test(code)) throw new Error('a source file contains "</script", which would end the inline script early');
  const css = fs.readFileSync(path.join(root, 'src/frontend/style.css'), 'utf8');
  const body = fs.readFileSync(path.join(root, 'src/frontend/body.html'), 'utf8');
  const html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="theme-color" content="#06080A">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<title>ORBIT AI | SENTINEL Engine</title>\n<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">\n<style>\n' + css + '</style>\n</head>\n<body>\n' + body + '<script>\n' + code + '\n</script>\n</body>\n</html>\n';
  fs.writeFileSync(path.join(root, 'index.html'), html);
  return html;
}
module.exports = { build, sourceFiles, ORDER, root };
if (require.main === module) { const h = build(); console.log('index.html built: ' + h.length + ' bytes from ' + ORDER.length + ' source files'); }
