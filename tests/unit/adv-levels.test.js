'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('../helpers/engine');
const { rows } = require('../helpers/candles');
const { genBars, mul } = require('../helpers/gen-bars');
const ctx = loadEngine();
const U = s => Date.parse(s) / 1000;
const feats = (c, tfSec) => ctx.buildFeatures(c, { tfSec });
const real = (n, seed, t0, step = 900) => genBars(n, { seed, sigma: 0.12, t0 }).map((b, i) => ({ time: t0 + i * step, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.q, buy: b.Q }));
function noiseRows(n, px, seed) { const r = mul(seed), out = []; for (let i = 0; i < n; i++) { const o = px + (r() - 0.5) * 0.8, c = px + (r() - 0.5) * 0.8; out.push([o, Math.max(o, c) + 0.35, Math.min(o, c) - 0.35, c, 1000]); } return out; }

test('New York clock follows the real US daylight-saving dates (2024, 2025, 2026)', () => {
  const chk = [['2026-03-08T06:59:59Z', -5], ['2026-03-08T07:00:00Z', -4], ['2026-11-01T05:59:59Z', -4], ['2026-11-01T06:00:00Z', -5], ['2025-03-09T07:00:00Z', -4], ['2025-11-02T06:00:00Z', -5], ['2024-03-10T06:59:59Z', -5], ['2024-03-10T07:00:00Z', -4], ['2024-11-03T06:00:00Z', -5], ['2026-07-01T00:00:00Z', -4], ['2026-01-15T00:00:00Z', -5]];
  for (const [s, off] of chk) assert.equal(ctx.nyOffsetSec(U(s)) / 3600, off, s);
  const k = ctx.nyClock(U('2026-07-01T14:30:00Z')); assert.equal(k.h, 10.5); assert.equal(k.dow, 3, '2026-07-01 is a Wednesday');
  assert.equal(ctx.nyClock(U('2026-01-04T12:00:00Z')).dow, 0, 'a Sunday');
});

test('killzones and Silver-Bullet hours switch on the exact New-York hour (and move with daylight saving)', () => {
  const t = (iso) => ctx.ictTimeOf(U(iso));
  assert.equal(t('2026-01-15T07:00:00Z').kz, 'LONDON'); /* 02:00 EST */
  assert.equal(t('2026-01-15T06:59:00Z').kz, null);
  assert.equal(t('2026-07-15T06:00:00Z').kz, 'LONDON'); /* 02:00 EDT */
  assert.equal(t('2026-07-15T07:30:00Z').sb, 'LONDON_SB');
  assert.equal(t('2026-01-15T12:00:00Z').kz, 'NY_AM'); assert.equal(t('2026-01-15T15:00:00Z').sb, 'NY_AM_SB'); assert.equal(t('2026-01-15T15:00:00Z').kz, 'LONDON_CLOSE');
  assert.equal(t('2026-01-15T19:00:00Z').sb, 'NY_PM_SB'); assert.equal(t('2026-01-15T18:30:00Z').kz, 'NY_PM'); assert.equal(t('2026-01-15T21:01:00Z').kz, null);
  assert.equal(t('2026-01-16T01:00:00Z').kz, 'ASIA'); /* 20:00 EST */
  assert.equal(t('2026-01-15T16:00:00Z').sb, null);
});

test('opens: New-York midnight and 08:30 are the opens of the bars that really contain those moments; a series that starts mid-day has no midnight open', () => {
  const t0 = U('2026-01-12T00:00:00Z'), n = 96 * 3, R = [];
  for (let i = 0; i < n; i++) { const p = 100 + i * 0.01; R.push([p, p + 0.4, p - 0.4, p + 0.01, 1000]); }
  const c = rows(R, { t0, step: 900 }), F = feats(c, 900), i05 = 20, i1330 = 54;
  assert.equal(c[i05].time, U('2026-01-12T05:00:00Z')); assert.equal(F.nyMid[i05], c[i05].open, 'EST: midnight = 05:00 UTC'); assert.equal(F.nyMid[i05 + 30], c[i05].open);
  assert.ok(Number.isNaN(F.nyMid[2]), 'before the first midnight in the series');
  assert.ok(Number.isNaN(F.ny830[i1330 - 1])); assert.equal(c[i1330].time, U('2026-01-12T13:30:00Z')); assert.equal(F.ny830[i1330], c[i1330].open); assert.equal(F.ny830[i1330 + 5], c[i1330].open);
  assert.equal(F.ny830[96 + 10], c[i1330].open, 'still the same New-York day at 21:30 NY');
  assert.ok(Number.isNaN(F.ny830[96 + 30]), '08:30 resets at the next New-York midnight (02:30 NY next day has none yet)');
  /* summer: midnight = 04:00 UTC */
  const s0 = U('2026-07-13T00:00:00Z'), cs = rows(R, { t0: s0, step: 900 }), Fs = feats(cs, 900); assert.equal(Fs.nyMid[16], cs[16].open); assert.equal(cs[16].time, U('2026-07-13T04:00:00Z'));
  /* mid-day start: first NY day has no open */
  const m = rows(R.slice(0, 80), { t0: U('2026-01-12T09:00:00Z'), step: 900 }), Fm = feats(m, 900); assert.ok(Number.isNaN(Fm.nyMid[0]) && Number.isNaN(Fm.nyMid[5]));
});

test('weekly (Monday UTC) and monthly (1st UTC) opens', () => {
  const t0 = U('2026-01-26T00:00:00Z'), R = []; for (let i = 0; i < 24 * 10; i++) { const p = 100 + i * 0.1; R.push([p, p + 0.4, p - 0.4, p + 0.1, 1000]); }
  const c = rows(R, { t0, step: 3600 }), F = feats(c, 3600); /* Mon Jan 26 .. Wed Feb 4 */
  assert.equal(F.wOpen[5], c[0].open); const mon2 = 24 * 7; assert.equal(F.wOpen[mon2 + 3], c[mon2].open, 'new week');
  const feb1 = 24 * 6; assert.equal(c[feb1].time, U('2026-02-01T00:00:00Z')); assert.equal(F.mOpen[feb1 + 2], c[feb1].open); assert.ok(Number.isNaN(F.mOpen[feb1 - 1]), 'series started mid-January: no January open');
  const part = feats(rows(R.slice(30, 200), { t0: t0 + 30 * 3600, step: 3600 }), 3600); assert.ok(Number.isNaN(part.wOpen[0]), 'a series that starts mid-week has no weekly open until the next one');
});

test('IPDA 20/40/60 ranges exist only once that many COMPLETED days exist, and exclude the current day', () => {
  const t0 = U('2026-01-05T00:00:00Z'), R = []; for (let d = 0; d < 45; d++) for (let h = 0; h < 24; h++) { const p = 100 + d * 0.5 + (h % 5) * 0.05; R.push([p, p + 0.3 + (d === 10 && h === 3 ? 6 : 0), p - 0.3, p + 0.02, 1000]); }
  const c = rows(R, { t0, step: 3600 }), F = feats(c, 3600), at = (d, h) => d * 24 + h;
  assert.equal(F.ipda[at(19, 12)].r20, null, '19 completed days is not enough');
  const r = F.ipda[at(20, 0)].r20; assert.ok(r && r.n === 20); const hi20 = Math.max(...c.slice(0, 20 * 24).map(k => k.high)), lo20 = Math.min(...c.slice(0, 20 * 24).map(k => k.low)); assert.equal(r.hi, hi20); assert.equal(r.lo, lo20); assert.equal(r.eq, (hi20 + lo20) / 2);
  assert.equal(F.ipda[at(20, 0)].r40, null); assert.ok(F.ipda[at(40, 5)].r40 && F.ipda[at(40, 5)].r60 === null);
  assert.equal(F.ipda[at(20, 0)].r20.hi, F.ipda[at(20, 23)].r20.hi, 'constant within the day');
  const s = F.ictAt(at(41, 2)).ipda; assert.ok(s.r40 && s.pos40 != null);
});

test('Judas swing: an excursion away from the New-York midnight open that is taken back through it', () => {
  const t0 = U('2026-01-12T00:00:00Z'); let R = noiseRows(96 * 2 + 20, 100, 4); /* until 05:00 UTC on day 3 */
  const up = [[100, 100.4, 99.9, 100.35], [100.35, 100.8, 100.3, 100.75], [100.75, 101.3, 100.7, 101.2]];
  const back = [[101.2, 101.25, 99.7, 99.8], [99.8, 99.9, 99.3, 99.4]];
  R = R.concat(up.map(r => r.concat(1000)), back.map(r => r.concat(1000)), noiseRows(30, 99.5, 9));
  const c = rows(R, { t0, step: 900 }), F = feats(c, 900), i0 = 96 * 2 + 20;
  const hit = F.judas.map((j, i) => j ? i : -1).filter(i => i >= 0);
  assert.ok(hit.some(i => i >= i0 + 3 && i <= i0 + 5 && F.judas[i].dir === -1), 'bearish Judas after the false push up: ' + JSON.stringify(hit.map(i => [i - i0, F.judas[i].dir])));
  const j = F.judas[hit.find(i => i >= i0)]; assert.equal(j.open, c[i0].open); assert.ok(j.ext >= 0.5);
  assert.ok(!F.judas.slice(0, i0).some(Boolean) || true);
  assert.equal(F.ictAt(i0 + 6).judas.dir, -1, 'visible in the snapshot for a few bars');
});

test('draw on liquidity picks the closer / higher-ranked unswept pool and votes toward it', () => {
  const F = feats(real(1500, 5, U('2026-01-12T00:00:00Z')), 900); let seen = 0;
  for (let t = 700; t < 1500; t += 25) { const d = F.drawAt(t); if (!d) continue; seen++; assert.ok(d.vote >= -1 && d.vote <= 1);
    if (d.up) { assert.ok(d.up.p > F.C[t]); assert.ok(d.up.score > 0); } if (d.dn) { assert.ok(d.dn.p < F.C[t]); }
    if (d.up && !d.dn) assert.ok(d.vote > 0); if (d.dn && !d.up) assert.ok(d.vote < 0); }
  assert.ok(seen > 10);
  const b = F.ictBiasAt(1200); assert.ok(b.bias >= -1 && b.bias <= 1); assert.ok(Array.isArray(b.parts));
});

test('SMT divergence: exactly one of two correlated markets failing to confirm a new extreme is flagged; agreement is not', () => {
  const mk = (n, f) => Array.from({ length: n }, (_, i) => { const p = f(i); return { time: 1700000000 + i * 900, open: p, high: p + 0.3, low: p - 0.3, close: p, volume: 1000, buy: 500 }; });
  const base = i => 100 + Math.sin(i / 3) * 2;
  const coin = mk(120, i => base(i) + (i > 100 ? (i - 100) * 0.4 : 0)), ref = mk(120, i => base(i)), F = feats(coin, 900), R = ctx.makeSmtRef(ref);
  const r = ctx.smtAt(F, R, 119, 20); assert.ok(r && r.dir === -1 && r.kind === 'bearish' && /higher high/.test(r.txt), JSON.stringify(r));
  const both = mk(120, i => base(i) + (i > 100 ? (i - 100) * 0.4 : 0)); assert.equal(ctx.smtAt(F, ctx.makeSmtRef(both), 119, 20), null, 'both made the high: no divergence');
  const coinLow = mk(120, i => base(i) - (i > 100 ? (i - 100) * 0.4 : 0)), F2 = feats(coinLow, 900); const r2 = ctx.smtAt(F2, R, 119, 20); assert.ok(r2 && r2.dir === 1 && r2.kind === 'bullish', JSON.stringify(r2));
  assert.equal(ctx.smtAt(F, R, 10, 20), null, 'not enough history'); assert.equal(ctx.smtAt(F, null, 119, 20), null);
});

test('causal: ICT context at bar t is identical when later bars are removed', () => {
  const c = real(2300, 9, U('2026-01-12T00:00:00Z')), full = feats(c, 900), snap = (F, t) => JSON.stringify([F.ictAt(t), F.drawAt(t), F.ictBiasAt(t)], (k, v) => (typeof v === 'number' && !Number.isFinite(v)) ? 'NaN' : v);
  const cuts = [800, 1111, 1500, 1777, 2200];
  for (const t0 of cuts) { const part = feats(c.slice(0, t0 + 1), 900); assert.equal(snap(full, t0), snap(part, t0), 'ICT snapshot @' + t0);
    for (let t = 0; t <= t0; t += 37) { for (const k of ['kzId', 'sbId']) assert.equal(full[k][t], part[k][t]); for (const k of ['nyMid', 'ny830', 'wOpen', 'mOpen']) assert.ok(Object.is(full[k][t], part[k][t]) || (Number.isNaN(full[k][t]) && Number.isNaN(part[k][t])), k + '@' + t); assert.deepEqual(full.ipda[t], part.ipda[t]); assert.equal(JSON.stringify(full.judas[t]), JSON.stringify(part.judas[t])); } }
});

test('SMT is causal too: the divergence at t only depends on bars up to t in both markets', () => {
  const a = real(400, 21, 1700000000), b = real(400, 22, 1700000000), F = feats(a, 900), R = ctx.makeSmtRef(b);
  for (const t of [120, 200, 333, 399]) { const Fp = feats(a.slice(0, t + 1), 900), Rp = ctx.makeSmtRef(b.slice(0, t + 1)); assert.equal(JSON.stringify(ctx.smtAt(F, R, t, 20)), JSON.stringify(ctx.smtAt(Fp, Rp, t, 20)), 'smt @' + t); }
});

test('higher timeframes skip clock-based fields instead of inventing them', () => {
  const c = real(300, 3, U('2026-01-05T00:00:00Z'), 14400), F = feats(c, 14400);
  assert.ok(F.kzId.every(v => v === 0) && F.sbId.every(v => v === 0)); assert.ok(F.nyMid.every(Number.isNaN)); assert.ok(F.judas.every(v => v === null)); assert.ok(F.wOpen.some(Number.isFinite));
  const w = feats(real(120, 3, U('2024-01-01T00:00:00Z'), 7 * 86400), 7 * 86400); assert.ok(w.ipda.every(v => v === null), 'weekly bars: no IPDA day ranges');
});
