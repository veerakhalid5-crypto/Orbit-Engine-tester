/* ================================================================
   RENDERING — radar · opportunities · signals · markets · system
   ================================================================ */
const STG_UP=['','EARLY WATCH','PRE-PUMP','INITIATION','CONFIRMED','EXHAUSTION'], STG_DN=['','EARLY WATCH','PRE-DUMP','DUMP START','CONFIRMED','CAPITULATION'];
function chip(stage,L,label){ return stage?'<span class="chip '+(L?'s':'d')+stage+'">'+(L?STG_UP:STG_DN)[stage]+'</span>':'<span class="chip s0">—</span>'; }
function tierTxt(t){ return ({DEEP:'deep',GOOD:'good',THIN:'thin',MICRO:'micro'})[t]||''; }
function flagsOf(r){ const o=[]; if(r.isNew||(r.ageDays!=null&&r.ageDays<14)) o.push('<span class="chip s2">NEW'+(r.ageDays!=null?' '+Math.max(0,Math.floor(r.ageDays))+'d':'')+'</span>'); if(r.stale) o.push('<span class="chip d3">STALE</span>'); if(r.ev&&r.ev.M.tier==='MICRO') o.push('<span class="chip d2">MICRO</span>'); if(r.ev&&r.ev.man.risk>=45) o.push('<span class="chip d3">MANIP '+Math.round(r.ev.man.risk)+'</span>'); else if(r.ev&&r.ev.man.risk>=20) o.push('<span class="chip d2">CAUTION</span>'); if(r.venue==='S') o.push('<span class="chip s1">SPOT</span>'); return o.join(' '); }
function sideOf(r){ return UI.dir==='L'?r.ev.up:r.ev.dn; }
function setHTML(id,h){ const e=$(id); if(e&&e.__h!==h){ e.innerHTML=h; e.__h=h; } }
function recs(){ return [...MK.syms.values()]; }

/* ---------------- RADAR ---------------- */
function renderMood(){
  const m=MKT, f=MK.macro||{}, btc=MK.syms.get('BTCUSDT');
  const mood=m.mood, lab=mood==null?'—':mood>.35?'RISK-ON':mood>.12?'LEANING BULLISH':mood<-.35?'RISK-OFF':mood<-.12?'LEANING BEARISH':'NEUTRAL';
  const pos=mood==null?50:(mood+1)/2*100;
  let h='<div class="metric"><label>Market mood (derived)</label><b class="'+(mood>.12?'up':mood<-.12?'dn':'')+'">'+lab+'</b><div class="gauge"><i style="left:calc('+pos.toFixed(0)+'% - 2px)"></i></div><small>'+(m.breadth15!=null?Math.round(m.breadth15*100)+'% of liquid coins up in 15 min · ':'')+(m.breadth24!=null?Math.round(m.breadth24*100)+'% up on 24h':'waiting for data')+'</small></div>';
  h+='<div class="metric"><label>Bitcoin</label><b>'+(btc&&btc.last?pf(btc.last):'—')+'</b><small>15 min '+(m.btc15!=null?'<span class="'+(m.btc15>=0?'up':'dn')+'">'+pc(m.btc15)+'</span>':'–')+' · 60 min '+(m.btc60!=null?'<span class="'+(m.btc60>=0?'up':'dn')+'">'+pc(m.btc60)+'</span>':'–')+' · 24h '+(btc?pc(btc.chg24):'–')+'</small></div>';
  h+='<div class="metric"><label>Sentiment feeds</label><b>'+(f.fng?f.fng.v+' <span style="font-size:12px" class="mut">'+esc(f.fng.label)+'</span>':'<span class="mut">N/A</span>')+'</b><small>Fear &amp; Greed (alternative.me) · BTC dominance '+(f.dom!=null?f.dom.toFixed(1)+'%':'N/A')+(f.capChg!=null?' · total cap 24h '+pc(f.capChg,1):'')+'</small></div>';
  h+='<div class="metric"><label>Engine snapshot</label><b><span class="up">'+m.up3+'</span> <span class="mut" style="font-size:12px">pumping</span> · <span class="dn">'+m.dn3+'</span> <span class="mut" style="font-size:12px">dumping</span></b><small>'+m.up2+' pre-pump · '+m.dn2+' pre-dump · '+m.ex+' exhausted · '+m.n+' coins analysed</small></div>';
  setHTML('mood',h);
}
function renderLive(){
  const list=UI.live==='live'?[...LIVE.values()]:LIVEHIST.slice(0,120);
  const f=list.filter(x=>UI.pd==='all'||x.dir===UI.pd).sort((a,b)=>UI.live==='live'?b.amp-a.amp:b.t-a.t).slice(0,60);
  $('liveSub').textContent=(UI.live==='live'?f.length+' live':'history '+LIVEHIST.length)+' · threshold '+SET.sens+'% · '+(MK.counts?MK.counts.perp+' perpetuals streamed live':'');
  if(!f.length){ setHTML('liveCards','<div class="empty" style="grid-column:1/-1">'+(UI.live==='live'?'No coin is moving '+SET.sens+'%+ inside its current 1-minute candle right now.<br><span class="mut">Lower the sensitivity to see smaller moves. '+(MK.wsOK?'Stream is live.':'Waiting for the live stream…')+'</span>':'No history yet — triggers are listed here once they fade.')+'</div>'); return; }
  setHTML('liveCards',f.map(x=>{ const r=MK.syms.get(x.sym); if(!r) return ''; const P=x.dir==='P', v=verdictOf(r,P);
    return '<div class="lcard '+x.dir+'" data-sym="'+x.sym+'"><div class="t"><b>'+esc(symName(r))+'</b><span class="chip '+(P?'long':'short')+'">'+(P?'PUMP':'DUMP')+' '+pc(x.ret,2)+'</span><span class="mut mono" style="margin-left:auto">'+hhmm(x.m*60)+'</span></div>'+
      '<div class="ohlc"><span>OPEN<b>'+pf(x.o)+'</b></span><span>HIGH<b>'+pf(x.h)+'</b></span><span>LOW<b>'+pf(x.l)+'</b></span><span>CLOSE<b>'+pf(x.c)+'</b></span><span>AMPLITUDE<b>'+x.amp.toFixed(2)+'%</b></span><span>24H VOL<b>'+money(r.q24)+'</b></span></div>'+
      '<div style="margin-top:8px;font-size:12px"><b class="'+v.c+'">'+v.k+'</b> <span class="mut">'+esc(v.t)+'</span></div></div>'; }).join(''));
}
function pick(fn,n){ return recs().filter(r=>r.ev&&r.hist&&!r.stale).map(r=>({r,v:fn(r)})).filter(x=>x.v!=null&&x.v!==false).sort((a,b)=>b.v-a.v).slice(0,n||3); }
function qItem(x,txt){ const r=x.r; return '<div class="it" data-sym="'+r.sym+'"><span><b>'+esc(symName(r))+'</b> <span class="mut">'+(r.venue==='S'?'spot':'perp')+'</span></span><span>'+txt+'</span></div>'; }
function renderNine(){
  const Qs=[
    ['1 · Unusual buying volume right now',pick(r=>{ const e=r.ev; return e.M.rv5>=3&&e.M.up.bs5>=.57&&e.M.up.ret15<8?e.M.rv5:null; }),x=>qItem(x,'×'+x.v.toFixed(1)+' vol · '+Math.round(x.r.ev.M.up.bs5*100)+'% buys')],
    ['2 · Early accumulation (price not moved yet)',pick(r=>{ const e=r.ev; return e.up.stage>=1&&e.up.stage<=2&&e.up.fam.accum.s>=.45&&e.M.up.z15<1.5?e.up.score:null; }),x=>qItem(x,x.r.ev.up.label+' · '+Math.round(x.v))],
    ['3 · Buying pressure rising, not pumped yet',pick(r=>{ const e=r.ev; return e.M.up.dN5>=.8&&e.M.up.ret15<1&&e.up.stage<=2?e.M.up.dN5:null; }),x=>qItem(x,'net flow +'+x.v.toFixed(1)+' · '+pc(x.r.ev.M.up.ret15,1))],
    ['4 · Approaching a breakout',pick(r=>{ const e=r.ev; return e.M.up.dist>=0&&e.M.up.dist<=.8&&e.M.rv5>=1.5&&e.up.score>=40&&e.up.stage<=2?(1-e.M.up.dist)*e.up.score:null; }),x=>qItem(x,x.r.ev.M.up.dist.toFixed(2)+'% below 60m high · ×'+x.r.ev.M.rv5.toFixed(1))],
    ['5 · Highest pump probability (evidence, early-weighted)',pick(r=>r.ev.up.opp>=30?r.ev.up.opp:null),x=>qItem(x,chipTxt(x.r.ev.up.stage,true)+' · '+Math.round(x.r.ev.up.score))],
    ['6 · Already pumping',pick(r=>r.ev.up.stage>=3&&r.ev.up.stage<=4?r.ev.up.score:null),x=>qItem(x,pc(x.r.ev.M.up.ret15,1)+' 15m · '+Math.round(x.v))],
    ['7 · Showing exhaustion',pick(r=>r.ev.up.stage===5?r.ev.M.up.ret60:null),x=>qItem(x,pc(x.v,1)+' 60m · '+esc(x.r.ev.up.label))],
    ['8 · Sudden dump risk',pick(r=>{ const e=r.ev; return (e.dn.stage>=2&&e.dn.stage<=4)||e.up.label==='High Dump Risk'||e.up.label==='Possible Distribution'?Math.max(e.dn.score,e.man.risk):null; }),x=>qItem(x,esc(x.r.ev.dn.stage>=2?x.r.ev.dn.label:x.r.ev.up.label))],
    ['9 · Best risk-to-reward right now',null,null]
  ];
  let h='';
  Qs.forEach(q=>{ h+='<div class="qa"><h4>'+q[0]+'</h4>'; if(q[1]){ h+=q[1].length?q[1].map(x=>q[2](x)).join(''):'<div class="note">Nothing matches right now.</div>'; }
    else{ const act=REG.sigs.filter(s=>s.trade.state!=='CLOSED').sort((a,b)=>b.plan.tps[1].r-a.plan.tps[1].r).slice(0,3);
      h+=act.length?act.map(s=>{ const r=MK.syms.get(s.sym)||{sym:s.sym,base:s.sym}; return qItem({r},(s.dir>0?'LONG':'SHORT')+' · R:R '+s.plan.tps[1].r.toFixed(1)); }).join(''):'<div class="note"><b>No confirmed setup</b> — nothing currently passes every gate.</div>'; }
    h+='</div>'; });
  setHTML('nine',h);
}
function chipTxt(stage,L){ return (L?STG_UP:STG_DN)[stage]||'—'; }

/* ---------------- OPPORTUNITIES ---------------- */
function renderOpps(){
  const L=UI.dir==='L', q=UI.q.trim().toUpperCase();
  let list=recs().filter(r=>r.ev&&r.hist);
  list=list.filter(r=>{ const s=sideOf(r); if(UI.stage===1&&s.stage<1) return false; if(UI.stage===2&&s.stage<2) return false; if(UI.stage===3&&(s.stage<3||s.stage>4)) return false; if(UI.stage===5&&s.stage!==5) return false;
    if(UI.venue&&r.venue!==UI.venue) return false; if(UI.tier==='GOOD'&&!(r.ev.M.tier==='DEEP'||r.ev.M.tier==='GOOD')) return false; if(UI.tier==='THIN'&&r.ev.M.tier==='MICRO') return false;
    if(q&&r.sym.indexOf(q)<0) return false; return true; });
  list.sort((a,b)=>UI.stage===5?sideOf(b).score-sideOf(a).score:sideOf(b).opp-sideOf(a).opp);
  $('oppTitle').textContent=L?'STRONGEST EMERGING PUMP OPPORTUNITIES':'STRONGEST EMERGING DUMP / SHORT OPPORTUNITIES';
  $('oppSub').textContent=list.length+' coins · ranked by evidence, early stages first';
  let h='<div class="row hd"><span>COIN</span><span>STAGE</span><span>EVIDENCE</span><span>15M</span><span class="hide-m">RVOL</span><span class="hide-m">'+(L?'BUYS':'SELLS')+'</span><span class="hide-m">NOTES</span></div>';
  if(!list.length) h+='<div class="empty"><b>Nothing at this stage right now.</b><br>That is information too — the engine only lists coins whose volume, flow and structure show real evidence.</div>';
  list.slice(0,100).forEach(r=>{ const s=sideOf(r), S=L?r.ev.M.up:r.ev.M.dn;
    h+='<div class="row" data-sym="'+r.sym+'"><span class="sym"><b>'+esc(symName(r))+'</b><small>'+pf(r.last||r.bars[r.bars.length-1].c)+' · '+tierTxt(r.ev.M.tier)+'</small></span><span>'+chip(s.stage,L)+'<small>'+esc(s.label||'')+'</small></span>'+
      '<span><b class="mono">'+Math.round(s.score)+'</b><div class="bar '+(L?'':'dnb')+'"><i style="width:'+Math.round(s.score)+'%"></i></div></span><span class="mono '+(S.ret15>=0?'up':'dn')+'">'+pc(L?r.ev.M.ret15:r.ev.M.ret15,1)+'</span><span class="mono hide-m">×'+r.ev.M.rv5.toFixed(1)+'</span><span class="mono hide-m">'+Math.round(S.bs5*100)+'%</span><span class="hide-m">'+flagsOf(r)+'</span></div>'; });
  setHTML('oppList',h);
  const n3=recs().filter(r=>r.ev&&r.ev.up.stage>=3&&r.ev.up.stage<=4||r.ev&&r.ev.dn.stage>=3&&r.ev.dn.stage<=4).length, b=$('bdOpps'); b.hidden=!n3; b.textContent=n3;
}

/* ---------------- SIGNALS ---------------- */
function liveR(s,r){ const t=s.trade; if(t.state!=='OPEN'||!r||!r.last) return null; return (r.last-t.entry)*s.dir/t.risk; }
const GRADE_RANK={S:3,A:2,B:1,C:0,T:0};
const qtyTxt=q=>!(q>0)?'–':q>=100?q.toFixed(1):q>=1?q.toFixed(3):q.toPrecision(3);
/* the active signals after the user's filters (the cards on screen are exactly this list) */
function sigList(){
  let a=REG.sigs.filter(s=>s.trade.state!=='CLOSED'); const q=UI.fq.trim().toUpperCase();
  if(q) a=a.filter(s=>s.sym.indexOf(q)>=0); if(UI.fdir) a=a.filter(s=>String(s.dir)===UI.fdir);
  if(UI.fgrade) a=a.filter(s=>s.src==='test'||GRADE_RANK[s.grade]>=GRADE_RANK[UI.fgrade]); if(UI.fhtf) a=a.filter(s=>(s.htfTag||'UNKNOWN')===UI.fhtf); if(UI.fconv) a=a.filter(s=>s.src==='test'||(s.conv&&TIER_RANK[s.conv]>=TIER_RANK[UI.fconv])); if(UI.ftf) a=a.filter(s=>s.src==='test'||(s.tf||'1m')===UI.ftf); if(UI.fvenue) a=a.filter(s=>s.src==='test'||s.venue===UI.fvenue); if(UI.feng) a=a.filter(s=>s.src==='test'||(s.eng&&s.eng.id===UI.feng)||(s.engines||[]).some(e=>e.id===UI.feng));
  return a.sort(UI.fsort==='score'?(x,y)=>y.score-x.score:UI.fsort==='rr'?(x,y)=>y.plan.tps[1].r-x.plan.tps[1].r:(x,y)=>y.t-x.t);
}
const EV_CLS={signal:'entry',entry:'entry',tp1:'tp1',tp2:'tp2',tp3:'tp3',stop:'stop',closed:'closed',reassess:'reassess',suppressed:'suppressed'};
function renderSignals(){
  const all=REG.sigs.filter(s=>s.trade.state!=='CLOSED'), act=sigList(), P=PRESETS[SET.preset], pfo=portfolio(), fa=feedAudit();
  const w=recs().filter(r=>r.ev&&(r.ev.up.stage===2||r.ev.dn.stage===2)).length;
  $('sigSub').textContent=act.length+' shown · '+all.length+' open · preset '+P.name;
  const bd=$('bdSigs'); bd.hidden=!all.length; bd.textContent=all.length;
  let top='';
  if(!RUN.on) top+='<div class="warn bad"><b>Scanner is switched off.</b> Markets are still measured and open signals are still tracked, but no new signals or early alerts are issued until you press the scanner button.</div>';
  if(pfo.breaker) top+='<div class="warn bad"><b>Drawdown breaker (advisory).</b> The live paper account is '+pfo.dd.toFixed(1)+'% below its peak (limit '+SET.ddBreaker+'%). Nothing is blocked automatically — consider pausing and reviewing the Performance tab.</div>';
  if(pfo.n) top+='<div class="warn info"><b>Portfolio (advisory).</b> '+pfo.n+' open live signal'+(pfo.n>1?'s':'')+' · '+pfo.longs+' long / '+pfo.shorts+' short · '+pfo.heat.toFixed(1)+'% of equity at risk if every stop is hit'+(pfo.heatHigh?' — <b class="amb">above your '+SET.maxHeat+'% limit</b>':'')+'.'+(pfo.same>=3?' <b class="amb">'+pfo.same+' positions lean the same way; crypto coins are strongly correlated, so they behave like one larger position.</b>':'')+'</div>';
  if(!all.length) top+='<div class="warn info"><b>No confirmed setup right now.</b> The engine is watching '+MKT.n+' markets; '+w+' are in an early/pre-move stage but none has passed every confirmation gate ('+P.name+' preset: evidence ≥ '+P.minScore+', ≥ '+P.minFams+' independent families, no manipulation flags, logical stop, R:R ≥ '+P.minRR+', higher timeframes not in conflict). Waiting is a valid position.</div>';
  setHTML('sigTop',top);
  setHTML('sigActive',act.length?act.map(sigCard).join(''):'<div class="empty-radar" style="grid-column:1/-1">'+(all.length?'No active signal matches the filters.':'No active signals.')+'</div>');
  UI.cardChk={shown:$$('#sigActive .signal-card').length,expected:act.length};
  /* feed */
  const items=feedItems(40), bad=!fa.ok;
  $('feedSub').textContent=fa.n+' signals recorded · '+fa.active+' active · '+fa.supp+' suppressed';
  setHTML('feedBox','<div class="'+(bad?'warn bad':'note')+'" style="margin-bottom:8px">Feed audit: '+(bad?'<b>⚠ inconsistency</b> — '+[fa.dups.length&&fa.dups.length+' duplicate id(s)',fa.noEvent.length&&fa.noEvent.length+' signal(s) without creation event',fa.noClose.length&&fa.noClose.length+' closed without closing event',fa.dupAct.length&&fa.dupAct.length+' duplicate active signal(s)',fa.conflicts.length&&fa.conflicts.length+' coin(s) with opposite active signals',fa.uiBad&&'cards on screen ≠ signals expected'].filter(Boolean).join(', '):'<b class="up">✔ consistent</b> — unique ids, every signal has its creation and (if closed) closing event, no duplicate or conflicting active signals, cards on screen = filtered active signals')+'</div>'+
    (items.length?'<div class="tw"><table class="t"><tr><th>Time</th><th>Coin</th><th>Side</th><th>Event</th></tr>'+items.map(e=>'<tr><td class="mut">'+dhm(e.t)+'</td><td>'+esc((e.sym||'').replace(/USDT$/,''))+(e.test?' <span class="badge test">TEST</span>':'')+'</td><td class="'+(e.dir>0?'up':'dn')+'">'+(e.dir>0?'LONG':'SHORT')+'</td><td class="'+(e.k==='suppressed'?'amb':e.k==='closed'?'':'')+'">'+esc(e.txt)+'</td></tr>').join('')+'</table></div>':'<div class="note">No signal events yet. Every signal that is issued, filled, reaches a target, moves its stop, is reassessed, closes — or is held back by a gate — appears here once.</div>'));
  /* early-watch alerts */
  const al=REG.alerts.slice().reverse().slice(0,30);
  let wh='<div class="row hd"><span>COIN</span><span>ALERT</span><span>EVIDENCE</span><span>SINCE</span><span class="hide-m">MOVE</span><span class="hide-m">BEST</span><span class="hide-m">RESULT</span></div>';
  if(!al.length) wh+='<div class="empty">No stage alerts recorded yet in this browser.</div>';
  al.forEach(a=>{ const r=MK.syms.get(a.sym), mv=r&&r.last?(a.dir>0?r.last/a.px-1:a.px/r.last-1)*100:null, hit=alertHit(a);
    wh+='<div class="row" data-sym="'+a.sym+'"><span class="sym"><b>'+esc(r?symName(r):a.sym)+'</b><small>'+(a.dir>0?'long side':'short side')+'</small></span><span>'+chip(a.stage,a.dir>0)+'</span><span class="mono">'+Math.round(a.score)+'</span><span class="mono mut">'+ago(nowSec()-a.t)+'</span><span class="mono hide-m '+(mv>=0?'up':'dn')+'">'+(mv==null?'–':pc(mv,1))+'</span><span class="mono hide-m up">'+pc(a.mfe,1)+'</span><span class="hide-m mono '+(hit?'up':'mut')+'">'+(hit?'followed through':a.done?'did not follow':'pending')+'</span></div>'; });
  setHTML('watchList',wh);
  /* history */
  const cl=REG.sigs.filter(s=>s.trade.state==='CLOSED'&&s.trade.outcome!=='MISSED').sort((a,b)=>(b.trade.tClose||0)-(a.trade.tClose||0)).slice(0,60);
  $('histSub').textContent=cl.length+' closed (this browser)';
  setHTML('histTable','<tr><th>Time</th><th>Coin</th><th>Side</th><th>Entry type</th><th>HTF</th><th>Grade</th><th>Evidence</th><th>R</th><th>Result</th><th>MFE</th><th>MAE</th><th>Exit</th></tr>'+(cl.length?cl.map(s=>{ const t=s.trade; return '<tr><td>'+dhm(s.t)+'</td><td>'+esc(symName(MK.syms.get(s.sym)||{base:s.sym}))+(s.src==='test'?' <span class="badge test">TEST</span>':'')+'</td><td class="'+(s.dir>0?'up':'dn')+'">'+(s.dir>0?'LONG':'SHORT')+'</td><td>'+esc(s.etype||'')+'</td><td>'+esc(s.htfTag||'')+'</td><td>'+esc(s.grade||'')+'</td><td>'+Math.round(s.score)+'</td><td class="'+(t.R>=0?'up':'dn')+'">'+(t.R>=0?'+':'')+t.R.toFixed(2)+'</td><td>'+t.outcome+'</td><td>'+t.mfe.toFixed(2)+'R</td><td>'+t.mae.toFixed(2)+'R</td><td class="mut">'+esc(t.exitWhy||'')+'</td></tr>'; }).join(''):'<tr><td colspan="12" class="mut">No closed signals yet. Outcomes appear here after the stop or targets are reached — nothing is shown as a win until it actually is.</td></tr>'));
}
function confText(sig){
  if(sig.src==='test') return '<span class="mut">n/a — test signal</span>';
  const c=confidenceFor(sig.score,calFor());
  if(c.calibrated) return '<b>'+Math.round(c.p*100)+'%</b> <span class="mut">of past signals with evidence '+c.bucket+' reached target 1 before the stop (95% interval '+Math.round(c.lo*100)+'–'+Math.round(c.hi*100)+'%, n='+c.n+', source: '+c.src+')</span>';
  return '<b class="amb">Not calibrated yet</b> <span class="mut">— only '+c.n+' of '+c.need+' needed past outcomes exist for evidence '+c.bucket+'. The '+Math.round(sig.score)+'/100 evidence score ranks how much evidence agrees; it is <u>not</u> a probability. Run the back-test in the Lab to start calibrating.</span>';
}
const htfRow=s=>{ const h=s.htf; const cells=h&&h.cells?h.cells:HTF.show.map(id=>({id,v:null}));
  return '<div class="mtf-row">'+cells.map(c=>'<div class="mtf-cell '+(c.v>0?'u':c.v<0?'d':'')+'">'+c.id+'<small>'+(c.v==null?'n/a':HTF_ARROW(c.v))+'</small></div>').join('')+'</div>'; };
const openKey=(s,n)=>s.id+':'+n, openAttr=(s,n)=>'data-k="'+openKey(s,n)+'"'+(UI.open&&UI.open[openKey(s,n)]?' open':'');
/* the engines that reported a setup (counted per dependency cluster) and the nine-family institutional confluence behind a signal */
function advBlock(s){
  let h=''; const E=s.engines||[], nC=s.engN||E.length;
  if(E.length) h+='<div class="note" style="margin-top:6px"><b>Engines reporting a setup on this side ('+nC+' independent cluster'+(nC===1?'':'s')+'):</b></div><ul class="ev">'+E.map(e=>'<li class="ok"><b>'+esc(e.id)+' · '+esc(e.name)+' — '+esc(e.setup)+'</b> <span class="mut">strength '+Math.round(e.strength*100)+'/100 · '+esc(ENG_CL[e.cluster]||e.cluster)+(e.live?' · live data':'')+'</span>'+((e.evidence||[])[0]?'<br><small>'+esc(e.evidence[0])+'</small>':'')+'</li>').join('')+'</ul><div class="note">Engines in the same cluster read the same underlying event, so they count once. Strength ranks how cleanly a setup is formed — it is not a probability. What each engine\'s setups are really worth is measured in the Engines tab.</div>';
  const a=s.adv;
  if(a&&a.fam){ const keys=Object.keys(a.fam).filter(k=>a.fam[k].known);
    h+='<div class="note" style="margin-top:8px"><b>Institutional confluence: '+esc(tierName(a.tier))+'</b> ('+Math.round(a.score)+'/100 · '+a.nAgree+' of '+a.nKnown+' concept families agree'+(a.regime?' · regime '+esc(a.regime.label):'')+')</div><div class="fam">'+keys.map(k=>{ const f=a.fam[k]; return '<span class="n">'+esc(f.name)+'</span><div class="bar '+(s.dir>0?'':'dnb')+'" style="margin:0"><i style="width:'+Math.round(f.s*100)+'%"></i></div><small>'+esc((f.lines||[])[0]||'')+'</small>'; }).join('')+'</div>'+
      (a.best?'<div class="note">Best zone: '+esc(a.best.label)+' '+pf(a.best.bot)+'–'+pf(a.best.top)+' · quality '+a.best.q+'/100'+(a.best.fresh?' · untested':' · tested '+a.best.touches+'×')+'</div>':'')+
      (a.against&&a.against.length?'<ul class="ev">'+a.against.map(x=>'<li class="no">'+esc(typeof x==='string'?x:(x.txt||x.name||''))+'</li>').join('')+'</ul>':'');
  }
  return h;
}
function sigCard(s){
  const r=MK.syms.get(s.sym)||{sym:s.sym,base:s.sym}, L=s.dir>0, p=s.plan, t=s.trade, lr=liveR(s,r), test=s.src==='test', f=s.facts||{}, sz=sizeOf(s);
  const ex=r.ev&&!test?(L?r.ev.up.stage===5:r.ev.dn.stage===5):false, fresh=UI.arrived[s.id]&&Date.now()-UI.arrived[s.id]<6000, px=r.last||s.px;
  const state=t.state==='PENDING'?'WAITING FOR NEXT CANDLE OPEN':t.state==='OPEN'?'OPEN'+(t.hit[0]?' · TP1 ✔':'')+(t.hit[1]?' TP2 ✔':'')+(t.hit[0]&&!t.hit[1]?' · stop at break-even':''):t.outcome;
  const Rv=t.state==='OPEN'?(lr==null?null:lr+0):t.state==='CLOSED'?t.R:null;
  const tp=p.tps.map((x,i)=>'<div class="level'+(t.hit[i]?' hit':'')+'"><label>TP'+(i+1)+' · '+x.r.toFixed(1)+'R'+(t.hit[i]?' ✔':'')+'</label><b class="up">'+pf(x.p)+'</b></div>').join('');
  const cls=(L?'buy':'sell')+(t.outcome==='WIN'?' win':t.outcome==='LOSS'?' loss':'')+(fresh?' just-arrived':'');
  const why=(s.why||[]).slice(0,3).map(w=>'<li><b>'+esc(w.name)+':</b> '+esc(w.txt)+'</li>').join('');
  const ev=s.events||[];
  return '<div class="signal-card '+cls+'" data-id="'+esc(s.id)+'"><div class="card-header"><span class="nm" data-sym="'+s.sym+'">'+esc(symName(r))+'</span><span class="badge '+(L?'buy':'sell')+'">'+(L?'LONG':'SHORT')+'</span>'+(test?'<span class="badge test">TEST</span>':'<span class="badge etype">'+esc(s.etype||'Signal')+'</span><span class="badge tf" title="candle size the setup was detected on · exchange the price comes from">'+esc(s.tf||'1m')+' · '+(s.venue==='S'?'Binance spot':'Binance F')+'</span><span class="badge tier-'+esc(s.grade||'C')+'" title="evidence grade — a ranking of how much independent evidence agrees, not a probability">GRADE '+esc(s.grade||'C')+'</span>'+(s.mode==='ENGINE'&&s.eng?'<span class="badge eng" title="a setup raised by one engine on its own — see the Engines tab">⚙ '+esc(s.eng.id)+' · '+esc(s.eng.name)+'</span>':'<span class="badge '+(s.stage>=4?'confirmed s4':'prov')+'">'+esc(s.label)+'</span>')+(s.conv?'<span class="badge conv-'+esc(s.conv)+'" title="institutional conviction tier — a rule-based ranking, not a probability">'+esc(tierName(s.conv))+'</span>':''))+'<span class="px">'+pf(px)+'<br>'+ago(nowSec()-s.t)+' ago</span></div>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap">'+(s.regime&&s.regime!=='UNKNOWN'?'<span class="badge regime">'+esc(s.regime.replace('_',' '))+'</span>':'')+(s.sess?'<span class="badge regime">'+esc(s.sess)+'</span>':'')+'<span class="badge htf-'+esc(s.htfTag||'UNKNOWN')+'">HTF '+esc(s.htfTag||'UNKNOWN')+'</span>'+(s.tier?'<span class="badge tier-C">'+esc(tierTxt(s.tier))+' liquidity</span>':'')+'</div>'+
    (test?'':htfRow(s))+
    (ex?'<div class="warn" style="margin:0">⚠ The engine now reads this move as EXHAUSTED — consider taking profit / do not add.</div>':'')+
    (test?'':'<div class="meters"><div class="meter"><label>'+(s.mode==='ENGINE'?'Engine strength · clusters':'Evidence · families')+'</label><b>'+Math.round(s.score)+' · '+s.fams+'</b><div class="bar '+(L?'':'dnb')+'"><i style="width:'+Math.round(s.score)+'%"></i></div></div><div class="meter"><label>Volume vs normal</label><b>×'+(f.rv5||0).toFixed(1)+'</b><div class="bar '+(L?'':'dnb')+'"><i style="width:'+Math.round(clip((f.rv5||0)/6,0,1)*100)+'%"></i></div></div><div class="meter"><label>Aggressive '+(L?'buys':'sells')+'</label><b>'+Math.round((f.bs5||.5)*100)+'%</b><div class="bar '+(L?'':'dnb')+'"><i style="width:'+Math.round((f.bs5||.5)*100)+'%"></i></div></div></div>')+
    '<div class="levels"><div class="level"><label>Entry zone</label><b>'+pf(p.entry.lo)+'–'+pf(p.entry.hi)+'</b></div><div class="level sl"><label>Stop ('+p.riskPct.toFixed(2)+'%)</label><b class="dn">'+pf(p.sl)+'</b></div><div class="level"><label>R:R (TP2)</label><b>1 : '+p.tps[1].r.toFixed(1)+'</b></div>'+tp+'</div>'+
    '<div class="size-line">Size at <b>'+SET.riskPct+'%</b> risk of <b>'+money(SET.acct)+'</b> = <b>'+money(sz.risk)+'</b> → qty <b>'+qtyTxt(sz.qty)+'</b> · notional <b>'+money(sz.notional)+'</b> ('+sz.lev.toFixed(2)+'× account) · est. liquidation 10× '+pf(p.liq10)+'</div>'+
    '<div class="trade-strip"><span class="lc-pill '+(({DEVELOPING:'dev',DETECTED:'det'})[(lifecycleOf(s)||{}).status]||'')+'">'+esc(lcText(lifecycleOf(s)))+'</span><span>'+state+'</span>'+(t.entry?'<span class="mut">filled '+pf(t.entry)+'</span>':'')+(Rv!=null?'<span class="R '+(Rv>=0?'pos':'neg')+'">'+(Rv>=0?'+':'')+Rv.toFixed(2)+'R</span>':'')+'</div>'+
    '<div style="font-size:12.5px">Confidence: '+confText(s)+'</div>'+
    '<div class="footer-reasons">'+(why?'<ul>'+why+'</ul>':'')+(ev.length?'<div class="mut" style="font:11.5px var(--mono);margin-top:6px">Last: '+esc(ev[ev.length-1].txt)+'</div>':'')+'</div>'+
    '<details '+openAttr(s,'d')+'><summary>Evidence, gates, higher timeframes &amp; lifecycle</summary>'+
      (s.htf&&s.htf.txt?'<div class="note" style="margin-top:6px"><b>Higher timeframes:</b> '+esc(s.htf.txt)+'</div>':'')+
      advBlock(s)+'<div class="note" style="margin-top:6px"><b>Invalidation:</b> '+esc(s.invalidation)+'. <b>Targets:</b> '+p.tps.map((x,i)=>'TP'+(i+1)+' '+x.r.toFixed(1)+'R = '+esc(x.src)).join(' · ')+' (a risk-multiple projection means no chart level was found in range). <b>Entry tags:</b> '+esc((s.etags||[]).join(', '))+'.</div>'+
      (s.why&&s.why.length?'<ul class="ev">'+s.why.map(w=>'<li class="ok"><b>'+esc(w.name)+':</b> '+esc(w.txt)+'</li>').join('')+(s.wyckoff?'<li class="ok"><b>Wyckoff:</b> '+esc(s.wyckoff)+'</li>':'')+(s.against||[]).map(w=>'<li class="no"><b>Weak — '+esc(w.name)+':</b> '+esc(w.txt)+'</li>').join('')+((s.man&&s.man.flags)||[]).map(x=>'<li class="no">Manipulation flag: '+esc(x)+'</li>').join('')+'</ul>':'')+
      '<ul class="ev">'+(s.gates||[]).map(g=>'<li class="'+(g.ok?'ok':'no')+'">'+esc(g.txt)+'</li>').join('')+'</ul>'+
      '<ul class="life">'+ev.map(e=>'<li class="'+(EV_CLS[e.k]||'')+'">'+hhmm(e.t)+' · '+esc(e.txt)+'</li>').join('')+'</ul></details></div>';
}

/* ---------------- MARKETS ---------------- */
function renderMarkets(){
  const h=MK.hydrate, tot=h.total||MK.syms.size, hyd=recs().filter(r=>r.hist).length, q=UI.mq.trim().toUpperCase();
  setHTML('hydBox',(h.running||hyd<tot)?'<div class="panel"><div class="pb"><b>Hydrating market history</b> <span class="mono mut">'+hyd+' / '+tot+'</span><div class="prog" style="margin-top:8px"><i style="width:'+(tot?hyd/tot*100:0).toFixed(0)+'%"></i></div><div class="note" style="margin-top:6px">Each coin needs ~8 hours of 1-minute candles before its volume baseline is meaningful. Coins start being analysed as soon as their history arrives, most liquid first.</div></div></div>':'');
  let list=recs();
  if(UI.mf==='F'||UI.mf==='S') list=list.filter(r=>r.venue===UI.mf); if(UI.mf==='N') list=list.filter(r=>r.isNew||(r.ageDays!=null&&r.ageDays<30)); if(q) list=list.filter(r=>r.sym.indexOf(q)>=0);
  const key=UI.ms==='c'?(r=>Math.abs(r.chg24)):UI.ms==='o'?(r=>r.ev?Math.max(r.ev.up.opp,r.ev.dn.opp):-1):(r=>r.q24);
  list.sort((a,b)=>key(b)-key(a)); $('mSub').textContent=list.length+' markets · '+(MK.counts?MK.counts.perp+' perps + '+MK.counts.spot+' spot-only':'');
  let o='<div class="row hd"><span>COIN</span><span>STAGE (LONG / SHORT)</span><span>24H</span><span>PRICE</span><span class="hide-m">24H VOL</span><span class="hide-m">15M</span><span class="hide-m">NOTES</span></div>';
  list.slice(0,150).forEach(r=>{ const e=r.ev;
    o+='<div class="row" data-sym="'+r.sym+'"><span class="sym"><b>'+esc(symName(r))+'</b><small>'+(r.venue==='F'?'USDT-M perp':'spot')+(r.kind&&r.kind!=='crypto'&&r.kind!=='spot'?' · '+esc(r.kind):'')+'</small></span><span>'+(e?chip(e.up.stage,true)+' '+(e.dn.stage?chip(e.dn.stage,false):''):'<span class="mut mono">'+(r.hist?'—':'loading…')+'</span>')+'</span><span class="mono '+(r.chg24>=0?'up':'dn')+'">'+pc(r.chg24,1)+'</span><span class="mono">'+pf(r.last||(r.bars.length?r.bars[r.bars.length-1].c:0))+'</span><span class="mono hide-m">'+money(r.q24)+'</span><span class="mono hide-m '+(e&&e.M.ret15>=0?'up':'dn')+'">'+(e?pc(e.M.ret15,1):'–')+'</span><span class="hide-m">'+flagsOf(r)+'</span></div>'; });
  setHTML('mList',o);
}


/* ---------------- SYSTEM ---------------- */
function srcPill(name,ok){ return '<span class="src '+(ok===true?'ok':ok===false?'bad':'')+'"><i></i>'+name+'</span>'; }
function renderSystem(){
  const H=MK.health, conns=Object.values(MK.conns), fa=feedAudit(), htfN=recs().filter(r=>r.htf&&r.htf.ok).length;
  setHTML('healthBox','<div>'+srcPill('Binance futures REST',H.fapi)+srcPill('Binance spot REST',H.spot)+srcPill('24h tickers',H.fapiT)+srcPill('Bybit',H.bybit)+srcPill('OKX',H.okx)+srcPill('Fear &amp; Greed',H.fng)+srcPill('Global market (CoinPaprika)',H.global)+srcPill('Server clock',H.time)+'</div>'+
    '<div style="margin-top:10px">'+conns.map(c=>'<span class="src '+(c.ok?'ok':'bad')+'"><i></i>WS '+esc(c.name)+'</span>').join('')+'</div>'+
    '<table class="t" style="margin-top:12px"><tr><td>Messages received</td><td>'+MK.cnt.msg.toLocaleString()+'</td><td>Candles closed</td><td>'+MK.cnt.bars.toLocaleString()+'</td></tr><tr><td>REST requests</td><td>'+MK.cnt.req+' ('+MK.cnt.err+' errors)</td><td>Reconnects</td><td>'+MK.cnt.reconn+'</td></tr><tr><td>Evaluations</td><td>'+EVALS.toLocaleString()+'</td><td>Engine errors</td><td>'+ERR+'</td></tr><tr><td>Stale markets</td><td>'+(MKT.stale||0)+'</td><td>Clock offset</td><td>'+MK.offset+' ms</td></tr><tr><td>Coins with multi-timeframe data</td><td>'+htfN+'</td><td>Feed audit</td><td>'+(fa.ok?'<b class="up">consistent</b>':'<b class="dn">inconsistent</b>')+'</td></tr><tr><td>Mode</td><td colspan="3">'+(MK.pollMode?'<b class="amb">REST polling (sockets unreachable) — top 60 coins only</b>':MK.wsOK?'<b class="up">Live WebSocket streams</b>':'<b class="amb">Connecting…</b>')+'</td></tr></table>');
  $('healthSub').textContent=(MK.counts?MK.counts.total+' markets':'');
  const D=DIAG, row=(a,b,c)=>'<tr><td>'+a+'</td><td class="mono">'+b+'</td><td class="mut">'+c+'</td></tr>';
  setHTML('pipeBox','<div class="tw"><table class="t"><tr><th>Stage of the pipeline (since this page was opened)</th><th>Count</th><th>Meaning</th></tr>'+
    row('Candle evaluations',D.evals.toLocaleString(),'every closed 1-minute candle of every analysed market')+row('Coin-sides at stage 3–4',D.s34,'the engine sees confirmation (stage 1–2 are watch alerts only)')+row('Passed every preset gate',D.gate,'evidence, families, manipulation, liquidity, lateness, stop, R:R, room')+
    row('… duplicate of an open signal',D.dup,'same coin + side already open — not issued again')+row('… inside the cooldown',D.cool,'the same coin + side was signalled less than an hour ago')+row('… opposite side already open',D.conflict,'conflicting signals are never issued (listed below)')+
    row('… waited for higher-timeframe data',D.htfDefer,'the 15m–1M candles are downloaded for candidates before a signal is issued')+row('… blocked by a higher-timeframe conflict',D.htfBlock,SET.htfBlock?'4h and daily structure both oppose the trade (listed below)':'policy is OFF — conflicts are issued but tagged')+row('… scanner switched off',D.paused,'listed below')+
    row('<b>Signals issued</b>','<b>'+D.issued+'</b>','each one is a card, a feed record, a tracked trade and a statistic')+'</table></div>'+
    '<h4 class="mut" style="margin:14px 0 6px">Feed audit</h4><div class="note">'+(fa.ok?'<b class="up">✔ consistent</b> · ':'<b class="dn">⚠ inconsistent</b> · ')+fa.n+' signals stored, '+fa.active+' active, '+fa.dups.length+' duplicate ids, '+fa.noEvent.length+' without creation event, '+fa.noClose.length+' closed without closing event, '+fa.dupAct.length+' duplicate active, '+fa.conflicts.length+' conflicting, cards on screen '+(fa.ui?fa.ui.shown+' / expected '+fa.ui.expected:'not rendered yet')+'.</div>'+
    '<h4 class="mut" style="margin:14px 0 6px">Setups that passed the gates but were deliberately not issued</h4>'+(SUPP.length?'<div class="tw"><table class="t"><tr><th>Time</th><th>Coin</th><th>Side</th><th>Evidence</th><th>Reason</th></tr>'+SUPP.slice(0,25).map(x=>'<tr><td class="mut">'+dhm(x.t)+'</td><td>'+esc(x.sym.replace(/USDT$/,''))+'</td><td class="'+(x.dir>0?'up':'dn')+'">'+(x.dir>0?'LONG':'SHORT')+'</td><td>'+x.score+'</td><td>'+esc(x.why)+(x.n>1?' <span class="mut">(×'+x.n+')</span>':'')+'</td></tr>').join('')+'</table></div>':'<div class="note">None so far.</div>'));
  setHTML('logBox',MK.log.slice(0,40).map(l=>'<div class="logl '+l.type+'">['+new Date(l.t).toLocaleTimeString()+'] '+esc(l.msg)+'</div>').join('')||'<div class="note">No events yet.</div>');
}
/* ---------------- settings pop-over ---------------- */
function renderSettings(){
  const o=(k,opts)=>'<select class="ctl" data-set="'+k+'">'+opts.map(x=>'<option value="'+x[0]+'"'+(String(SET[k])===String(x[0])?' selected':'')+'>'+x[1]+'</option>').join('')+'</select>';
  const P=PRESETS[SET.preset]; $('presetSel').value=SET.preset;
  setHTML('setBox','<b style="letter-spacing:1px;font-size:12px">SETTINGS</b>'+
    '<label class="note">Signal preset</label>'+o('preset',[['ELITE','Elite — high-conviction only, evidence ≥66, 5 families'],['STRICT','Strict — evidence ≥62, 4 families'],['BALANCED','Balanced — evidence ≥55, 3 families'],['EARLY','Early — evidence ≥48, 3 families'],['ENGINE','Engine-led — one engine setup is enough (strength ≥60), all safety gates stay']])+'<div class="note" style="margin-top:4px">Now: '+(P.indep?'a single engine setup of strength ≥ '+Math.round(P.engMin*100)+' (pump/dump stage and evidence-count gates do not apply)':'evidence ≥ '+P.minScore+', ≥ '+P.minFams+' families')+(P.advTier?', conviction ≥ '+tierName(P.advTier):'')+', R:R ≥ '+P.minRR+'. The Backtest Lab compares all presets on the same data.</div>'+
    '<label class="note">Account size (USD) — position sizing &amp; paper account</label><input class="ctl" type="number" min="100" step="100" data-set="acct" value="'+SET.acct+'">'+
    '<label class="note">Risk per trade</label>'+o('riskPct',[[.25,'0.25% of account'],[.5,'0.5% of account'],[1,'1% of account'],[2,'2% of account']])+
    '<label class="note">Higher-timeframe conflict policy</label>'+o('htfBlock',[['true','Block signals that fight the 4h AND daily structure'],['false','Issue them, but tag them CONFLICT']])+
    '<label class="note">Advisory limits (they warn — they never block silently)</label>'+o('maxHeat',[[3,'Portfolio heat 3%'],[5,'Portfolio heat 5%'],[8,'Portfolio heat 8%'],[12,'Portfolio heat 12%']])+'<div style="height:6px"></div>'+o('ddBreaker',[[5,'Drawdown breaker 5%'],[10,'Drawdown breaker 10%'],[15,'Drawdown breaker 15%'],[20,'Drawdown breaker 20%']])+
    '<label class="note">Alerts</label>'+o('alertStage',[[0,'Signals only'],[2,'Early watch (stage 2+)'],[3,'Initiation (stage 3+)']])+'<div style="height:6px"></div>'+o('sound',[['true','Sound on'],['false','Sound off']])+'<div style="height:6px"></div>'+o('vibrate',[['true','Vibrate on'],['false','Vibrate off']])+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn" id="btNotif">Enable browser notifications</button><button class="btn ghost" id="btExport">Export JSON</button><button class="btn stop" id="btClear">Clear all history</button></div>'+
    '<div class="note" style="margin-top:10px">Everything is stored only in this browser. Close the panel by pressing Settings again.</div>');
}
/* ---------------- self-test: fixed vectors with known answers + live data integrity ---------------- */
function runSelfTest(){
  const out=[], T=(name,fn)=>{ try{ const r=fn(); out.push({name,ok:r===true||(r&&r.ok),detail:r&&r.detail||''}); }catch(e){ out.push({name,ok:false,detail:'exception: '+e.message}); } };
  const near=(a,b)=>Math.abs(a-b)<1e-9, mkSig=(sym,dir,entry,sl,tps,t)=>({sym,dir,t:t||1000,px:entry,preset:'X',score:60,fams:3,stage:3,label:'t',tier:'DEEP',plan:{sl,tps:tps.map((p,i)=>({p,r:Math.abs(p-entry)/Math.abs(entry-sl),src:'x'})),entry:{mid:entry}},grade:'B'});
  const B=(t,o,h,l,c)=>({t,o,h,l,c,q:0,Q:0});
  T('Tracker: long, TP1 → TP2 → trailing stop pays 1.90R (0.5×1.6 + 0.3×2.6 + 0.2×1.6)',()=>{ const tr=newTrade(mkSig('A',1,100,99,[101.6,102.6,104.2]),{costPct:0}); [B(1,100,100.4,99.6,100.2),B(2,100.2,101.7,100.1,101.5),B(3,101.5,102.7,101.6,102.6),B(4,102,102.2,101.5,101.6)].forEach(b=>stepTrade(tr,b)); return {ok:tr.state==='CLOSED'&&near(tr.R,1.9)&&tr.outcome==='WIN',detail:'R='+tr.R.toFixed(4)+' state '+tr.state}; });
  T('Tracker: a candle touching both stop and target counts as a STOP (−1R)',()=>{ const tr=newTrade(mkSig('A',1,100,99,[101.6,102.6,104.2]),{costPct:0}); stepTrade(tr,B(1,100,101.7,98.9,100)); return {ok:tr.state==='CLOSED'&&near(tr.R,-1)&&tr.outcome==='LOSS',detail:'R='+tr.R.toFixed(4)}; });
  T('Tracker: short side is mirrored (TP1 reached → +0.80R banked, stop at break-even)',()=>{ const tr=newTrade(mkSig('A',-1,100,101,[98.4,97.4,95.8]),{costPct:0}); stepTrade(tr,B(1,100,100.4,99.6,99.8)); stepTrade(tr,B(2,99.8,100,98.3,98.5)); return {ok:tr.state==='OPEN'&&near(tr.R,.8)&&tr.stop===tr.entry,detail:'R='+tr.R.toFixed(4)+' stop '+tr.stop}; });
  T('Tracker: price already past the stop at the next open → MISSED, not a fake fill',()=>{ const tr=newTrade(mkSig('A',1,100,99,[101.6,102.6,104.2]),{costPct:0}); stepTrade(tr,B(1,98.5,99,98,98.8)); return tr.state==='CLOSED'&&tr.outcome==='MISSED'; });
  T('Tracker: costs reduce R (0.10% cost on a 1% stop = −0.10R)',()=>{ const tr=newTrade(mkSig('A',1,100,99,[101.6,102.6,104.2]),{costPct:.1}); stepTrade(tr,B(1,100,101.7,98.9,100)); return {ok:near(tr.R,-1.1),detail:'R='+tr.R.toFixed(4)}; });
  T('Registry: duplicate, conflict and cooldown are refused; adding the same id twice keeps one record',()=>{ const R=new Registry({}), s=mkSig('A',1,100,99,[101.6,102.6,104.2],1000); s.id='ID1'; R.add(s,'X'); const again=R.add(Object.assign({},s),'X');
    const d=R.why('A',1,'X',1100), c=R.why('A',-1,'X',1100); s.trade.state='CLOSED'; const k=R.why('A',1,'X',1200), f=R.why('A',1,'X',1000+3700); return {ok:d==='duplicate'&&c==='conflict'&&k==='cooldown'&&f===null&&again===s&&R.sigs.length===1,detail:[d,c,k,f,R.sigs.length].join(' / ')}; });
  T('Statistics: Wilson 95% interval for 8 wins of 10 is about 49–94%',()=>{ const w=wilson(8,10); return {ok:w[0]>.47&&w[0]<.51&&w[1]>.92&&w[1]<.96,detail:Math.round(w[0]*100)+'–'+Math.round(w[1]*100)+'%'}; });
  T('Calibration: no confidence is shown with 29 outcomes, one is shown with 30',()=>{ const mk=n=>Array.from({length:n},()=>({state:'CLOSED',outcome:'WIN',hit:[1,0,0],R:1,src:'live',score:60,tpR:[0,2,0]})); const a=confidenceFor(60,calibration(mk(29))), b=confidenceFor(60,calibration(mk(30))); return {ok:!a.calibrated&&b.calibrated,detail:'29→'+a.calibrated+' · 30→'+b.calibrated}; });
  T('Higher timeframes: 4h + daily both down → a LONG is a CONFLICT, a SHORT is ALIGNED',()=>{ const h={ok:true,bias:-.6,tf:{'1h':{ok:true,trend:-1},'4h':{ok:true,trend:-1},'1d':{ok:true,trend:-1}}}; const L=htfCheck(h,1), S=htfCheck(h,-1); return {ok:L.conflict&&L.align==='CONFLICT'&&!S.conflict&&S.align==='ALIGNED',detail:L.align+' / '+S.align}; });
  T('Higher timeframes: split 4h/daily is MIXED (no conflict); missing data is UNKNOWN (never invented)',()=>{ const h={ok:true,bias:0,tf:{'4h':{ok:true,trend:1},'1d':{ok:true,trend:-1}}}; const m=htfCheck(h,1), u=htfCheck(null,1); return {ok:m.align==='MIXED'&&!m.conflict&&u.align==='UNKNOWN'&&!u.conflict,detail:m.align+' / '+u.align}; });
  T('45-minute candles: merged from complete 15-minute groups only',()=>{ const b=[]; for(let k=1;k<=7;k++) b.push({t:900*k,o:1,h:2,l:.5,c:1.5,v:1,q:1,V:1,Q:1,n:1}); const m=mergeBars(b,3,900); return {ok:m.length===1&&m[0].t===2700&&m[0].cnt===3,detail:m.length+' candle(s)'}; });
  T('Paper account: +1R then −1R at 1% risk ends slightly below the start (compounding)',()=>{ const a=paperAccount([{state:'CLOSED',outcome:'WIN',R:1,tClose:1},{state:'CLOSED',outcome:'LOSS',R:-1,tClose:2}],10000,1); return {ok:near(a.equity,10000*1.01*.99),detail:'$'+a.equity.toFixed(2)}; });
  T('Persistence: the signal registry survives a save → load round trip',()=>{ const R2=new Registry({}); R2.load(REG.dump()); return {ok:R2.sigs.length===REG.sigs.length&&R2.alerts.length===REG.alerts.length,detail:R2.sigs.length+' signals, '+R2.alerts.length+' alerts'}; });
  T('Signal feed: audit is consistent',()=>{ const a=feedAudit(); return {ok:a.ok,detail:a.n+' signals, '+a.active+' active'}; });
  T('Live data: candles are in time order and internally consistent (high ≥ open/close ≥ low, no NaN)',()=>{ let n=0,bad=0,first=''; MK.syms.forEach(r=>{ if(!r.hist) return; const A=r.bars; for(let i=0;i<A.length;i++){ const b=A[i]; n++; const e=1e-12*Math.abs(b.c)+1e-12; const ok=fin(b.o)&&fin(b.h)&&fin(b.l)&&fin(b.c)&&fin(b.v)&&b.h>=Math.max(b.o,b.c)-e&&b.l<=Math.min(b.o,b.c)+e&&b.v>=0&&(i===0||b.t>A[i-1].t); if(!ok){ bad++; if(!first) first=r.sym+' @'+b.t; } } }); return {ok:bad===0&&n>0,detail:n.toLocaleString()+' candles checked'+(bad?', '+bad+' bad (first: '+first+')':'')}; });
  T('Live data: exchange clock offset is below 5 minutes',()=>({ok:Math.abs(MK.offset)<300000,detail:MK.offset+' ms'}));
  return out;
}
function renderSelfTest(){
  const r=runSelfTest(), pass=r.filter(x=>x.ok).length;
  $('stBox').innerHTML='<div class="'+(pass===r.length?'warn info':'warn bad')+'"><b>'+pass+' / '+r.length+' checks passed.</b> '+(pass===r.length?'The tracker, registry, statistics and multi-timeframe logic behave as specified on the test vectors, and the live candles are consistent.':'Something does not behave as specified — details below.')+'</div><div class="tw"><table class="t">'+r.map(x=>'<tr><td><span class="st '+(x.ok?'ok':'na')+'">'+(x.ok?'PASS':'FAIL')+'</span></td><td>'+esc(x.name)+'</td><td class="mut">'+esc(x.detail)+'</td></tr>').join('')+'</table></div>';
}
/* ---------------- specification coverage — honest status of every requirement ---------------- */
const COVER=[
 ['Surveillance','All Binance USDT markets in real time','ok','Every USDT-M perpetual plus every USDT spot pair that has no perpetual, streamed over WebSockets (REST polling fallback when sockets are blocked).'],
 ['Surveillance','Early pump / dump detection, 5 stages','ok','Early watch → pre-move → initiation → confirmation → exhaustion/capitulation, with hysteresis so a stage does not flicker.'],
 ['Timeframes','14 timeframes (1m 3m 5m 15m 30m 45m 1h 2h 4h 1d 3d 5d 1w 1M)','partial','All 14 are analysed with the same structure/liquidity engine, but 15m–1M candles are downloaded only for the few coins that reach a candidate stage (not for every market). 45m and 5d do not exist on Binance and are merged from 15m / 1d candles. A coin too new for a timeframe reports "not enough history".'],
 ['Timeframes','Higher timeframe = direction, lower = entry, conflict detection','ok','4h and daily structure opposing the trade is a CONFLICT (blocked by default, configurable); mixed / aligned / unknown are tagged on each signal.'],
 ['Signal logic','Entry-type classification','ok','Liquidity-sweep, reversal (CHoCH), retest, breakout, trend-continuation, early vs confirmed — derived from 5-minute structure events.'],
 ['Signal logic','No candlestick-pattern signals','ok','Candlestick patterns (engulfing, pin bars, …) are not used for signals or confirmation. Chart-pattern geometry is shown only as context.'],
 ['Order flow','Aggressive volume, footprint, stacked imbalances','ok','Real taker-buy volume from klines for every coin; aggTrade tape (footprint, large orders, stacked imbalance, bot-like uniformity) for candidates. No history before the page was opened.'],
 ['Order flow','Spot-vs-futures CVD','ok','Binance spot taker flow compared with the perpetual for coins that trade on both (candidates only).'],
 ['Order flow','Order book depth, walls, spoof detection','partial','Depth ±0.5% and wall/spoof heuristics for candidates. Spoof detection is a heuristic on consecutive snapshots, not proof.'],
 ['Derivatives','Open interest, funding, long/short ratio, taker ratio, liquidations','ok','Binance futures data for candidates. Liquidations are those observed on the live force-order stream since the page was opened (not an aggregated heat-map).'],
 ['Levels','Previous day/week/month high-low, weekly & monthly open, order blocks, FVG, liquidity pools','ok','From real higher-timeframe candles; they feed target selection and the opposing-block check.'],
 ['Levels','Volume profile (POC / value area)','partial','4-hour profile from 1-minute candles. Weekly/session profiles are not built.'],
 ['Levels','Wyckoff phases','partial','A "Wyckoff-lite" description from range, effort and result — a heuristic reading, not a full phase model.'],
 ['Integrity','Manipulation / wash-trade / trap checks','partial','Heuristics: uniform order sizes, volume without progress, spoof, trap wicks. They lower the score or block the signal; they cannot prove manipulation.'],
 ['Signals','Entry, stop, TP1–TP3, R:R, invalidation, explanation','ok','Every card shows the plan, the evidence that agrees, the evidence that is weak, every gate with pass/fail, and what invalidates the idea.'],
 ['Signals','Calibrated confidence','ok','Shown only when a score bucket has ≥ 30 real outcomes (live or back-test). Until then the card says "Not calibrated yet". The evidence score is a ranking, not a probability.'],
 ['Signals','Duplicate / conflicting signal prevention, cooldown','ok','Same coin+side open → refused; opposite side open → refused and listed; one-hour cooldown. All counted in the pipeline table.'],
 ['Signals','Expiry, reassessment, partial targets, trailing stop','ok','Time exit after 240 minutes; open signals are re-judged on every candle and the timeline records fading evidence / exhaustion / opposite confirmation; 50/30/20 scale-out, break-even after TP1, stop trails to TP1 after TP2.'],
 ['Signals','Position sizing','ok','Quantity, notional and leverage from account size and risk %.'],
 ['Risk','Execution costs','partial','Round-trip fee + slippage by liquidity tier plus prorated funding are charged in R. The cost table is an ASSUMPTION, not a measurement of your fills.'],
 ['Risk','Portfolio / correlation exposure','partial','Open count, long/short balance, heat (% of equity at risk) and drawdown breaker — all advisory. There is no correlation matrix; crypto is treated as one correlated group.'],
 ['Validation','Every signal tracked: MFE, MAE, outcome, false-signal rate, Wilson intervals','ok','Judged by one fixed rule set; fill at next candle open, stop-first on ambiguous candles.'],
 ['Validation','Walk-forward style stability, Sharpe, Sortino, Monte Carlo','partial','Chronological in-sample / out-of-sample split, 4 folds, per-trade Sharpe and Sortino and Monte-Carlo reshuffles. The rules are fixed (nothing is optimised), so this checks stability — it is not a walk-forward optimisation.'],
 ['Validation','Back-test on real history','partial','Replays the identical pipeline on real 1-minute history. Higher timeframes, order book, OI, funding and cross-venue evidence have no free history and are NOT part of the back-test.'],
 ['Reliability','Signal feed: no silent misses, no duplicates, synchronised','ok','Cards, feed and history all derive from one registry; each signal id is recorded once; held-back setups are listed with a reason; an audit runs continuously.'],
 ['Interface','Premium dark responsive dashboard, mobile navigation','ok','Sidebar on desktop, bottom navigation on phones.'],
 ['Alerts','Sound, vibration, browser notifications','ok','Work while the page is open.'],
 ['Alerts','Telegram / e-mail / push when the page is closed','na','Needs a server and keys. This app runs only while the browser tab is open.'],
 ['Data','On-chain flows, whale wallets, exchange reserves','na','Needs paid / keyed providers (Glassnode, Nansen, …). Not simulated.'],
 ['Data','News, event calendar, social sentiment (NLP)','na','Needs paid / keyed feeds. Only the free Fear & Greed index and BTC dominance are used. Avoid trading through scheduled events manually.'],
 ['Data','Aggregated liquidation heat-maps, other exchanges\' books and trades','na','Paid data. Bybit and OKX are used only for price / funding cross-checks.'],
 ['Engines','50-engine registry: every engine may raise BUY / SELL on its own','partial','Registry lists all 50. 20 candle engines raise signals by themselves (tagged engine + setup, with entry zone, invalidation, targets and evidence). 7 live-data engines (order-book, derivatives, other-venue, trade tape) run on candidates only. 17 are context engines that gate, rank or measure the others. 6 are NOT built (listed, never faked): TPO/market profile, Elliott waves, spectral cycles, options/gamma, L2 heat-map history, deep learning. See the Engines tab.'],
 ['Engines','Engine strength vs real hit-rate','ok','Strength (0–1) only ranks how cleanly a setup is formed. Hit-rate is shown per engine from closed signals the app actually produced (live and back-test), with a 95% interval; a Bayesian rate appears only from 10 outcomes.'],
 ['Engines','Agreement counted by independent cluster','ok','Engines reading the same event (e.g. sweep + inducement + zone reaction) share a cluster and count once — no double-counting as "confirmation".'],
 ['Engines','Engine-led preset','ok','One engine hit may raise a signal; manipulation, liquidity, lateness, structure-veto, stop / R:R / room / spread gates, higher-timeframe check and duplicate / cooldown still apply. It is the most permissive preset, so expect more signals and measure them before trusting it.'],
 ['Engines','Institutional confluence tier (high conviction / standard / weak)','ok','Weighted concept families (zones, structure, flow, profile, levels, regime, quant). Weak-tier setups are not published. The tier is an evidence label, not a win-rate.'],
 ['Engines','Statistical models: Hurst, entropy, CUSUM, Kalman, regression channel, OU half-life, VPIN-lite','partial','Implemented as descriptive estimators on bars up to the current one (no look-ahead, tested). On a few hundred bars they are noisy and are used as one family, not as a prediction. VPIN-lite uses candles as volume buckets and needs real taker-buy volume.'],
 ['Engines','Historical-similarity (analog) evidence','na','Not built yet. It will be shown only with enough comparable past cases to be statistically meaningful, and never as a forecast.'],
 ['Venues','Bybit Futures pairs scanned for signals','na','NOT built. Bybit is used today only as a price / funding cross-check for Binance coins. Binance USDT-M futures (plus Binance spot without a perpetual) are scanned.'],
 ['Timeframes','Engine scans on 15m / 30m / 1H','na','Not built yet. Engines run on 5-minute candles built from 1-minute data; 15m–1H candles are used for higher-timeframe context and the conflict check, not as separate signal feeds.'],
 ['Chart','Interactive layers (entry/SL/TP, engine zone, OB/FVG/S-D, BOS/CHoCH, volume profile, levels)','partial','Layer chips under the detail chart switch each group on or off. Overlays come from the same engine that produced the signal. No drawing tools, zoom or pan yet.'],
 ['Method','"AI" model','partial','The engine is a transparent evidence-weighting system with empirical calibration, not a trained neural network. Weights are design choices, not optimised values.']
];
function renderCoverage(){
  const lab={ok:'IMPLEMENTED',partial:'PARTIAL',na:'NOT AVAILABLE'}, n=k=>COVER.filter(x=>x[2]===k).length;
  $('covBox').innerHTML='<div class="note" style="margin-bottom:8px">'+n('ok')+' implemented · '+n('partial')+' partial · '+n('na')+' not possible without paid or keyed data. Nothing marked "not available" is simulated anywhere in the app.</div><table class="t"><tr><th>Area</th><th>Requirement</th><th>Status</th><th>How / limits</th></tr>'+COVER.map(x=>'<tr><td class="mut">'+esc(x[0])+'</td><td>'+esc(x[1])+'</td><td><span class="st '+x[2]+'">'+lab[x[2]]+'</span></td><td class="mut" style="font-family:var(--sans)">'+esc(x[3])+'</td></tr>').join('')+'</table>';
}
