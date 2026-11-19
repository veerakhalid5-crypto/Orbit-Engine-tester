/* ================================================================
   EVALUATION PIPELINE (pure) — the same function runs live and in the back-test
   cheap Tier-A pass for every symbol → deep pass (5-minute structure, optional live extras) only for candidates
   ================================================================ */
const DEEP_WINDOW=1500;
function deepLite(bars,L,cache){
  const key=Math.floor((bars[L].t+60)/300);
  if(cache&&cache.key===key) return cache.val;
  const d=deepStruct5(aggBars(bars,L,5,L-(DEEP_WINDOW-1)),bars[L].c);   /* at most the last DEEP_WINDOW 1-minute bars = exactly what the live app keeps in memory, so a back-test sees the same window and its cost does not grow with the history length */ let val=null;
  if(d){ const zs=d.zoneSwing||{}, sw=d.swing||{}; val={struct:{up:d.up,dn:d.dn},atr5:d.atr5,levels:d.levels,swing:{low:zs.low!=null?zs.low:sw.low,high:zs.high!=null?zs.high:sw.high},wyckoff:d.wyckoff,rep:d,vp:volProfile(bars,L,240,40)}; }
  if(cache){ cache.key=key; cache.val=val; } return val;
}
function newSymState(){ return {latch:newLatch(),cache:{},extra:null,lastEv:null}; }
/* st.extra (live only): {book,deriv,xex,fp} fetched asynchronously by the network layer */
function evaluateFull(bars,L,ctx,st,o){
  o=o||{}; const M0=computeA(bars,L,ctx); if(!M0) return null;
  /* pass 1: cheap, without deep evidence — decides whether this symbol deserves a deep look */
  const e0=evaluate(bars,L,ctx,null,o);
  /* engine-led mode also looks deeper at coins with unusual activity, because an engine setup (a sweep, a failed breakout …) does not need a pump/dump score to be worth checking */
  const cand=Math.max(e0.up.score,e0.dn.score)>=(o.deepAt||34)||e0.up.raw>0||e0.dn.raw>0||(!!o.indep&&(M0.rv5>=1.5||Math.max(M0.up.z15,M0.dn.z15)>=1.5));
  let deep=null;
  if(cand){ const dl=deepLite(bars,L,st.cache); if(dl){ deep=Object.assign({},dl); if(st.extra){ ['book','deriv','xex','fp'].forEach(k=>{ if(st.extra[k]) deep[k]=st.extra[k]; }); } } }
  const ev=evaluate(bars,L,ctx,deep,o,st.latch); ev.deep=deep; st.lastEv=ev; return ev;
}

/* ---------------- signal / alert construction (shared by live and back-test) ---------------- */
const BTC_COND=b=>b==null?'BTC unknown':b>.25?'BTC rising':b<-.25?'BTC falling':'BTC flat';
function topFamilies(sc,n){ return Object.keys(sc.fam).filter(k=>sc.fam[k].known).map(k=>({k,v:sc.fam[k].w*sc.fam[k].s,s:sc.fam[k].s})).sort((a,b)=>b.v-a.v).slice(0,n||3); }
/* ---------------- context tags: session · regime · entry type · evidence grade ---------------- */
/* UTC trading sessions (a label for the performance breakdown — it does NOT change the score; whether a session matters is measured, not assumed) */
function sessionOf(tSec){ const h=((tSec%86400)/3600); return h>=13&&h<16?'OVERLAP':h>=16&&h<21?'US':h>=7&&h<13?'LONDON':'ASIA'; }
/* market regime from the 5-minute structure data: efficiency ratio of the last 2 hours + current ATR vs its own recent median */
function regimeOf(ev){
  const rep=ev&&ev.deep&&ev.deep.rep; if(!rep||!rep.F) return 'UNKNOWN';
  const F=rep.F,t=rep.t; if(t<30) return 'UNKNOWN';
  let net=Math.abs(F.C[t]-F.C[t-24]), path=0; for(let j=t-23;j<=t;j++) path+=Math.abs(F.C[j]-F.C[j-1]);
  const er=path>0?net/path:0, arr=[]; for(let j=Math.max(14,t-100);j<=t;j++) if(fin(F.atr[j])) arr.push(F.atr[j]); const vr=F.atr[t]/Math.max(med(arr),1e-12);
  if(vr>=1.8) return 'HIGH_VOL'; if(er>=.35) return 'TRENDING'; if(er<=.15) return 'RANGING'; return 'TRANSITION';
}
/* what kind of entry is this? (first match wins; every matching tag is kept) — derived from the 5-minute structure events, never from candlestick patterns */
function classifyEntry(ev,dir,sc){
  const tags=[], rep=ev&&ev.deep&&ev.deep.rep;
  if(rep&&rep.F){ const F=rep.F,t=rep.t, near=(arr,w,f)=>(arr||[]).some(e=>e.dir===dir&&t-e.i<=w&&(!f||f(e)));
    if(near(F.sweeps,6)) tags.push('Liquidity Sweep Entry');
    if(near(F.struct,12,e=>e.kind==='CHoCH')) tags.push('Reversal Entry');
    if(near(F.retest,4)) tags.push('Retest Entry');
    if(near(F.brks,6)) tags.push('Breakout Entry');
    if(near(F.struct,12,e=>e.kind==='BOS')&&F.trend[t]===dir) tags.push('Trend Continuation Entry');
    const ad=ev.deep&&ev.deep.adv?(dir>0?ev.deep.adv.up:ev.deep.adv.dn):null;
    if(ad&&ad.bestZone){ const nm={OB:'Order Block Entry',FVG:'Fair-Value-Gap Entry',SD:'Supply/Demand Entry',IFVG:'Inverse FVG Entry',BPR:'Balanced Price Range Entry',BRK:'Breaker Entry',REJ:'Rejection Block Entry',PROP:'Propulsion Block Entry',VI:'Volume Imbalance Entry'}[ad.bestZone.kind]; if(nm) tags.unshift(nm); }
    if(ad){ const lines=(ad.fam.loc.lines||[]).concat(ad.fam.time.lines||[]).join(' '); if(/optimal trade entry/.test(lines)) tags.push('OTE Entry'); if(/Silver Bullet/.test(lines)) tags.push('Silver Bullet Entry'); if(/Judas/.test(lines)) tags.push('Judas Swing Entry'); }
  }
  tags.push(sc.stage>=4?'Confirmed Entry':'Early Entry');
  return {etype:tags[0],etags:tags};
}
/* evidence grade — a RANKING of how much independent evidence agrees, not a probability */
const gradeOf=(score,fams)=>score>=75&&fams>=5?'S':score>=65&&fams>=4?'A':score>=55?'B':'C';
/* engine-led grade: the setup's own strength plus the institutional conviction tier (a ranking, not a probability) */
const engGrade=(st,tier)=>tier==='HIGH_CONVICTION'&&st>=.7?'S':(tier==='HIGH_CONVICTION'||st>=.7)?'A':st>=.6?'B':'C';

/* the part of an institutional-confluence result that is stored with a signal (plain data: no zone objects, no feature arrays) */
function advSummary(ad){
  if(!ad) return null; const bz=ad.bestZone;
  return {tier:ad.tier,score:ad.score,nAgree:ad.nAgree,nKnown:ad.nKnown,mand:ad.mand,veto:ad.veto.slice(0,4),against:ad.against.slice(0,5),
    fam:Object.fromEntries(Object.keys(ad.fam).map(k=>[k,{s:Math.round(ad.fam[k].s*100)/100,known:ad.fam[k].known,w:ad.fam[k].w,name:CONF_NAME[k],lines:ad.fam[k].lines.slice(0,4)}])),
    best:bz?{kind:bz.kind,label:zoneLabel(bz),top:bz.top,bot:bz.bot,q:bz.qNow,qf:(bz.qf||[]).slice(0,4),fresh:bz.fresh,touches:bz.touches}:null,
    regime:ad.regime?{state:ad.regime.state,label:ad.regime.label||ad.regime.state}:null};
}
/* conviction of the final decision: re-evaluated with the higher-timeframe picture once it is known */
function advFor(ev,dir,ctx,hc,px){
  const R=ev&&ev.deep&&ev.deep.rep; if(!R||!R.F) return null; return advConfluence(R.F,R.t,dir,advOpts(R,ctx,ev.man,px,hc));
}
function makeSignal(sym,ev,dir,g,bars,L,ctx,presetKey){
  const sc=dir>0?ev.up:ev.dn, M=ev.M, S=dir>0?M.up:M.dn, p=g.plan, up=dir>0;
  const eg=ev.deep&&ev.deep.eng?(dir>0?ev.deep.eng.up:ev.deep.eng.dn):null, ENGM=!!(presetKey&&PRESETS[presetKey]&&PRESETS[presetKey].indep&&eg&&eg.top), etop=eg?eg.top:null;
  const lines=(ENGM?etop.evidence.map(t=>({k:'eng',name:etop.name+' — '+etop.setup,txt:t,s:etop.strength})):[]).concat(Object.keys(sc.fam).filter(k=>sc.fam[k].known&&sc.fam[k].s>=.5).sort((a,b)=>sc.fam[b].w*sc.fam[b].s-sc.fam[a].w*sc.fam[a].s).map(k=>({k,name:FAM_NAME[k],txt:sc.ev[k],s:sc.fam[k].s})));
  const weak=Object.keys(sc.fam).filter(k=>sc.fam[k].known&&sc.fam[k].s<.35).map(k=>({k,name:FAM_NAME[k],txt:sc.ev[k]}));
  const known=Object.keys(sc.fam).filter(k=>sc.fam[k].known);
  const et=classifyEntry(ev,dir,sc);
  const advS=ev.deep&&ev.deep.adv?(dir>0?ev.deep.adv.up:ev.deep.adv.dn):null;
  return {sym,dir,t:bars[L].t+60,px:bars[L].c,preset:presetKey||null,score:ENGM?Math.round(etop.strength*100):sc.score,fams:ENGM?eg.n:sc.fams,stage:sc.stage,label:ENGM?etop.setup:sc.label,
    mode:ENGM?'ENGINE':'MOMENTUM',tf:ENGM?'5m':'1m',eng:etop?engineSummary(etop):null,engN:eg?eg.n:0,engines:eg?eg.hits.slice(0,6).map(engineSummary):[],
    etype:ENGM?etop.setup:et.etype,etags:ENGM?[etop.setup].concat(et.etags.filter(x=>x!==et.etype&&x!=='Early Entry'&&x!=='Confirmed Entry')).concat(['Engine '+etop.id]):et.etags,sess:sessionOf(bars[L].t+60),regime:regimeOf(ev),grade:ENGM?engGrade(etop.strength,advS&&advS.tier):gradeOf(sc.score,sc.fams),fund:ctx&&fin(ctx.fund)?ctx.fund:null,htfTag:'UNKNOWN',
    plan:{sl:p.sl,tps:p.tps.map(x=>({p:x.p,r:x.r,src:x.src})),entry:p.entry,risk:p.risk,riskPct:p.riskPct,atr:p.atr,liq10:p.liq10,liq25:p.liq25,room:p.room,roomSrc:p.roomSrc},
    why:lines,against:weak,pen:sc.pen,man:{risk:ev.man.risk,level:ev.man.level,flags:ev.man.flags.map(f=>f.txt)},gates:g.gates.map(x=>({ok:x.ok,txt:x.txt})),known,
    top:topFamilies(sc,2).map(x=>x.k),cond:BTC_COND(ctx&&ctx.btc15),tier:M.tier,
    facts:{rv5:M.rv5,rv1:M.rv1,acc:M.acc,bs5:S.bs5,dN5:S.dN5,ret5:S.ret5,ret15:S.ret15,ret60:S.ret60,z15:S.z15,s1:M.s1,B:M.B},
    wyckoff:ev.deep&&ev.deep.wyckoff?ev.deep.wyckoff.txt:null,
    adv:advSummary(ev.deep&&ev.deep.adv?(dir>0?ev.deep.adv.up:ev.deep.adv.dn):null),conv:ev.deep&&ev.deep.adv?(dir>0?ev.deep.adv.up:ev.deep.adv.dn).tier:null,
    invalidation:(up?'a close below ':'a close above ')+pf(p.sl)+' (the level where the idea is wrong), or the stage turning to EXHAUSTION'};
}
function makeAlert(sym,ev,dir,bars,L,presetKey){
  const sc=dir>0?ev.up:ev.dn;
  return {sym,dir,stage:sc.stage,label:sc.label,t:bars[L].t+60,px:bars[L].c,score:sc.score,s1:ev.M.s1,preset:presetKey||null};
}
if(typeof module!=='undefined') module.exports={engGrade,advSummary,advFor,sessionOf,regimeOf,classifyEntry,gradeOf,deepLite,newSymState,evaluateFull,makeSignal,makeAlert,topFamilies,BTC_COND};
