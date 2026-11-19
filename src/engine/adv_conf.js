/* ================================================================
   MULTI-CONCEPT CONFLUENCE (pure — no DOM, no network)
   Nine families of independent concepts are scored for one direction at bar t:
     structure · liquidity · institutional zones · displacement/imbalance · location (premium/discount, OTE, opens, IPDA) ·
     ICT time · order flow · quant & regime · higher-timeframe alignment
   Score = fixed-weight average over the families that could actually be measured (an unmeasured family is never counted as evidence).
   Conviction tier: HIGH_CONVICTION needs a high score AND at least six families agreeing AND structure + a quality zone + (a liquidity event or displacement)
   AND no veto (higher-timeframe conflict, a strong opposing zone, volatile chop, high manipulation risk).
   The weights and thresholds are FIXED design choices — they rank setups against each other; they are not probabilities.
   What the tiers are actually worth is measured on closed signals (back-test and live) and shown in the Performance view.
   ================================================================ */
const CONF_W={struct:18,liq:18,zone:18,disp:10,loc:10,time:6,flow:10,quant:6,htf:12};
const CONF_NAME={struct:'Market structure',liq:'Liquidity (sweeps · draw · SMT)',zone:'Institutional zones',disp:'Displacement & imbalance',loc:'Location (premium/discount · OTE · opens)',time:'ICT time (killzone · Silver Bullet)',flow:'Order flow & volume structure',quant:'Quant & regime',htf:'Higher-timeframe alignment'};
const ZONE_LABEL={OB:'order block',FVG:'fair-value gap',BRK:'breaker block',SD:'supply/demand zone',IFVG:'inverse fair-value gap',BPR:'balanced price range',VI:'volume imbalance',REJ:'rejection block',PROP:'propulsion block',VOID:'liquidity void'};
const CONF_TIER={HIGH:'HIGH_CONVICTION',STD:'STANDARD',WEAK:'WEAK',VETO:'VETOED'};
const confBias=d=>d>0?'bullish':'bearish';
function zoneLabel(z){
  let k=ZONE_LABEL[z.kind]||z.kind; if(z.kind==='SD') k=(z.dir>0?'demand':'supply')+' zone'+(z.sdType?' ('+z.sdType+')':'');
  else if(z.kind==='OB'&&z.sub==='REVERSAL_OB') k='reversal order block'; else if(z.kind==='OB'&&z.sub==='MITIGATION_BLOCK') k='mitigation block'; else if(z.kind==='OB'&&z.sub==='CONTINUATION_OB') k='continuation order block';
  return confBias(z.dir)+' '+k;
}
const _last=(arr,t,w,f)=>{ for(let j=t;j>=Math.max(0,t-w);j--){ const v=arr[j]; if(v){ if(Array.isArray(v)){ for(const e of v) if(!f||f(e)) return {e,j}; } else if(!f||f(v)) return {e:v,j}; } } return null; };

function advConfluence(F,t,dir,o){
  o=o||{}; const a=F.atr[t], px=fin(o.px)?o.px:F.C[t]; if(!F.q||!fin(a)||a<=0||t<60) return null;
  const fam={}, against=[], veto=[], set=(k,s,lines,known)=>{ fam[k]={s:clip(s,0,1),w:CONF_W[k],known:known!==false,lines}; };
  const up=dir>0, sideTxt=up?'bullish':'bearish';

  /* ---- 1. market structure ---- */
  { let s=0; const L=[], tr=F.trend[t];
    if(tr===dir){ s+=.3; L.push('swing structure is '+sideTxt); } else if(tr===-dir) L.push('swing structure is '+(up?'bearish':'bullish')+' (this would be counter-trend)');
    const ev=_last(F.structAt,t,20,e=>e.dir===dir&&!e.init);
    if(ev){ const e=ev.e, age=t-ev.j;
      if(e.kind==='CHoCH'){ s+=e.mss?.5:.38; L.push((e.mss?'market-structure shift (change of character with displacement after a liquidity sweep)':'change of character')+' '+age+' bar'+(age===1?'':'s')+' ago'); }
      else if(tr===dir){ s+=.25; L.push('break of structure '+age+' bar'+(age===1?'':'s')+' ago, with the trend'); } }
    const rt=_last(F.retestAt,t,6,e=>e.dir===dir); if(rt){ s+=.15; L.push('break & retest held'); }
    const opp=_last(F.structAt,t,6,e=>e.dir===-dir&&e.kind==='CHoCH'); if(opp){ s-=.25; against.push('a '+(up?'bearish':'bullish')+' change of character '+(t-opp.j)+' bars ago'); }
    set('struct',s,L); }

  /* ---- 2. liquidity ---- */
  { let s=0; const L=[];
    const sw=_last(F.sweepAt,t,20,e=>e.dir===dir);
    if(sw){ const e=sw.e, rk=POOL_RANK[e.kind]||1; let b=.3+.07*rk; if(e.rej>=.4) b+=.07; if(e.rv>=1.3) b+=.05; if(e.n>1) b+=.05; if(e.flip) b+=.03; if(t-sw.j>8) b*=.8; s+=Math.min(.62,b);
      L.push('swept '+(up?'sell':'buy')+'-side liquidity ('+(KIND_TXT[e.kind]||'level')+(e.n>1?' ×'+e.n:'')+') and reclaimed it '+(t-sw.j)+' bar'+(t-sw.j===1?'':'s')+' ago'); }
    const ind=_last(F.indAt,t,6,e=>e.dir===dir); if(ind){ s+=.2; L.push('inducement: a minor '+(up?'low':'high')+' was taken inside a '+zoneLabel(ind.e.zone)); }
    const dr=F.drawAt(t); const tgt=dr?(up?dr.up:dr.dn):null; if(tgt){ s+=.1+.04*(tgt.rank-1); L.push('draw on liquidity: '+(KIND_TXT[tgt.kind]||'level')+' '+tgt.dist.toFixed(1)+' ATR '+(up?'above':'below')+' is the next target'); }
    if(o.smt){ if(o.smt.dir===dir){ s+=.2; L.push('SMT divergence — '+o.smt.txt); } else{ s-=.1; against.push('SMT divergence points the other way — '+o.smt.txt); } }
    const brk=_last(F.brkAt,t,3,e=>e.dir===-dir&&(POOL_RANK[e.kind]||1)>=3); if(brk){ s-=.15; against.push('a major '+(KIND_TXT[brk.e.kind]||'level')+' was just broken the other way with momentum'); }
    set('liq',s,L); }

  /* ---- 3. institutional zones ---- */
  let bestZone=null, zoneList=[];
  { let s=0; const L=[]; const zs=F.zonesAt(t,{reach:1.0,px:o.px}); zoneList=zs;
    const mine=zs.filter(z=>z.dir===dir&&z.kind!=='VOID'&&(z.inside||z.dist<=.35)); bestZone=mine[0]||null;
    if(bestZone){ s+=clip((bestZone.qNow-30)/55,0,1)*.7; if(bestZone.fresh) s+=.1; if(bestZone.ceHit) s-=.05;
      const kinds=new Set(mine.map(z=>z.kind)); if(kinds.size>=3) s+=.25; else if(kinds.size===2) s+=.15;
      L.push('price is '+(bestZone.inside?'inside':'at')+' a '+zoneLabel(bestZone)+' (quality '+bestZone.qNow+'/100'+(bestZone.fresh?', untested':', tested '+bestZone.touches+'×')+')'+(kinds.size>=2?' · stacked with '+[...kinds].filter(k=>k!==bestZone.kind).map(k=>ZONE_LABEL[k]).join(' + '):''));
      if(bestZone.qf&&bestZone.qf.length) L.push('why it ranks: '+bestZone.qf.slice(0,3).join('; '));
      const rx=(F.zr[t]||[]).concat(F.zxr[t]||[]).find(r=>r.dir===dir); if(rx){ s+=.15; L.push('price reacted from the zone on this bar'+(rx.first?' (first touch)':'')); } }
    const blockers=zs.filter(z=>z.dir===-dir&&z.kind!=='VOID'&&z.qNow>=60&&z.dist<=1.0).sort((x,y)=>y.qNow-x.qNow);
    if(blockers.length){ const z=blockers[0]; s-=.25; against.push(zoneLabel(z)+' (quality '+z.qNow+') '+(z.inside?'contains price':z.dist.toFixed(1)+' ATR away')+' in the way'); if(z.inside&&z.qNow>=75) veto.push('price is inside a strong opposing '+zoneLabel(z)); }
    set('zone',s,L); }

  /* ---- 4. displacement & imbalance ---- */
  { let s=0; const L=[];
    let dj=-1; for(let j=t;j>=Math.max(0,t-12);j--){ if(F.dsp[j]===dir){ dj=j; break; } }
    if(dj>=0){ s+=.35; if(F.dspMag[dj]>=1.8) s+=.1; if(F.rv[dj]>=1.3) s+=.15; L.push('displacement candle '+F.dspMag[dj].toFixed(1)+' ATR '+(t-dj)+' bar'+(t-dj===1?'':'s')+' ago'+(F.rv[dj]>=1.3?' on volume ×'+F.rv[dj].toFixed(1):'')); }
    let fv=null,ot=null; for(let j=t;j>=Math.max(0,t-12);j--){ (F.bornAt[j]||[]).forEach(Z=>{ if(Z.dir!==dir) return; if(!fv&&(Z.kind==='FVG'||Z.kind==='BPR'||Z.kind==='IFVG')&&(Z.q||0)>=50&&(Z.end==null||Z.end>t)) fv=Z; if(!ot&&(Z.kind==='VI'||Z.kind==='VOID')) ot=Z; }); }
    if(fv){ s+=.3; L.push('fresh '+zoneLabel(fv)+' left behind (quality '+fv.q+')'); } if(ot){ s+=.1; L.push(zoneLabel(ot)+' formed'); }
    set('disp',s,L); }

  /* ---- 5. location ---- */
  { let s=0; const L=[], pd=F.pd[t], ict=F.ictAt(t), fib=F.fibAt(t);
    if(fin(pd)){ if(up?pd<=.5:pd>=.5){ s+=.3; L.push((up?'discount':'premium')+' of the dealing range ('+Math.round(pd*100)+'%)'); if(up?pd<=.3:pd>=.7) s+=.1; } else if(up?pd>.8:pd<.2){ s-=.15; against.push((up?'buying':'selling')+' at the '+(up?'premium':'discount')+' extreme of the range ('+Math.round(pd*100)+'%)'); } }
    if(fib&&fib.dir===dir&&fib.inOte){ s+=.3; L.push('inside the optimal trade entry zone (62–79% retracement of the last '+(up?'up':'down')+' leg)'); }
    let op=0; const nm={daily:'daily open',nyMid:'New York midnight open',ny830:'08:30 New York open',weekly:'weekly open'}; Object.keys(nm).forEach(k=>{ if(ict.vs[k]===-dir&&op<2){ op++; s+=.1; L.push('price is '+(up?'below':'above')+' the '+nm[k]+' ('+(up?'discount':'premium')+' to the open)'); } });
    if(ict.ipda){ const p=ict.ipda.pos20; if(p!=null){ if(up?p<=.4:p>=.6){ s+=.15; L.push('in the '+(up?'discount':'premium')+' half of the 20-day (IPDA) range'); } } }
    set('loc',s,L,fin(pd)||!!fib); }

  /* ---- 6. ICT time ---- */
  { let s=0; const L=[], ict=F.ictAt(t), clock=F.opt.tfSec<=3600;
    if(clock){ if(ict.kz&&ict.kz!=='ASIA'){ s+=.45; L.push(ict.kzTxt); } else if(ict.kz==='ASIA'){ s+=.1; L.push('Asian session'); } else L.push('outside the main killzones');
      if(ict.sb){ s+=.25; L.push(ict.sbTxt); }
      const jd=_last(F.judas,t,6,e=>e.dir===dir); if(jd){ s+=.3; L.push('Judas swing: a false move '+(up?'down':'up')+' from the '+(jd.e.win==='MID'?'midnight':'08:30')+' open was taken back through it'); } }
    set('time',s,L,clock); }

  /* ---- 7. order flow ---- */
  { let s=0; const L=[], fl=F.flowAt(t);
    if(fl.delta3*dir>0){ s+=clip(fl.delta3*dir,0,1)*.3; if(fl.delta3*dir>.25) L.push('taker flow over the last 3 bars is '+(up?'buying':'selling')+' ('+(fl.delta3>0?'+':'')+fl.delta3.toFixed(2)+' bars of volume)'); } else if(fl.delta3*dir<-.4){ s-=.15; against.push('taker flow is against the trade'); }
    if(fl.delta10*dir>.1) s+=.1;
    if(fl.stack.dir===dir&&fl.stack.n>=3){ s+=.25; L.push(fl.stack.n+' consecutive one-sided '+(up?'buying':'selling')+' bars'); }
    if(fl.absorb&&fl.absorb.dir===dir){ s+=.3; L.push((up?'sell':'buy')+'ing was absorbed (heavy volume, no progress) '+fl.absorb.age+' bar(s) ago'); }
    if(fl.exhaust&&fl.exhaust.dir===dir){ s+=.2; L.push('the opposite move made a new extreme on fading volume and opposing flow'); }
    const dv=_last(F.divAt,t,10,e=>e.dir===dir&&e.kind==='reg'&&e.ind.indexOf('Volume delta')>=0); if(dv){ s+=.2; L.push('cumulative-delta divergence ('+dv.e.ind.join(' + ')+')'); }
    if(fl.vp&&fl.vp.poc!=null&&(up?px<fl.vp.poc:px>fl.vp.poc)&&Math.abs(fl.vp.poc-px)/a<=8) { s+=.05; L.push('the volume point of control is '+(up?'above':'below')+' (a magnet)'); }
    set('flow',s,L,F.hasDelta); }

  /* ---- 8. quant & regime ---- */
  let reg=null;
  { const L=[], q=F.quantAt(t); reg=F.regimeAt(t); const counter=F.trend[t]===-dir, fit=reg.fit?(counter?reg.fit.reversal:reg.fit.trend):.5;
    let bp=clip(.5+.5*q.bias*dir,0,1);
    /* trend-following indicators lag: right after a structure shift in our direction they still point the old way, so they are treated as neutral, not as evidence against */
    const shifted=!!_last(F.structAt,t,20,e=>e.dir===dir&&e.kind==='CHoCH'); if(shifted&&bp<.5){ bp=.5; L.push('lagging trend indicators still point the old way — expected right after a reversal, counted as neutral'); }
    const s=.6*bp+.4*fit;
    L.push('quant vote '+(q.bias>=0?'+':'')+q.bias.toFixed(2)+' ('+q.mode.toLowerCase().replace('_',' ')+')'+' · regime: '+(reg.label||reg.state)+(reg.txt?' — '+reg.txt:''));
    if(reg.state==='CHOP') against.push('volatile chop — no directional edge');
    set('quant',s,L); }

  /* ---- 9. higher timeframes ---- */
  { const h=o.htf, known=!!h&&h.align!=='UNKNOWN', L=[]; let s=.5;
    if(known){ s=h.align==='ALIGNED'?.9:h.align==='MIXED'?(h.bias!=null&&h.bias*dir>0?.6:.45):.05; L.push(h.txt); if(h.conflict) veto.push('higher-timeframe structure conflicts with this trade'); (h.notes||[]).forEach(n=>against.push(n)); }
    set('htf',s,L,known); }

  if(o.manip!=null&&o.manip>=45) veto.push('manipulation risk is high ('+Math.round(o.manip)+')');
  if(reg&&reg.state==='CHOP') veto.push('market is in volatile chop');

  let sc=0,wk=0; Object.keys(fam).forEach(k=>{ if(fam[k].known){ sc+=fam[k].w*fam[k].s; wk+=fam[k].w; } });
  let score=wk?100*sc/wk:0; if(o.manip!=null&&o.manip>0) score-=Math.min(12,o.manip*.2); score=clip(score,0,100);
  const known=Object.keys(fam).filter(k=>fam[k].known), agree=known.filter(k=>fam[k].s>=.55), against_f=known.filter(k=>fam[k].s<=.3);
  const mand=fam.struct.s>=.55&&fam.zone.s>=.5&&(fam.liq.s>=.45||fam.disp.s>=.45);
  const zq=bestZone?bestZone.qNow:0;
  let tier=CONF_TIER.WEAK;
  if(veto.length) tier=CONF_TIER.VETO;
  else if(score>=72&&agree.length>=6&&mand&&zq>=65) tier=CONF_TIER.HIGH;
  else if(score>=58&&agree.length>=4) tier=CONF_TIER.STD;
  const why=known.filter(k=>fam[k].s>=.5&&fam[k].lines.length).sort((x,y)=>fam[y].w*fam[y].s-fam[x].w*fam[x].s).map(k=>({k,name:CONF_NAME[k],s:fam[k].s,lines:fam[k].lines}));
  return {dir,score,tier,fam,known,agree,againstFams:against_f,nAgree:agree.length,nKnown:known.length,mand,bestZone,zones:zoneList,veto,against,why,regime:reg,
    summary:tier+' · '+Math.round(score)+'/100 · '+agree.length+' of '+known.length+' concept families agree'};
}

/* compact picture of the advanced context for the analysis panel and the chart (both sides, nothing directional) */
function advPanel(F,t){
  if(!F.q||t<60) return null; const a=F.atr[t], px=F.C[t];
  const zones=F.zonesAt(t,{reach:6}).filter(z=>z.kind!=='VOID'||z.inside).slice(0,12).map(z=>({kind:z.kind,sub:z.sub,label:zoneLabel(z),dir:z.dir,top:z.top,bot:z.bot,ce:z.ce,q:z.qNow,qf:z.qf,fresh:z.fresh,touches:z.touches,dist:z.dist,inside:z.inside,sdType:z.sdType}));
  const pools=F.pools.filter(P=>P.b<=t&&(P.end==null||t<P.end)&&(P.taken==null||t<P.taken)&&P.b<t).map(P=>({p:P.p,kind:P.kind,n:P.n,txt:KIND_TXT[P.kind]||P.kind,dist:(P.p-px)/a,rank:POOL_RANK[P.kind]||1})).sort((x,y)=>Math.abs(x.dist)-Math.abs(y.dist)).slice(0,10);
  return {t,px,atr:a,zones,pools,ict:F.ictAt(t),draw:F.drawAt(t),bias:F.ictBiasAt(t),flow:F.flowAt(t),regime:F.regimeAt(t),quant:F.quantAt(t),fib:F.fibAt(t)};
}
if(typeof module!=='undefined') module.exports={advConfluence,advPanel,zoneLabel,CONF_W,CONF_NAME,CONF_TIER};
