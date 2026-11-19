'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('../helpers/engine');
const { rows, walk, fromCloses } = require('../helpers/candles');
const { bullScenario, mirror } = require('../helpers/scenarios');
const ctx = loadEngine(), X = ctx.__x;
const feats = (c, tfSec = 300) => ctx.buildFeatures(c, { tfSec });
const scan = (F, t, o) => ctx.engineScan(F, t, o || {});
const find = (hits, id, setup) => hits.find(h => h.id === id && (!setup || h.setup === setup));
const sig = h => h.map(x => [x.id, x.setup, x.dir, x.strength, +x.inval.toFixed(9)].join('|')).sort().join(';');

test('registry: 50 unique engines E01..E50 with honest kinds and statuses', () => {
  const D = X.ENGINE_DEFS; assert.equal(D.length, 50);
  D.forEach((e, i) => { assert.equal(e.no, i + 1); assert.equal(e.id, 'E' + String(i + 1).padStart(2, '0')); assert.ok(e.name.length > 5 && X.ENG_CL[e.cluster], e.id); assert.ok(['signal', 'live', 'context', 'none'].includes(e.kind), e.id); assert.ok(['full', 'partial', 'none'].includes(e.built), e.id); });
  assert.equal(new Set(D.map(e => e.id)).size, 50);
  D.filter(e => e.kind === 'none').forEach(e => { assert.equal(e.built, 'none', e.id); assert.match(e.note, /NOT BUILT/, e.id); });
  D.filter(e => e.kind === 'signal' || e.kind === 'live').forEach(e => { assert.ok(e.setups.length >= 1, e.id + ' lists its setup types'); assert.notEqual(e.built, 'none', e.id); });
  D.filter(e => e.kind === 'context').forEach(e => assert.equal(e.setups.length, 0, e.id + ' context engines raise no signals'));
  D.filter(e => e.built === 'partial').forEach(e => assert.ok(e.note.length > 15, e.id + ' says what is missing'));
  const c = ctx.engineCoverage(); assert.deepEqual([c.total, c.signal, c.live, c.context, c.none], [50, 20, 7, 17, 6]); assert.equal(c.built + c.none, 50);
  for (const id of ['E27', 'E42', 'E46', 'E23', 'E25', 'E19']) assert.equal(X.ENG_BY[id].built, 'none', id + ' cannot be built honestly here');
});

test('every hit is well formed: engine/setup tagged, side-correct stop and targets, evidence present', () => {
  const sets = [bullScenario(), mirror(bullScenario())]; for (const seed of [21, 22, 23, 24]) sets.push(walk(2500, { seed, sigma: 0.5, drift: (seed % 3 - 1) * 0.02 }));
  let n = 0;
  for (const c of sets) { const F = feats(c); for (let t = 100; t < F.n; t++) for (const h of scan(F, t, { min: 0.5 })) { n++;
    const px = F.C[t], E = X.ENG_BY[h.id]; assert.ok(E && (E.kind === 'signal') && E.setups.length, h.id + ' is a candle signal engine');
    assert.equal(h.cluster, E.cluster); assert.ok(h.dir === 1 || h.dir === -1); assert.ok(h.strength >= 0.5 && h.strength <= 1, 'strength'); assert.ok(h.evidence.length >= 1 && h.evidence.every(s => typeof s === 'string' && s.length > 10));
    assert.ok(h.dir > 0 ? h.inval < px : h.inval > px, h.id + ' ' + h.setup + ' stop on the wrong side'); if (h.tgt) h.tgt.forEach(g => assert.ok(h.dir > 0 ? g > px : g < px, h.id + ' target'));
    if (h.entry) assert.ok(h.entry[0] < h.entry[1]); } }
  assert.ok(n > 300, 'the scan finds something: ' + n);
});

test('causal: hits at bar t are identical when every later bar is removed', () => {
  const sets = [bullScenario(), mirror(bullScenario()), walk(1800, { seed: 31, sigma: 0.5 }), walk(1800, { seed: 32, sigma: 0.5, drift: 0.03 })];
  let compared = 0, nonEmpty = 0;
  for (const c of sets) { const full = feats(c); for (let t = 120; t < c.length; t += (c.length < 300 ? 1 : 23)) { const part = feats(c.slice(0, t + 1)); const a = sig(scan(full, t, { min: 0.5 })), b = sig(scan(part, t, { min: 0.5 })); compared++; if (a) nonEmpty++; assert.equal(a, b, 'bar ' + t + ' of series ' + c.length); } }
  assert.ok(compared > 120 && nonEmpty > 15, compared + ' bars compared, ' + nonEmpty + ' with hits');
});

test('bullish reversal story: the structure shift fires at the break, the zone reaction fires at the entry; the mirror gives the opposite side', () => {
  const c = bullScenario(), F = feats(c), t = F.n - 1;
  const mss = find(scan(F, 141), 'E04', 'Market-structure shift'); assert.ok(mss && mss.dir === 1 && mss.strength >= 0.7, 'MSS ' + JSON.stringify(mss && mss.strength));
  const last = scan(F, t); const z = last.filter(h => (h.id === 'E02' || h.id === 'E08') && h.dir === 1 && /reaction/.test(h.setup)); assert.ok(z.length >= 1 && z[0].strength >= 0.6, 'zone reaction at the entry');
  assert.ok(z[0].entry && z[0].entry[0] < F.C[t] + F.atr[t] && z[0].inval < z[0].entry[0], 'entry zone and a stop beyond its far edge');
  const M = feats(mirror(bullScenario())), m141 = find(scan(M, 141), 'E04', 'Market-structure shift'); assert.ok(m141 && m141.dir === -1 && Math.abs(m141.strength - mss.strength) < 0.08, 'mirror MSS');
  const mz = scan(M, t).filter(h => (h.id === 'E02' || h.id === 'E08') && h.dir === -1 && /reaction/.test(h.setup)); assert.ok(mz.length >= 1, 'mirrored zone reaction');
});

test('quiet random markets almost never produce a strong hit, and almost never one that is also high-conviction', () => {
  let bars = 0, strong = 0, vet = 0;
  for (const seed of [11, 12, 13, 14]) { const F = feats(walk(3000, { seed, sigma: 0.5, drift: (seed % 2) * 0.02 })); for (let t = 120; t < F.n; t++) { bars++; const h = scan(F, t, { min: 0.7 }); if (h.length) strong++; for (const x of h) { const ad = ctx.advConfluence(F, t, x.dir, {}); if (ad && ad.tier === 'HIGH_CONVICTION') vet++; } } }
  assert.ok(strong / bars < 0.015, 'strong hits on noise: ' + (100 * strong / bars).toFixed(2) + '%'); assert.equal(vet, 0, 'no high-conviction signal from pure noise');
});

test('without taker-buy volume the order-flow engine stays silent (no fabricated delta)', () => {
  const c = walk(1500, { seed: 44, sigma: 0.6 }).map(k => { const { buy, ...r } = k; return r; }), F = feats(c); assert.equal(F.hasDelta, false);
  for (let t = 100; t < F.n; t++) assert.equal(scan(F, t, { min: 0.3 }).filter(h => h.id === 'E01').length, 0);
});

test('a failing detector is isolated: the other engines still report', () => {
  const F = feats(bullScenario()); F.vpAt = () => { throw new Error('boom'); }; const h = scan(F, 141); assert.ok(find(h, 'E04'), 'structure engine still reports');
});

test('dependency clusters: agreement is counted per cluster, not per engine', () => {
  const mk = (id, cluster, dir, s) => ({ id, cluster, dir, strength: s, setup: 'x', inval: 1, evidence: ['e'] });
  const hits = [mk('E02', 'SMC', 1, .8), mk('E08', 'SMC', 1, .7), mk('E11', 'SMC', 1, .6), mk('E04', 'STRUCT', 1, .75), mk('E18', 'PROF', 1, .6), mk('E10', 'MOM', -1, .7)];
  const a = ctx.engineAgg(hits, 1); assert.equal(a.n, 3, 'three SMC engines are one piece of evidence'); assert.deepEqual([...a.clusters].sort(), ['PROF', 'SMC', 'STRUCT']); assert.equal(a.top.id, 'E02');
  assert.equal(a.against.length, 1); assert.equal(a.conflict, true); assert.equal(ctx.engineAgg(hits, -1).n, 1); assert.equal(ctx.engineAgg([], 1).n, 0);
});

test('stored summary is plain data (no functions or zone objects) and survives JSON', () => {
  const F = feats(bullScenario()), h = scan(F, F.n - 1); assert.ok(h.length); const s = h.map(ctx.engineSummary), j = JSON.parse(JSON.stringify(s));
  assert.deepEqual(j, JSON.parse(JSON.stringify(j))); s.forEach(x => { assert.ok(x.id && x.setup && x.strength > 0 && Array.isArray(x.evidence) && x.evidence.length <= 3); assert.equal(typeof x.inval, 'number'); });
});

test('live engines: read the order book / derivatives / venues / tape only when present, side-aware', () => {
  assert.equal(ctx.liveEngines(null, 1).length, 0); assert.equal(ctx.liveEngines({}, 1).length, 0);
  const deep = { book: { up: { s: 0.82, txt: 'bids heavy' }, dn: { s: 0.2, txt: 'asks light' }, depth05: 90000, imb: 0.4 }, deriv: { up: { s: 0.8, txt: 'OI rising' }, dn: { s: 0.3, txt: 'x' }, squeeze: 1 }, xex: { up: { s: 0.75, txt: 'venues agree' }, dn: { s: 0.3, txt: 'x' } },
    fp: { count: 120, aggBuyShare: 0.7, largeBuys: 4, largeSells: 1 } };
  const up = ctx.liveEngines(deep, 1), ids = up.map(h => h.id).sort(); assert.equal(ids.join(','), 'E09,E12,E28,E34,E41,E43'); up.forEach(h => { assert.equal(h.dir, 1); assert.equal(h.live, true); assert.ok(h.strength >= 0.5 && h.strength <= 1); });
  assert.equal(ctx.liveEngines(deep, -1).length, 0, 'nothing supports the other side');
  assert.equal(ctx.liveEngines({ fp: { count: 10, aggBuyShare: 0.9, largeBuys: 9, largeSells: 0 } }, 1).length, 0, 'too few trades to say anything');
});

/* ---------- hand-built formations: each engine must fire on its textbook shape, on the right bar, in the right direction ---------- */
const { mul } = require('../helpers/gen-bars');
const rangeRows = (n) => { const R = []; for (let i = 0; i < n; i++) { const m = 102 + 2 * Math.sin(i * 2 * Math.PI / 12), p = 102 + 2 * Math.sin((i - 1) * 2 * Math.PI / 12); R.push([p, Math.max(p, m) + 0.3, Math.min(p, m) - 0.3, m, 1000]); } return R; };

test('Wyckoff: a spring below a tested range low (and the mirror, an upthrust) is reported on the reclaim bar', () => {
  const sp = rangeRows(90); sp.push([100.4, 100.6, 98.6, 100.7, 900]); sp.push([100.7, 101.9, 100.5, 101.8, 1100]);
  const F = feats(rows(sp)), h = find(scan(F, F.n - 1, { min: 0.5 }), 'E11', 'Spring'); assert.ok(h && h.dir === 1 && h.inval < 98.6 && h.tgt && h.tgt[0] > F.C[F.n - 1], 'spring');
  const up = rangeRows(90); up.push([103.6, 105.4, 103.4, 103.3, 900]); up.push([103.3, 103.5, 102.0, 102.1, 1100]);
  const G = feats(rows(up)), u = find(scan(G, G.n - 1, { min: 0.5 }), 'E11', 'Upthrust'); assert.ok(u && u.dir === -1 && u.inval > 105.4, 'upthrust');
  assert.equal(find(scan(F, 60, { min: 0.3 }), 'E11'), undefined, 'inside the plain range nothing fires');
});
test('squeeze release: fires on the breakout bar in the breakout direction, not while still compressed', () => {
  for (const dir of [1, -1]) { const R = []; let p = 100; for (let i = 0; i < 80; i++) { const c = p + Math.sin(i * 0.9) * 1.5; R.push([p, Math.max(p, c) + 0.4, Math.min(p, c) - 0.4, c, 1000]); p = c; }
    for (let i = 0; i < 30; i++) { const c = p + (i % 2 ? 0.05 : -0.05); R.push([p, Math.max(p, c) + 0.06, Math.min(p, c) - 0.06, c, 600]); p = c; }
    R.push([p, dir > 0 ? p + 2.4 : p + 0.05, dir > 0 ? p - 0.05 : p - 2.4, p + dir * 2.2, 2600]);
    const F = feats(rows(R)), t = F.n - 1, h = find(scan(F, t, { min: 0.5 }), 'E31'); assert.ok(h && h.dir === dir && h.strength >= 0.55, 'dir ' + dir);
    assert.equal(find(scan(F, t - 1, { min: 0.3 }), 'E31'), undefined, 'no signal while the squeeze is still on'); }
});
test('harmonic: a Gartley X-A-B-C that completes at the 0.786 zone and turns is reported with targets above the zone', () => {
  const pts = [[0, 100], [20, 120], [40, 107.64], [58, 116], [78, 104.4]], cl = []; for (let k = 0; k < pts.length - 1; k++) { const [i0, p0] = pts[k], [i1, p1] = pts[k + 1]; for (let i = i0; i < i1; i++) cl.push(p0 + (p1 - p0) * (i - i0) / (i1 - i0)); }
  const all = Array.from({ length: 90 }, (_, i) => 100 + Math.sin(i / 3) * 0.8).concat(cl), c = fromCloses(all, { wick: 0.5 }), R = c.map(k => [k.open, k.high, k.low, k.close, k.volume]), last = all[all.length - 1]; R.push([last, last + 1.6, last - 0.8, last + 1.4, 1300]);
  const F = feats(rows(R)), t = F.n - 1, h = scan(F, t, { min: 0.5 }).find(x => x.id === 'E24'); assert.ok(h && h.dir === 1 && /Gartley/.test(h.setup), h && h.setup); assert.ok(h.tgt.length === 2 && h.tgt[0] > F.C[t] && h.tgt[1] > h.tgt[0] && h.inval < F.L[t]);
  assert.equal(scan(F, t - 8, { min: 0.3 }).filter(x => x.id === 'E24').length, 0, 'not before price reaches the zone');
});
test('trend pullback: a tag of the 20-bar average inside a strong trend, closing back with momentum, is reported with the trend', () => {
  const r = mul(3), g = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const cl = []; let p = 100; for (let i = 0; i < 150; i++) { p += 0.45 + 0.25 * g(); cl.push(p); } for (let i = 0; i < 5; i++) { p -= 0.9; cl.push(p); } p += 1.0; cl.push(p); p += 0.8; cl.push(p);
  const F = feats(fromCloses(cl, { wick: 0.3 })), h = find(scan(F, F.n - 1, { min: 0.5 }), 'E32'); assert.ok(h && h.dir === 1, 'long pullback'); assert.ok(h.inval < Math.min(...F.L.slice(F.n - 7, F.n - 1)));
});
test('order flow engine logic: absorption needs a location, exhaustion needs a swept extreme, stacks need the trend; all need real delta', () => {
  const F = feats(walk(420, { seed: 5, sigma: 0.4 })), t = 300, a = F.atr[t], mk = (dir) => ({ i: t - 2, dir, kind: 'PDL', n: 1, rej: 0.5, rv: 1.5, ex: 0.5, cb: 0.5, ext: F.L[t] - 0.1, lvl: F.L[t] + 0.2, flip: true });
  F.absorb[t] = 1; F.rv[t] = 2.8; assert.equal(find(scan(F, t, { min: 0.3 }), 'E01', 'Absorption reversal'), undefined, 'absorption in the middle of nowhere is not a signal');
  F.sweepAt[t - 2] = mk(1); const h = find(scan(F, t, { min: 0.3 }), 'E01', 'Absorption reversal'); assert.ok(h && h.dir === 1 && h.strength >= 0.55 && h.inval < F.C[t]);
  F.absorb[t] = 0; F.exh[t] = -1; F.sweepAt[t - 2] = mk(-1); F.sweepAt[t - 2].ext = F.H[t] + 0.1; F.sweepAt[t - 2].lvl = F.H[t] - 0.2; F.C[t] = F.O[t] - 0.3 * a; F.rv[t] = 0.5;
  const e = find(scan(F, t, { min: 0.3 }), 'E01', 'Exhaustion reversal'); assert.ok(e && e.dir === -1, 'exhaustion with a rejected sweep');
  F.exh[t] = 0; F.sweepAt[t - 2] = null; F.stk[t] = 4; F.trend[t] = 1; F.rv[t] = 1.5; const s = find(scan(F, t, { min: 0.3 }), 'E01', 'Stacked-imbalance continuation'); assert.ok(s && s.dir === 1);
  F.trend[t] = -1; assert.equal(find(scan(F, t, { min: 0.3 }), 'E01', 'Stacked-imbalance continuation'), undefined, 'a stack against the swing trend is not a continuation');
});
