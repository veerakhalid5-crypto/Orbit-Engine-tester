'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('../helpers/engine');
const { rows, walk } = require('../helpers/candles');
const { genBars, mul } = require('../helpers/gen-bars');
const ctx = loadEngine();
const feats = (c, tfSec = 60) => ctx.buildFeatures(c, { tfSec });
const real = (n, seed) => genBars(n, { seed, sigma: 0.12 }).map(b => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.q, buy: b.Q }));

/* ~60 bars of quiet noise around `px` with ATR close to 1.0 (rows format [o,h,l,c,vol]) */
function noise(n, px, seed = 5) {
  const r = mul(seed), out = []; let p = px;
  for (let i = 0; i < n; i++) { const d = (r() - 0.5) * 0.8, o = p, c = px + (r() - 0.5) * 0.8; void d; out.push([o, Math.max(o, c) + 0.35, Math.min(o, c) - 0.35, c, 1000]); p = c; }
  return out;
}
const bar = (o, c, up = 0.1, dn = 0.1, v = 1500) => [o, Math.max(o, c) + up, Math.min(o, c) - dn, c, v];

test('every order block / FVG carries a 0-100 quality, a consequent-encroachment midpoint and a reason list', () => {
  const F = feats(real(2500, 4));
  const zs = F.zones.filter(z => z.kind === 'OB' || z.kind === 'FVG'); assert.ok(zs.length > 50);
  for (const z of zs) {
    assert.ok(z.q >= 0 && z.q <= 100, 'q ' + z.q); assert.ok(Array.isArray(z.qf)); assert.ok(Math.abs(z.ce - (z.top + z.bot) / 2) < 1e-12);
    if (z.q > 0 && z.kind !== 'BRK') assert.ok(z.qf.length > 0, 'a scored zone lists why');
  }
  const qs = zs.map(z => z.q); assert.ok(Math.max(...qs) > Math.min(...qs), 'scores must discriminate between zones');
});

test('demand zone: tight base after a drop, then a displacement up -> a typed DBR demand zone with a reason list', () => {
  const R = noise(70, 100);
  let p = R[R.length - 1][3]; const drop = [];
  for (let i = 0; i < 4; i++) { const c = p - 0.9; drop.push(bar(p, c, 0.1, 0.1, 1400)); p = c; }
  const base = [bar(p, p + 0.1, 0.15, 0.15), bar(p + 0.1, p - 0.05, 0.15, 0.15), bar(p - 0.05, p + 0.05, 0.15, 0.15)];
  const lowB = p - 0.2;
  const up = []; let q = p + 0.05;
  for (let i = 0; i < 3; i++) { const c = q + 1.6; up.push(bar(q, c, 0.05, 0.05, 4000)); q = c; }
  const c = rows(R.concat(drop, base, up, noise(10, q, 9).map(r => r.map(x => x + (q - 100)))));
  const F = feats(c), d = F.zx.filter(z => z.kind === 'SD' && z.dir === 1);
  assert.ok(d.length >= 1, 'a demand zone is detected'); const z = d[0];
  assert.equal(z.sub, 'DEMAND'); assert.equal(z.sdType, 'DBR'); assert.ok(!z.continuation, 'drop then rally is a reversal zone');
  assert.ok(z.bot <= lowB + 0.35 && z.top < q, 'zone sits at the base, not at the top of the move'); assert.ok(z.q >= 35 && z.q <= 100); assert.ok(z.qf.some(s => /departure/.test(s)));
  assert.ok(z.born >= 74, 'only known after the displacement finished');
});

test('supply zone mirrors it: rally, tight base, displacement down -> RBD supply', () => {
  const R = noise(70, 100); let p = R[R.length - 1][3]; const rally = [];
  for (let i = 0; i < 4; i++) { const c = p + 0.9; rally.push(bar(p, c, 0.1, 0.1, 1400)); p = c; }
  const base = [bar(p, p - 0.1, 0.15, 0.15), bar(p - 0.1, p + 0.05, 0.15, 0.15), bar(p + 0.05, p - 0.05, 0.15, 0.15)];
  const dn = []; let q = p - 0.05; for (let i = 0; i < 3; i++) { const c = q - 1.6; dn.push(bar(q, c, 0.05, 0.05, 4000)); q = c; }
  const F = feats(rows(R.concat(rally, base, dn))), s = F.zx.filter(z => z.kind === 'SD' && z.dir === -1);
  assert.ok(s.length >= 1); assert.equal(s[0].sub, 'SUPPLY'); assert.equal(s[0].sdType, 'RBD'); assert.ok(s[0].top >= p - 0.1);
});

test('no supply/demand zone is created by plain noise', () => {
  const F = feats(rows(noise(300, 100, 2))); assert.equal(F.zx.filter(z => z.kind === 'SD').length, 0);
});

test('inverse FVG: a quality bullish gap that is closed through by a strong bearish candle flips to a bearish zone', () => {
  const R = noise(70, 100); let p = R[R.length - 1][3];
  const a = bar(p, p + 0.2, 0.05, 0.3), b = bar(p + 0.2, p + 2.0, 0.05, 0.05, 5000), c = bar(p + 2.0, p + 2.5, 0.05, 0.4, 3000); /* gap between a.high and c.low */
  assert.ok(c[2] > a[1], 'fixture has a real gap');
  const crash = bar(p + 2.5, p - 0.3, 0.05, 0.05, 6000);
  const F = feats(rows(R.concat([a, b, c, crash, bar(p - 0.3, p - 0.4)])));
  const g = F.zones.filter(z => z.kind === 'FVG' && z.dir === 1 && z.born >= 70); assert.ok(g.length >= 1, 'bullish FVG found');
  const inv = F.zx.filter(z => z.kind === 'IFVG' && z.dir === -1); assert.ok(inv.length >= 1, 'inverse FVG created'); assert.equal(inv[0].sub, 'INVERSE_FVG');
  assert.ok(inv[0].born > g[0].born);
});

test('zoneState: depth of penetration, consequent-encroachment hit and touches are measured from price', () => {
  const Z = { kind: 'FVG', dir: 1, top: 102, bot: 100, ce: 101, born: 2, end: null, tb: [], q: 60 };
  const F = { H: [105, 105, 105, 105, 105, 105], L: [103, 103, 103, 102.4, 101.5, 100.5], C: [], tb: [] };
  let st = ctx.zoneState(F, Z, 3); assert.equal(st.pen, 0, 'untouched while the low stays above the top: ' + st.pen); assert.equal(st.inside, false); assert.equal(st.fresh, true);
  Z.tb = [4]; st = ctx.zoneState(F, Z, 4); assert.ok(Math.abs(st.pen - 0.25) < 1e-9, 'pen ' + st.pen); assert.equal(st.ceHit, false); assert.equal(st.inside, true); assert.equal(st.touches, 0, 'the visit in progress is not a prior test'); assert.equal(st.fresh, true);
  Z.tb = [4, 5]; st = ctx.zoneState(F, Z, 5); assert.ok(Math.abs(st.pen - 0.75) < 1e-9); assert.equal(st.ceHit, true); assert.equal(st.touches, 1, 'two visits, one still in progress'); assert.equal(st.visits, 2); assert.equal(st.fresh, false);
  const q5 = ctx.zoneQualityNow(Z, st); assert.ok(q5 < Z.q, 'penetrated, re-tested zones are worth less'); assert.equal(q5, Math.round(60 * (1 - 0.35 * 0.75) * 0.85));
  assert.equal(ctx.zoneQualityNow(Z, { pen: 0, touches: 0 }), 60); assert.ok(ctx.zoneQualityNow(Z, { pen: 0, touches: 3 }) < ctx.zoneQualityNow(Z, { pen: 0, touches: 1 }));
  /* after price left the zone, both visits are prior tests */
  const F2 = { H: [105, 105, 105, 105, 105, 105, 105], L: [103, 103, 103, 102.4, 101.5, 100.5, 103.5], C: [], tb: [] }; Z.tb = [4, 5]; st = ctx.zoneState(F2, Z, 6); assert.equal(st.inside, false); assert.equal(st.touches, 2);
});

test('rejection block appears on a long wick at a confirmed swing high', () => {
  const F = feats(real(3000, 3)), rb = F.zx.filter(z => z.kind === 'REJ');
  assert.ok(rb.length > 0);
  for (const z of rb) { assert.ok(z.top > z.bot); assert.ok(z.born > z.i, 'known only after the pivot is confirmed'); assert.ok(z.q >= 35 && z.q <= 100); }
});

test('all advanced zones are well-formed and never known before they exist', () => {
  for (const seed of [1, 2, 3]) {
    const F = feats(real(2500, seed));
    for (const z of F.zx) {
      assert.ok(z.top > z.bot, z.kind); assert.ok(z.dir === 1 || z.dir === -1); assert.ok(z.born >= z.i); assert.ok(z.q >= 0 && z.q <= 100);
      assert.ok(z.end == null || z.end > z.born); assert.ok(z.tb.every(b => b > z.born));
      assert.ok(Math.abs(z.ce - (z.top + z.bot) / 2) < 1e-12);
    }
  }
});

test('zonesAt returns only live zones near price, best first, with a quality that accounts for penetration', () => {
  const F = feats(real(2500, 6));
  for (const t of [1200, 1800, 2400]) {
    const zs = F.zonesAt(t); for (let i = 1; i < zs.length; i++) assert.ok(zs[i - 1].qNow >= zs[i].qNow);
    for (const z of zs) { assert.ok(z.dist >= 0 && z.dist <= 2.5 + 1e-9); assert.ok(z.z.born < t); assert.ok(z.z.end == null || z.z.end > t); assert.ok(z.qNow <= z.q); assert.ok(z.pen >= 0 && z.pen <= 1); }
  }
});

test('causal: every advanced zone, its quality and zonesAt(t) are identical when later bars are removed', () => {
  const c = real(2200, 8), full = feats(c);
  /* cut exactly at the bars where zones are born (and 1 bar after), so look-ahead in a quality score cannot hide */
  const births = [...new Set(full.zones.concat(full.zx).filter(z => z.born > 300 && z.born < 2100).map(z => z.born))].sort((a, b) => a - b);
  const cuts = [900, 1500, 2100]; for (let k = 5; k < births.length; k += Math.ceil(births.length / 14)) cuts.push(births[k], births[k] + 1);
  assert.ok(cuts.length >= 12);
  for (const t0 of cuts) {
    const part = feats(c.slice(0, t0 + 1));
    const view = F => F.zx.filter(z => z.born <= t0).map(z => [z.kind, z.sub, z.dir, +z.top.toFixed(9), +z.bot.toFixed(9), z.born, z.i, z.q, z.qf.join('|'), z.end != null && z.end <= t0 ? z.end : null]);
    assert.deepEqual(view(full), view(part), 'advanced zones @' + t0);
    const bq = F => F.zones.filter(z => z.born <= t0).map(z => [z.kind, z.born, z.q, z.qf.join('|')]); assert.deepEqual(bq(full), bq(part), 'base zone quality @' + t0);
    const za = F => F.zonesAt(t0).map(z => [z.kind, z.sub, z.dir, z.top, z.bot, z.q, z.qNow, +z.dist.toFixed(9), z.touches, z.fresh, z.ceHit]); assert.deepEqual(za(full), za(part), 'zonesAt @' + t0);
    for (let t = 0; t <= t0; t += 7) { assert.equal(full.dsp[t], part.dsp[t], 'displacement @' + t); const a = full.indAt[t], b = part.indAt[t]; assert.equal(!!a, !!b, 'inducement @' + t); if (a) assert.equal(a.dir, b.dir); }
  }
});

test('performance: a 3000-bar series builds in a reasonable time', () => {
  const c = real(3000, 12), t0 = Date.now(); feats(c); assert.ok(Date.now() - t0 < 3000, 'took ' + (Date.now() - t0) + ' ms');
});

test('walk() data does not crash the pass and still produces bounded values', () => {
  const F = feats(walk(1500, { seed: 5, sigma: 0.3 })); for (const z of F.zx) assert.ok(Number.isFinite(z.top) && Number.isFinite(z.bot) && z.q >= 0 && z.q <= 100);
});
