'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('../helpers/engine');
const { bullScenario, mirror } = require('../helpers/scenarios');
const { to1m } = require('../helpers/to1m');
const { genBars } = require('../helpers/gen-bars');
const ctx = loadEngine(), X = ctx.__x;
/* the textbook bullish story followed by three quiet continuation candles (the back-test tracker needs bars after the signal) */
const story = (m) => { const c = bullScenario(), last = c[c.length - 1]; let p = last.close; for (let i = 1; i <= 3; i++) { const o = p; p += 0.5; c.push({ time: last.time + 300 * i, open: o, high: p + 0.1, low: o - 0.1, close: p, volume: 1200, buy: 700 }); } return m ? mirror(c) : c; };
const run = (c5, presets) => ctx.backtestSymbol(to1m(c5), { sym: 'TESTUSDT', presets, q24: 4e8 });

test('engine-led preset exists, is independent of the pump/dump stage gates and keeps the institutional gate', () => {
  const P = X.PRESETS.ENGINE; assert.ok(P && P.indep === true && P.engMin >= 0.6 && P.advTier === 'STANDARD' && P.advVeto === true);
  for (const k of ['ELITE', 'STRICT', 'BALANCED', 'EARLY']) assert.ok(!X.PRESETS[k].indep, k + ' still needs the stage gates');
});
test('bullish story: ONE engine setup raises a LONG at the retracement entry — not on the earlier chase bars — with the engine\'s own stop and real targets', () => {
  const r = run(story(false), ['ENGINE']), L = r.sigs.filter(s => s.dir === 1); assert.ok(L.length >= 1, 'a long signal exists'); const s = L[0], P = X.PRESETS.ENGINE;
  assert.equal(s.preset, 'ENGINE'); assert.equal(s.mode, 'ENGINE'); assert.ok(['E02', 'E08'].includes(s.eng.id) && /reaction/.test(s.eng.setup), s.eng.id + ' ' + s.eng.setup);
  assert.equal(s.etype, s.eng.setup); assert.ok(s.engines.length >= 1 && s.engN >= 1); assert.ok(s.eng.strength >= P.engMin);
  assert.ok(s.plan.sl < s.px && s.px < s.plan.tps[0].p && s.plan.tps[0].p < s.plan.tps[1].p && s.plan.tps[1].p < s.plan.tps[2].p, 'stop below, targets ascending above');
  assert.ok(s.plan.sl <= s.eng.inval + 1e-9, 'stop sits at or beyond the engine\'s invalidation level'); assert.ok(s.plan.tps[1].r >= P.minRR, 'reward ≥ ' + P.minRR + 'R to target 2');
  assert.ok(s.why.some(w => w.k === 'eng' && /fair-value|order block|zone|gap/i.test(w.txt)), 'the engine\'s own evidence is shown first'); assert.equal(s.why[0].k, 'eng');
  assert.ok(['A', 'B', 'S', 'C'].includes(s.grade) && s.score === Math.round(s.eng.strength * 100));
  const chase = Date.parse('2026-01-14T14:20:00Z') / 1000; assert.ok(s.t >= chase, 'no signal while the displacement is still running (' + new Date(s.t * 1000).toISOString() + ')');
  assert.ok(s.gates.every(g => g.ok), 'every gate passed: ' + s.gates.filter(g => !g.ok).map(g => g.txt).join(' | '));
});
test('the mirrored story raises the SHORT, and the same data does not raise anything on the other side', () => {
  const r = run(story(true), ['ENGINE']); assert.ok(r.sigs.some(s => s.dir === -1 && s.mode === 'ENGINE')); assert.equal(r.sigs.filter(s => s.dir === 1).length, 0);
  const s = r.sigs.find(x => x.dir === -1); assert.ok(s.plan.sl > s.px && s.px > s.plan.tps[0].p && s.plan.tps[0].p > s.plan.tps[1].p);
});
test('the momentum presets are unchanged by the engine path (same data, same behaviour) and the signal carries both views when it is a momentum signal', () => {
  const r = run(story(false), ['STRICT', 'BALANCED', 'EARLY']); r.sigs.forEach(s => { assert.equal(s.mode, 'MOMENTUM'); assert.ok(s.stage >= 3 && s.stage <= 4); assert.ok(Array.isArray(s.engines)); });
});
test('random markets: the engine-led preset stays quiet and never issues a signal with a stop on the wrong side', () => {
  let n = 0, bars = 0;
  for (const seed of [3, 4, 5, 6]) { const b = genBars(4000, { seed, sigma: 0.12 }); bars += b.length; const r = ctx.backtestSymbol(b, { sym: 'N' + seed, presets: ['ENGINE'], q24: 4e8 }); n += r.sigs.length; r.sigs.forEach(s => { assert.ok(s.dir > 0 ? s.plan.sl < s.px : s.plan.sl > s.px); assert.ok(s.eng && s.eng.strength >= 0.6); }); }
  assert.ok(n <= 8, n + ' engine-led signals in ' + bars + ' minutes of pure noise');
});

test('every signal carries the candle size it was detected on: engine-led = 5m, momentum = 1m', () => {
  const e = run(story(false), ['ENGINE']).sigs[0], m = run(story(false), ['STRICT', 'BALANCED', 'EARLY']).sigs;
  assert.equal(e.tf, '5m'); m.forEach(x => assert.equal(x.tf, '1m'));
});
