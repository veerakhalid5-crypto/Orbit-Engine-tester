/* ================================================================
   SIGNAL REGISTRY · OUTCOME SIMULATION · CALIBRATION · PERFORMANCE (pure, no DOM)
   The same stepTrade() drives live tracking and the back-test, so a back-test trade and a live trade are judged by identical rules.
   Rules (conservative on purpose):
   · a signal is filled at the OPEN of the next 1-minute bar (never at the signal bar's close)
   · if a bar touches both the stop and a target, the STOP is assumed to be hit first
   · 50 % of the position is closed at TP1 (and the stop moves to break-even), 30 % at TP2, 20 % at TP3
   · after TP2 the stop trails up to the TP1 price (locks the first target's profit on the last 20 %)
   · every trade pays an assumed round-trip cost (taker fees + slippage by liquidity tier) plus perpetual funding for the time held, expressed in R.
     The cost table is an ASSUMPTION (taker fee 0.04 % per side on USDT-M futures + a slippage allowance that grows as the book thins) — it is not measured.
   ================================================================ */
const TRK={legs:[.5,.3,.2],costPct:.10,maxBars:240,minCalib:30,trail:true,
  costByTier:{DEEP:.08,GOOD:.10,THIN:.18,MICRO:.35}};            // round-trip %, by liquidity tier
function costFor(tier){ return TRK.costByTier[tier]!=null?TRK.costByTier[tier]:TRK.costPct; }

function newTrade(sig,opt){
  opt=opt||{}; const p=sig.plan;
  return {id:sig.id,sym:sig.sym,dir:sig.dir,tSig:sig.t,state:'PENDING',sl:p.sl,tps:p.tps.map(x=>x.p),tpR:p.tps.map(x=>x.r),stop:p.sl,
    entry:null,risk:null,riskPct:null,R:0,rem:1,hit:[0,0,0],mfe:0,mae:0,bars:0,tOpen:null,tClose:null,exitPx:null,outcome:null,exitWhy:null,
    maxBars:opt.maxBars||TRK.maxBars,costPct:opt.costPct==null?costFor(sig.tier):opt.costPct,fund:fin(sig.fund)?sig.fund:null,trail:opt.trail==null?TRK.trail:opt.trail};
}
function closeTrade(tr,t,px,why,code){
  tr.state='CLOSED'; tr.tClose=t; tr.exitPx=px; tr.exitWhy=why; tr.closeCode=code||null;   // closeCode: STOP_LOSS | BREAKEVEN_STOP | TRAILING_STOP | ALL_TARGETS | TIME_EXIT
  /* funding: a perpetual long pays the funding rate every 8 h when it is positive (a short receives it); prorated for the minutes held */
  const fundPct=tr.fund!=null?tr.fund*tr.dir*(tr.bars/480):0;
  tr.costR=tr.costPct/tr.riskPct; tr.fundR=fundPct/tr.riskPct;
  const net=tr.R-tr.costR-tr.fundR; tr.Rgross=tr.R; tr.R=net;
  tr.outcome=tr.hit[0]||net>.05?'WIN':net<-.05?'LOSS':'FLAT';
  return tr;
}
/* advance one finished 1-minute bar {t,o,h,l,c} */
function stepTrade(tr,bar){
  if(tr.state==='CLOSED') return tr;
  if(tr.lastT!=null&&bar.t<=tr.lastT) return tr;          // a candle that was already applied is never applied twice (restart replay, duplicate feed)
  tr.lastT=bar.t;
  const d=tr.dir;
  if(tr.state==='PENDING'){
    const e=bar.o;
    if((e-tr.sl)*d<=0||(tr.tps[0]-e)*d<=0){ tr.state='CLOSED'; tr.outcome='MISSED'; tr.closeCode='MISSED_ENTRY'; tr.exitWhy='price had already passed the stop or target 1 at the next open'; tr.tClose=bar.t; tr.R=0; return tr; }
    tr.entry=e; tr.risk=Math.abs(e-tr.sl); tr.riskPct=tr.risk/e*100; tr.state='OPEN'; tr.tOpen=bar.t; tr.stop=tr.sl;
    tr.tpR=tr.tps.map(p=>Math.abs(p-e)/tr.risk);
  }
  tr.bars++;
  const fav=(d>0?bar.h-tr.entry:tr.entry-bar.l)/tr.risk, adv=(d>0?tr.entry-bar.l:bar.h-tr.entry)/tr.risk;
  const stopped=d>0?bar.l<=tr.stop:bar.h>=tr.stop;
  if(stopped){
    tr.mae=Math.max(tr.mae,adv);
    tr.R+=tr.rem*((tr.stop-tr.entry)*d/tr.risk); tr.rem=0;
    return closeTrade(tr,bar.t,tr.stop,tr.hit[1]&&tr.trail?'trailing stop hit (locked at target 1)':tr.hit[0]?'stopped at break-even after target 1':'stop loss',tr.hit[1]&&tr.trail?'TRAILING_STOP':tr.hit[0]?'BREAKEVEN_STOP':'STOP_LOSS');
  }
  tr.mae=Math.max(tr.mae,adv); tr.mfe=Math.max(tr.mfe,fav);
  for(let k=0;k<3;k++){
    if(tr.hit[k]) continue;
    if(d>0?bar.h>=tr.tps[k]:bar.l<=tr.tps[k]){
      tr.hit[k]=bar.t; const leg=k===2?tr.rem:Math.min(TRK.legs[k],tr.rem); tr.R+=leg*(tr.tps[k]-tr.entry)*d/tr.risk; tr.rem-=leg;
      if(k===0) tr.stop=tr.entry;            // risk-free after target 1
      if(k===1&&tr.trail) tr.stop=tr.tps[0]; // trail to target 1 after target 2
    } else break;
  }
  if(tr.rem<=1e-9) return closeTrade(tr,bar.t,tr.tps[2],'all targets reached','ALL_TARGETS');
  if(tr.bars>=tr.maxBars){ tr.R+=tr.rem*((bar.c-tr.entry)*d/tr.risk); tr.rem=0; return closeTrade(tr,bar.t,bar.c,'time exit after '+tr.maxBars+' minutes','TIME_EXIT'); }
  return tr;
}
/* run a trade forward over bars[from..] (back-test) */
function simulateTrade(sig,bars,from,opt){
  const tr=newTrade(sig,opt);
  for(let i=from;i<bars.length&&tr.state!=='CLOSED';i++) stepTrade(tr,bars[i]);
  if(tr.state!=='CLOSED'){ tr.openAtEnd=true; }
  return tr;
}

/* ---------------- stage alerts (early watch / pre-pump …): did the move really follow? ---------------- */
const ALERT_WIN=[15,30,60,120];
function newAlert(a){ return {id:a.id,sym:a.sym,dir:a.dir,stage:a.stage,label:a.label,t:a.t,px:a.px,score:a.score,s1:a.s1,fwd:{},mfe:0,mae:0,done:false,hitT:null,preset:a.preset||null}; }
function stepAlert(al,bar){
  if(al.done) return al;
  const d=al.dir, mv=(d>0?bar.c/al.px-1:al.px/bar.c-1)*100, hi=(d>0?bar.h/al.px-1:al.px/bar.l-1)*100, lo=(d>0?bar.l/al.px-1:al.px/bar.h-1)*100;
  al.mfe=Math.max(al.mfe,hi); al.mae=Math.min(al.mae,lo);
  const thr=alertThreshold(al); if(al.hitT==null&&al.mfe>=thr&&bar.t<=al.t+3600) al.hitT=bar.t;
  ALERT_WIN.forEach(m=>{ if(al.fwd[m]==null&&bar.t+60>=al.t+m*60) al.fwd[m]=mv; });
  if(bar.t+60>=al.t+120*60) al.done=true;
  return al;
}
/* a "meaningful move" is scaled to the coin's own 1-minute volatility, never a fixed number */
function alertThreshold(al){ return Math.max(1.5,5*(al.s1||.2)); }
function alertHit(al){ return al.hitT!=null; }

/* ---------------- statistics ---------------- */
function wilsonCI(w,n){ return typeof wilson==='function'?wilson(w,n):[0,1]; }
function perf(trades){
  const T=trades.filter(t=>t.state==='CLOSED'&&t.outcome!=='MISSED'), n=T.length;
  if(!n) return {n:0};
  const w=T.filter(t=>t.outcome==='WIN'), l=T.filter(t=>t.outcome==='LOSS'), f=n-w.length-l.length;
  const sumW=w.reduce((s,t)=>s+t.R,0), sumL=l.reduce((s,t)=>s+t.R,0), rs=T.map(t=>t.R);
  const tp1=T.filter(t=>t.hit[0]).length, ci=wilsonCI(w.length,n);
  const mu=rs.reduce((a,b)=>a+b,0)/n, sd=Math.sqrt(rs.reduce((a,b)=>a+(b-mu)*(b-mu),0)/Math.max(n-1,1)), dsd=Math.sqrt(rs.reduce((a,b)=>a+(b<0?b*b:0),0)/n);
  return {n,wins:w.length,losses:l.length,flat:f,winRate:w.length/n,wlo:ci[0],whi:ci[1],tp1Rate:tp1/n,avgR:mu,
    sharpe:sd>1e-9&&n>=5?mu/sd:null,sortino:dsd>1e-9&&n>=5?mu/dsd:null,          // per-trade ratios (mean R / std of R) — not annualised
    pf:sumL<0?sumW/Math.abs(sumL):(sumW>0?Infinity:0),avgWinR:w.length?sumW/w.length:0,avgLossR:l.length?sumL/l.length:0,
    avgMFE:T.reduce((s,t)=>s+t.mfe,0)/n,avgMAE:T.reduce((s,t)=>s+t.mae,0)/n,
    plannedRR:T.reduce((s,t)=>s+(t.tpR[1]||0),0)/n,
    falseRate:T.filter(t=>t.outcome==='LOSS'&&!t.hit[0]).length/n,
    sumR:rs.reduce((a,b)=>a+b,0),maxDD:maxDrawdownR(T.slice().sort((a,b)=>(a.tClose||0)-(b.tClose||0)).map(t=>t.R))};
}
function maxDrawdownR(rs){ let eq=0,pk=0,dd=0; rs.forEach(r=>{ eq+=r; pk=Math.max(pk,eq); dd=Math.max(dd,pk-eq); }); return dd; }
/* chronological stability: split closed trades into an earlier "in-sample" part and a later "out-of-sample" part, and into k folds.
   The engine's rules are fixed (nothing here is fitted to the data), so this is a stability check, not an optimisation. */
function chrono(trades){ return trades.filter(t=>t.state==='CLOSED'&&t.outcome!=='MISSED').sort((a,b)=>(a.tOpen||a.tSig||0)-(b.tOpen||b.tSig||0)); }
function isOos(trades,frac){ frac=frac||.7; const T=chrono(trades), k=Math.floor(T.length*frac); return {is:perf(T.slice(0,k)),oos:perf(T.slice(k)),nIs:k,nOos:T.length-k}; }
function foldPerf(trades,k){ const T=chrono(trades); k=k||4; const out=[]; const sz=Math.floor(T.length/k); if(sz<1) return out; for(let i=0;i<k;i++) out.push(perf(T.slice(i*sz,i===k-1?T.length:(i+1)*sz))); return out; }
function groupPerf(trades,keyFn){ const m={}; trades.forEach(t=>{ const k=keyFn(t); if(k==null) return; (m[k]=m[k]||[]).push(t); }); const o={}; Object.keys(m).forEach(k=>{ o[k]=perf(m[k]); }); return o; }
function alertStats(alerts){
  const o={}; alerts.forEach(a=>{ const k=a.stage; (o[k]=o[k]||[]).push(a); });
  const out={}; Object.keys(o).forEach(k=>{ const A=o[k], dn=A.filter(a=>a.done||a.hitT!=null), n=dn.length; if(!n){ out[k]={n:0,pending:A.length}; return; }
    const hit=dn.filter(alertHit), ci=wilsonCI(hit.length,n), leads=hit.map(a=>(a.hitT-a.t)/60).sort((x,y)=>x-y);
    const avg=m=>{ const v=dn.map(a=>a.fwd[m]).filter(x=>x!=null); return v.length?v.reduce((s,x)=>s+x,0)/v.length:null; };
    out[k]={n,pending:A.length-n,hit:hit.length,rate:hit.length/n,lo:ci[0],hi:ci[1],leadMed:leads.length?leads[leads.length>>1]:null,avgMFE:dn.reduce((s,a)=>s+a.mfe,0)/n,avgMAE:dn.reduce((s,a)=>s+a.mae,0)/n,f15:avg(15),f30:avg(30),f60:avg(60),f120:avg(120)}; });
  return out;
}

/* ---------------- calibration: evidence score -> observed hit rate ---------------- */
const CAL_EDGES=[0,55,62,70,80,101];
function calBucket(score){ for(let i=0;i<CAL_EDGES.length-1;i++) if(score>=CAL_EDGES[i]&&score<CAL_EDGES[i+1]) return i; return 0; }
function calLabel(i){ return i===CAL_EDGES.length-2?CAL_EDGES[i]+'+':CAL_EDGES[i]+'–'+(CAL_EDGES[i+1]-1); }
/* "hit" = target 1 reached before the stop. Source can be 'live' | 'backtest' */
function calibration(trades){
  const out={};
  ['live','backtest'].forEach(src=>{
    const rows=CAL_EDGES.slice(0,-1).map((_,i)=>({i,label:calLabel(i),n:0,w:0,sumR:0}));
    trades.filter(t=>t.state==='CLOSED'&&t.outcome!=='MISSED'&&(t.src||'live')===src).forEach(t=>{ const r=rows[calBucket(t.score)]; r.n++; if(t.hit[0]) r.w++; r.sumR+=t.R; });
    rows.forEach(r=>{ const ci=wilsonCI(r.w,r.n); r.rate=r.n?r.w/r.n:null; r.lo=ci[0]; r.hi=ci[1]; r.exp=r.n?r.sumR/r.n:null; });
    out[src]=rows; });
  return out;
}
/* confidence shown on a signal: the observed hit rate of its score bucket, or an honest "not calibrated yet" */
function confidenceFor(score,cal){
  const i=calBucket(score);
  for(const src of ['live','backtest']){ const r=cal&&cal[src]&&cal[src][i]; if(r&&r.n>=TRK.minCalib) return {calibrated:true,src,p:r.rate,lo:r.lo,hi:r.hi,n:r.n,exp:r.exp,bucket:r.label}; }
  const n=Math.max(cal&&cal.live?cal.live[i].n:0,cal&&cal.backtest?cal.backtest[i].n:0);
  return {calibrated:false,n,bucket:calLabel(i),need:TRK.minCalib};
}

/* ---------------- paper account + Monte Carlo on the realised R sequence ---------------- */
function paperAccount(trades,start,riskPct){
  start=start||10000; riskPct=riskPct==null?1:riskPct; let eq=start,pk=start,dd=0; const curve=[{t:null,eq}];
  trades.filter(t=>t.state==='CLOSED'&&t.outcome!=='MISSED').sort((a,b)=>(a.tClose||0)-(b.tClose||0)).forEach(t=>{ eq*=1+t.R*riskPct/100; pk=Math.max(pk,eq); dd=Math.max(dd,(pk-eq)/pk); curve.push({t:t.tClose,eq}); });
  return {start,equity:eq,ret:(eq/start-1)*100,maxDD:dd*100,curve,riskPct};
}
function monteCarlo(rs,riskPct,iter,seed){
  riskPct=riskPct==null?1:riskPct; iter=iter||1000; if(!rs||rs.length<8) return null;
  let s=(seed||2463534242)>>>0; const rnd=()=>{ s^=s<<13; s>>>=0; s^=s>>>17; s^=s<<5; s>>>=0; return s/4294967296; };
  const fin_=[],dds=[];
  for(let k=0;k<iter;k++){ let eq=1,pk=1,dd=0; for(let i=0;i<rs.length;i++){ eq*=1+rs[Math.floor(rnd()*rs.length)]*riskPct/100; pk=Math.max(pk,eq); dd=Math.max(dd,(pk-eq)/pk); } fin_.push((eq-1)*100); dds.push(dd*100); }
  const q=(a,p)=>{ const b=a.slice().sort((x,y)=>x-y); return b[Math.min(b.length-1,Math.floor((b.length-1)*p))]; };
  return {runs:iter,n:rs.length,p05:q(fin_,.05),p50:q(fin_,.5),p95:q(fin_,.95),ddP95:q(dds,.95),probLoss:fin_.filter(x=>x<0).length/iter};
}

/* informational only: half-Kelly from the observed win rate and average win / loss (in R), capped at 10 % of equity */
function kellyFraction(p,avgWin,avgLoss){ const b=avgWin/Math.abs(avgLoss); if(!(b>0)||!(p>=0)) return 0; return Math.max(0,Math.min(.10,(p-(1-p)/b)/2)); }

/* ---------------- registry: dedupe, cooldown, persistence ---------------- */
function Registry(opt){ opt=opt||{}; this.sigs=[]; this.alerts=[]; this.cool=opt.cool||3600; this.cap=opt.cap||1500; this.seq=0; this.lastKey={}; }
/* duplicate prevention (same coin + side + preset still active, or inside the cooldown) and conflict prevention
   (never issue the opposite side on a coin while a live signal on it is still open) */
Registry.prototype.why=function(sym,dir,preset,t){
  const k=sym+'|'+dir+'|'+(preset||'');
  if(this.sigs.some(s=>s.sym===sym&&s.dir===dir&&(s.preset||'')===(preset||'')&&s.trade.state!=='CLOSED')) return 'duplicate';
  if(this.sigs.some(s=>s.sym===sym&&s.dir===-dir&&s.trade.state!=='CLOSED'&&(s.src||'live')!=='test')) return 'conflict';
  if(this.lastKey[k]!=null&&t-this.lastKey[k]<this.cool) return 'cooldown';
  return null;
};
Registry.prototype.canSignal=function(sym,dir,preset,t){ return this.why(sym,dir,preset,t)===null; };
Registry.prototype.byId=function(id){ return this.sigs.find(s=>s.id===id)||null; };
Registry.prototype.active=function(){ return this.sigs.filter(s=>s.trade.state!=='CLOSED'); };
/* idempotent: adding a signal whose id is already registered returns the existing record (this is what prevents duplicate feed entries) */
Registry.prototype.add=function(sig,preset){
  sig.id=sig.id||('S'+(++this.seq)+'-'+sig.sym+'-'+sig.t); const ex=this.byId(sig.id); if(ex) return ex;
  sig.preset=preset||sig.preset; this.lastKey[sig.sym+'|'+sig.dir+'|'+(sig.preset||'')]=sig.t;
  sig.trade=newTrade(sig); const tr=sig.trade; tr.score=sig.score; tr.src=sig.src||'live'; tr.preset=sig.preset; tr.dir=sig.dir; tr.cond=sig.cond; tr.stage=sig.stage; tr.tier=sig.tier; tr.top=sig.top;
  tr.etype=sig.etype; tr.conv=sig.conv||null; tr.mode=sig.mode||'MOMENTUM'; tr.eng=sig.eng?sig.eng.id:null; tr.engName=sig.eng?sig.eng.name:null; tr.engN=sig.engN||0; tr.htf=sig.htfTag; tr.sess=sig.sess; tr.regime=sig.regime; tr.liq=sig.liqTier||sig.tier; tr.grade=sig.grade;
  sig.events=[{t:sig.t,k:'signal',txt:(sig.etype||'Signal')+' generated · '+(sig.dir>0?'LONG':'SHORT')+' · evidence '+Math.round(sig.score)}];
  this.sigs.push(sig); if(this.sigs.length>this.cap) this.sigs.splice(0,this.sigs.length-this.cap); return sig;
};
Registry.prototype.onBar=function(sym,bar){
  const closed=[]; this.sigs.forEach(s=>{ if(s.sym===sym&&s.trade.state!=='CLOSED'){
      const tr=s.trade, was=tr.state, wasHit=tr.hit.slice(), wasStop=tr.stop; stepTrade(tr,bar);
      const ev=s.events||(s.events=[]), push=(k,txt)=>{ if(ev.length<24) ev.push({t:bar.t,k,txt}); };
      if(was==='PENDING'&&tr.state==='OPEN') push('entry','Entry filled at '+pf(tr.entry)+' (next-candle open)');
      tr.hit.forEach((h,i)=>{ if(h&&!wasHit[i]) push('tp'+(i+1),'Target '+(i+1)+' reached at '+pf(tr.tps[i])); });
      if(tr.state==='OPEN'&&tr.stop!==wasStop&&was!=='PENDING') push('stop',tr.hit[1]&&tr.trail?'Stop trailed to target 1 ('+pf(tr.stop)+')':'Stop moved to break-even ('+pf(tr.stop)+')');
      if(tr.state==='CLOSED'){ push('closed',(tr.outcome==='MISSED'?'Missed — ':'Closed — ')+tr.exitWhy+(tr.outcome==='MISSED'?'':' · '+sg(tr.R,2)+'R')); closed.push(s); }
      else if(tr.hit.some((h,i)=>h&&!wasHit[i])) s.event={k:'tp',t:bar.t}; } });
  this.alerts.forEach(a=>{ if(a.sym===sym&&!a.done) stepAlert(a,bar); }); return closed;
};
Registry.prototype.addAlert=function(a){ const al=newAlert(a); al.id=al.id||('A'+(++this.seq)); this.alerts.push(al); if(this.alerts.length>2500) this.alerts.splice(0,this.alerts.length-2500); return al; };
Registry.prototype.hasRecentAlert=function(sym,dir,stage,t,gap){ for(let i=this.alerts.length-1;i>=0;i--){ const a=this.alerts[i]; if(t-a.t>(gap||1800)) break; if(a.sym===sym&&a.dir===dir&&a.stage>=stage) return true; } return false; };
Registry.prototype.trades=function(src){ return this.sigs.map(s=>s.trade).filter(t=>!src||(t.src||'live')===src); };
Registry.prototype.dump=function(){ return JSON.stringify({seq:this.seq,sigs:this.sigs,alerts:this.alerts,lastKey:this.lastKey}); };
Registry.prototype.load=function(txt){ try{ const o=JSON.parse(txt); this.seq=o.seq||0; this.sigs=o.sigs||[]; this.alerts=o.alerts||[]; this.lastKey=o.lastKey||{}; return true; }catch(e){ return false; } };

if(typeof module!=='undefined') module.exports={kellyFraction,TRK,costFor,isOos,foldPerf,chrono,newTrade,stepTrade,simulateTrade,newAlert,stepAlert,alertThreshold,alertHit,perf,groupPerf,alertStats,calibration,confidenceFor,calBucket,calLabel,paperAccount,monteCarlo,Registry,maxDrawdownR,CAL_EDGES};
