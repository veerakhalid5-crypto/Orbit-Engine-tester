/* ================================================================
   BACK-TEST REPLAY (pure) — replays the SAME evaluation pipeline bar by bar over 1-minute history.
   Each presets is gated separately so Strict / Balanced / Early can be compared on identical data.
   What this can and cannot test: price / volume / aggressive-flow / 5-minute structure (all in the kline data).
   Order-book, open-interest, funding, liquidation and cross-venue evidence have no free history, so they are NOT part of it.
   ================================================================ */
function BTRunner(bars,o){
  o=o||{}; this.bars=bars; this.o=o; this.sym=o.sym||'X'; this.presets=o.presets||['ELITE','STRICT','BALANCED','EARLY','ENGINE']; this.indep=this.presets.some(k=>PRESETS[k]&&PRESETS[k].indep);
  this.L=Math.max(o.from||0,ENG.minBars+6); this.st=newSymState(); this.sigs=[]; this.alerts=[]; this.evals=0; this.busy={}; this.lastSig={}; this.lastAlert={}; this.prevStage=[0,0];
  let s=0; for(let i=0;i<bars.length;i++) s+=bars[i].q; this.q24=o.q24||(s/Math.max(bars.length,1)*1440);
  this.btcIdx=null; if(o.btc){ this.btcIdx=new Map(); o.btc.forEach((b,i)=>this.btcIdx.set(b.t,i)); }
  this.cool=o.cool||3600;
}
BTRunner.prototype.btc15=function(t){ if(!this.btcIdx) return undefined; const i=this.btcIdx.get(t); if(i==null||i<15) return undefined; return (this.o.btc[i].c/this.o.btc[i-15].c-1)*100; };
BTRunner.prototype.done=function(){ return this.L>=this.bars.length-2; };
BTRunner.prototype.step=function(budgetMs){
  const bars=this.bars, t0=Date.now(); const end=bars.length-2;
  while(this.L<end&&(budgetMs==null||Date.now()-t0<budgetMs)){
    const L=this.L++, ctx={q24:this.q24,btc15:this.btc15(bars[L].t),fresh:true};
    const ev=evaluateFull(bars,L,ctx,this.st,{indep:this.indep}); if(!ev) continue; this.evals++;
    [1,-1].forEach((dir,i)=>{
      const sc=dir>0?ev.up:ev.dn;
      if(sc.stage>this.prevStage[i]&&sc.stage>=1){ const k=dir+'|'+sc.stage, t=bars[L].t+60; if(this.lastAlert[k]==null||t-this.lastAlert[k]>1800){ this.lastAlert[k]=t; const a=newAlert(makeAlert(this.sym,ev,dir,bars,L)); a.id='A'+this.sym+t+dir+sc.stage; a.src='backtest'; this.alerts.push(a); this.pend=this.pend||[]; this.pend.push({a,from:L+1}); } }
      this.prevStage[i]=sc.stage;
      this.presets.forEach(pk=>{
        const key=pk+'|'+dir, t=bars[L].t+60;
        if(this.busy[key]!=null&&t<this.busy[key]) return;
        if(this.lastSig[key]!=null&&t-this.lastSig[key]<this.cool) return;
        const g=gateSignal(ev,dir,bars,L,ctx,ev.deep,PRESETS[pk]); if(!g.ok) return;
        const sig=makeSignal(this.sym,ev,dir,g,bars,L,ctx,pk); sig.id='B'+this.sym+t+dir+pk; sig.src='backtest';
        const tr=simulateTrade(sig,bars,L+1); tr.score=sig.score; tr.src='backtest'; sig.trade=tr; this.sigs.push(sig);
        this.lastSig[key]=t; this.busy[key]=tr.tClose!=null?tr.tClose:Infinity;
      });
    });
  }
  if(this.L>=end&&this.pend){ this.pend.forEach(p=>{ for(let i=p.from;i<bars.length&&!p.a.done;i++) stepAlert(p.a,bars[i]); }); this.pend=null; }
  return this.done();
};
BTRunner.prototype.result=function(){ return {sym:this.sym,sigs:this.sigs,alerts:this.alerts,evals:this.evals,bars:this.bars.length}; };
function backtestSymbol(bars,o){ const r=new BTRunner(bars,o); r.step(null); return r.result(); }
/* combine runs of several symbols into per-preset statistics */
function btSummary(results,presetKeys){
  const sigs=[].concat(...results.map(r=>r.sigs)), alerts=[].concat(...results.map(r=>r.alerts)), out={byPreset:{}};
  (presetKeys||['ELITE','STRICT','BALANCED','EARLY','ENGINE']).forEach(pk=>{ const T=sigs.filter(s=>s.preset===pk).map(s=>s.trade); out.byPreset[pk]={perf:perf(T),dir:groupPerf(T,t=>t.dir>0?'LONG':'SHORT'),cal:calibration(T)}; });
  out.alerts=alertStats(alerts); out.evals=results.reduce((s,r)=>s+r.evals,0); out.symbols=results.length; out.bars=results.reduce((s,r)=>s+r.bars,0);
  out.sigs=sigs; out.alertList=alerts; return out;
}
if(typeof module!=='undefined') module.exports={BTRunner,backtestSymbol,btSummary};
