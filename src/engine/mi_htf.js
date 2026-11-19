/* ================================================================
   MULTI-TIMEFRAME INTELLIGENCE (pure — no DOM, no network)
   The 16 timeframes: 1m 3m 5m 15m 30m 45m 1h 2h 4h 6h 12h 1d 3d 5d 1w 1M.
   · 1m / 3m / 5m come from the live 1-minute buffer
   · 15m 30m 1h 2h 4h 6h 12h 1d 3d 1w 1M are real exchange candles (downloaded by mi_net for the few coins being analysed)
   · 45m and 5d do not exist on Binance, so they are merged from 15m and 1d candles (epoch-aligned, complete groups only)
   Each timeframe is analysed with the SAME structure/liquidity/zone engine used for 5-minute analysis (buildFeatures).
   Higher timeframes set the direction and the targets; lower timeframes decide the entry. A signal that fights the
   4h AND the daily structure is flagged as a timeframe conflict (and blocked, by default).
   A timeframe without enough history (e.g. a coin listed 3 weeks ago has no monthly structure) is reported as
   "not enough history" — it is never filled with invented values.
   ================================================================ */
const HTF={
  ids:['1m','3m','5m','15m','30m','45m','1h','2h','4h','6h','12h','1d','3d','5d','1w','1M'],
  native:['15m','30m','1h','2h','4h','6h','12h','1d','3d','1w','1M'],
  ttl:{'15m':120,'30m':240,'1h':360,'2h':600,'4h':900,'6h':1200,'12h':1800,'1d':1800,'3d':3600,'1w':3600,'1M':14400},     // seconds between refreshes (a bar can only change when it closes)
  w:{'15m':1,'30m':1,'45m':1,'1h':1.5,'2h':1.5,'4h':2,'6h':1.5,'12h':1.5,'1d':2.5,'3d':1.5,'5d':1.5,'1w':2,'1M':1},     // vote weights (a design choice, not an optimised value)
  minBars:40, minBy:{'3d':30,'5d':30,'1w':30,'1M':20}, show:['15m','1h','4h','1d','1w'], maxAge:900
};
const HTF_ARROW=v=>v>0?'▲':v<0?'▼':'–';

/* merge k consecutive base candles into one (complete groups only) */
function mergeBars(bars,k,baseSec){
  const out=[]; let cur=null; const step=baseSec*k;
  for(const b of bars){
    const key=Math.floor(b.t/step)*step;
    if(!cur||cur.t!==key){ cur={t:key,o:b.o,h:b.h,l:b.l,c:b.c,v:b.v,q:b.q,V:b.V,Q:b.Q,n:b.n,cnt:1}; out.push(cur); }
    else{ if(b.h>cur.h) cur.h=b.h; if(b.l<cur.l) cur.l=b.l; cur.c=b.c; cur.v+=b.v; cur.q+=b.q; cur.V+=b.V; cur.Q+=b.Q; cur.n+=b.n; cur.cnt++; }
  }
  if(out.length&&out[0].cnt<k) out.shift();
  if(out.length&&out[out.length-1].cnt<k) out.pop();
  return out;
}

/* analyse one timeframe from FINISHED candles {t,o,h,l,c,v,q,V,Q,n} (seconds) */
function analyzeTF(id,bars,nowS){
  const T=tfOf(id), res={id,sec:T.sec,ok:false,n:bars?bars.length:0,reason:null,trend:0};
  const need=HTF.minBy[id]||HTF.minBars;
  if(!bars||bars.length<need){ res.reason='not enough history ('+(bars?bars.length:0)+' candles, need '+need+')'; return res; }
  let F; try{ F=buildFeatures(toCandles(bars),{tfSec:T.sec}); }catch(e){ res.reason='analysis failed'; return res; }
  const t=F.n-1, px=F.C[t], a=F.atr[t];
  res.ok=true; res.t=bars[t].t; res.px=px; res.atrPct=a/px*100; res.trend=F.trend[t];
  const st=F.struct.length?F.struct[F.struct.length-1]:null;
  res.last=st?{kind:st.kind,dir:st.dir,age:t-st.i,mss:!!st.mss}:null;
  res.pd=fin(F.pd[t])?F.pd[t]:null; res.range=fin(F.rHi[t])?{hi:F.rHi[t],lo:F.rLo[t]}:null;
  /* live zones near price, ranked by quality (order blocks, fair-value gaps, breakers, supply/demand, inverse FVG, balanced price range, rejection / propulsion blocks) */
  res.zones=F.zonesAt(t,{reach:8}).filter(z=>z.kind!=='VOID'&&z.kind!=='VI').slice(0,8).map(z=>({kind:z.kind,sub:z.sub,dir:z.dir,top:z.top,bot:z.bot,strong:z.qNow>=70,q:z.qNow,dist:z.dist,inside:z.inside,label:zoneLabel(z)}));
  try{ const rg=F.regimeAt(t), bs=F.ictBiasAt(t); res.regime=rg.state; res.regimeTxt=rg.label||rg.state; res.ictBias=bs.bias; }catch(e){}
  res.pools=F.pools.filter(P=>poolAlive(P,t)).map(P=>({p:P.p,kind:P.kind,n:P.n,side:P.side})).sort((x,y)=>Math.abs(x.p-px)-Math.abs(y.p-px)).slice(0,8);
  res.sweeps=F.sweeps.filter(e=>t-e.i<=6).map(e=>({dir:e.dir,kind:e.kind,lvl:e.lvl,age:t-e.i}));
  /* cumulative volume delta over the last 14 candles vs price (real taker-buy volume when the exchange supplies it) */
  if(F.hasDelta&&t>=16){ const dc=F.cvd[t]-F.cvd[t-14], dp=F.C[t]-F.C[t-14], sc=Math.max(1e-9,F.avgV[t]*14);
    res.cvd={dir:sgn(dc),norm:clip(dc/sc,-1,1),priceDir:sgn(dp),div:(sgn(dc)!==sgn(dp)&&Math.abs(dc/sc)>.15&&Math.abs(dp)>.3*a)?(dc>0?'bullish':'bearish'):null}; }
  /* chart patterns only ever describe context here — they are never a signal by themselves */
  try{ if(t>=70){ res.patterns=F.patAt(t).filter(p=>p.dir&&p.q>=60).slice(0,2).map(p=>({name:p.name,dir:p.dir,status:p.status})); } }catch(e){}
  /* moving-average structure: supporting evidence only */
  res.emaUp=F.ema20[t]>F.ema50[t]; res.rsi=F.rsi[t];
  return res;
}

/* previous / current day, week and month levels from real candles */
function calLevels(raw,nowS){
  const out=[], one=(id,pre,open)=>{ const r=raw&&raw[id]; if(!r||!r.bars||!r.bars.length) return; const T=tfOf(id);
    const closed=r.bars.filter(b=>barEnd(b.t,T)<=nowS), cur=r.bars.find(b=>b.t<=nowS&&nowS<barEnd(b.t,T));
    if(closed.length){ const p=closed[closed.length-1]; out.push({p:p.h,src:'previous '+pre+' high',major:true,cal:id},{p:p.l,src:'previous '+pre+' low',major:true,cal:id}); }
    if(cur) out.push({p:cur.o,src:open+' open',major:false,cal:id}); };
  one('1d','day','daily'); one('1w','week','weekly'); one('1M','month','monthly'); return out;
}

/* build the whole multi-timeframe picture for one coin */
function buildHtf(bars1m,raw,nowS){
  const tf={};
  HTF.ids.forEach(id=>{
    const T=tfOf(id); let bars=null;
    try{
      if(id==='1m') bars=bars1m.slice(-400);
      else if(id==='3m'||id==='5m') bars=bars1m.length?aggBars(bars1m,bars1m.length-1,T.sec/60).slice(-(id==='3m'?400:300)):null;
      else{ const src=T.f>1?tfOf(T.bin):T, r=raw&&raw[src.id]; const closed=r?r.bars.filter(b=>barEnd(b.t,src)<=nowS):null; bars=closed?(T.f>1?mergeBars(closed,T.f,src.sec):closed):null; }
    }catch(e){ bars=null; }
    tf[id]=analyzeTF(id,bars,nowS);
  });
  let sw=0,sv=0; HTF.ids.forEach(id=>{ const x=tf[id]; if(x.ok&&x.trend&&x.sec>=900){ sw+=HTF.w[id]; sv+=HTF.w[id]*x.trend; } });
  const got=HTF.ids.filter(id=>tf[id].ok).length;
  return {at:Date.now(),tf,bias:sw?sv/sw:null,nVotes:HTF.ids.filter(id=>tf[id].ok&&tf[id].trend&&tf[id].sec>=900).length,loaded:got,cal:calLevels(raw,nowS),ok:got>=4};
}

/* candidate target / obstacle levels from the higher timeframes, relative to the current price */
function htfLevels(h,px){
  if(!h||!h.ok) return [];
  const o=(h.cal||[]).map(l=>({p:l.p,src:l.src,major:l.major})), near=p=>Math.abs(p-px)/px<.08;
  ['1h','2h','4h','1d','3d','1w'].forEach(id=>{ const x=h.tf[id]; if(!x||!x.ok) return;
    (x.zones||[]).forEach(Z=>{ if(!(Z.kind==='OB'||Z.kind==='SD'||Z.kind==='IFVG'||Z.kind==='BPR'||(Z.kind==='FVG'&&Z.strong))) return; if(Z.q!=null&&Z.q<55) return; const p=Z.bot>px?Z.bot:Z.top<px?Z.top:null; if(p==null||!near(p)) return;
      const supply=Z.dir<0, label=id+' '+(Z.label||((Z.dir>0?'bullish':'bearish')+' '+(Z.kind==='OB'?'order block':Z.kind==='BRK'?'breaker':'fair-value gap')))+(Z.q!=null?' (quality '+Z.q+')':'');
      o.push({p,src:label,major:true,block:!!Z.strong&&(Z.kind==='OB'||Z.kind==='SD')&&(supply===(p>px))}); });
    (x.pools||[]).forEach(P=>{ if(!near(P.p)||(P.kind!=='EQH'&&P.kind!=='EQL'&&P.n<2&&P.kind!=='PDH'&&P.kind!=='PDL')) return; o.push({p:P.p,src:id+' '+(KIND_TXT[P.kind]||'liquidity')+(P.n>1?' ×'+P.n:''),major:true}); }); });
  return o.filter(l=>near(l.p)).sort((a,b)=>Math.abs(a.p-px)-Math.abs(b.p-px)).slice(0,14);
}

/* does the higher-timeframe picture oppose a trade in direction dir? */
function htfCheck(h,dir,policy){
  if(!h||!h.ok) return {align:'UNKNOWN',conflict:false,tag:'UNKNOWN',txt:'Higher-timeframe data not loaded yet (the engine fetches it for candidates)',cells:[]};
  const v=id=>h.tf[id]&&h.tf[id].ok&&h.tf[id].trend?h.tf[id].trend:0, has=id=>h.tf[id]&&h.tf[id].ok;
  const majors=['4h','1d'].filter(has), opp=majors.filter(id=>v(id)===-dir), sup=majors.filter(id=>v(id)===dir);
  let conflict=false;
  if(majors.length===2) conflict=opp.length===2;
  else if(majors.length===1) conflict=opp.length===1&&v('1h')===-dir;
  const bias=h.bias==null?0:h.bias, aligned=!conflict&&bias*dir>=.25&&opp.length===0, align=conflict?'CONFLICT':aligned?'ALIGNED':'MIXED';
  const cells=HTF.show.map(id=>({id,v:has(id)?v(id):null})), row=cells.map(c=>c.id+(c.v==null?' n/a':' '+HTF_ARROW(c.v))).join(' · ');
  const notes=[]; const d1=h.tf['1d'], h4=h.tf['4h'];
  [['daily',d1],['4h',h4]].forEach(([nm,x])=>{ if(x&&x.ok&&x.pd!=null){ if(dir>0&&x.pd>.85) notes.push('price is at '+Math.round(x.pd*100)+'% of the '+nm+' dealing range (premium) — buying high in the range'); else if(dir<0&&x.pd<.15) notes.push('price is at '+Math.round(x.pd*100)+'% of the '+nm+' dealing range (discount) — selling low in the range'); } });
  /* price sitting in / right under a strong opposing higher-timeframe zone */
  ['1h','2h','4h','6h','12h','1d'].forEach(id=>{ const x=h.tf[id]; if(!x||!x.ok) return; const z=(x.zones||[]).find(q=>q.dir===-dir&&q.q>=65&&(q.inside||q.dist<=.5)); if(z) notes.push('price is '+(z.inside?'inside':'right at')+' a '+id+' '+z.label+' (quality '+z.q+') that opposes this trade'); });
  const dv=['15m','1h','4h','1d'].filter(id=>has(id)&&h.tf[id].cvd&&h.tf[id].cvd.div===(dir>0?'bearish':'bullish')); if(dv.length) notes.push('CVD divergence against the trade on '+dv.join(', '));
  const txt=row+' → '+(conflict?'CONFLICT: '+opp.join(' and ')+' structure opposes this trade':aligned?'higher timeframes agree':'mixed — no major timeframe opposes, no clear alignment')+(notes.length?' · '+notes.join(' · '):'');
  return {align,conflict,tag:align,txt,cells,bias,opp,sup,notes};
}
if(typeof module!=='undefined') module.exports={HTF,mergeBars,analyzeTF,calLevels,buildHtf,htfLevels,htfCheck,HTF_ARROW};
