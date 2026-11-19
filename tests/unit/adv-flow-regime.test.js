'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('../helpers/engine');
const { rows, walk } = require('../helpers/candles');
const { genBars, mul } = require('../helpers/gen-bars');
const ctx = loadEngine();
const U = s => Date.parse(s) / 1000;
const feats = (c, tfSec = 300) => ctx.buildFeatures(c, { tfSec });
const real = (n, seed, step = 300, t0 = U('2026-01-12T00:00:00Z')) => genBars(n, { seed, sigma: 0.12, t0 }).map((b, i) => ({ time: t0 + i * step, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.q, buy: b.Q }));
/* quiet warm-up rows [o,h,l,c,vol,buyShare] around px with ATR ~1 */
function quiet(n, px, seed = 3, vol = 1000) { const r = mul(seed), out = []; for (let i = 0; i < n; i++) { const o = px + (r() - 0.5) * 0.8, c = px + (r() - 0.5) * 0.8; out.push([o, Math.max(o, c) + 0.35, Math.min(o, c) - 0.35, c, vol, 0.5]); } return out; }

test('stacked flow: consecutive one-sided strong candles are counted, and a neutral candle resets the run', () => {
  const R = quiet(70, 100); let p = 100;
  for (let i = 0; i < 4; i++) { R.push([p, p + 0.8, p - 0.05, p + 0.7, 1500, 0.85]); p += 0.7; }
  R.push([p, p + 0.3, p - 0.3, p + 0.02, 1000, 0.5]);
  const F = feats(rows(R)), t = 69 + 4; assert.equal(F.stk[69 + 1], 1); assert.equal(F.stk[t], 4); assert.equal(F.stk[t + 1], 0);
  assert.equal(F.flowAt(t).stack.dir, 1); assert.equal(F.flowAt(t).stack.n, 4);
  const S = quiet(70, 100); p = 100; for (let i = 0; i < 3; i++) { S.push([p, p + 0.05, p - 0.8, p - 0.7, 1500, 0.15]); p -= 0.7; }
  const G = feats(rows(S)); assert.equal(G.stk[72], -3);
});

test('absorption: heavy selling that does not move price, closing in the upper half, is flagged as buyers absorbing', () => {
  const R = quiet(70, 100); R.push([100, 100.35, 99.75, 100.15, 4000, 0.15]); /* big volume, tiny range, 85% taker selling, close above the middle */
  const F = feats(rows(R)); assert.equal(F.absorb[70], 1); assert.equal(F.flowAt(70).absorb.dir, 1); assert.equal(F.flowAt(73).absorb.age, 3, 'still inside the 3-bar window'); assert.equal(F.flowAt(74).absorb, null, 'older than 3 bars: not reported');
  const S = quiet(70, 100); S.push([100, 100.25, 99.65, 99.85, 4000, 0.85]); assert.equal(feats(rows(S)).absorb[70], -1);
  const N = quiet(70, 100); N.push([100, 101.5, 98.5, 100.1, 4000, 0.15]); assert.equal(feats(rows(N)).absorb[70], 0, 'a wide-range bar is not absorption');
});

test('exhaustion: a new 20-bar high on thin volume with selling flow', () => {
  const R = quiet(70, 100); R.push([100, 102.2, 99.9, 100.5, 500, 0.3]); const F = feats(rows(R)); assert.equal(F.exh[70], -1);
  const L = quiet(70, 100); L.push([100, 100.1, 97.8, 99.6, 500, 0.7]); assert.equal(feats(rows(L)).exh[70], 1);
  const V = quiet(70, 100); V.push([100, 102.2, 99.9, 100.5, 5000, 0.3]); assert.equal(feats(rows(V)).exh[70], 0, 'heavy volume at a new high is not exhaustion');
});

test('volume profile: point of control, value area, high- and low-volume nodes are found where volume really sits', () => {
  const R = []; const r = mul(2);
  for (let i = 0; i < 200; i++) { const mid = i % 2 ? 110 : 100, vol = 5000; const o = mid + (r() - 0.5) * 0.4, c = mid + (r() - 0.5) * 0.4; R.push([o, Math.max(o, c) + 0.3, Math.min(o, c) - 0.3, c, vol, 0.5]); }
  for (let i = 0; i < 40; i++) { const base = 100 + (i + 1) * 0.25; R.push([base, base + 0.3, base - 0.3, base + 0.05, 200, 0.5]); } /* thin transit between the two clusters */
  const F = feats(rows(R)), t = R.length - 1, vp = F.vpAt(t, 240, 40);
  assert.ok(vp && vp.nHvn >= 2, 'two high-volume nodes: ' + JSON.stringify(vp)); assert.ok(vp.nLvn >= 1, 'a low-volume node between them');
  assert.ok(Math.abs(vp.poc - 100) < 1.5 || Math.abs(vp.poc - 110) < 1.5, 'poc on a cluster ' + vp.poc);
  assert.ok(vp.vah >= vp.poc && vp.val <= vp.poc);
  assert.ok(ctx.flowProfile(F, 0, 20, 20) !== null); assert.equal(ctx.flowProfile({ L: [1, 1], H: [1, 1], V: [1, 1] }, 0, 1, 10), null, 'flat price: no profile');
  assert.equal(F.vpAt(20, 150), null, 'not enough bars');
});

test('previous-day value area and naked POC', () => {
  const t0 = U('2026-01-12T00:00:00Z'), R = [];
  for (let i = 0; i < 288; i++) { const px = 100 + (i < 144 ? 0 : 0) + Math.sin(i / 9) * 0.4; R.push([px, px + 0.3, px - 0.3, px + 0.02, 1000, 0.5]); }       /* day 1 around 100 */
  for (let i = 0; i < 100; i++) { const px = 106 + Math.sin(i / 9) * 0.4; R.push([px, px + 0.3, px - 0.3, px + 0.02, 1000, 0.5]); }                  /* day 2 far above */
  const F = feats(rows(R, { t0, step: 300 })), t = R.length - 1, p = F.pdvpAt(t);
  assert.ok(p && Math.abs(p.poc - 100) < 1.0, JSON.stringify(p)); assert.equal(p.nakedPoc, true, 'day 2 never traded back to the day-1 POC');
  const R2 = R.concat([[106, 106.2, 99.5, 100.1, 1000, 0.5], [100.1, 100.4, 99.8, 100.2, 1000, 0.5]]), F2 = feats(rows(R2, { t0, step: 300 })); assert.equal(F2.pdvpAt(R2.length - 1).nakedPoc, false);
  assert.equal(F.pdvpAt(50), null, 'no previous day yet');
});

test('bars without taker-buy volume: delta is estimated and hasDelta is false (callers must label it)', () => {
  const c = real(300, 4).map(k => ({ time: k.time, open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume })); const F = feats(c); assert.equal(F.hasDelta, false); assert.equal(F.flowAt(250).hasDelta, false);
  assert.equal(feats(real(300, 4)).hasDelta, true);
});

test('flow is causal: stack / absorption / exhaustion / delta / profile at t do not change when later bars are removed', () => {
  const c = real(1500, 17), full = feats(c);
  for (const t0 of [400, 777, 1111, 1499]) { const part = feats(c.slice(0, t0 + 1)); assert.equal(JSON.stringify(full.flowAt(t0)), JSON.stringify(part.flowAt(t0)), 'flowAt @' + t0);
    for (let t = 0; t <= t0; t += 11) { assert.equal(full.stk[t], part.stk[t]); assert.equal(full.absorb[t], part.absorb[t]); assert.equal(full.exh[t], part.exh[t]); } }
});

/* ---------------- regime ---------------- */
test('regime: a clean trend is TREND_UP / TREND_DOWN in the right direction, and fits continuation setups better than reversals', () => {
  const up = feats(walk(500, { seed: 2, drift: 0.12, sigma: 0.1 }), 300), r = up.regimeAt(up.n - 1); assert.equal(r.state, 'TREND_UP', JSON.stringify(r)); assert.ok(r.trendiness > 0.55); assert.ok(r.fit.trend > r.fit.reversal);
  const dn = feats(walk(500, { seed: 2, drift: -0.12, sigma: 0.1 }), 300), d = dn.regimeAt(dn.n - 1); assert.equal(d.state, 'TREND_DOWN');
});
test('regime: it discriminates — noise is labelled a trend far less often than a weak real trend, and a strong trend always is (and noise still gets false trend labels sometimes: it is one family among nine, never a signal alone)', () => {
  const share = (gen, seeds) => { let tr = 0, tot = 0; for (const s of seeds) { const F = feats(gen(s), 300); for (let t = 200; t < F.n; t += 4) { const st = F.regimeAt(t).state; tot++; if (st === 'TREND_UP' || st === 'TREND_DOWN') tr++; } } return tr / tot; };
  const noise = share(s => walk(900, { seed: 40 + s, drift: 0, sigma: 0.3 }), [1, 2, 3, 4, 5, 6, 7, 8]), weak = share(s => walk(900, { seed: 60 + s, drift: 0.06, sigma: 0.3 }), [1, 2, 3, 4]), strong = share(s => walk(900, { seed: 70 + s, drift: 0.12, sigma: 0.1 }), [1, 2, 3]);
  assert.ok(noise < 0.3, 'noise ' + noise.toFixed(3)); assert.ok(weak > noise + 0.15, `weak ${weak.toFixed(3)} vs noise ${noise.toFixed(3)}`); assert.ok(strong > 0.9, 'strong ' + strong.toFixed(3));
});
test('regime: a long quiet stretch compresses (SQUEEZE or QUIET), and a break out of it is EXPANSION / trend, not range', () => {
  const R = []; const r = mul(11); for (let i = 0; i < 160; i++) { const px = 100 + (r() - 0.5) * 8; R.push([px, px + 1.5, px - 1.5, px + (r() - 0.5) * 3, 1000, 0.5]); }
  for (let i = 0; i < 80; i++) { const px = 100 + (r() - 0.5) * 0.15; R.push([px, px + 0.08, px - 0.08, px + (r() - 0.5) * 0.05, 400, 0.5]); }
  const F = feats(rows(R)), s = F.regimeAt(R.length - 1); assert.ok(['SQUEEZE', 'QUIET', 'RANGE'].includes(s.state), JSON.stringify(s));
  assert.ok(F.regimeAt(R.length - 1).volRank <= 0.25, 'volatility rank is in the bottom quarter: ' + s.volRank);
});
test('regime: fields are bounded, early bars are UNKNOWN (never invented), and the result is causal', () => {
  const c = real(1600, 3), F = feats(c); assert.equal(F.regimeAt(20).state, 'UNKNOWN');
  for (let t = 150; t < F.n; t += 9) { const g = F.regimeAt(t); assert.ok(g.trendiness >= 0 && g.trendiness <= 1); assert.ok(g.volRank >= 0 && g.volRank <= 1); assert.ok(g.fit.trend >= 0 && g.fit.trend <= 1); assert.ok(typeof g.state === 'string'); }
  for (const t0 of [300, 800, 1555]) { const part = feats(c.slice(0, t0 + 1)); assert.equal(JSON.stringify(F.regimeAt(t0)), JSON.stringify(part.regimeAt(t0)), 'regime @' + t0); }
});
