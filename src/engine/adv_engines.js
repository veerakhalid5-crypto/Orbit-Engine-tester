/* ================================================================
   SIGNAL-ENGINE REGISTRY + INDEPENDENT ENGINE DETECTORS (pure — no DOM, no network)

   The 50-engine specification is mapped one-to-one below, and each engine carries an HONEST status:
     kind  'signal'  raises its own BUY/SELL setups from candles (+ taker-buy volume where the exchange supplies it)
           'live'    raises setups only from live data fetched for candidates (order book · derivatives · other venues · trade tape)
           'context' does not raise signals: it feeds regime / gating / ranking / measurement of the others
           'none'    NOT BUILT (the data or a validated method is not available here) — listed, never faked
     built 'full' · 'partial' (the note says what is missing) · 'none'
   Every hit is tagged with its engine and setup type and carries a rule-based STRENGTH (0..1): a ranking of how cleanly the setup is formed,
   NOT a probability.  What an engine's setups are really worth is measured per engine on closed signals (back-test + live) and shown in Performance.
   DEPENDENCY: engines that read the same underlying event share a CLUSTER; agreement is counted per cluster, so one sweep seen through three
   lenses is one piece of evidence, not three (spec #49: duplicate-confirmation prevention).
   All candle detectors are causal: they use bars <= t only (verified by prefix-invariance tests).
   ================================================================ */
const ENG_CL={SMC:'Smart-money / ICT price delivery',FLOW:'Order flow (candle delta)',PROF:'Volume profile & VWAP',STRUCT:'Structure & levels',PATT:'Chart patterns & geometry',MOM:'Momentum & volatility',STAT:'Statistical models',DERIV:'Derivatives & positioning',BOOK:'Order book & trade tape',XMKT:'Cross-market',CTX:'Context only'};
const _E=(no,name,cluster,kind,built,data,setups,note)=>({no,id:'E'+(no<10?'0':'')+no,name,cluster,kind,built,data,setups:setups||[],note:note||''});
const ENGINE_DEFS=[
 _E(1,'Institutional order flow & footprint','FLOW','signal','partial','candles + taker-buy volume',['Absorption reversal','Exhaustion reversal','Stacked-imbalance continuation'],'bar-level delta only; per-price footprint clusters and bid/ask imbalances need tick data (the live trade tape is used for candidates)'),
 _E(2,'Liquidity engineering & smart-money concepts','SMC','signal','full','candles',['Liquidity sweep & reclaim','Inducement into zone','Order-block reaction','Fair-value-gap reaction','Breaker reaction','Inverse-FVG / balanced-range reaction'],''),
 _E(3,'Volume profile & auction market theory','PROF','signal','full','candles (volume)',['Failed auction at value-area edge'],'profile is built from bar volume spread across each bar\'s range (not tick-level)'),
 _E(4,'Price action & market structure','STRUCT','signal','full','candles',['Change of character / market-structure shift','Break of structure continuation'],''),
 _E(5,'Trendline & dynamic structure','STRUCT','signal','full','candles',['Trendline break & retest','Trendline bounce','Trendline momentum break'],''),
 _E(6,'Chart pattern recognition','PATT','signal','full','candles',['Chart-pattern breakout'],'double/triple tops-bottoms, head & shoulders, triangles, wedges, flags/pennants, rectangles, cup & handle; broadening and complex patterns are not built'),
 _E(7,'Breakout & retest intelligence','STRUCT','signal','full','candles',['Breakout retest','Failed breakout (trap)'],''),
 _E(8,'Supply & demand zones','SMC','signal','full','candles',['Supply / demand zone reaction'],''),
 _E(9,'Market microstructure & liquidity imbalance','BOOK','live','partial','live order-book snapshot',['Order-book pressure'],'snapshot of the book at scan time only; no book history, so replenishment/layering is limited to spoof-like wall disappearance'),
 _E(10,'Momentum & volatility intelligence','MOM','signal','full','candles',['Momentum divergence reversal'],''),
 _E(11,'Wyckoff accumulation / distribution','SMC','signal','partial','candles',['Spring','Upthrust'],'spring / upthrust at a range edge; full phase labelling (SC, AR, ST, LPS …) is not built'),
 _E(12,'Derivatives & positioning','DERIV','live','partial','futures open interest · funding · long/short · liquidations (live)',['Positioning-supported move','Squeeze fuel'],'futures-listed coins only; no futures-basis history'),
 _E(13,'Multi-timeframe structural alignment','CTX','context','partial','candles (16 timeframes)',[],'used as the higher-timeframe family of the conviction score and as a hard gate; does not raise signals itself'),
 _E(14,'AI pattern & regime recognition','CTX','context','partial','candles',[],'rule-based regime classifier + statistical anomaly flags; there is no neural network. The logistic meta-label stays inert until 100 closed signals exist'),
 _E(15,'Relative strength & SMT divergence','XMKT','signal','partial','candles of the coin and of BTC',['SMT divergence vs BTC'],'BTC is the only reference market; sector leadership needs sector data'),
 _E(16,'Level-2 order-book intelligence','BOOK','live','partial','live order-book snapshot',['Depth pressure'],'same snapshot as engine 9; queue dynamics / resilience need a book stream'),
 _E(17,'VPIN (informed-trading probability)','FLOW','context','partial','candles + taker-buy volume',[],'VPIN-lite on bar buckets; used as a toxicity flag, it measures one-sidedness not direction'),
 _E(18,'VWAP & anchored-VWAP intelligence','PROF','signal','full','candles (volume)',['Anchored-VWAP reclaim / loss','VWAP trend pullback'],''),
 _E(19,'Market profile & TPO','PROF','none','none','candles',[],'NOT BUILT: TPO letters / initial balance / single prints need session time-at-price; value area, POC, HVN and LVN are covered by engine 3'),
 _E(20,'Statistical arbitrage & mean reversion','STAT','signal','partial','candles',['Z-score extreme reversion (range regime)'],'single-asset z-score + Ornstein-Uhlenbeck half-life; cointegration needs pairs (not built)'),
 _E(21,'Adaptive support & resistance','STRUCT','context','partial','candles',[],'level strength and decay live inside the zone / pool quality scores; no separate signals'),
 _E(22,'Fractal market structure & multiscale analysis','CTX','context','partial','candles',[],'multi-timeframe swing structure and Hurst exponent; fractal dimension is not computed'),
 _E(23,'Elliott wave','CTX','none','none','candles',[],'NOT BUILT: wave counts are subjective and cannot be validated honestly'),
 _E(24,'Harmonic patterns & Fibonacci confluence','PATT','signal','partial','candles',['Gartley','Bat','Butterfly','Crab','AB=CD'],'five patterns completed at the projected reversal zone; Shark and Cypher are not built'),
 _E(25,'Market cycle & spectral analysis','CTX','none','none','candles',[],'NOT BUILT: Fourier / Hilbert / wavelet cycles are not shown to add value on noisy crypto bars and would be decoration'),
 _E(26,'Quantitative trend & state-space models','STAT','signal','partial','candles',['Kalman trend flip'],'Kalman local-trend filter; hidden Markov models are not built'),
 _E(27,'Volatility surface & options flow','CTX','none','none','options data',[],'NOT BUILT: needs options data (implied-volatility skew, gamma exposure) which is not available here'),
 _E(28,'Liquidation cascade & leverage pressure','DERIV','live','partial','futures liquidations + open interest (live)',['Liquidation-driven move'],'based on the liquidation stream seen while the app is open, not on estimated liquidation maps'),
 _E(29,'Price efficiency & market entropy','CTX','context','full','candles',[],'permutation entropy, Hurst exponent, efficiency ratio and variance ratio are computed and shown as a predictability read'),
 _E(30,'Execution & trade-impact analysis','CTX','context','partial','live depth + volume',[],'slippage / liquidity gates and the estimated cost of getting in; there is no order execution'),
 _E(31,'Breakout compression & volatility squeeze','MOM','signal','full','candles',['Squeeze release breakout'],''),
 _E(32,'Quantitative momentum & acceleration','MOM','signal','full','candles',['Trend pullback continuation'],''),
 _E(33,'Market breadth & participation','CTX','context','partial','scanned universe',[],'share of scanned coins rising (live); sector participation needs sector data'),
 _E(34,'Cross-exchange liquidity & price dislocation','XMKT','live','partial','live prices from other venues',['Cross-venue confirmation'],'a handful of spot venues, current price and 24h change only'),
 _E(35,'Time-series anomaly & change-point detection','STAT','signal','partial','candles',['CUSUM change-point with abnormal volume'],'CUSUM; Bayesian change-points are not built'),
 _E(36,'Machine-learning meta-labeling','CTX','context','partial','closed signals',[],'a regularised logistic model trained on this app\'s own closed signals; inert (no effect) until 100 outcomes exist'),
 _E(37,'Optimal entry & execution timing','CTX','context','partial','candles',[],'entry zones come from the zone / OTE / retest logic; there is no order-flow trigger or order execution'),
 _E(38,'Regression channels & price bands','STAT','signal','partial','candles',['Regression-channel trend pullback'],'linear regression channel; polynomial / adaptive channels are not built'),
 _E(39,'Pair divergence & relative value','XMKT','signal','partial','candles of the coin and of BTC',['Beta-adjusted relative-value reversion vs BTC'],'residual vs BTC only; correlation breakdown and cointegrated pairs are not built'),
 _E(40,'Regime-adaptive signal intelligence','CTX','context','full','candles',[],'regime classifier with fixed fit table; setups that need a trend are suppressed in chop'),
 _E(41,'Order-flow imbalance & microprice','BOOK','live','partial','live order-book snapshot',['Book imbalance + wall-free path'],'needs a book stream for true OFI / Kyle\'s lambda; here a single snapshot'),
 _E(42,'Liquidity heat-map & book evolution','CTX','none','none','historical level-2 data',[],'NOT BUILT: historical depth heat-maps need stored level-2 history which is not available'),
 _E(43,'Trade-flow classification & absorption','BOOK','live','partial','live trade tape (aggTrades)',['Tape aggression with large orders'],'candidates only, last few minutes of trades; iceberg estimation is not built'),
 _E(44,'Breakout probability & false-breakout modelling','CTX','context','partial','closed signals',[],'measured hit rates per setup type from back-test and live outcomes; no assumed probabilities'),
 _E(45,'Bayesian market probability','CTX','context','partial','closed signals',[],'Beta-binomial posterior of each engine\'s MEASURED hit rate with a 90% credible interval'),
 _E(46,'Deep-learning temporal intelligence','CTX','none','none','trained model',[],'NOT BUILT: no training pipeline or validated model exists here; nothing is pretended'),
 _E(47,'Event-driven market reaction','CTX','context','partial','candles',[],'abnormal volume / price reactions are flagged; scheduled-event calendars are not available'),
 _E(48,'Cross-asset risk transmission','CTX','context','partial','BTC candles',[],'BTC trend / volatility as the risk-on / risk-off backdrop; other asset classes are not available'),
 _E(49,'Signal ensemble & evidence dependency','CTX','context','full','—',[],'dependency clusters, independent-cluster agreement, duplicate prevention and cooldowns'),
 _E(50,'Probabilistic outcome & risk-adjusted opportunity','CTX','context','partial','closed signals',[],'triple-barrier outcomes (targets / stop / time) with max adverse and favourable excursion; expected value is shown only from measured results (needs ≥30)')
];
const ENG_BY={}; ENGINE_DEFS.forEach(e=>{ ENG_BY[e.id]=e; });
function engineCoverage(){
  const c={total:ENGINE_DEFS.length,signal:0,live:0,context:0,none:0,full:0,partial:0,built:0};
  ENGINE_DEFS.forEach(e=>{ c[e.kind]++; if(e.built==='full') c.full++; else if(e.built==='partial') c.partial++; }); c.built=c.full+c.partial; return c;
}

/* ---------------- helpers ---------------- */
const _EMIN=.55;                                    /* a hit below this strength is not reported */
function _hit(id,setup,dir,s,ev,x){ const E=ENG_BY[id]; return Object.assign({id,name:E.name,cluster:E.cluster,setup,dir,strength:Math.round(clip(s,0,1)*100)/100,evidence:ev},x||{}); }
function _pivSeq(F,t){                              /* alternating confirmed swing points known at bar t (the more extreme of consecutive same-side pivots wins) */
  const out=[]; for(const p of F.piv){ if(p.ci>t) break; const L=out[out.length-1]; if(L&&L.t===p.t){ if(p.t==='H'?p.p>L.p:p.p<L.p) out[out.length-1]=p; } else out.push(p); } return out;
}
function _zloc(F,t,d,reach,minQ){                   /* is price at a quality zone of direction d? returns the best one */
  const zs=F.zonesAt(t,{reach:reach==null?.6:reach}); return zs.find(z=>z.dir===d&&z.kind!=='VOID'&&z.qNow>=(minQ||45)&&(z.inside||z.dist<=.5))||null;
}
function _recentSweep(F,t,d,w){ return _last(F.sweepAt,t,w,e=>e.dir===d); }

/* ================= E01 order flow ================= */
function dFlow(F,t,out){
  if(!F.hasDelta) return; const a=F.atr[t];
  for(let j=t;j>=Math.max(0,t-1);j--){
    const d=F.absorb[j]; if(d){
      const conf=j===t?true:(d>0?F.C[t]>F.C[j]:F.C[t]<F.C[j]); if(!conf) continue;
      const z=_zloc(F,t,d,.7,45), sw=_recentSweep(F,t,d,8); if(!z&&!sw) continue;          /* absorption in the middle of nowhere is noise */
      const s=.4+(F.rv[j]>=2.5?.07:0)+(z?.1+clip((z.qNow-45)/200,0,.08):0)+(sw?.1:0)-(t-j)*.03;
      out.push(_hit('E01','Absorption reversal',d,s,['heavy volume ×'+F.rv[j].toFixed(1)+' in a small range while '+(d>0?'sellers':'buyers')+' were aggressive — the other side absorbed it'].concat(z?['at a '+zoneLabel(z)]:[]).concat(sw?['after a liquidity sweep']:[]),{inval:d>0?F.L[j]-.15*a:F.H[j]+.15*a,age:t-j})); break; }
  }
  for(let j=t;j>=Math.max(0,t-1);j--){
    const d=F.exh[j]; if(d){
      const conf=j===t?(d>0?F.C[t]>F.O[t]:F.C[t]<F.O[t]):(d>0?F.C[t]>F.C[j]:F.C[t]<F.C[j]); if(!conf) continue;
      const sw=_recentSweep(F,t,d,4); if(!sw) continue;
      out.push(_hit('E01','Exhaustion reversal',d,.42+(sw.e.rej>=.5?.08:0)+(F.rv[j]<.6?.05:0)+(POOL_RANK[sw.e.kind]>=3?.06:0)-(t-j)*.03,['a new 20-bar '+(d>0?'low':'high')+' on thin volume (×'+F.rv[j].toFixed(1)+') with flow pointing the other way','the extreme took '+(KIND_TXT[sw.e.kind]||'resting')+' liquidity and was rejected'],{inval:d>0?Math.min(F.L[j],sw.e.ext)-.15*a:Math.max(F.H[j],sw.e.ext)+.15*a,age:t-j})); break; }
  }
  const sk=F.stk[t], n=Math.abs(sk), d=Math.sign(sk);
  if(n>=3&&F.trend[t]===d&&F.rv[t]>=1.3){ let ex=d>0?Infinity:-Infinity; for(let j=t-n+1;j<=t;j++) ex=d>0?Math.min(ex,F.L[j]):Math.max(ex,F.H[j]);
    out.push(_hit('E01','Stacked-imbalance continuation',d,.4+.06*Math.min(n-2,5)+(F.dsp[t]?.05:0),[n+' consecutive bars of one-sided aggressive '+(d>0?'buying':'selling')+' with volume ×'+F.rv[t].toFixed(1)+', with the swing trend'],{inval:d>0?ex-.2*a:ex+.2*a,age:0})); }
}

/* ================= E02 liquidity / SMC  +  E08 supply & demand ================= */
const _Z02=['OB','FVG','BRK','IFVG','BPR','VI'];
function dSMC(F,t,out){
  const a=F.atr[t], px=F.C[t];
  const sw=_last(F.sweepAt,t,2);
  if(sw){ const e=sw.e, rk=POOL_RANK[e.kind]||1;
    if((rk>=2||e.n>1)&&e.rej>=.35&&e.cb>=.1){
      const s=.42+.06*rk+(e.rej>=.5?.06:0)+(e.rv>=1.3?.05:0)+(e.flip?.04:0)+(e.n>1?.04:0)+(e.ex>=.5?.03:0)-(t-sw.j)*.03;
      out.push(_hit('E02','Liquidity sweep & reclaim',e.dir,s,['swept '+(e.dir>0?'sell':'buy')+'-side liquidity at '+(KIND_TXT[e.kind]||'a level')+(e.n>1?' (×'+e.n+' equal levels)':'')+' and closed back '+e.cb.toFixed(1)+' ATR '+(e.dir>0?'above':'below')+' it','rejection wick '+Math.round(e.rej*100)+'% of the range'],{inval:e.dir>0?e.ext-.12*a:e.ext+.12*a,lvl:e.lvl,age:t-sw.j})); } }
  const ind=_last(F.indAt,t,1); if(ind&&ind.e.zone){ const e=ind.e, Z=e.zone, q=zoneQualityNow(Z,zoneState(F,Z,ind.j));
    if(q>=50&&(e.dir>0?F.C[t]>F.O[t]:F.C[t]<F.O[t])) out.push(_hit('E02','Inducement into zone',e.dir,.42+clip((q-50)/150,0,.2)+(F.rv[t]>=1.2?.04:0),['a minor '+(e.dir>0?'low':'high')+' was taken inside a '+zoneLabel(Z)+' (quality '+q+'/100) and price turned'],{inval:e.dir>0?Z.bot-.15*a:Z.top+.15*a,entry:[Z.bot,Z.top],age:t-ind.j})); }
  for(let j=t;j>=Math.max(0,t-1);j--){
    const evs=(F.zr[j]||[]).concat(F.zxr[j]||[]);
    for(const e of evs){ const Z=e.z, d=e.dir; if(j<t&&!(d>0?F.C[t]>F.C[j]:F.C[t]<F.C[j])) continue;
      const st=zoneState(F,Z,j), q=zoneQualityNow(Z,st); if(q<55) continue;
      const is02=_Z02.indexOf(Z.kind)>=0, id=is02?'E02':'E08', pd=F.pd[j];
      const s=.34+clip((q-45)/55,0,1)*.28+(e.first?.1:0)+(st.fresh?.04:0)+(fin(pd)&&(d>0?pd<.5:pd>.5)?.05:0)+(F.rv[j]>=1.3?.03:0)-(t-j)*.03;
      const nm=({OB:'Order-block',FVG:'Fair-value-gap',BRK:'Breaker',IFVG:'Inverse-FVG',BPR:'Balanced-range',VI:'Volume-imbalance'})[Z.kind]||'Supply / demand zone';
      out.push(_hit(id,is02?nm+' reaction':'Supply / demand zone reaction',d,s,['price reacted from a '+zoneLabel(Z)+' (quality '+q+'/100'+(st.fresh?', untested':', tested '+st.touches+'×')+(e.first?', first touch':'')+')'].concat(Z.qf&&Z.qf.length?['why it ranks: '+Z.qf.slice(0,2).join('; ')]:[]),{inval:d>0?Z.bot-.15*a:Z.top+.15*a,entry:[Z.bot,Z.top],age:t-j,zone:{kind:Z.kind,top:Z.top,bot:Z.bot,q}})); }
  }
}

/* ================= E03 volume profile — failed auction ================= */
function dProfile(F,t,out){
  if(t<90) return; const a=F.atr[t], vp=F.vpAt(t-4,150,48); if(!vp) return;           /* the profile BEFORE the excursion */
  let hi=-Infinity,lo=Infinity,above=0,below=0; for(let j=t-3;j<=t;j++){ hi=Math.max(hi,F.H[j]); lo=Math.min(lo,F.L[j]); if(F.C[j]>vp.vah) above++; if(F.C[j]<vp.val) below++; }
  const c=F.C[t], rng=F.H[t]-F.L[t]||1e-12;
  if(hi>vp.vah+.2*a&&c<vp.vah-.1*a&&above<=1&&(F.C[t]<F.O[t]||(F.H[t]-c)/rng>=.5)&&vp.poc<c-1*a){
    const s=.42+(hi>vp.vah+.5*a?.05:0)+((F.H[t]-c)/rng>=.6?.05:0)+(F.rv[t]>=1.2?.06:0)+(F.hasDelta&&F.dl[t]<0?.06:0)+(c-vp.poc>2*a?.05:0);
    out.push(_hit('E03','Failed auction above value',-1,s,['price pushed '+((hi-vp.vah)/a).toFixed(1)+' ATR above the value area high and was not accepted — it closed back inside','target: the point of control '+pf(vp.poc)+', then the value area low '+pf(vp.val)],{inval:hi+.15*a,tgt:[vp.poc,vp.val],age:0})); }
  if(lo<vp.val-.2*a&&c>vp.val+.1*a&&below<=1&&(F.C[t]>F.O[t]||(c-F.L[t])/rng>=.5)&&vp.poc>c+1*a){
    const s=.42+(lo<vp.val-.5*a?.05:0)+((c-F.L[t])/rng>=.6?.05:0)+(F.rv[t]>=1.2?.06:0)+(F.hasDelta&&F.dl[t]>0?.06:0)+(vp.poc-c>2*a?.05:0);
    out.push(_hit('E03','Failed auction below value',1,s,['price pushed '+((vp.val-lo)/a).toFixed(1)+' ATR below the value area low and was not accepted — it closed back inside','target: the point of control '+pf(vp.poc)+', then the value area high '+pf(vp.vah)],{inval:lo-.15*a,tgt:[vp.poc,vp.vah],age:0})); }
}

/* ================= E04 structure · E05 trendlines · E06 chart patterns · E07 breakout & retest ================= */
function dStruct(F,t,out){
  const a=F.atr[t];
  const ch=_last(F.structAt,t,2,e=>e.kind==='CHoCH'&&!e.init&&e.disp>=1);
  if(ch){ const e=ch.e, s=.45+(e.mss?.12:0)+(e.sweep?.06:0)+clip((e.disp-1)*.06,0,.1)+(e.beyond>=.3?.04:0)+(F.rv[ch.j]>=1.3?.04:0)-(t-ch.j)*.03;
    out.push(_hit('E04',e.mss?'Market-structure shift':'Change of character',e.dir,s,[(e.mss?'market-structure shift: ':'')+'change of character — price closed '+e.beyond.toFixed(1)+' ATR '+(e.dir>0?'above':'below')+' the swing '+(e.dir>0?'high':'low')+' '+pf(e.lvl)+' with a '+e.disp.toFixed(1)+' ATR displacement candle'+(e.sweep?', after sweeping liquidity':'')],{inval:e.prot+(e.dir>0?-.1:.1)*a,lvl:e.lvl,age:t-ch.j})); }
  const bs=_last(F.structAt,t,1,e=>e.kind==='BOS'&&e.disp>=1.2&&F.trend[t]===e.dir);
  if(bs&&F.rv[bs.j]>=1.3){ const e=bs.e, st=F.regimeAt(t);
    if(st.state!=='CHOP') out.push(_hit('E04','Break of structure continuation',e.dir,.4+clip((e.disp-1.2)*.05,0,.08)+(F.rv[bs.j]>=1.8?.05:0)+(st.fit.trend>=.8?.06:0),['break of structure through '+pf(e.lvl)+' with the trend, displacement '+e.disp.toFixed(1)+' ATR, volume ×'+F.rv[bs.j].toFixed(1)],{inval:e.lvl-e.dir*.4*a,lvl:e.lvl,age:t-bs.j})); }
}
function dTrendline(F,t,out){
  const a=F.atr[t], ev=_last(F.tlAt,t,1); if(!ev) return; const e=ev.e, d=e.dir, Z=e.line, lv=F.tlVal(Z,t), tc=Math.min(e.touches||2,6);
  if(e.kind==='retest') out.push(_hit('E05','Trendline break & retest',d,.4+.05*Math.min(tc,5)+(F.rv[t]>=1?.03:0),['price broke a '+tc+'-touch trendline and retested it from the other side — it held'],{inval:lv-d*.4*a,age:t-ev.j}));
  else if(e.kind==='bounce'&&tc>=3) out.push(_hit('E05','Trendline bounce',d,.38+.06*Math.min(tc-2,4)+(F.rv[t]>=1.2?.03:0),['bounce from a '+tc+'-touch '+(d>0?'rising support':'falling resistance')+' trendline'],{inval:lv-d*.5*a,age:t-ev.j}));
  else if(e.kind==='break'&&F.rv[t]>=1.5&&Math.abs(F.C[t]-F.O[t])/a>=.8) out.push(_hit('E05','Trendline momentum break',d,.38+.04*Math.min(tc,5)+(F.rv[t]>=2?.05:0),['a '+tc+'-touch trendline broke with a '+(Math.abs(F.C[t]-F.O[t])/a).toFixed(1)+' ATR body and volume ×'+F.rv[t].toFixed(1)],{inval:lv-d*.3*a,age:t-ev.j}));
}
function dPattern(F,t,out){
  if(t<70) return; const a=F.atr[t]; let best=null;
  for(const p of F.patAt(t)){ if(!p.dir||p.status!=='breakout'||p.brkI==null||t-p.brkI>2||p.q<60) continue; if(!best||p.q>best.q) best=p; }
  if(!best) return; const p=best, s=.4+clip((p.q-60)/40,0,1)*.22+(F.rv[p.brkI]>=1.3?.05:0)-(t-p.brkI)*.03;
  out.push(_hit('E06',p.name+' breakout',p.dir,s,[p.name+' (pattern quality '+Math.round(p.q)+'/100) broke out '+(t-p.brkI)+' bar'+(t-p.brkI===1?'':'s')+' ago'+(F.rv[p.brkI]>=1.3?' on volume ×'+F.rv[p.brkI].toFixed(1):'')],{inval:p.stop!=null?p.stop:F.C[t]-p.dir*2*a,tgt:p.target!=null?[p.target]:null,lvl:p.level,age:t-p.brkI}));
}
function dBreakout(F,t,out){
  const a=F.atr[t]; const rt=(F.retestAt[t]||[]).find(e=>e.healthy&&e.rej>=.35);
  if(rt){ const rk=POOL_RANK[rt.kind]||1; out.push(_hit('E07','Breakout retest',rt.dir,.42+.03*rk+(rt.rej>=.5?.06:0)+(rt.gap<=8?.04:0)+(rt.pierce<=.15?.04:0),['broke '+(KIND_TXT[rt.kind]||'a level')+' '+rt.gap+' bars ago, came back to '+pf(rt.lvl)+' on lower volume and held'],{inval:rt.lvl-rt.dir*.5*a,lvl:rt.lvl,age:0})); }
  for(let j=t-1;j>=Math.max(0,t-6);j--){ const b=(F.brkAt[j]||[]).find(e=>(POOL_RANK[e.kind]||1)>=2); if(!b) continue; const d=-b.dir;
    if(F.C[t]*b.dir<b.lvl*b.dir-.3*a&&(d>0?F.C[t]>F.O[t]:F.C[t]<F.O[t])&&Math.abs(F.C[t]-F.O[t])/a>=.4){
      let ex=b.dir>0?-Infinity:Infinity; for(let k=j;k<=t;k++) ex=b.dir>0?Math.max(ex,F.H[k]):Math.min(ex,F.L[k]);
      out.push(_hit('E07','Failed breakout (trap)',d,.45+.04*(POOL_RANK[b.kind]||1)+(F.rv[j]>=1.5?.04:0)+(t-j<=3?.04:0),['price broke '+(KIND_TXT[b.kind]||'a level')+' '+pf(b.lvl)+' '+(t-j)+' bars ago and is now back '+((b.lvl-F.C[t])*b.dir/a).toFixed(1)+' ATR on the other side — breakout traders are trapped'],{inval:ex+b.dir*.12*a,lvl:b.lvl,age:t-j})); break; } }
}

/* ================= E10 momentum divergence · E31 squeeze · E32 trend pullback ================= */
function dMomentum(F,t,out){
  const a=F.atr[t], Q=F.q, rg=F.regimeAt(t);
  const dv=_last(F.divAt,t,1,e=>e.kind==='reg'&&e.n>=2);
  if(dv){ const e=dv.e, d=e.dir; if(d>0?F.C[t]>F.O[t]:F.C[t]<F.O[t]){ const z=_zloc(F,t,d,.7,45), sw=_recentSweep(F,t,d,6);
      out.push(_hit('E10','Momentum divergence reversal',d,.38+.08*(e.n-1)+(z?.08:0)+(sw?.08:0)+(rg.state==='CHOP'?-.1:0),['price made a '+(d>0?'lower low':'higher high')+' while '+e.ind.join(' + ')+' did not confirm it'].concat(z?['at a '+zoneLabel(z)]:[]).concat(sw?['after a liquidity sweep']:[]),{inval:d>0?e.pr2-.15*a:e.pr2+.15*a,age:t-dv.j})); } }
}
function dSqueeze(F,t,out){
  const Q=F.q; if(t<30||!Q.sqz) return; const a=F.atr[t]; let sq=0; for(let j=t-12;j<t;j++) if(Q.sqz[j]===1) sq++;
  if(sq<6||Q.sqz[t]===1) return; const d=Q.dcBrk[t]||(F.C[t]>Q.bbUp[t]?1:F.C[t]<Q.bbLo[t]?-1:0); if(!d) return;
  const body=Math.abs(F.C[t]-F.O[t])/a; if(F.rv[t]<1.3||body<.5||(d>0?F.C[t]<F.O[t]:F.C[t]>F.O[t])) return;
  let hi=-Infinity,lo=Infinity; for(let j=t-12;j<t;j++){ hi=Math.max(hi,F.H[j]); lo=Math.min(lo,F.L[j]); }
  out.push(_hit('E31','Squeeze release breakout',d,.4+clip((F.rv[t]-1.3)*.1,0,.1)+(fin(Q.bwRank[t-1])&&Q.bwRank[t-1]<=.2?.05:0)+(F.trend[t]===d?.05:0)+(body>=1?.04:0),['Bollinger bands were inside the Keltner channel for '+sq+' of the last 12 bars, now released '+(d>0?'upward':'downward')+' with volume ×'+F.rv[t].toFixed(1)],{inval:(hi+lo)/2,age:0}));
}
function dTrendPullback(F,t,out){
  const a=F.atr[t], Q=F.q, rg=F.regimeAt(t); if(rg.state!=='TREND_UP'&&rg.state!=='TREND_DOWN') return; const d=rg.state==='TREND_UP'?1:-1;
  const e20=F.ema20[t]; if(!fin(e20)||!fin(Q.roc[t])||!fin(Q.roc[t-2])) return;
  let tag=false, ex=d>0?Infinity:-Infinity; for(let j=t-6;j<=t-1;j++){ if(d>0?F.L[j]<=e20+.1*a:F.H[j]>=e20-.1*a) tag=true; ex=d>0?Math.min(ex,F.L[j]):Math.max(ex,F.H[j]); }
  if(!tag||(d>0?!(F.C[t]>e20&&F.C[t]>F.O[t]):!(F.C[t]<e20&&F.C[t]<F.O[t]))||(d>0?Q.roc[t]<=Q.roc[t-2]:Q.roc[t]>=Q.roc[t-2])||Math.abs(F.C[t]-e20)>1.5*a||F.rv[t]<.9) return;
  out.push(_hit('E32','Trend pullback continuation',d,.46+(F.trend[t]===d?.05:0)+(_zloc(F,t,d,.7,45)?.05:0)+(Q.adx[t]>30?.08:Q.adx[t]>25?.04:0)+(Q.er[t]>.5?.05:0)+(rg.trendiness>=.75?.04:0)+(F.pd[t]!=null&&fin(F.pd[t])&&(d>0?F.pd[t]<.5:F.pd[t]>.5)?.04:0),['strong '+(d>0?'up':'down')+'trend (ADX '+Q.adx[t].toFixed(0)+', efficiency '+Q.er[t].toFixed(2)+'): price pulled back to the 20-period average and closed back '+(d>0?'above':'below')+' it with momentum turning'],{inval:ex-d*.15*a,age:0}));
}

/* ================= E11 Wyckoff spring / upthrust ================= */
function dWyckoff(F,t,out){
  if(t<70) return; const a=F.atr[t];
  for(const W of [60,40]){
    let hi=-Infinity,lo=Infinity; for(let j=t-W;j<t-2;j++){ hi=Math.max(hi,F.H[j]); lo=Math.min(lo,F.L[j]); } const R=hi-lo; if(R>6*a||R<1.5*a) continue;
    let th=0,tl=0; for(let j=t-W;j<t-2;j++){ if(F.H[j]>=hi-.3*a) th++; if(F.L[j]<=lo+.3*a) tl++; } if(th<2||tl<2) continue;
    for(let j=t;j>=t-2;j--){
      if(F.L[j]<lo-.1*a&&F.C[j]>lo&&F.C[t]>lo+.1*a&&F.C[t]>(F.H[j]+F.L[j])/2){ const lowVol=F.rv[j]<=1.2, climax=F.rv[j]>=2;
        if(lowVol||climax) out.push(_hit('E11','Spring',1,.4+Math.min(tl,5)*.02+(lowVol?.05:.08)+(F.hasDelta&&F.dl[t]>0?.04:0)+(t-j===0?.03:0),['range '+pf(lo)+' – '+pf(hi)+' ('+W+' bars, '+tl+' tests of the low): price dipped below the low (volume ×'+F.rv[j].toFixed(1)+', '+(lowVol?'no supply behind it':'a selling climax')+') and was bought back inside'],{inval:F.L[j]-.15*a,tgt:[(hi+lo)/2,hi],age:t-j})); break; }
      if(F.H[j]>hi+.1*a&&F.C[j]<hi&&F.C[t]<hi-.1*a&&F.C[t]<(F.H[j]+F.L[j])/2){ const lowVol=F.rv[j]<=1.2, climax=F.rv[j]>=2;
        if(lowVol||climax) out.push(_hit('E11','Upthrust',-1,.4+Math.min(th,5)*.02+(lowVol?.05:.08)+(F.hasDelta&&F.dl[t]<0?.04:0)+(t-j===0?.03:0),['range '+pf(lo)+' – '+pf(hi)+' ('+W+' bars, '+th+' tests of the high): price poked above the high (volume ×'+F.rv[j].toFixed(1)+', '+(lowVol?'no demand behind it':'a buying climax')+') and was sold back inside'],{inval:F.H[j]+.15*a,tgt:[(hi+lo)/2,lo],age:t-j})); break; }
    }
    if(out.some(h=>h.id==='E11')) return;
  }
}

/* ================= E15 SMT · E18 VWAP · E20 mean reversion · E24 harmonics · E26 Kalman · E35 change-point · E38 channel · E39 relative value ================= */
function dSMT(F,t,out,o){
  if(!o||!o.smtRef) return; const s=smtAt(F,o.smtRef,t,20); if(!s) return; const a=F.atr[t], d=s.dir, sw=_recentSweep(F,t,d,6), ch=_last(F.structAt,t,6,e=>e.dir===d&&e.kind==='CHoCH'&&!e.init);
  if(!sw&&!ch) return;                                   /* a divergence on its own is not a trigger */
  const kz=F.kzId[t]>0;
  out.push(_hit('E15','SMT divergence vs BTC',d,.45+(sw?.1:0)+(ch?.08:0)+(kz?.04:0),['SMT divergence: '+s.txt].concat(sw?['with a liquidity sweep '+(t-sw.j)+' bars ago']:[]).concat(ch?['and a change of character '+(t-ch.j)+' bars ago']:[]),{inval:d>0?Math.min(F.L[t],F.L[t-1],F.L[t-2])-.2*a:Math.max(F.H[t],F.H[t-1],F.H[t-2])+.2*a,age:0}));
}
function dVWAP(F,t,out){
  const Q=F.q, a=F.atr[t]; if(t<40) return;
  const L=Q.avwapL, H=Q.avwapH;
  if(fin(L[t])&&fin(L[t-1])&&F.C[t]>L[t]+.05*a&&F.rv[t]>=1.1){ let was=false; for(let j=t-5;j<t;j++) if(F.C[j]<L[j]-.05*a) was=true; if(was&&F.C[t]>F.O[t]) out.push(_hit('E18','Anchored-VWAP reclaim',1,.4+(F.rv[t]>=1.5?.06:0)+(Q.stDir[t]===1?.05:0)+(F.hasDelta&&F.dl[t]>0?.04:0),['price reclaimed the VWAP anchored at the last swing low ('+pf(L[t])+') on volume ×'+F.rv[t].toFixed(1)],{inval:L[t]-.5*a,age:0})); }
  if(fin(H[t])&&fin(H[t-1])&&F.C[t]<H[t]-.05*a&&F.rv[t]>=1.1){ let was=false; for(let j=t-5;j<t;j++) if(F.C[j]>H[j]+.05*a) was=true; if(was&&F.C[t]<F.O[t]) out.push(_hit('E18','Anchored-VWAP loss',-1,.4+(F.rv[t]>=1.5?.06:0)+(Q.stDir[t]===-1?.05:0)+(F.hasDelta&&F.dl[t]<0?.04:0),['price lost the VWAP anchored at the last swing high ('+pf(H[t])+') on volume ×'+F.rv[t].toFixed(1)],{inval:H[t]+.5*a,age:0})); }
  const v=Q.vwap[t]; if(fin(v)&&F.opt.tfSec<=14400){ const d=Q.stDir[t]; let side=0; for(let j=t-10;j<t;j++) if(d>0?F.C[j]>Q.vwap[j]:F.C[j]<Q.vwap[j]) side++;
    if(d&&side>=8&&(d>0?(F.L[t]<=v+.1*a&&F.C[t]>v+.1*a&&F.C[t]>F.O[t]):(F.H[t]>=v-.1*a&&F.C[t]<v-.1*a&&F.C[t]<F.O[t]))) out.push(_hit('E18','VWAP trend pullback',d,.4+(Q.adx[t]>25?.06:0)+(F.rv[t]>=1.1?.04:0)+((d>0?F.pd[t]<.5:F.pd[t]>.5)?.04:0),['price tested the daily VWAP '+pf(v)+' from the '+(d>0?'upside':'downside')+' (held on '+side+' of the last 10 bars) and rejected it'],{inval:v-d*.5*a,age:0})); }
}
function dMeanRev(F,t,out){
  const Q=F.q, a=F.atr[t], rg=F.regimeAt(t); if(rg.state!=='RANGE'&&rg.state!=='QUIET') return; const z=Q.zC[t]; if(!fin(z)||Math.abs(z)<2.3) return;
  const d=-Math.sign(z), ou=qOU(F,t,100); if(!ou||!ou.reverting||ou.halfLife<3||ou.halfLife>40) return;
  if(!(d>0?F.C[t]>F.O[t]&&F.C[t]>F.C[t-1]:F.C[t]<F.O[t]&&F.C[t]<F.C[t-1])) return;
  let ex=d>0?Infinity:-Infinity; for(let j=t-2;j<=t;j++) ex=d>0?Math.min(ex,F.L[j]):Math.max(ex,F.H[j]);
  const sw=_recentSweep(F,t,d,4);
  out.push(_hit('E20','Z-score extreme reversion',d,.38+clip((Math.abs(z)-2.3)/1.5,0,.2)+.07+(sw?.06:0)+(fin(Q.pctB[t])&&(d>0?Q.pctB[t]<.05:Q.pctB[t]>.95)?.04:0),['price is '+Math.abs(z).toFixed(1)+' standard deviations from its 50-bar mean in a '+rg.label.toLowerCase()+' market; mean-reversion half-life ≈ '+ou.halfLife.toFixed(0)+' bars','the latest bar is already turning back toward the mean'],{inval:ex-d*.3*a,tgt:fin(Q.bbMid[t])?[Q.bbMid[t]]:null,age:0}));
}
const HARM=[ /* ratios are fractions of XA unless noted; bullish form shown (mirror for bearish) */
  {n:'Gartley',b:[.58,.66],d:[.74,.82],bc:[.38,.886]},{n:'Bat',b:[.36,.52],d:[.85,.92],bc:[.38,.886]},
  {n:'Butterfly',b:[.74,.82],d:[1.2,1.65],bc:[.38,.886]},{n:'Crab',b:[.36,.64],d:[1.55,1.7],bc:[.38,.886]}];
function dHarmonic(F,t,out){
  if(t<80) return; const a=F.atr[t], P=_pivSeq(F,t); if(P.length<4) return; const m=P.length;
  /* X A B C are the last four confirmed swings; D is the projected completion zone that price is arriving at now */
  const X=P[m-4], A=P[m-3], B=P[m-2], C=P[m-1]; if(!(X.t===B.t&&A.t===C.t)) return; const d=X.t==='L'?1:-1;      /* X low → bullish pattern */
  const XA=Math.abs(A.p-X.p); if(XA<3*a||t-C.i>60||t-C.i<3) return;
  const bRet=Math.abs(A.p-B.p)/XA, AB=Math.abs(A.p-B.p), bc=Math.abs(C.p-B.p)/AB;
  const near=(v,r)=>v>=r[0]&&v<=r[1], hits=[];
  for(const h of HARM){ if(!near(bRet,h.b)||!near(bc,h.bc)) continue;
    const dr=(h.d[0]+h.d[1])/2, Dp=A.p-d*dr*XA, lo=A.p-d*h.d[1]*XA, hi=A.p-d*h.d[0]*XA, zl=Math.min(lo,hi)-.3*a, zh=Math.max(lo,hi)+.3*a;
    if(d>0?!(F.L[t]<=zh&&F.L[t]>=zl-.5*a):!(F.H[t]>=zl&&F.H[t]<=zh+.5*a)) continue;                       /* price has reached the reversal zone */
    if(!(d>0?F.C[t]>F.O[t]&&F.C[t]>zl+.3*a:F.C[t]<F.O[t]&&F.C[t]<zh-.3*a)) continue;                       /* and turned */
    const fit=1-Math.abs(bRet-(h.b[0]+h.b[1])/2)/(h.b[1]-h.b[0]+.01)*.25;
    hits.push({n:h.n,fit,Dp,dr}); }
  const ABCD=Math.abs(bc-.618)<=.17&&true; if(!hits.length&&ABCD){                     /* AB=CD: D where CD equals AB */
    const Dp=C.p-d*AB, zl=Dp-.4*a, zh=Dp+.4*a; if(d>0?(F.L[t]<=zh&&F.L[t]>=zl-.5*a&&F.C[t]>F.O[t]&&F.C[t]>zl+.3*a):(F.H[t]>=zl&&F.H[t]<=zh+.5*a&&F.C[t]<F.O[t]&&F.C[t]<zh-.3*a)) hits.push({n:'AB=CD',fit:.8,Dp,dr:null}); }
  if(!hits.length) return; hits.sort((x,y)=>y.fit-x.fit); const h=hits[0], CD=Math.abs(C.p-h.Dp);
  out.push(_hit('E24',h.n+(d>0?' (bullish)':' (bearish)'),d,.4+clip(h.fit-.7,0,.3)*.4+(F.rv[t]>=1.2?.04:0)+(h.n==='AB=CD'?-.04:.04)+(_recentSweep(F,t,d,3)?.06:0),[h.n+' pattern X-A-B-C complete (B retraces '+bRet.toFixed(2)+' of XA, BC '+bc.toFixed(2)+' of AB); price reached the projected reversal zone near '+pf(h.Dp)+' and turned'],{inval:d>0?Math.min(F.L[t],h.Dp)-.4*a:Math.max(F.H[t],h.Dp)+.4*a,tgt:[h.Dp+d*.382*CD,h.Dp+d*.618*CD],age:0}));
}
function dKalman(F,t,out){
  const k=qKalman(F,t,150); if(!k||!k.flip) return; const a=F.atr[t], rg=F.regimeAt(t); if(rg.state==='CHOP') return; const d=k.dir;
  const e20=F.ema20[t]; if(!fin(e20)||(d>0?F.C[t]<e20:F.C[t]>e20)||F.rv[t]<1) return;
  const ch=_last(F.structAt,t,8,e=>e.dir===d&&!e.init); if(!ch) return;                         /* the filter flips often in noise: require structure to agree */
  let ex=d>0?Infinity:-Infinity; for(let j=t-6;j<=t;j++) ex=d>0?Math.min(ex,F.L[j]):Math.max(ex,F.H[j]);
  out.push(_hit('E26','Kalman trend flip',d,.4+clip((Math.abs(k.z)-1)*.06,0,.1)+(ch.e.kind==='CHoCH'?.06:.03)+(F.rv[t]>=1.3?.04:0),['the Kalman trend filter changed slope to '+(d>0?'up':'down')+' (slope '+k.z.toFixed(1)+' standard errors) and structure agrees ('+ch.e.kind+' '+(t-ch.j)+' bars ago)'],{inval:ex-d*.15*a,age:0}));
}
function dChangePoint(F,t,out){
  const c=qCusum(F,t); if(!c||!c.hit) return; const a=F.atr[t], rg=F.regimeAt(t), d=c.hit.dir; if(rg.state==='CHOP') return;
  let vm=0; for(let j=t-3;j<=t;j++) vm=Math.max(vm,F.rv[j]||0); if(vm<2||(d>0?F.C[t]<F.O[t-1]:F.C[t]>F.O[t-1])) return;
  let ex=d>0?Infinity:-Infinity; for(let j=t-5;j<=t;j++) ex=d>0?Math.min(ex,F.L[j]):Math.max(ex,F.H[j]);
  out.push(_hit('E35','CUSUM change-point with abnormal volume',d,.38+clip((c.hit.s-5)*.03,0,.1)+(vm>=3?.06:.03)+(F.trend[t]===d?.04:0),['cumulative-sum test detected a sustained '+(d>0?'upward':'downward')+' shift in returns versus the earlier baseline, with volume ×'+vm.toFixed(1)],{inval:ex-d*.2*a,age:c.hit.age}));
}
function dChannel(F,t,out){
  const ch=qRegChannel(F,t,100); if(!ch||ch.r2<.55||Math.abs(ch.slopeAtr)<.04) return; const a=F.atr[t], d=ch.slope>0?1:-1;
  if(d>0?!(ch.pos<=-1.5&&F.C[t]>F.O[t]&&F.C[t]>F.L[t]+.5*(F.H[t]-F.L[t])):!(ch.pos>=1.5&&F.C[t]<F.O[t]&&F.C[t]<F.H[t]-.5*(F.H[t]-F.L[t]))) return;
  const sw=_recentSweep(F,t,d,3);
  out.push(_hit('E38','Regression-channel trend pullback',d,.38+clip((ch.r2-.55)*.3,0,.1)+clip((Math.abs(ch.pos)-1.5)*.08,0,.06)+(sw?.06:0)+(F.rv[t]>=1.1?.03:0),['price is '+Math.abs(ch.pos).toFixed(1)+' standard deviations '+(d>0?'below':'above')+' a '+(d>0?'rising':'falling')+' 100-bar regression channel (R² '+ch.r2.toFixed(2)+') and turned back'],{inval:F.C[t]-d*(Math.abs(F.C[t]-ch.mid)>0?.6*ch.sd:.5*a),tgt:[ch.mid,d>0?ch.up:ch.lo],age:0}));
}
function dRelValue(F,t,out,o){
  const R=o&&o.btcRef; if(!R||t<120) return; const a=F.atr[t], ra=[], rb=[];
  for(let j=t-80;j<=t;j++){ const ti=R.idx.get(F.c[j].time), tp=R.idx.get(F.c[j-1].time); if(ti==null||tp==null) return; const x=Math.log(F.C[j]/F.C[j-1]), y=Math.log(R.c[ti].close/R.c[tp].close); ra.push(x); rb.push(y); }
  const n0=60, f=_ols(rb.slice(0,n0),ra.slice(0,n0)); if(!f||!(f.sd>0)) return; const res=[]; for(let i=n0;i<ra.length;i++) res.push(ra[i]-f.b*rb[i]);
  const cum=res.reduce((s,v)=>s+v,0), z=cum/(f.sd*Math.sqrt(res.length)); if(Math.abs(z)<2.8) return; const d=-Math.sign(z);
  if(!(d>0?F.C[t]>F.O[t]&&F.C[t]>F.C[t-1]:F.C[t]<F.O[t]&&F.C[t]<F.C[t-1])||F.rv[t]>1.5) return;
  let ex=d>0?Infinity:-Infinity; for(let j=t-3;j<=t;j++) ex=d>0?Math.min(ex,F.L[j]):Math.max(ex,F.H[j]);
  out.push(_hit('E39','Beta-adjusted relative-value reversion',d,.38+clip((Math.abs(z)-2.8)*.06,0,.1)+.04,['after removing BTC beta ('+f.b.toFixed(2)+') the coin has '+(z>0?'out':'under')+'performed BTC by '+Math.abs(z).toFixed(1)+' standard deviations over the last '+res.length+' bars and is turning back'],{inval:ex-d*.3*a,age:0}));
}

/* ================= live engines (candidates only: order book · derivatives · other venues · tape) ================= */
function liveEngines(deep,dir){
  const out=[]; if(!deep) return out; const key=dir>0?'up':'dn', W=dir>0?'buy':'sell';
  const bk=deep.book&&deep.book[key]; if(bk&&bk.s>=.75){ out.push(_hit('E09','Order-book pressure',dir,.3+bk.s*.45,[bk.txt],{live:true})); if(deep.book.depth05>=50000&&Math.abs(deep.book.imb)>=.25&&dir*deep.book.imb>0) out.push(_hit('E41','Book imbalance + wall-free path',dir,.3+Math.min(.4,Math.abs(deep.book.imb)),['depth imbalance '+Math.round(deep.book.imb*100)+'% within 0.5% of the price, no opposing wall close by'],{live:true})); }
  const dv=deep.deriv&&deep.deriv[key]; if(dv&&dv.s>=.68) out.push(_hit('E12','Positioning-supported move',dir,.3+dv.s*.45,[dv.txt],{live:true}));
  if(deep.deriv&&deep.deriv.squeeze===dir) out.push(_hit('E28','Liquidation-driven move',dir,.58,['forced liquidations on the other side are driving the move'],{live:true}));
  const xe=deep.xex&&deep.xex[key]; if(xe&&xe.s>=.7) out.push(_hit('E34','Cross-venue confirmation',dir,.3+xe.s*.4,[xe.txt],{live:true}));
  const fp=deep.fp; if(fp&&fp.count>=40){ const share=dir>0?fp.aggBuyShare:1-fp.aggBuyShare, lg=dir>0?fp.largeBuys-fp.largeSells:fp.largeSells-fp.largeBuys;
    if(share>=.64&&lg>=1) out.push(_hit('E43','Tape aggression with large orders',dir,.4+clip((share-.64)*1.5,0,.2)+Math.min(.1,lg*.03),[Math.round(share*100)+'% of the last '+fp.count+' trades were aggressive '+W+'s, large orders '+(dir>0?fp.largeBuys:fp.largeSells)+' vs '+(dir>0?fp.largeSells:fp.largeBuys)],{live:true})); }
  return out;
}

/* ================= scan + aggregation ================= */
const _DET=[dFlow,dSMC,dProfile,dStruct,dTrendline,dPattern,dBreakout,dMomentum,dSqueeze,dTrendPullback,dWyckoff,dSMT,dVWAP,dMeanRev,dHarmonic,dKalman,dChangePoint,dChannel,dRelValue];
/* all candle-based engines at bar t.  o: {smtRef, btcRef, min} — returns hits sorted by strength; never throws (a failing detector is skipped, not allowed to stop the scan) */
function engineScan(F,t,o){
  o=o||{}; if(!F||!F.q||t<60||!fin(F.atr[t])||F.atr[t]<=0) return []; const raw=[], min=o.min!=null?o.min:_EMIN;
  for(const f of _DET){ try{ f(F,t,raw,o); }catch(e){ if(typeof console!=='undefined'&&console.error) console.error('engine detector',f.name,e); } }
  /* one hit per engine + setup + direction (the strongest) */
  const best=new Map(), px=F.C[t], a=F.atr[t];
  for(const h of raw){ if(!(h.strength>=min)) continue; if(!fin(h.inval)) continue;
    if(h.dir>0?h.inval>=px:h.inval<=px) continue;                         /* price has already gone through the invalidation level: the setup is dead */
    if(h.tgt){ h.tgt=h.tgt.filter(g=>fin(g)&&(h.dir>0?g>px+.3*a:g<px-.3*a)); if(!h.tgt.length){ if(h.id==='E24'||h.id==='E03') continue; h.tgt=null; } }   /* a target already reached is not a target */
    const k=h.id+'|'+h.setup+'|'+h.dir, b=best.get(k); if(!b||h.strength>b.strength) best.set(k,h); }
  return [...best.values()].sort((x,y)=>y.strength-x.strength);
}
/* agreement counted per dependency cluster: a cluster contributes its strongest hit only */
function engineAgg(hits,dir){
  const cl=new Map(), against=new Map(); for(const h of hits){ const m=h.dir===dir?cl:against; const b=m.get(h.cluster); if(!b||h.strength>b.strength) m.set(h.cluster,h); }
  const mine=[...cl.values()].sort((x,y)=>y.strength-x.strength), opp=[...against.values()].sort((x,y)=>y.strength-x.strength);
  return {n:mine.length,top:mine[0]||null,hits:mine,against:opp,clusters:mine.map(h=>h.cluster),conflict:opp.length>0&&opp[0].strength>=.65};
}
/* the part of a hit that is stored with a signal (plain data) */
function engineSummary(h){ return {id:h.id,name:h.name,setup:h.setup,cluster:h.cluster,strength:h.strength,evidence:(h.evidence||[]).slice(0,3),inval:h.inval,entry:h.entry||null,tgt:h.tgt||null,age:h.age==null?null:h.age,live:!!h.live}; }
if(typeof module!=='undefined') module.exports={ENG_CL,ENGINE_DEFS,ENG_BY,engineCoverage,engineScan,engineAgg,engineSummary,liveEngines};
