/* Signal lifecycle.
   The engine's tracker knows three trade states (PENDING → OPEN → CLOSED) plus which targets were hit and why a trade closed.
   This module maps that onto the lifecycle required by the specification and records every change as a transition.

     DETECTED       an early-watch alert (stage 2-4) was raised for the same coin and side before the signal — it is NOT a signal
     VALIDATED      the signal passed every gate (stage, preset, duplicate/conflict/cooldown, higher-timeframe)
     ACTIVE         the signal is published and waiting for the tracker's simulated fill (the next 1-minute candle's open)
                    (VALIDATED and ACTIVE are recorded at the same instant: the engine validates and publishes atomically)
     ENTRY_REACHED  the simulated entry was filled
     TP1_HIT / TP2_HIT / TP3_HIT   targets reached (TP3_HIT = all targets, the trade is complete)
     STOP_LOSS_HIT  stopped out before any target
     INVALIDATED    price had already passed the stop or target 1 when the entry would have been filled — the setup never became a trade
     EXPIRED        closed by the time limit without any target, or the service was offline too long to reconstruct the outcome
     CANCELLED      cancelled by an operator before the entry was filled

   A trade that is stopped at break-even / by the trailing stop after TP1 or TP2 keeps its highest-target state (TP1_HIT / TP2_HIT)
   and carries closed=true with a closeReason, so that "reached TP1" is never rewritten into "stopped out". */

const LC_STATES = ['DETECTED', 'VALIDATED', 'ACTIVE', 'ENTRY_REACHED', 'TP1_HIT', 'TP2_HIT', 'TP3_HIT', 'STOP_LOSS_HIT', 'INVALIDATED', 'EXPIRED', 'CANCELLED'];
/* the 12 lifecycle states of the specification, as shown to the user.  DEVELOPING and DETECTED are radar states (an alert, not a signal); the others describe a published signal. */
const LC_LABEL = { DEVELOPING: 'Developing Setup', DETECTED: 'Early Warning', VALIDATED: 'Confirmed', ACTIVE: 'Active · awaiting entry', ENTRY_REACHED: 'Entry Triggered',
  TP1_HIT: 'Target 1 Reached', TP2_HIT: 'Target 2 Reached', TP3_HIT: 'Completed · all targets', STOP_LOSS_HIT: 'Stop Loss Reached', INVALIDATED: 'Invalidated', EXPIRED: 'Expired', CANCELLED: 'Cancelled' };
/* a trade that reached a target and was then closed (break-even / trailing stop / time) is "Completed", with what was reached */
function lcText(lc) {
  if (!lc) return ''; if (lc.closed && (lc.status === 'TP1_HIT' || lc.status === 'TP2_HIT')) return 'Completed · ' + LC_LABEL[lc.status].replace(' Reached', '') + ' reached';
  return LC_LABEL[lc.status] || lc.status;
}
const LC_TERMINAL = new Set(['TP3_HIT', 'STOP_LOSS_HIT', 'INVALIDATED', 'EXPIRED', 'CANCELLED']);

function closeCodeOf(tr) {
  if (tr.closeCode) return tr.closeCode;
  /* signals stored before closeCode existed */
  const w = String(tr.exitWhy || '');
  if (tr.outcome === 'MISSED') return 'MISSED_ENTRY';
  if (/all targets/.test(w)) return 'ALL_TARGETS';
  if (/trailing/.test(w)) return 'TRAILING_STOP';
  if (/break-even/.test(w)) return 'BREAKEVEN_STOP';
  if (/time exit/.test(w)) return 'TIME_EXIT';
  return 'STOP_LOSS';
}

/* pure function of the signal's current state */
function lifecycleOf(sig) {
  const tr = sig.trade;
  const hits = tr.hit.reduce((n, h) => n + (h ? 1 : 0), 0);
  if (sig.cancelled) return { status: 'CANCELLED', closed: true, closeReason: 'CANCELLED', hits };
  if (tr.state === 'PENDING') return { status: 'ACTIVE', closed: false, closeReason: null, hits };
  if (tr.state === 'OPEN') return { status: hits >= 2 ? 'TP2_HIT' : hits === 1 ? 'TP1_HIT' : 'ENTRY_REACHED', closed: false, closeReason: null, hits };
  const code = closeCodeOf(tr);
  let status;
  if (code === 'ALL_TARGETS') status = 'TP3_HIT';
  else if (code === 'MISSED_ENTRY') status = 'INVALIDATED';
  else if (code === 'REPLAY_GAP') status = 'EXPIRED';
  else if (hits >= 2) status = 'TP2_HIT';
  else if (hits === 1) status = 'TP1_HIT';
  else if (code === 'TIME_EXIT') status = 'EXPIRED';
  else status = 'STOP_LOSS_HIT';
  return { status, closed: true, closeReason: code, hits };
}

/* the time after which an entered trade is closed by the tracker's time limit (counted from the fill) */
function expiresAt(sig) {
  const tr = sig.trade, base = tr.tOpen || (sig.t + 60);
  return base + (tr.maxBars || 240) * 60;
}

const TRANSITION_NOTE = {
  VALIDATED: 'passed every validation gate',
  ACTIVE: 'published; waiting for the simulated fill at the next 1-minute candle open',
  ENTRY_REACHED: 'simulated entry filled',
  TP1_HIT: 'target 1 reached — stop moved to break-even',
  TP2_HIT: 'target 2 reached — stop trailed to target 1',
  TP3_HIT: 'all targets reached',
  STOP_LOSS_HIT: 'stop loss hit',
  INVALIDATED: 'price had already passed the stop or target 1 at the next open — never entered',
  EXPIRED: 'time limit reached or outcome not reconstructable',
  CANCELLED: 'cancelled by an operator before entry'
};

if(typeof module!=='undefined') module.exports = { LABEL: LC_LABEL, lcText, STATES: LC_STATES, TERMINAL: LC_TERMINAL, lifecycleOf, expiresAt, closeCodeOf, TRANSITION_NOTE };
