'use strict';
/* hand-built price stories for tests (engine candle format).  bullScenario(): a textbook bullish reversal —
   down-trend with lower highs -> equal lows -> liquidity sweep -> displacement that breaks structure (CHoCH / MSS) -> retracement toward the order block / fair-value gap. */
const { mul } = require('./gen-bars');
function bullScenario({ seed = 7, retrace = 8, sweep = true, endTime = Date.parse('2026-01-14T14:35:00Z') / 1000, step = 300 } = {}) {
  const r = mul(seed), R = [], bar = (o, c, up, dn, v, buy) => R.push({ o, h: Math.max(o, c) + up, l: Math.min(o, c) - dn, c, v, buy });
  for (let i = 0; i < 90; i++) { const o = 100 + (r() - 0.5) * 1.2, c = 100 + (r() - 0.5) * 1.2; bar(o, c, 0.3, 0.3, 1000, 500); }
  let level = R[R.length - 1].c;
  for (let k = 0; k < 4; k++) { for (let i = 0; i < 4; i++) { const c = level - 0.45; bar(level, c, 0.12, 0.12, 1100, 430); level = c; } for (let i = 0; i < 3; i++) { const c = level + 0.3; bar(level, c, 0.12, 0.12, 900, 520); level = c; } }
  const eq = 92.0; while (level > eq + 0.45) { const c = level - 0.45; bar(level, c, 0.12, 0.1, 1100, 430); level = c; }
  bar(level, eq, 0.1, 0.05, 1200, 420); level = eq;
  for (let i = 0; i < 5; i++) { const c = level + 0.35; bar(level, c, 0.12, 0.12, 900, 520); level = c; }
  for (let i = 0; i < 5; i++) { const c = level - 0.35; bar(level, c, 0.12, 0.12, 900, 480); level = c; }
  bar(level, level + 0.05, 0.1, 0.1, 900, 450);
  if (sweep) { const sw = level; bar(sw, sw + 0.5, 0.05, 1.0, 3500, 1500); level = sw + 0.5; } else { const sw = level; bar(sw, sw + 0.5, 0.05, 0.1, 1200, 600); level = sw + 0.5; }
  for (let i = 0; i < 3; i++) { const c = level + 1.7; bar(level, c, 0.05, 0.05, 4200, 3300); level = c; }
  bar(level, level - 0.3, 0.15, 0.15, 1500, 700); level -= 0.3;
  for (let i = 0; i < retrace; i++) { const c = level - 0.55; bar(level, c, 0.1, 0.1, 1000, 420); level = c; }
  bar(level, level + 0.5, 0.05, 0.5, 3200, 2300);
  const n = R.length, t0 = endTime - (n - 1) * step;
  return R.map((x, i) => ({ time: t0 + i * step, open: x.o, high: x.h, low: x.l, close: x.c, volume: x.v, buy: x.buy }));
}
/* mirror a series around a price (every long story becomes the equivalent short story) */
function mirror(c, axis = 200) { return c.map(k => ({ time: k.time, open: axis - k.open, high: axis - k.low, low: axis - k.high, close: axis - k.close, volume: k.volume, buy: k.volume - k.buy })); }
module.exports = { bullScenario, mirror };
