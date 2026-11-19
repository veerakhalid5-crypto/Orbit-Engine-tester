/* ================================================================
   HEADLESS RUNTIME — the signal pipeline shared by the browser app and the Node server
   state · evaluation pipeline · confirmation gates · duplicate/conflict/cooldown · higher-timeframe gate ·
   open-signal reassessment · feed audit · market-wide state · deep-data scheduler · back-test runner
   No DOM, no storage, no sound: everything the outside world needs goes through HOOKS.
   Loaded after mi_net.js (it uses MK, NET, jget, fetchBars …) in the same scope as the other engine modules.
   ================================================================ */
/* acct = account size used for position sizing and as the paper-account start; maxHeat / ddBreaker are ADVISORY thresholds (they warn, they never silently block) */
const SET={preset:'BALANCED',alertStage:3,sound:true,notify:false,vibrate:true,sens:2,riskPct:1,acct:10000,btSyms:20,btDays:2,htfBlock:true,maxHeat:5,ddBreaker:10};
const REG=new Registry({cap:800});
const BT={trades:[],alerts:[],at:0,info:null};
const RUN={on:true};                                   /* scanner switch: when off the engine keeps measuring but issues no new signals / alerts */
const DIAG={evals:0,s34:0,gate:0,dup:0,cool:0,conflict:0,htfDefer:0,htfBlock:0,paused:0,issued:0};   /* signal-pipeline funnel (where candidate setups went) */
const SUPP=[];                                         /* setups that passed every gate but were deliberately not issued — each one is listed, nothing is dropped silently */
const LIVE=new Map(), LIVEHIST=[], MKT={breadth24:null,breadth15:null,btc15:null,btc60:null,up3:0,dn3:0,up2:0,dn2:0,ex:0,n:0,mood:null};
let CAL=null, CALAT=0, ERR=0, EVALS=0;
/* the host (browser UI or Node server) plugs in here; every hook is optional and a failing hook never breaks the pipeline */
const HOOKS={
  signal(sig,rec){},            /* a new signal was issued */
  watch(alert,rec){},           /* an early-watch / exhaustion alert was raised */
  closed(sig){},                /* a signal's trade was closed by the tracker */
  bar(rec,bar,closedSigs){},    /* a finished 1m candle was applied to the tracker */
  persist(){},                  /* state changed — save it */
  sel(){ return null; },        /* symbol the user is inspecting (gets deep data even when it is not a candidate) */
  cardChk(){ return null; }     /* UI card consistency counters (browser only) */
};
const hook=(name,a,b,c)=>{ try{ const f=HOOKS[name]; if(f) return f(a,b,c); }catch(e){ ERR++; MK.lastErr=e; } };
const symName=r=>r.base||r.sym.replace(/USDT$/,'');
const perfNow=()=>(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();

function calFor(){
  if(!CAL||Date.now()-CALAT>20000){ const tr=REG.trades().concat(BT.trades).filter(t=>!t.preset||t.preset===SET.preset); CAL=calibration(tr); CALAT=Date.now(); }
  return CAL;
}
/* closed trades drop their long evidence text before they are stored */
function slimSig(s){ if(s.trade&&s.trade.state==='CLOSED'){ const c=Object.assign({},s); delete c.why; delete c.against; delete c.gates; delete c.facts; delete c.pen; return c; } return s; }

/* ---------------- evaluation pipeline ---------------- */
function btcRet(n){ const b=MK.syms.get('BTCUSDT'); if(!b||b.bars.length<n+2) return undefined; const A=b.bars; return (A[A.length-1].c/A[A.length-1-n].c-1)*100; }
/* btcBars: the BTC 1-minute buffer, used for the SMT-divergence and relative-value engines (never for the coin's own bars) */
function ctxFor(rec){ const b=MK.syms.get('BTCUSDT'); return {q24:rec.q24,btc15:btcRet(15),breadth:MKT.breadth15,fund:rec.fund,ageDays:rec.ageDays,fresh:!rec.stale,btcBars:b&&b.bars&&b.bars.length>=400?b.bars:null,isBtc:rec.sym==='BTCUSDT'}; }
/* engine-led mode: is there an engine setup strong enough to be worth running the gates on? */
function engineReady(ev,dir,P){ const e=ev&&ev.deep&&ev.deep.eng?(dir>0?ev.deep.eng.up:ev.deep.eng.dn):null; return !!(e&&e.top&&e.top.strength>=(P.engMin||.6)); }
function evalRec(rec){
  const bars=rec.bars, L=bars.length-1; if(L<ENG.minBars+8||rec.evT===bars[L].t) return; /* keyed on the candle's time, not its array position (the buffer is capped, so L stops changing once it is full) */
  if(!rec.warm){ rec.warm=true; const c0=ctxFor(rec); for(let i=Math.max(ENG.minBars+8,L-30);i<L;i++) evaluateFull(bars,i,c0,rec.st,{}); }
  const ctx=ctxFor(rec); rec.st.extra=rec.deepWanted?buildExtra(rec,rec.ev):null;
  const P0=PRESETS[SET.preset]||PRESETS.BALANCED, ev=evaluateFull(bars,L,ctx,rec.st,{indep:!!P0.indep}); if(!ev) return; EVALS++; DIAG.evals++;
  const prevUp=rec.ev?rec.ev.up.stage:0, prevDn=rec.ev?rec.ev.dn.stage:0; rec.evL=L; rec.evT=bars[L].t; rec.ev=ev; rec.ctx=ctx;
  const t=bars[L].t+60;
  /* stage alerts (for tracking whether early alerts really precede moves) — silent while the scanner is switched off */
  if(RUN.on) [[ev.up,1,prevUp],[ev.dn,-1,prevDn]].forEach(([sc,dir,pv])=>{
    if(sc.stage>pv&&sc.stage>=2&&sc.stage<=4&&!REG.hasRecentAlert(rec.sym,dir,sc.stage,t,1800)){ const al=REG.addAlert(makeAlert(rec.sym,ev,dir,bars,L,SET.preset)); al.src='live'; hook('watch',al,rec); }
    if(sc.stage===5&&pv<5&&!REG.hasRecentAlert(rec.sym,dir,5,t,1800)){ const al=REG.addAlert(makeAlert(rec.sym,ev,dir,bars,L,SET.preset)); al.src='live'; hook('watch',al,rec); }
  });
  /* confirmed signals: stage gates → preset gates → duplicate/conflict → higher-timeframe gate (see tryConfirm) */
  [1,-1].forEach(dir=>{ const sc=dir>0?ev.up:ev.dn; if(!(P0.indep?engineReady(ev,dir,P0):(sc.stage>=3&&sc.stage<=4))) return; DIAG.s34++; tryConfirm(rec,dir,false); });
  reassessOpen(rec,ev);
  /* spot-only coins have no tick stream: the live scanner uses the finished candle */
  if(rec.venue==='S'){ const b=bars[L], amp=(b.h-b.l)/b.o*100, ret=(b.c/b.o-1)*100; if(b.o>0&&amp>=SET.sens&&Math.abs(ret)>=SET.sens*.6) liveTrigger(rec,{o:b.o,h:b.h,l:b.l,c:b.c,m:Math.floor(b.t/60)}); }
}
/* ---------------- confirmation → signal ---------------- */
/* A setup that passes every gate but is deliberately NOT issued is written to SUPP with the reason, so the feed never has a silent miss. */
function suppress(rec,dir,sc,why){
  const k=rec.sym+'|'+dir+'|'+why.slice(0,24), now=nowSec(), prev=SUPP.find(x=>x.k===k&&now-x.t<1800);
  if(prev){ prev.n=(prev.n||1)+1; return; }
  SUPP.unshift({k,t:now,sym:rec.sym,dir,why,score:Math.round(sc.score),label:sc.label,n:1}); if(SUPP.length>100) SUPP.length=100;
}
function tryConfirm(rec,dir,again){
  const bars=rec.bars, L=bars.length-1, ev=rec.ev; if(!ev||!L||rec.evT!==bars[L].t) return;      /* a newer candle arrived while we waited: its own evaluation decides */
  const sc=dir>0?ev.up:ev.dn, P=PRESETS[SET.preset]||PRESETS.BALANCED; if(P.indep?!engineReady(ev,dir,P):(sc.stage<3||sc.stage>4)) return;
  const t=bars[L].t+60, ctx=rec.ctx||ctxFor(rec), h=rec.htf&&rec.htf.ok?rec.htf:null;
  /* higher-timeframe levels (previous day/week/month highs & lows, 1h–1w order blocks, FVGs, liquidity pools) join the candidate targets, so TP1–TP3 can sit on real levels */
  let deep=ev.deep; if(deep&&h) deep=Object.assign({},deep,{levels:(deep.levels||[]).concat(htfLevels(h,bars[L].c))});
  const g=gateSignal(ev,dir,bars,L,ctx,deep,P); rec.gate=rec.gate||{}; rec.gate[dir]={t,ok:g.ok,gates:g.gates,plan:g.plan};
  if(!g.ok) return; if(!again) DIAG.gate++;
  const why=REG.why(rec.sym,dir,SET.preset,t);
  if(why){ if(!again) DIAG[why==='duplicate'?'dup':why==='cooldown'?'cool':'conflict']++; if(why==='conflict'&&!again) suppress(rec,dir,sc,'an opposite-side signal on this coin is still open'); return; }
  if(!RUN.on){ DIAG.paused++; suppress(rec,dir,sc,'scanner is switched off'); return; }
  /* the higher-timeframe picture is fetched for candidates; when it is not fresh the signal waits for it (once) instead of being issued blind */
  if(!htfFresh(rec)&&!again&&Date.now()-(rec.htfTry||0)>60000){ rec.htfTry=Date.now(); DIAG.htfDefer++; fetchHtf(rec).then(()=>tryConfirm(rec,dir,true),()=>tryConfirm(rec,dir,true)); return; }
  const hc=htfCheck(h,dir);
  if(hc.conflict&&SET.htfBlock){ DIAG.htfBlock++; suppress(rec,dir,sc,'higher-timeframe conflict — '+hc.txt); return; }
  /* final conviction with the higher-timeframe picture now known: a preset that needs a conviction tier is enforced on THIS number, not on the one computed before the timeframes were loaded */
  const fa=advFor(ev,dir,ctx,hc,bars[L].c);
  if(P.advTier&&fa&&TIER_RANK[fa.tier]<TIER_RANK[P.advTier]){ DIAG.tierBlock=(DIAG.tierBlock||0)+1; suppress(rec,dir,sc,'conviction is '+tierName(fa.tier)+' once the higher timeframes are included (this preset needs '+tierName(P.advTier)+')'); return; }
  const sig=makeSignal(rec.sym,ev,dir,g,bars,L,ctx,SET.preset); sig.src='live'; sig.venue=rec.venue; sig.exch='BINANCE'; sig.htfTag=hc.align; sig.htf=hc;
  if(fa){ sig.adv=advSummary(fa); sig.conv=fa.tier; }
  if(hc.align==='MIXED'||hc.align==='UNKNOWN') sig.gates.push({ok:hc.align==='MIXED',txt:hc.align==='UNKNOWN'?'Higher-timeframe data was not available — the signal is based on the 1m/5m engine only':'Higher timeframes: '+hc.txt});
  emitSignal(sig,rec);
}
/* single entry point: registry (idempotent by id) → host hook → persistence. Dashboard cards, the feed and the API are all derived from REG.sigs, so they cannot disagree. */
function emitSignal(sig,rec){
  const s=REG.add(sig,sig.preset||SET.preset); if(s!==sig) return s;
  DIAG.issued++; hook('signal',s,rec); hook('persist'); return s;
}
let testN=0;
/* a pipeline test signal: exercises card / feed / tracker / alerts / delivery. It is NOT produced by the evidence engine and is excluded from every statistic. */
function makeTestSignal(){
  const rec=MK.syms.get('BTCUSDT')||[...MK.syms.values()].filter(r=>r.hist&&r.bars.length>40).sort((a,b)=>b.q24-a.q24)[0];
  if(!rec||rec.bars.length<30) return null;
  const bars=rec.bars, L=bars.length-1, px=rec.last||bars[L].c; let a=0; for(let i=L-13;i<=L;i++) a+=bars[i].h-bars[i].l; a=Math.max(a/14*2.2,px*.0006);
  const dir=(testN++%2===0)?1:-1, sl=px-dir*a, mk=m=>({p:px+dir*a*m,r:m,src:'risk-multiple projection'}), ts=nowSec();
  return emitSignal({sym:rec.sym,dir,t:ts,px,preset:'TEST',score:0,fams:0,stage:3,label:'TEST SIGNAL',etype:'Test',etags:['Test'],sess:sessionOf(ts),regime:'UNKNOWN',grade:'T',fund:null,htfTag:'UNKNOWN',htf:null,
    plan:{sl,tps:[mk(1.6),mk(2.6),mk(4.2)],entry:{mid:px,lo:px-.2*a,hi:px+.2*a},risk:a,riskPct:a/px*100,atr:a,liq10:liqPrice(px,dir,10),liq25:liqPrice(px,dir,25),room:9,roomSrc:''},
    why:[],against:[],pen:[],man:{risk:0,level:'LOW',flags:[]},gates:[{ok:true,txt:'Test signal — it exercises the signal pipeline (card, feed, tracker, alerts); it is not produced by the evidence engine'}],known:[],top:[],cond:'',tier:'DEEP',facts:{},wyckoff:null,
    invalidation:'a close '+(dir>0?'below ':'above ')+pf(sl)+' (test)',src:'test',venue:rec.venue,id:'T'+(++REG.seq)+'-'+rec.sym+'-'+ts},rec);
}
/* while a signal is open the engine keeps judging the coin: fading evidence, exhaustion or opposite-side confirmation are written into the signal's timeline */
function reassessOpen(rec,ev){
  REG.sigs.forEach(s=>{ if(s.sym!==rec.sym||s.trade.state==='CLOSED'||s.src==='test') return;
    const sc=s.dir>0?ev.up:ev.dn, op=s.dir>0?ev.dn:ev.up, k=op.stage>=3&&op.stage<=4?'opp':sc.stage===5?'exh':(sc.stage>=3?'ok':'fade'); if(s.reass===k) return;
    const was=s.reass; s.reass=k; if(was==null&&k==='ok') return;
    const txt=k==='ok'?'Reassessment: evidence is back at confirmation level':k==='opp'?'Reassessment: the OPPOSITE side now shows confirmation — the idea is at risk':k==='exh'?'Reassessment: the engine now reads this move as exhausted — consider taking profit, do not add':'Reassessment: evidence has faded to stage '+sc.stage+' — the conditions that justified the entry are weaker';
    const e=s.events||(s.events=[]); if(e.length<24) e.push({t:rec.bars[rec.bars.length-1].t+60,k:'reassess',txt}); });
}
/* ---------------- sizing · portfolio exposure (advisory) · feed ---------------- */
function sizeOf(s){ const risk=SET.acct*SET.riskPct/100, d=Math.abs(s.px-s.plan.sl), qty=d>0?risk/d:0; return {risk,qty,notional:qty*s.px,lev:SET.acct>0?qty*s.px/SET.acct:0}; }
function portfolio(){
  const open=REG.sigs.filter(s=>s.trade.state!=='CLOSED'&&(s.src||'live')==='live'), longs=open.filter(s=>s.dir>0).length;
  const acc=paperAccount(REG.trades('live'),SET.acct,SET.riskPct); let pk=acc.start; acc.curve.forEach(p=>{ if(p.eq>pk) pk=p.eq; }); const dd=pk>0?(pk-acc.equity)/pk*100:0, heat=open.length*SET.riskPct;
  return {n:open.length,longs,shorts:open.length-longs,same:Math.max(longs,open.length-longs),heat,heatHigh:heat>SET.maxHeat,dd,breaker:dd>=SET.ddBreaker&&acc.curve.length>3};
}
function feedItems(n){
  const out=[]; REG.sigs.forEach(s=>{ (s.events||[]).forEach(e=>out.push({t:e.t,k:e.k,txt:e.txt,sym:s.sym,dir:s.dir,id:s.id,test:s.src==='test'})); });
  SUPP.forEach(x=>out.push({t:x.t,k:'suppressed',txt:'Not issued — '+x.why+(x.n>1?' (×'+x.n+')':''),sym:x.sym,dir:x.dir,id:null}));
  return out.sort((a,b)=>b.t-a.t).slice(0,n||80);
}
/* consistency check of the signal feed: unique ids, every signal has its creation event, every closed signal has its closing event,
   no duplicate active signal, no opposite active signals on one coin, and (browser) the cards on screen equal the signals that should be shown */
function feedAudit(){
  const ids=new Set(), dups=[], noEvent=[], noClose=[], act={}, dirs={}, dupAct=[]; let n=0, active=0;
  REG.sigs.forEach(s=>{ n++; if(ids.has(s.id)) dups.push(s.id); ids.add(s.id); const ev=s.events||[];
    if(!ev.length||ev[0].k!=='signal') noEvent.push(s.id); if(s.trade.state==='CLOSED'&&!ev.some(e=>e.k==='closed')) noClose.push(s.id);
    if(s.trade.state!=='CLOSED'){ active++; if(s.src==='test') return; const k=s.sym+'|'+s.dir+'|'+s.preset; if(act[k]) dupAct.push(k); act[k]=1; (dirs[s.sym]=dirs[s.sym]||new Set()).add(s.dir); } });
  const conflicts=Object.keys(dirs).filter(k=>dirs[k].size>1), c=hook('cardChk'), uiBad=!!(c&&c.shown!==c.expected);
  return {ok:!dups.length&&!noEvent.length&&!noClose.length&&!dupAct.length&&!conflicts.length&&!uiBad,n,active,dups,noEvent,noClose,dupAct,conflicts,uiBad,ui:c||null,supp:SUPP.length};
}

MK.onBar=(rec,hy)=>{
  if(!hy&&rec.bars.length){ const b=rec.bars[rec.bars.length-1]; const closed=REG.onBar(rec.sym,b); closed.forEach(s=>hook('closed',s)); hook('bar',rec,b,closed); }
  if(!Q.has(rec)){ Q.add(rec); kick(); }
};
const Q=new Set(); let kicking=false;
function kick(){ if(kicking) return; kicking=true; setTimeout(pump,0); }
function pump(){ const t0=perfNow(); for(const r of Q){ Q.delete(r); try{ evalRec(r); }catch(e){ ERR++; MK.lastErr=e; } if(perfNow()-t0>8) break; } kicking=false; if(Q.size) kick(); }
/* resolves when every queued evaluation has run (used by tests and by the server's readiness check) */
function idle(){ return new Promise(res=>{ const chk=()=>(Q.size||kicking)?setTimeout(chk,2):res(); chk(); }); }

/* ---------------- live (reference-style) scanner: sensitivity on the live 1-minute candle ---------------- */
function liveTrigger(rec,lv){
  const amp=(lv.h-lv.l)/lv.o*100, ret=(lv.c/lv.o-1)*100, key=rec.sym, cur=LIVE.get(key);
  if(cur&&cur.m===lv.m){ cur.h=lv.h; cur.l=lv.l; cur.c=lv.c; cur.amp=amp; cur.ret=ret; if(Math.abs(ret)>=Math.abs(cur.peakRet||0)) cur.peakRet=ret; return; }
  if(cur) LIVEHIST.unshift(cur);
  LIVE.set(key,{sym:rec.sym,m:lv.m,o:lv.o,h:lv.h,l:lv.l,c:lv.c,amp,ret,peakRet:ret,dir:ret>=0?'P':'D',t:Date.now()});
  if(LIVEHIST.length>300) LIVEHIST.length=300;
}
function scanLive(){
  const thr=SET.sens, mn=Math.floor(nowMs()/60000);
  MK.syms.forEach(rec=>{ const lv=rec.live; if(!lv||lv.m!==mn||rec.venue!=='F') return; const amp=(lv.h-lv.l)/lv.o*100, ret=(lv.c/lv.o-1)*100;
    if(amp>=thr&&Math.abs(ret)>=thr*.6) liveTrigger(rec,lv); else { const cur=LIVE.get(rec.sym); if(cur&&cur.m===lv.m){ cur.h=lv.h; cur.l=lv.l; cur.c=lv.c; cur.amp=amp; cur.ret=ret; } } });
  LIVE.forEach((v,k)=>{ if(Date.now()-v.t>90000||v.m<mn-1){ LIVEHIST.unshift(v); LIVE.delete(k); } });
  if(LIVEHIST.length>300) LIVEHIST.length=300;
}
function verdictOf(rec,dirP){
  const ev=rec&&rec.ev; if(!ev) return {k:'DEVELOPING',c:'mut',t:'no engine data yet'};
  const sc=dirP?ev.up:ev.dn, S=dirP?ev.M.up:ev.M.dn;
  if(sc.stage>=3&&sc.stage<=4) return {k:'CONFIRMED',c:dirP?'up':'dn',t:'volume ×'+ev.M.rv5.toFixed(1)+' and '+Math.round(S.bs5*100)+'% aggressive '+(dirP?'buying':'selling')+' agree'};
  if(sc.stage===5) return {k:'EXHAUSTION',c:'vio',t:'move is already extended'};
  if(ev.M.rv5<1.4) return {k:'SPIKE',c:'amb',t:'price moved but volume is only ×'+ev.M.rv5.toFixed(1)+' — thin spike, not backed by flow'};
  if(ev.man.risk>=45) return {k:'SUSPECT',c:'amb',t:'manipulation risk '+Math.round(ev.man.risk)};
  return {k:'DEVELOPING',c:'mut',t:'volume ×'+ev.M.rv5.toFixed(1)+' · '+Math.round(S.bs5*100)+'% '+(dirP?'buy':'sell')+' side'};
}

/* ---------------- market-wide state ---------------- */
function updateMarket(){
  let up=0,tot=0,u15=0,t15=0,up3=0,dn3=0,up2=0,dn2=0,ex=0,n=0,stale=0;
  MK.syms.forEach(r=>{ if(r.stale) stale++; if(r.q24>=1e6){ tot++; if(r.chg24>0) up++; }
    const e=r.ev; if(!e) return; n++; if(r.q24>=1e6){ t15++; if(e.M.ret15>0) u15++; }
    if(e.up.stage>=3&&e.up.stage<=4) up3++; if(e.dn.stage>=3&&e.dn.stage<=4) dn3++; if(e.up.stage===2) up2++; if(e.dn.stage===2) dn2++; if(e.up.stage===5||e.dn.stage===5) ex++; });
  MKT.breadth24=tot?up/tot:null; MKT.breadth15=t15?u15/t15:null; Object.assign(MKT,{up3,dn3,up2,dn2,ex,n,stale});
  MKT.btc15=btcRet(15); MKT.btc60=btcRet(60);
  /* mood: only inputs that were measured; each is shown separately in the UI */
  const parts=[]; if(MKT.breadth15!=null) parts.push((MKT.breadth15-.5)*2); if(MKT.btc60!=null) parts.push(clip(MKT.btc60/1.5,-1,1)); if(MKT.breadth24!=null) parts.push((MKT.breadth24-.5)*2);
  MKT.mood=parts.length?clip(parts.reduce((a,b)=>a+b,0)/parts.length,-1,1):null;
}

/* ---------------- deep-data scheduler: only the few candidates get the expensive data ---------------- */
let deepBusy=false;
async function deepTick(){
  if(deepBusy||MK.hydrate.running) return; deepBusy=true;
  try{
    const sel=hook('sel');
    const c=[...MK.syms.values()].filter(r=>r.ev&&r.venue==='F').map(r=>({r,o:Math.max(r.ev.up.opp,r.ev.dn.opp)})).filter(x=>x.o>=34||x.r.ev.up.stage>=2||x.r.ev.dn.stage>=2).sort((a,b)=>b.o-a.o).slice(0,NET.deepMax);
    const set=new Set(c.map(x=>x.r.sym)); if(sel&&MK.syms.get(sel)&&MK.syms.get(sel).venue==='F') set.add(sel);
    MK.syms.forEach(r=>{ r.deepWanted=set.has(r.sym); });
    syncDeepSockets([...set].filter(s=>s!==sel||c.some(x=>x.r.sym===s)),sel);
    for(const r of [...set].map(s=>MK.syms.get(s))){ if(!r) continue; await fetchDeep(r); if(r.ev&&r.ev.up.stage+r.ev.dn.stage>0){ deepenHistory(r); await fetchHtf(r); } else if(r.sym===sel) await fetchHtf(r); }
  }catch(e){}
  deepBusy=false;
}
/* signals that were still open when the process stopped: the missed minutes are replayed from exchange history once data is loaded.
   If the process was down for longer than one history request can cover, the outcome cannot be reconstructed faithfully:
   the signal is closed as MISSED (code REPLAY_GAP), which excludes it from every statistic — it is never guessed. */
async function resumeOpen(){
  const open=REG.sigs.filter(s=>s.trade.state!=='CLOSED'&&s.src!=='test'); if(!open.length) return;
  for(const s of open){ const rec=MK.syms.get(s.sym); if(!rec) continue; const tr=s.trade;
    try{ const last=tr.lastT!=null?tr.lastT:s.t, need=Math.ceil((nowSec()-last)/60)+2;
      if(need>NET.klineLimit){ tr.state='CLOSED'; tr.outcome='MISSED'; tr.closeCode='REPLAY_GAP'; tr.R=0; tr.tClose=nowSec(); tr.exitWhy='the service was offline longer than the replay window — the outcome could not be reconstructed, so it is excluded from statistics';
        const ev=s.events||(s.events=[]); ev.push({t:tr.tClose,k:'closed',txt:'Closed — '+tr.exitWhy}); hook('closed',s); hook('bar',rec,rec.bars[rec.bars.length-1],[s]); continue; }
      const bars=await fetchBars(rec,Math.min(NET.klineLimit,Math.max(5,need))), was=tr.state;
      bars.filter(b=>b.t>=s.t&&(tr.lastT==null||b.t>tr.lastT)).forEach(b=>stepTrade(tr,b));   /* lastT: candles the tracker has already applied are never applied twice */
      if(bars.length) hook('bar',rec,bars[bars.length-1],tr.state==='CLOSED'&&was!=='CLOSED'?[s]:[]); }catch(e){} }
  hook('persist');
}

/* ---------------- back-test (same engine, same tracker rules, on real exchange history) ---------------- */
/* a back-test signal is stored in a compact form (the full evidence text is not kept) */
function compactTrade(s){ const t=s.trade; return {state:'CLOSED',outcome:t.outcome,hit:[t.hit[0]?1:0,0,0],R:t.R,score:s.score,src:'backtest',mfe:t.mfe,mae:t.mae,tpR:[0,t.tpR[1]||0,0],dir:s.dir,preset:s.preset,cond:s.cond,stage:s.stage,tier:s.tier,top:s.top,tClose:t.tClose||0,tOpen:t.tOpen||0,tSig:t.tSig||s.t,sym:s.sym,etype:s.etype,conv:s.conv||null,mode:s.mode||'MOMENTUM',eng:s.eng?s.eng.id:null,engName:s.eng?s.eng.name:null,sess:s.sess,regime:s.regime,grade:s.grade,htf:'N/A'}; }
async function fetchHistory(rec,days){
  const need=days*1440+ENG.minBars+10; let out=[], end=null;
  while(out.length<need){ const lim=Math.min(1500,need-out.length), k=await jget(NET.fapi+'/fapi/v1/klines?symbol='+rec.sym+'&interval=1m&limit='+lim+(end?'&endTime='+end:''),'F',lim>=1000?10:5,2); if(!k.length) break;
    const b=k.map(parseKline).filter(x=>x.t+60<=nowSec()+1); out=b.concat(out); end=k[0][0]-1; if(k.length<lim) break; }
  return out;
}
/* returns {ok:true,info} and fills BT, or {ok:false,error} — never throws */
async function runBacktestCore(opt,prog){
  opt=opt||{}; prog=prog||(()=>{}); const nSyms=opt.syms||SET.btSyms, days=opt.days||SET.btDays;
  try{
    const syms=[...MK.syms.values()].filter(r=>r.venue==='F'&&r.hist).sort((a,b)=>b.q24-a.q24).slice(0,nSyms);
    if(!syms.length) return {ok:false,error:'No coins are loaded yet — wait for the market history to finish hydrating.'};
    prog('loading Bitcoin history…',0,syms.length); const btcRec=MK.syms.get('BTCUSDT'); const btcBars=btcRec?await fetchHistory(btcRec,days):[];
    const results=[]; let i=0;
    for(const r of syms){ i++; prog('replaying '+symName(r)+' ('+i+'/'+syms.length+')…',i,syms.length); let bars; try{ bars=await fetchHistory(r,days); }catch(e){ continue; } if(bars.length<ENG.minBars+200) continue;
      const run=new BTRunner(bars,{sym:r.sym,btc:btcBars}); while(!run.step(20)) await sleep(0); results.push(run.result()); }
    const sum=btSummary(results);
    BT.trades=sum.sigs.map(compactTrade);
    BT.alerts=sum.alertList.map(a=>({stage:a.stage,dir:a.dir,done:true,hitT:a.hitT,mfe:a.mfe,mae:a.mae,fwd:a.fwd,s1:a.s1,t:a.t,src:'backtest'}));
    BT.info={symbols:results.length,days,evals:sum.evals,bars:sum.bars,at:Date.now()}; CAL=null; mlog('Back-test finished: '+results.length+' coins, '+BT.trades.length+' simulated signals','ok');
    return {ok:true,info:BT.info};
  }catch(e){ mlog('Back-test failed: '+e.message,'bad'); return {ok:false,error:e.message}; }
}

/* ---------------- headless start (Node server) — the same sequence the browser's boot() runs, without any DOM ---------------- */
const HL={tickN:0,started:false};
async function headlessStart(opt){
  opt=opt||{}; const ok=await netStart(); if(!ok) return false; HL.started=true;
  setInterval(()=>{ HL.tickN++; try{ scanLive(); if(HL.tickN%2===0) updateMarket(); }catch(e){ ERR++; MK.lastErr=e; } },1000);
  setTimeout(()=>{ deepTick(); setInterval(deepTick,15000); },opt.deepDelay==null?25000:opt.deepDelay);
  setTimeout(resumeOpen,opt.resumeDelay==null?20000:opt.resumeDelay);
  return true;
}
