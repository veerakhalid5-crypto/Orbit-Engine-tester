'use strict';
/* Loads the engine + backend files (everything except the UI) into one vm context, exactly in the browser's order,
   so unit tests exercise the same code that ships in index.html. */
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const M = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'manifest.json'), 'utf8'));

function loadEngine(extra = {}) {
  const sandbox = Object.assign({ console: { log() {}, info() {}, warn() {}, error() {}, debug() {} }, performance, Date, setTimeout, clearTimeout, setInterval, clearInterval, AbortController,
    fetch: async () => { throw new Error('network disabled in unit tests'); }, WebSocket: class { constructor() { throw new Error('network disabled in unit tests'); } } }, extra);
  const ctx = vm.createContext(sandbox);
  const files = [].concat(M.engine.map(f => 'engine/' + f), M.backend.map(f => 'backend/' + f), M.engine2.map(f => 'engine/' + f), M.backend2.map(f => 'backend/' + f));
  for (const f of files) {
    const p = path.join(root, 'src', f);
    if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  }
  /* const/let declarations are not properties of the global: expose what tests need */
  vm.runInContext('globalThis.__x = { ENGINE_DEFS, ENG_BY, ENG_CL, HTF, TFS, TFMAP, PRESETS, TIER_RANK, FAM_W, FAM_NAME, CONF_W, CONF_NAME, CONF_TIER, ENG, toCandles };', ctx);
  return ctx;
}
/* make bars in the engine's candle format {time,open,high,low,close,volume,...} from simple arrays */
module.exports = { loadEngine };
