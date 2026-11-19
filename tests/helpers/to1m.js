'use strict';
/* turns 5-minute test candles (engine candle format) into 1-minute bars (runtime bar format) whose 5-minute aggregate is EXACTLY the input candle */
function to1m(c5, { volScale = 1000 } = {}) {
  const out = [];
  for (const k of c5) {
    const up = k.close >= k.open, p = i => k.open + (k.close - k.open) * i / 5;
    for (let m = 0; m < 5; m++) {
      const o = p(m), c = p(m + 1); let h = Math.max(o, c), l = Math.min(o, c);
      if (m === (up ? 3 : 1)) h = k.high; if (m === (up ? 1 : 3)) l = k.low;
      if (h < Math.max(o, c)) h = Math.max(o, c); if (l > Math.min(o, c)) l = Math.min(o, c);
      const v = k.volume * volScale / 5, V = k.buy * volScale / 5, px = (o + c) / 2;
      out.push({ t: k.time + m * 60, o, h, l, c, v, q: v * px, V, Q: V * px, n: Math.max(1, Math.round(v * px / 180)) });
    }
  }
  return out;
}
module.exports = { to1m };
