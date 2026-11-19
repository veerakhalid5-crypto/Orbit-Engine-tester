'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('../helpers/engine');
const { genBars } = require('../helpers/gen-bars');
const { bullScenario, mirror } = require('../helpers/scenarios');
const ctx = loadEngine();
const U = s => Date.parse(s) / 1000;
const feats = (c, tfSec = 300) => ctx.buildFeatures(c, { tfSec });
const real = (n, seed, step = 300, t0 = U('2026-01-12T00:00:00Z')) => genBars(n, { seed, sigma: 0.12, t0 }).map((b, i) => ({ time: t0 + i * step, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.q, buy: b.Q }));
const A = ctx.advConfluence;

test('textbook bullish reversal: the long outscores the short by a wide margin, structure / liquidity / zone / displacement / location agree', () => {
  const c = bullScenario(), F = feats(c), t = c.length - 1, L = A(F, t, 1, {}), S = A(F, t, -1, {});
  assert.ok(L.score >= 55, 'long ' + L.summary); assert.ok(S.score < L.score - 20, `short ${S.score} long ${L.score}`);
  for (const k of ['struct', 'liq', 'zone', 'disp', 'loc']) assert.ok(L.fam[k].s >= 0.5, k + ' ' + L.fam[k].s + ' ' + L.fam[k].lines.join('|'));
  assert.ok(L.mand, 'structure + zone + (liquidity or displacement)'); assert.ok(['STANDARD', 'HIGH_CONVICTION'].includes(L.tier), L.tier); assert.ok(!['HIGH_CONVICTION', 'STANDARD'].includes(S.tier), 'the opposite side is not tradable: ' + S.tier);
  assert.ok(L.why.length >= 4 && L.why.every(w => w.lines.length && w.name), 'every agreeing family explains itself');
  assert.ok(/market-structure shift/.test(L.fam.struct.lines.join(' '))); assert.ok(/swept sell-side liquidity/.test(L.fam.liq.lines.join(' ')));
});

test('mirror symmetry: the mirrored (bearish) story gives exactly the mirrored result, family by family', () => {
  const a = bullScenario(), b = mirror(a), Fa = feats(a), Fb = feats(b), t = a.length - 1, ra = A(Fa, t, 1, {}), rb = A(Fb, t, -1, {});
  for (const k of Object.keys(ra.fam)) { assert.equal(ra.fam[k].known, rb.fam[k].known, k); assert.ok(Math.abs(ra.fam[k].s - rb.fam[k].s) < 1e-9, `${k}: ${ra.fam[k].s} vs ${rb.fam[k].s}`); }
  assert.equal(ra.tier, rb.tier); assert.ok(Math.abs(ra.score - rb.score) < 1e-9);
  assert.equal(A(Fa, t, -1, {}).tier, A(Fb, t, 1, {}).tier);
});

test('evidence matters: removing the liquidity sweep lowers the liquidity family and the total score', () => {
  const withSweep = bullScenario(), without = bullScenario({ sweep: false }), t = withSweep.length - 1;
  const a = A(feats(withSweep), t, 1, {}), b = A(feats(without), without.length - 1, 1, {});
  assert.ok(b.fam.liq.s < a.fam.liq.s, `liq ${b.fam.liq.s} < ${a.fam.liq.s}`); assert.ok(b.score < a.score, `score ${b.score} < ${a.score}`);
});

test('a family that could not be measured is never counted: no higher-timeframe data -> htf is unknown and excluded from the average', () => {
  const c = bullScenario(), F = feats(c), t = c.length - 1, r = A(F, t, 1, {});
  assert.equal(r.fam.htf.known, false); assert.ok(!r.known.includes('htf')); assert.equal(r.nKnown, r.known.length);
  const hand = (() => { let s = 0, w = 0; for (const k of r.known) { s += r.fam[k].w * r.fam[k].s; w += r.fam[k].w; } return 100 * s / w; })(); assert.ok(Math.abs(hand - r.score) < 1e-9, 'score = weighted mean over known families only');
  const r2 = A(F, t, 1, { htf: { align: 'ALIGNED', conflict: false, bias: 0.6, txt: '15m ▲ · 1h ▲ · 4h ▲ → higher timeframes agree', notes: [] } });
  assert.equal(r2.fam.htf.known, true); assert.ok(r2.fam.htf.s >= 0.85); assert.ok(r2.score > r.score);
  const r3 = A(F, t, 1, { htf: { align: 'UNKNOWN', conflict: false } }); assert.equal(r3.fam.htf.known, false);
});

test('vetoes: a higher-timeframe conflict, high manipulation risk, or a strong opposing zone each force the VETOED tier regardless of score', () => {
  const c = bullScenario(), F = feats(c), t = c.length - 1;
  const h = A(F, t, 1, { htf: { align: 'CONFLICT', conflict: true, bias: -0.7, txt: '4h ▼ · 1d ▼ → CONFLICT', notes: ['price is at 90% of the daily range'] } });
  assert.equal(h.tier, 'VETOED'); assert.ok(h.veto.some(v => /higher-timeframe/.test(v))); assert.ok(h.against.length >= 1);
  const m = A(F, t, 1, { manip: 60 }); assert.equal(m.tier, 'VETOED'); assert.ok(m.veto.some(v => /manipulation/.test(v)));
  const lowManip = A(F, t, 1, { manip: 10 }), base = A(F, t, 1, {}); assert.ok(lowManip.score < base.score, 'a little manipulation risk lowers the score without vetoing'); assert.notEqual(lowManip.tier, 'VETOED');
});

test('HIGH_CONVICTION is strict: it needs score, six agreeing families, the mandatory trio and a quality zone together — every one of them is necessary', () => {
  /* a controllable stand-in for the feature object so each condition can be switched off on its own */
  const mk = ({ trend = 1, zoneQ = 80, fam = {} } = {}) => {
    const F = { atr: new Array(200).fill(1), C: new Array(200).fill(100), q: {}, trend: new Int8Array(200).fill(trend), opt: { tfSec: 300 }, pd: new Float64Array(200).fill(0.3), hasDelta: true,
      structAt: new Array(200).fill(null), retestAt: new Array(200).fill(null), sweepAt: new Array(200).fill(null), indAt: new Array(200).fill(null), brkAt: new Array(200).fill(null), judas: new Array(200).fill(null), divAt: new Array(200).fill(null),
      zr: new Array(200).fill(null), zxr: new Array(200).fill(null), dsp: new Int8Array(200), dspMag: new Float64Array(200), rv: new Float64Array(200).fill(1), bornAt: new Array(200).fill(null) };
    F.structAt[195] = [{ dir: 1, kind: 'CHoCH', mss: true, init: false }]; F.sweepAt[190] = { dir: 1, kind: 'PDL', n: 2, rej: 0.6, rv: 2, flip: true };
    F.dsp[196] = 1; F.dspMag[196] = 2; F.rv[196] = 2;
    F.zonesAt = () => [{ kind: 'OB', sub: 'REVERSAL_OB', dir: 1, top: 100, bot: 99, ce: 99.5, q: zoneQ, qNow: zoneQ, qf: ['+20 displacement'], pen: 0, touches: 0, fresh: true, ceHit: false, age: 5, dist: 0, inside: true }, { kind: 'FVG', dir: 1, top: 100.2, bot: 99.8, ce: 100, q: 70, qNow: 70, qf: [], pen: 0, touches: 0, fresh: true, ceHit: false, age: 4, dist: 0, inside: true }];
    F.drawAt = () => ({ up: { p: 103, kind: 'PDH', n: 1, rank: 4, dist: 3, score: 1 }, dn: null, vote: 1 });
    F.ictAt = () => ({ kz: 'NY_AM', kzTxt: 'New York AM killzone', sb: 'NY_AM_SB', sbTxt: 'sb', vs: { daily: -1, nyMid: -1, ny830: -1, weekly: -1, monthly: -1 }, ipda: null, judas: null });
    F.fibAt = () => ({ dir: 1, inOte: true });
    F.flowAt = () => ({ hasDelta: true, stack: { dir: 1, n: 3 }, absorb: { dir: 1, age: 1 }, exhaust: null, delta3: 0.8, delta10: 0.3, vp: null, pdvp: null });
    F.quantAt = () => ({ bias: 0.8, mode: 'TRENDING' }); F.regimeAt = () => ({ state: 'TREND_UP', label: 'Trending up', txt: 'x', fit: { trend: 1, reversal: 0.35 } });
    Object.assign(F, fam); return F;
  };
  const htf = { align: 'ALIGNED', conflict: false, bias: 0.8, txt: 'aligned', notes: [] };
  const best = A(mk(), 199, 1, { htf }); assert.equal(best.tier, 'HIGH_CONVICTION', best.summary + ' ' + JSON.stringify(Object.fromEntries(Object.entries(best.fam).map(([k, v]) => [k, +v.s.toFixed(2)]))));
  assert.ok(best.nAgree >= 6 && best.score >= 72 && best.mand && best.bestZone.qNow >= 65);
  /* each condition removed on its own must drop the tier */
  assert.notEqual(A(mk({ zoneQ: 55 }), 199, 1, { htf }).tier, 'HIGH_CONVICTION', 'zone quality below 65');
  const noStruct = mk(); noStruct.structAt = new Array(200).fill(null); noStruct.trend = new Int8Array(200).fill(0); assert.notEqual(A(noStruct, 199, 1, { htf }).tier, 'HIGH_CONVICTION', 'no structure');
  const noLiqDisp = mk(); noLiqDisp.sweepAt = new Array(200).fill(null); noLiqDisp.dsp = new Int8Array(200); noLiqDisp.drawAt = () => null; assert.equal(A(noLiqDisp, 199, 1, { htf }).mand, false, 'neither a liquidity event nor displacement');
  const chop = mk(); chop.regimeAt = () => ({ state: 'CHOP', label: 'Volatile chop', txt: 'x', fit: { trend: 0.2, reversal: 0.3 } }); assert.equal(A(chop, 199, 1, { htf }).tier, 'VETOED', 'volatile chop vetoes');
  const few = mk(); few.flowAt = () => ({ hasDelta: true, stack: { dir: 0, n: 0 }, absorb: null, exhaust: null, delta3: -0.5, delta10: -0.3, vp: null, pdvp: null }); few.ictAt = () => ({ kz: null, sb: null, vs: { daily: 1, nyMid: 1, ny830: 1, weekly: 1, monthly: 1 }, ipda: null, judas: null }); few.quantAt = () => ({ bias: -0.8, mode: 'TRENDING' }); few.fibAt = () => null; few.pd = new Float64Array(200).fill(0.6);
  assert.notEqual(A(few, 199, 1, { htf }).tier, 'HIGH_CONVICTION', 'too few families agree');
  /* a high weighted score reached by only five strong families (the rest weak, higher timeframes unknown) must still not be HIGH_CONVICTION: breadth is required, not just a big average */
  const five = mk(); five.flowAt = () => ({ hasDelta: true, stack: { dir: 0, n: 0 }, absorb: null, exhaust: null, delta3: -0.5, delta10: -0.3, vp: null, pdvp: null }); five.quantAt = () => ({ bias: -0.9, mode: 'TRENDING' }); five.regimeAt = () => ({ state: 'TREND_DOWN', label: 'Trending down', txt: 'x', fit: { trend: 0.05, reversal: 0.05 } });
  five.ictAt = () => ({ kz: null, sb: null, vs: { daily: -1, nyMid: -1, ny830: -1, weekly: -1, monthly: -1 }, ipda: { pos20: 0.2 }, judas: null });
  five.bornAt[196] = [{ kind: 'FVG', dir: 1, q: 80, end: null }]; five.retestAt[197] = [{ dir: 1 }]; five.indAt[198] = { dir: 1, zone: { kind: 'OB', dir: 1 } }; five.zr[199] = [{ dir: 1, first: true }];
  const f5 = A(five, 199, 1, {}); assert.ok(f5.score >= 72 && f5.nAgree === 5 && f5.mand && f5.bestZone.qNow >= 65, 'precondition: ' + f5.summary); assert.notEqual(f5.tier, 'HIGH_CONVICTION', 'five agreeing families are not enough'); assert.equal(f5.tier, 'STANDARD');
  assert.equal(A(mk(), 199, 1, { htf: { align: 'CONFLICT', conflict: true, bias: -1, txt: 'c', notes: [] } }).tier, 'VETOED');
  /* the same evidence for the other direction scores low */
  assert.ok(A(mk(), 199, -1, { htf }).score < best.score - 25);
});

test('an inside-opposing strong zone vetoes; a nearby opposing zone only lowers the zone family', () => {
  const c = bullScenario(), F = feats(c), t = c.length - 1, real0 = F.zonesAt;
  F.zonesAt = (tt, o) => real0(tt, o).concat([{ kind: 'OB', sub: 'REVERSAL_OB', dir: -1, top: F.C[t] + 0.2, bot: F.C[t] - 0.2, ce: F.C[t], q: 85, qNow: 85, qf: [], pen: 0, touches: 0, fresh: true, ceHit: false, age: 5, dist: 0, inside: true }]);
  const r = A(F, t, 1, {}); assert.equal(r.tier, 'VETOED'); assert.ok(r.veto.some(v => /strong opposing/.test(v)));
  F.zonesAt = (tt, o) => real0(tt, o).concat([{ kind: 'OB', dir: -1, top: F.C[t] + 1, bot: F.C[t] + 0.7, ce: F.C[t] + 0.85, q: 70, qNow: 70, qf: [], pen: 0, touches: 0, fresh: true, ceHit: false, age: 5, dist: 0.7, inside: false }]);
  const r2 = A(F, t, 1, {}); assert.notEqual(r2.tier, 'VETOED'); assert.ok(r2.against.some(x => /in the way/.test(x)));
});

test('SMT divergence in our direction adds liquidity evidence; against us it counts against', () => {
  const c = bullScenario(), F = feats(c), t = c.length - 1, base = A(F, t, 1, {});
  const pro = A(F, t, 1, { smt: { dir: 1, kind: 'bullish', txt: 'the coin made a lower low but the reference market did not confirm it' } }), con = A(F, t, 1, { smt: { dir: -1, kind: 'bearish', txt: 'x' } });
  assert.ok(pro.fam.liq.s > base.fam.liq.s); assert.ok(con.fam.liq.s < base.fam.liq.s); assert.ok(con.against.some(x => /SMT/.test(x)));
});

test('random noise almost never earns STANDARD and never HIGH_CONVICTION (4 seeds, thousands of checks, both directions)', () => {
  const tiers = {}; let n = 0;
  for (const seed of [1, 2, 3, 4]) { const F = feats(real(2500, seed)); for (let t = 200; t < F.n; t += 5) for (const d of [1, -1]) { const r = A(F, t, d, {}); if (!r) continue; n++; tiers[r.tier] = (tiers[r.tier] || 0) + 1; assert.ok(r.score >= 0 && r.score <= 100); } }
  assert.equal(tiers.HIGH_CONVICTION || 0, 0, JSON.stringify(tiers)); assert.ok((tiers.STANDARD || 0) / n < 0.02, 'STANDARD share ' + ((tiers.STANDARD || 0) / n).toFixed(4) + ' of ' + n);
});

test('returns null (never a guess) before there is enough history', () => {
  const F = feats(real(400, 5)); assert.equal(A(F, 30, 1, {}), null); assert.ok(A(F, 300, 1, {}));
});

test('causal: the whole confluence result at bar t is identical when later bars are removed', () => {
  const c = real(1800, 12), full = feats(c), strip = r => r && JSON.stringify({ s: r.score, t: r.tier, k: r.known, a: r.agree, v: r.veto, g: r.against, f: Object.fromEntries(Object.entries(r.fam).map(([k, v]) => [k, [v.s, v.known, v.lines]])), z: r.bestZone && [r.bestZone.kind, r.bestZone.top, r.bestZone.bot, r.bestZone.qNow] });
  for (const t0 of [300, 701, 1200, 1555, 1799]) { const part = feats(c.slice(0, t0 + 1)); for (const d of [1, -1]) assert.equal(strip(A(full, t0, d, {})), strip(A(part, t0, d, {})), `confluence @${t0} dir ${d}`); }
  const sc = bullScenario(), Fs = feats(sc), t = sc.length - 1; for (const cut of [t, t - 3, t - 9]) { const P = feats(sc.slice(0, cut + 1)); assert.equal(strip(A(Fs, cut, 1, {})), strip(A(P, cut, 1, {})), 'scenario @' + cut); }
});

test('advPanel: a compact two-sided picture with zones, liquidity pools, ICT context, regime and flow', () => {
  const c = bullScenario(), F = feats(c), t = c.length - 1, p = ctx.advPanel(F, t);
  assert.ok(p.zones.length > 0 && p.zones.every(z => z.top > z.bot && z.label && z.q >= 0)); assert.ok(p.zones.some(z => z.dir > 0) && p.zones.some(z => z.dir < 0), 'both sides are shown');
  for (let i = 1; i < p.zones.length; i++) assert.ok(p.zones[i - 1].q >= p.zones[i].q || p.zones[i - 1].dist <= p.zones[i].dist + 1e-9);
  assert.ok(Array.isArray(p.pools) && p.pools.every(x => x.txt && Number.isFinite(x.dist))); assert.ok(p.ict && p.regime && p.flow && p.quant); assert.equal(ctx.advPanel(feats(real(200, 3)), 20), null);
  assert.doesNotThrow(() => JSON.stringify(p));
});
