'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('../helpers/engine');
const { fromCloses, walk } = require('../helpers/candles');
const { mul } = require('../helpers/gen-bars');
const ctx = loadEngine();
const feats = (c, tfSec = 300) => ctx.buildFeatures(c, { tfSec });
const gauss = (r) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
/* AR(1) deviation around 100: phi>0 persistent steps, phi<0 anti-persistent */
const arSeries = (n, phi, seed, sig = 0.4) => { const r = mul(seed); let x = 100, d = 0; const cl = []; for (let i = 0; i < n; i++) { d = phi * d + sig * gauss(r); x += d; cl.push(x); } return cl; };
const meanRev = (n, seed, k = 0.25, sig = 0.4) => { const r = mul(seed); let x = 100; const cl = []; for (let i = 0; i < n; i++) { x += -k * (x - 100) + sig * gauss(r); cl.push(x); } return cl; };

test('Hurst: persistent > random walk > mean-reverting, all bounded in [0,1]', () => {
  const hp = ctx.qHurst(feats(fromCloses(arSeries(600, 0.7, 3))), 599), hr = ctx.qHurst(feats(walk(600, { seed: 5, sigma: 0.4 })), 599), hm = ctx.qHurst(feats(fromCloses(meanRev(600, 4))), 599);
  for (const h of [hp, hr, hm]) assert.ok(h.h >= 0 && h.h <= 1 && h.n >= 150);
  assert.ok(hp.h > hr.h + 0.08, 'persistent ' + hp.h + ' vs random ' + hr.h);
  assert.ok(hm.h < hr.h - 0.08, 'mean-reverting ' + hm.h + ' vs random ' + hr.h);
  assert.equal(hm.kind, 'MEAN_REVERTING'); assert.equal(hp.kind, 'PERSISTENT');
});
test('Hurst, entropy, CUSUM, Kalman, channel, OU return null when there is too little history', () => {
  const F = feats(walk(30, { seed: 1 }));
  for (const f of ['qHurst', 'qEntropy', 'qCusum', 'qKalman', 'qRegChannel', 'qOU', 'qVpin']) assert.equal(ctx[f](F, 29), null, f);
});
test('permutation entropy: random is near 1, a clean ramp is far lower', () => {
  const er = ctx.qEntropy(feats(walk(500, { seed: 8 })), 499), ramp = ctx.qEntropy(feats(fromCloses(Array.from({ length: 500 }, (_, i) => 100 + i * 0.1 + (i % 2) * 0.01))), 499);
  assert.ok(er.pe > 0.9 && er.pe <= 1, 'random ' + er.pe); assert.ok(ramp.pe < 0.5, 'ramp ' + ramp.pe);
});
test('CUSUM: quiet noise does not fire; a sustained shift fires once, in the right direction, only at the crossing', () => {
  const r = mul(41), base = []; let x = 100; for (let i = 0; i < 400; i++) { x += 0.3 * gauss(r); base.push(x); }
  for (let t = 200; t < 400; t += 7) { const c = ctx.qCusum(feats(fromCloses(base.slice(0, t + 1))), t); if (c && c.hit) assert.ok(c.hit.s >= 5); }
  const up = base.slice(); for (let i = 380; i < 400; i++) up[i] = up[379] + (i - 379) * 0.7;           // a strong drift over the last 20 bars
  let fired = 0, dir = 0; for (let t = 380; t < 400; t++) { const c = ctx.qCusum(feats(fromCloses(up.slice(0, t + 1))), t); if (c && c.hit) { fired++; dir = c.hit.dir; assert.ok(c.hit.age >= 0 && c.hit.age <= 2); } }
  assert.ok(fired >= 1 && fired <= 3, 'fired on ' + fired + ' bars'); assert.equal(dir, 1);
  const dn = base.slice(); for (let i = 380; i < 400; i++) dn[i] = dn[379] - (i - 379) * 0.7; let d2 = 0; for (let t = 380; t < 400; t++) { const c = ctx.qCusum(feats(fromCloses(dn.slice(0, t + 1))), t); if (c && c.hit) d2 = c.hit.dir; }
  assert.equal(d2, -1);
});
test('Kalman: slope sign follows the trend and a turn produces a flip in the new direction', () => {
  const r = mul(6); let x = 100; const cl = []; for (let i = 0; i < 160; i++) { x += 0.5 + 0.35 * gauss(r); cl.push(x); }
  const k1 = ctx.qKalman(feats(fromCloses(cl)), 159); assert.equal(k1.dir, 1); assert.ok(k1.z > 2 && !k1.flip);
  let flipDir = 0; for (let i = 0; i < 25; i++) { x -= 0.9 + 0.35 * gauss(r); cl.push(x); const t = cl.length - 1, k = ctx.qKalman(feats(fromCloses(cl)), t); if (k.flip) flipDir = k.dir; }
  assert.equal(flipDir, -1, 'a clear reversal flips the filter');
});
test('regression channel: a noisy line has high R², slope sign and a position near zero', () => {
  const r = mul(12), cl = Array.from({ length: 200 }, (_, i) => 100 + 0.2 * i + 0.5 * gauss(r)), ch = ctx.qRegChannel(feats(fromCloses(cl)), 199, 100);
  assert.ok(ch.r2 > 0.9 && ch.slope > 0 && Math.abs(ch.pos) < 3 && ch.up > ch.mid && ch.mid > ch.lo && ch.n === 100, JSON.stringify(ch));
  const cl2 = cl.slice(); cl2[199] = cl2[198] - 6; const ch2 = ctx.qRegChannel(feats(fromCloses(cl2)), 199, 100); assert.ok(ch2.pos < -2.5, 'a drop to the channel floor reads as a negative position: ' + ch2.pos);
});
test('Ornstein-Uhlenbeck: finds a half-life for a mean-reverting series, none for a trending one', () => {
  const ou = ctx.qOU(feats(fromCloses(meanRev(300, 9, 0.2))), 299, 100); assert.ok(ou.reverting && ou.halfLife > 1.5 && ou.halfLife < 8, JSON.stringify(ou));
  const tr = ctx.qOU(feats(fromCloses(Array.from({ length: 300 }, (_, i) => 100 + i * 0.3 + 0.05 * Math.sin(i)))), 299, 100); assert.equal(tr.reverting, false);
});
test('VPIN-lite: needs taker-buy volume, is bounded, and one-sided flow ranks high against its own history', () => {
  const noDelta = walk(400, { seed: 3 }).map(k => { const { buy, ...rest } = k; return rest; }); assert.equal(ctx.qVpin(feats(noDelta), 399), null);
  const r = mul(5); const c = walk(400, { seed: 3, sigma: 0.3 }).map((k, i) => ({ ...k, buy: k.volume * (i >= 380 ? 0.95 : 0.5 + 0.08 * gauss(r)) }));
  const F = feats(c), v = ctx.qVpin(F, 399); assert.ok(v.vpin >= 0 && v.vpin <= 1 && v.pct >= 0 && v.pct <= 1); assert.equal(v.dir, 1);
  const calm = ctx.qVpin(feats(c.slice(0, 380).map(k => ({ ...k, buy: k.volume * 0.5 }))), 379); assert.ok(calm.pct <= 1 && calm.vpin < v.vpin, 'one-sided flow raises the reading');
});
test('Beta posterior: no data is wide and centred, more data narrows it, the mean follows the measured rate', () => {
  const p0 = ctx.betaPost(0, 0), p1 = ctx.betaPost(8, 10), p2 = ctx.betaPost(80, 100), p3 = ctx.betaPost(40, 100);
  assert.ok(Math.abs(p0.mean - 0.5) < 1e-9 && p0.lo < 0.1 && p0.hi > 0.9);
  assert.ok(p2.hi - p2.lo < p1.hi - p1.lo, 'more outcomes → narrower interval'); assert.ok(Math.abs(p2.mean - 81 / 102) < 1e-9 && p3.mean < p2.mean);
  assert.ok(p2.lo < p2.mean && p2.mean < p2.hi);
});
test('causal: every estimator gives the same answer when later bars are removed', () => {
  const c = walk(700, { seed: 17, sigma: 0.45 }), full = feats(c), t0 = 520, part = feats(c.slice(0, t0 + 1));
  const same = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);
  for (const f of ['qHurst', 'qEntropy', 'qCusum', 'qKalman', 'qRegChannel', 'qOU', 'qVpin']) for (const t of [t0 - 40, t0]) { const p = t === t0 ? part : feats(c.slice(0, t + 1)); same(ctx[f](full, t), ctx[f](p, t), f + '@' + t); }
});
