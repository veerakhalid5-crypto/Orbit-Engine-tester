'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('../helpers/engine');
const { fromCloses, walk } = require('../helpers/candles');
const ctx = loadEngine();
const feats = (c, tfSec = 60) => ctx.buildFeatures(c, { tfSec });
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} !~ ${b}`);

test('every quant array is full length, finite where defined, and bounded', () => {
  const F = feats(walk(700, { seed: 3, sigma: 0.5 })), n = F.n, Q = F.q;
  for (const k of ['bbMid', 'bbUp', 'bbLo', 'pctB', 'bw', 'kcUp', 'kcLo', 'dcHi', 'dcLo', 'st', 'adx', 'pdi', 'mdi', 'stK', 'stD', 'roc', 'zC', 'zR', 'er', 'arsi', 'vwap', 'avwapL', 'avwapH']) assert.equal(Q[k].length, n, k);
  for (let t = 100; t < n; t++) {
    assert.ok(Q.adx[t] >= 0 && Q.adx[t] <= 100, 'adx ' + Q.adx[t]); assert.ok(Q.stK[t] >= -1e-9 && Q.stK[t] <= 100 + 1e-9, 'stoch');
    assert.ok(Q.bbUp[t] >= Q.bbMid[t] && Q.bbMid[t] >= Q.bbLo[t], 'bands ordered'); assert.ok(Math.abs(Q.stDir[t]) === 1, 'supertrend direction');
    assert.ok(Q.er[t] >= 0 && Q.er[t] <= 1 + 1e-9, 'efficiency ratio'); assert.ok(Q.arsi[t] >= 0 && Q.arsi[t] <= 100, 'adaptive RSI'); assert.ok(Number.isFinite(Q.vwap[t]), 'vwap');
  }
});

test('causal: values at bar t do not change when later bars are removed', () => {
  const c = walk(620, { seed: 9, sigma: 0.45 }), full = feats(c), t0 = 480, part = feats(c.slice(0, t0 + 1));
  for (const k of ['bbUp', 'bbLo', 'pctB', 'bwRank', 'kcUp', 'dcHi', 'st', 'stDir', 'adx', 'pdi', 'stK', 'roc', 'zC', 'zR', 'er', 'arsi', 'vwap', 'avwapL', 'avwapH', 'sqz', 'dcBrk']) {
    for (const t of [200, 300, 400, t0]) { const a = full.q[k][t], b = part.q[k][t]; if (Number.isNaN(a)) assert.ok(Number.isNaN(b), k + ' nan@' + t); else near(a, b, 1e-9); }
  }
  assert.deepEqual(JSON.parse(JSON.stringify(full.quantAt(t0))), JSON.parse(JSON.stringify(part.quantAt(t0))));
});

test('clean uptrend: supertrend up, +DI above -DI, strong ADX, bullish bias; downtrend is the mirror', () => {
  const up = feats(walk(400, { seed: 2, drift: 0.12, sigma: 0.12 })), s = up.quantAt(up.n - 1);
  assert.equal(s.supertrend, 1); assert.equal(s.diDir, 1); assert.ok(s.adx > 25, 'adx ' + s.adx); assert.ok(s.bias > 0.5, 'bias ' + s.bias); assert.equal(s.mode, 'TRENDING');
  const dn = feats(walk(400, { seed: 2, drift: -0.12, sigma: 0.12 })), d = dn.quantAt(dn.n - 1);
  assert.equal(d.supertrend, -1); assert.equal(d.diDir, -1); assert.ok(d.bias < -0.5);
});

test('flat noise reads weaker than a trend (ADX and bias averaged over several seeds)', () => {
  const avg = (drift, sigma) => { let adx = 0, bias = 0; for (let s = 1; s <= 6; s++) { const F = feats(walk(500, { seed: 20 + s, drift, sigma })), q = F.quantAt(F.n - 1); adx += q.adx; bias += Math.abs(q.bias); } return { adx: adx / 6, bias: bias / 6 }; };
  const flat = avg(0, 0.3), trend = avg(0.12, 0.12); assert.ok(flat.adx < trend.adx, `flat ${flat.adx} trend ${trend.adx}`); assert.ok(flat.bias < trend.bias, `bias flat ${flat.bias} trend ${trend.bias}`);
});

test('Bollinger: a constant series has zero width and %B 0.5; a spike pushes %B above 1', () => {
  const flat = feats(fromCloses(new Array(80).fill(100), { wick: 0 })); near(flat.q.bw[79], 0); near(flat.q.pctB[79], 0.5);
  const cl = new Array(60).fill(100); cl.push(103); const sp = feats(fromCloses(cl)); assert.ok(sp.q.pctB[60] > 1, 'pctB ' + sp.q.pctB[60]);
});

test('Donchian breakout is flagged only when the close clears the previous 20-bar extreme', () => {
  const cl = new Array(40).fill(0).map((_, i) => 100 + Math.sin(i) * 0.3); cl.push(104); const F = feats(fromCloses(cl));
  assert.equal(F.q.dcBrk[40], 1); assert.equal(F.q.dcBrk[39], 0);
});

test('VWAP resets each UTC day on intraday charts and equals the volume-weighted typical price', () => {
  const c = fromCloses(new Array(30).fill(0).map((_, i) => 100 + i * 0.1), { t0: 86400 * 20000 - 600, step: 60, vol: i => 100 + i });   // crosses a UTC midnight after 10 bars
  const F = feats(c); const k = c.findIndex(x => Math.floor(x.time / 86400) !== Math.floor(c[0].time / 86400));
  const tp = j => (F.H[j] + F.L[j] + F.C[j]) / 3; let pv = 0, vv = 0; for (let j = k; j <= k + 5; j++) { pv += tp(j) * F.V[j]; vv += F.V[j]; }
  near(F.q.vwap[k + 5], pv / vv, 1e-9); near(F.q.vwap[k], tp(k), 1e-9);
});

test('Fibonacci: retracement levels, OTE band and extensions of the latest confirmed leg', () => {
  /* up leg 100 -> 120 over 25 bars, pullback to 105 */
  const cl = []; for (let i = 0; i < 12; i++) cl.push(100 + Math.sin(i) * .2); for (let i = 1; i <= 25; i++) cl.push(100 + i * 0.8); for (let i = 1; i <= 15; i++) cl.push(120 - i * 1.0);
  const F = feats(fromCloses(cl, { wick: 0.05 })); const f = F.fibAt(F.n - 1); assert.ok(f, 'a leg is found'); assert.equal(f.dir, 1);
  near(f.ret[0.5], (f.a + f.b) / 2, 1e-9); near(f.ret[0.618], f.b - 0.618 * (f.b - f.a), 1e-9); near(f.ext[1.618], f.a + 1.618 * (f.b - f.a), 1e-9);
  assert.ok(f.ratio > 0.6 && f.ratio < 0.85, 'ratio ' + f.ratio); assert.equal(f.inOte, f.ratio >= 0.62 && f.ratio <= 0.79); assert.ok(f.ote.lo < f.ote.hi);
});

test('variance ratio: positively autocorrelated returns -> TRENDING, negatively -> MEAN_REVERTING, white noise -> INCONCLUSIVE (statistically, not by eye)', () => {
  const { mul } = require('../helpers/gen-bars'); const mk = (phi, seed) => { const r = mul(seed), g = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }; let ret = 0, p = 100; const cl = []; for (let i = 0; i < 400; i++) { ret = phi * ret + 0.2 * g(); p *= 1 + ret / 100; cl.push(p); } return feats(fromCloses(cl)); };
  const kinds = phi => { const o = { TRENDING: 0, MEAN_REVERTING: 0, INCONCLUSIVE: 0 }; for (let s = 1; s <= 12; s++) o[mk(phi, 100 + s).vrAt(399).kind]++; return o; };
  const pos = kinds(0.6), neg = kinds(-0.6), none = kinds(0);
  assert.ok(pos.TRENDING >= 9, JSON.stringify(pos)); assert.ok(neg.MEAN_REVERTING >= 9, JSON.stringify(neg)); assert.ok(none.INCONCLUSIVE >= 9, 'white noise should rarely be classified: ' + JSON.stringify(none));
});

test('relStrength: a coin that moves 2x BTC has beta 2 and correlation 1', () => {
  const btc = [100]; for (let i = 1; i < 120; i++) btc.push(btc[i - 1] * (1 + (i % 3 === 0 ? 0.004 : -0.002)));
  const coin = [50]; for (let i = 1; i < 120; i++) coin.push(coin[i - 1] * Math.exp(2 * Math.log(btc[i] / btc[i - 1])));
  const r = ctx.relStrength(coin, btc, 60); near(r.beta, 2, 1e-9); near(r.corr, 1, 1e-9); assert.equal(ctx.relStrength(coin.slice(0, 10), btc.slice(0, 10), 60), null);
});
