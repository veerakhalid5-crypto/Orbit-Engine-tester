'use strict';
/* tiny deterministic candle builders for unit tests (engine candle format: {time, open, high, low, close, volume, buy}) */
const { mul } = require('./gen-bars');

/* closes -> candles. wick = fraction of the body/ATR-ish range added above and below; vol constant unless a function is given */
function fromCloses(closes, { t0 = 1700006400, step = 60, wick = 0.15, vol = 1000, buyShare = 0.5, start } = {}) {
  const out = []; let prev = start != null ? start : closes[0];
  closes.forEach((c, i) => {
    const o = prev, body = Math.abs(c - o), w = Math.max(body * wick, Math.abs(c) * 0.0002);
    const v = typeof vol === 'function' ? vol(i) : vol, bs = typeof buyShare === 'function' ? buyShare(i) : buyShare;
    out.push({ time: t0 + i * step, open: o, high: Math.max(o, c) + w, low: Math.min(o, c) - w, close: c, volume: v, buy: v * bs });
    prev = c;
  });
  return out;
}
/* explicit [open, high, low, close, volume?] rows */
function rows(list, { t0 = 1700006400, step = 60 } = {}) {
  return list.map((r, i) => ({ time: t0 + i * step, open: r[0], high: r[1], low: r[2], close: r[3], volume: r[4] == null ? 1000 : r[4], buy: (r[4] == null ? 1000 : r[4]) * (r[5] == null ? 0.5 : r[5]) }));
}
/* a noisy random walk with optional drift */
function walk(n, { seed = 1, start = 100, drift = 0, sigma = 0.4, t0, step } = {}) {
  const r = mul(seed), g = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const cl = []; let p = start; for (let i = 0; i < n; i++) { p = p * (1 + (drift + sigma * g()) / 100); cl.push(p); }
  return fromCloses(cl, { t0, step, start });
}
module.exports = { fromCloses, rows, walk };
