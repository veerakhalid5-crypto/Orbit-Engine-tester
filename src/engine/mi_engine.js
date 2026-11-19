/* ================================================================
   MARKET INTELLIGENCE ENGINES  (pure functions — no network, no DOM)
   input : 1-minute bars  {t,o,h,l,c,v,q,V,Q,n}   (q = quote volume, Q = taker-buy quote volume, n = trades)
   output: volume / order-flow facts, pre-pump & pre-dump scores, 5-stage lifecycle,
           manipulation risk, signal gating and trade plan
   Everything evaluated at bar L only looks at bars <= L, so live results equal back-test results.
   ================================================================ */
const med=a=>{ if(!a.length) return 0; const s=a.slice().sort((x,y)=>x-y), m=s.length>>1; return s.length%2?s[m]:(s[m-1]+s[m])/2; };
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const sumF=(bars,f,a,b)=>{ let s=0; for(let i=a;i<=b;i++) s+=f(bars[i]); return s; };
const share=(Q,q)=>q>0?clip(Q/q,0,1):.5;

const ENG={minBars:70,
  liqTier:b=>b>=100000?'DEEP':b>=20000?'GOOD':b>=3000?'THIN':'MICRO',
  stageName:['none','EARLY WATCH','PRE-PUMP ALERT','PUMP INITIATION','PUMP CONFIRMATION','EXHAUSTION / REVERSAL RISK'],
  stageNameDn:['none','EARLY DUMP WATCH','PRE-DUMP ALERT','DUMP INITIATION','DUMP CONFIRMATION','CAPITULATION / BOUNCE RISK']};

/* ---------------- volume intelligence & order flow (one side at a time) ---------------- */
/* evaluateFull calls this up to three times for the same bar (cheap pass, deep pass, back-test gate); the result is read-only afterwards, so the last one is reused when nothing it reads has changed */
let _CA=null;
function computeA(bars,L,ctx){
  ctx=ctx||{}; const k=bars[L]; if(L<ENG.minBars||!k) return null;
  if(_CA&&_CA.bars===bars&&_CA.L===L&&_CA.q24===(ctx.q24||0)&&_CA.t===k.t&&_CA.c===k.c&&_CA.h===k.h&&_CA.l===k.l&&_CA.v===k.q&&_CA.n===k.n&&_CA.Q===k.Q) return _CA.M;
  const M=computeA0(bars,L,ctx); _CA=M?{bars,L,q24:ctx.q24||0,t:k.t,c:k.c,h:k.h,l:k.l,v:k.q,n:k.n,Q:k.Q,M}:null; return M;
}
function computeA0(bars,L,ctx){
  ctx=ctx||{}; if(L<ENG.minBars||!bars[L]) return null;
  const k=bars[L], px=k.c, lo=Math.max(1,L-125), hi=L-6;
  const qs=[],ns=[],sz=[],ma=[];
  for(let i=lo;i<=hi;i++){ const b=bars[i]; qs.push(b.q); ns.push(b.n); if(b.n>0&&b.q>0) sz.push(b.q/b.n); ma.push(Math.abs(Math.log(b.c/bars[i-1].c))); }
  const B=Math.max(med(qs),.35*mean(qs),25), nB=Math.max(med(ns),1), szB=Math.max(med(sz),1e-12);
  const s1=Math.max(.03,1.25*mean(ma)*100);                            // typical 1-minute move in %
  const q1=k.q, q3=sumF(bars,x=>x.q,L-2,L), q5=sumF(bars,x=>x.q,L-4,L), q15=sumF(bars,x=>x.q,L-14,L);
  const Q3=sumF(bars,x=>x.Q,L-2,L), Q5=sumF(bars,x=>x.Q,L-4,L), Q15=sumF(bars,x=>x.Q,L-14,L);
  const n5=sumF(bars,x=>x.n,L-4,L), prev=sumF(bars,x=>x.q,L-14,L-5)/10;
  const M={L,t:k.t,px,B,nB,szB,s1,tier:ENG.liqTier(B),
    rv1:q1/B,rv3:q3/(3*B),rv5:q5/(5*B),rv15:q15/(15*B),acc:(q3/3)/Math.max(prev,B*.5),
    rn5:(n5/5)/nB,szR:(q5/Math.max(n5,1))/szB,bs1:share(k.Q,k.q),bs3:share(Q3,q3),bs5:share(Q5,q5),bs15:share(Q15,q15),
    d3:(2*Q3-q3),d5:(2*Q5-q5),d15:(2*Q15-q15),q24:ctx.q24||0};
  const ret=K=>L-K>=0?(px/bars[L-K].c-1)*100:0;
  M.ret1=ret(1);M.ret3=ret(3);M.ret5=ret(5);M.ret15=ret(15);M.ret30=ret(30);M.ret60=ret(60);
  /* range compression: recent true range vs the last hour */
  const trp=(a,b)=>{ let s=0,c=0; for(let i=a;i<=b;i++){ s+=(bars[i].h-bars[i].l)/bars[i].c*100; c++; } return c?s/c:0; };
  M.comp=clip(1-trp(L-7,L)/Math.max(trp(L-59,L-8),1e-9),0,1);
  /* per-direction facts: d=+1 looks for a pump, d=-1 for a dump (mirror image) */
  const side=d=>{
    const g=x=>d>0?x:-x, s={d};
    s.ret1=g(M.ret1);s.ret3=g(M.ret3);s.ret5=g(M.ret5);s.ret15=g(M.ret15);s.ret30=g(M.ret30);s.ret60=g(M.ret60);
    s.z5=s.ret5/(s1*Math.sqrt(5)); s.z15=s.ret15/(s1*Math.sqrt(15)); s.z60=s.ret60/(s1*Math.sqrt(60));
    s.bs3=d>0?M.bs3:1-M.bs3; s.bs5=d>0?M.bs5:1-M.bs5; s.bs15=d>0?M.bs15:1-M.bs15;
    s.dN5=d*M.d5/(5*B); s.dN15=d*M.d15/(15*B);
    let pe=0; for(let i=L-4;i<=L;i++){ const sh=share(bars[i].Q,bars[i].q); if(d>0?sh>.52:sh<.48) pe++; } s.persist5=pe;
    /* accumulation geometry: rising lows (pump) / falling highs (dump) in four 5-bar blocks */
    const blk=[]; for(let b=3;b>=0;b--){ let e=d>0?Infinity:-Infinity; for(let i=L-b*5-4;i<=L-b*5;i++) e=d>0?Math.min(e,bars[i].l):Math.max(e,bars[i].h); blk.push(e); }
    let inc=0,dec=0,tol=px*s1/100*.15; for(let j=1;j<4;j++){ const df=d>0?blk[j]-blk[j-1]:blk[j-1]-blk[j]; if(df>tol) inc++; else if(df<-tol) dec++; }
    s.hl=dec===0?inc:Math.max(0,inc-dec);
    /* heavy volume that does not move price (absorption) in the last 8 bars */
    let ab=0; for(let i=L-7;i<=L;i++){ const b=bars[i], body=Math.abs(b.c/b.o-1)*100, sh=share(b.Q,b.q), mid=(b.h+b.l)/2;
      if(b.q/B>=2&&body<=.8*s1&&(d>0?(sh>=.5&&b.c>=mid):(sh<=.5&&b.c<=mid))) ab++; } s.abs=ab;
    /* distance to the nearest breakout level (60-bar high for pumps, low for dumps) */
    let lvl=d>0?-Infinity:Infinity; for(let i=L-60;i<L;i++) lvl=d>0?Math.max(lvl,bars[i].h):Math.min(lvl,bars[i].l);
    s.lvl=lvl; s.dist=d>0?(lvl-px)/px*100:(px-lvl)/px*100;
    s.bo=null; for(let i=L-2;i<=L;i++){ let l2=d>0?-Infinity:Infinity; for(let j=i-60;j<i;j++) l2=d>0?Math.max(l2,bars[j].h):Math.min(l2,bars[j].l);
      if(d>0?bars[i].c>l2:bars[i].c<l2){ s.bo=L-i; break; } }
    /* extension, pull-back and exhaustion clues */
    let ex=d>0?-Infinity:Infinity, bs=d>0?Infinity:-Infinity; for(let i=L-14;i<=L;i++){ ex=d>0?Math.max(ex,bars[i].h):Math.min(ex,bars[i].l); bs=d>0?Math.min(bs,bars[i].l):Math.max(bs,bars[i].h); }
    s.ext=ex; s.pull=Math.abs(ex-bs)>1e-12?clip(Math.abs(ex-px)/Math.abs(ex-bs),0,1):0;
    let uw=0; for(let i=L-1;i<=L;i++){ const b=bars[i], r=b.h-b.l||1e-12; uw+=(d>0?(b.h-Math.max(b.o,b.c)):(Math.min(b.o,b.c)-b.l))/r; } s.uw=uw/2;
    let mq=0; for(let i=L-5;i<=L;i++) mq=Math.max(mq,bars[i].q); s.fade=mq>0?k.q/mq:1; s.peak=mq/B;
    const dl=i=>d*(2*bars[i].Q-bars[i].q); s.flip=(dl(L)<0&&dl(L-1)<0&&(dl(L-2)+dl(L-3)+dl(L-4))>0);
    s.div=(s.ret15>Math.max(.3,.6*s1)&&s.dN15<-.4);                  // price pushes, net aggressive flow does not
    s.divBull=(s.ret15<=.5*s1&&s.dN15>1.2&&s.bs15>.54);               // flow builds while price is quiet
    return s; };
  M.up=side(1); M.dn=side(-1);
  M.hi60=M.up.lvl; M.lo60=M.dn.lvl;
  return M;
}

/* ---------------- manipulation / false-signal protection ---------------- */
function manipCheck(M,ctx,deep){
  ctx=ctx||{}; const f=[], add=(k,w,txt)=>f.push({k,w,txt});
  if(!M) return {risk:0,level:'LOW',flags:f};
  const L=M.L;
  if(ctx.bars){ const bars=ctx.bars; let mx=0,oth=0; for(let i=L-5;i<=L;i++){ if(bars[i].q>mx){ oth+=mx; mx=bars[i].q; } else oth+=bars[i].q; }
    if(mx>=12*M.B&&oth/5<2*M.B) add('spike',15,'One isolated volume spike (×'+(mx/M.B).toFixed(0)+') with nothing around it — could be a single account, not broad demand'); }
  if(M.rv5>=5&&Math.abs(M.up.z5)<.8&&M.bs5>.46&&M.bs5<.54&&M.rn5>=3)
    add('wash',25,'Huge volume and trade count but no price progress and a perfectly balanced buy/sell split — churn / wash-trading pattern');
  const big=Math.max(M.up.ret15,M.dn.ret15);
  if(M.tier==='MICRO'&&big>=3) add('thin',22,'Large move on a micro-liquidity market (~$'+Math.round(M.B)+'/min) — easy to push, easy to trap');
  else if(M.tier==='THIN'&&big>=5) add('thin',12,'Large move on thin liquidity');
  if(M.up.ret60>=12||M.dn.ret60>=12){ const d=M.up.ret60>=M.dn.ret60?M.up:M.dn;
    if(d.uw>=.35||d.flip||d.div) add('pd',25,'Parabolic '+d.ret60.toFixed(0)+'% move that is now rolling over (wicks / flow flip) — classic pump-and-dump shape'); }
  if(ctx.bars){ const bars=ctx.bars; for(let i=L-5;i<L;i++){ let hh=-Infinity; for(let j=i-60;j<i;j++) hh=Math.max(hh,bars[j].h); /* breakout that failed on weak volume */
      if(bars[i].c>hh&&bars[i].q/M.B<1.3&&bars[L].c<hh&&bars[L].c<bars[i].c){ add('trap',20,'Low-volume break of the 60-minute high that already failed — liquidity trap'); break; } } }
  if(ctx.ageDays!=null&&ctx.ageDays<7) add('new',12,'Listed '+(ctx.ageDays<1?'today':Math.floor(ctx.ageDays)+' days ago')+' — extreme volatility, thin history');
  if(ctx.fund!=null&&Math.abs(ctx.fund)>=.1) add('fund',10,'Funding rate '+(ctx.fund>0?'+':'')+ctx.fund.toFixed(3)+'% — one side is heavily crowded');
  if(deep){
    if(deep.xex&&deep.xex.dev!=null&&Math.abs(deep.xex.dev)>=.6) add('xdev',15,'Price differs '+deep.xex.dev.toFixed(2)+'% from another venue — exchange-specific move');
    if(deep.book&&deep.book.spoof) add('spoof',20,deep.book.spoof);
  }
  const risk=clip(f.reduce((s,x)=>s+x.w,0),0,100);
  return {risk,level:risk>=45?'HIGH':risk>=20?'MEDIUM':'LOW',flags:f};
}

/* ---------------- evidence score for one side (pump or dump) ---------------- */
const FAM_W={vol:20,aggr:20,accum:12,prox:8,struct:12,smc:16,deriv:8,liq:6,ctx:6,xex:8};
const FAM_NAME={vol:'Volume acceleration',aggr:'Aggressive buying/selling',accum:'Accumulation / distribution shape',prox:'Breakout proximity',struct:'Market structure & liquidity',smc:'Institutional concepts (structure · liquidity · zones · ICT)',deriv:'Derivatives (OI · funding · positioning)',liq:'Liquidity quality',ctx:'Market backdrop',xex:'Cross-venue confirmation'};
function scoreSide(S,M,ctx,deep,man){
  ctx=ctx||{}; const d=S.d, fam={}, ev={}, up=d>0, W=up?'buy':'sell';
  const set=(k,s,txt,known)=>{ fam[k]={s:clip(s,0,1),w:FAM_W[k],known:known!==false}; ev[k]=txt; };
  const a=clip(Math.log2(Math.max(M.rv5,.01))/2.6,0,1), f=.75+.25*clip((M.acc-1)/1.5,0,1);
  set('vol',a*f,'Volume ×'+M.rv5.toFixed(1)+' of its normal pace over 5 minutes (×'+M.rv1.toFixed(1)+' on the last bar), '+(M.acc>1.2?'accelerating ×'+M.acc.toFixed(1):'not accelerating'));
  const p1=clip((S.bs5-.5)/.14,0,1), p2=clip(S.dN5/2.5,0,1), p3=S.persist5/5, p4=clip((M.rn5-1)/1.5,0,1)*.5+clip((M.szR-1),0,1)*.5;
  set('aggr',.35*p1+.25*p2+.2*p3+.2*p4,Math.round(S.bs5*100)+'% of 5-minute volume was aggressive '+W+'ing · net flow '+(S.dN5>=0?'+':'')+S.dN5.toFixed(1)+' bars of volume · '+S.persist5+'/5 bars one-sided'+(M.rn5>=1.5?' · trades ×'+M.rn5.toFixed(1):'')+(M.szR>=1.4?' · bigger average order ×'+M.szR.toFixed(1):''));
  if(deep&&deep.fp&&deep.fp.count>=40){            // live trade tape (candidates only): refines the aggressive-flow reading
    const fp=deep.fp, share=up?fp.aggBuyShare:1-fp.aggBuyShare, lg=up?fp.largeBuyUsd-fp.largeSellUsd:fp.largeSellUsd-fp.largeBuyUsd, tot=fp.buyUsd+fp.sellUsd;
    const fs=.7*clip((share-.5)/.15,0,1)+.3*clip(lg/Math.max(tot*.15,1),0,1); fam.aggr.s=clip(.7*fam.aggr.s+.3*fs,0,1);
    ev.aggr+=' · live tape: '+Math.round(share*100)+'% aggressive '+W+'s over '+fp.count+' trades, large orders '+(up?fp.largeBuys:fp.largeSells)+' vs '+(up?fp.largeSells:fp.largeBuys)+(fp.stack&&fp.stack[up?'buy':'sell']?' · stacked '+(up?'buy':'sell')+' imbalance across '+fp.stack[up?'buy':'sell'].n+' price levels':'');
  }
  const quiet=S.z15<1.2?1:.55;
  set('accum',(.4*(S.hl/3)+.3*M.comp+.3*clip(S.abs/2,0,1))*quiet,(up?'Higher lows ':'Lower highs ')+S.hl+'/3 · range compression '+Math.round(M.comp*100)+'% · '+S.abs+' absorption bar'+(S.abs===1?'':'s')+(quiet<1?' · price already moved, so this counts less':''));
  const dz=S.dist/(M.s1*Math.sqrt(15));
  set('prox',S.bo!=null?.85:(S.dist>=0?clip(1-dz/2,0,1):0),S.bo!=null?'Broke the 60-minute '+(up?'high':'low')+' '+S.bo+' bar'+(S.bo===1?'':'s')+' ago':(S.dist>=0?'Price is '+S.dist.toFixed(2)+'% from the 60-minute '+(up?'high':'low'):'Beyond the 60-minute range'));
  /* deep layer (only when it has been fetched; otherwise neutral and not counted) */
  const sd=deep&&deep.struct?(up?deep.struct.up:deep.struct.dn):null;
  set('struct',sd?sd.s:.4,sd?sd.txt:'5-minute structure not checked yet',!!sd);
  /* institutional confluence (order blocks, FVG, supply/demand, liquidity, ICT time, flow, regime): it already contains market structure, so when it is available it REPLACES the plain structure family (never counted twice) */
  const ad=deep&&deep.adv?(up?deep.adv.up:deep.adv.dn):null;
  set('smc',ad?ad.score/100:.4,ad?ad.summary+' — '+ad.why.slice(0,3).map(w=>w.name+': '+w.lines[0]).join(' · '):'Institutional concepts not evaluated yet (needs 5-minute history)',!!ad);
  if(ad){ fam.struct.known=false; ev.struct='(included in the institutional-concepts family)'; }
  const dv=deep&&deep.deriv?(up?deep.deriv.up:deep.deriv.dn):null;
  set('deriv',dv?dv.s:.4,dv?dv.txt:'Derivatives not checked yet',!!dv);
  const bk=deep&&deep.book?(up?deep.book.up:deep.book.dn):null;
  const lq=({DEEP:1,GOOD:.75,THIN:.4,MICRO:.1})[M.tier];
  set('liq',bk?(lq*.6+bk.s*.4):lq,'~$'+fmtMoney(M.B)+' traded per minute ('+M.tier+')'+(bk?' · '+bk.txt:''));
  const bt=ctx.btc15!=null?clip(.5+d*ctx.btc15/1.2,.1,.9):.5;
  set('ctx',bt,ctx.btc15!=null?'BTC '+(ctx.btc15>=0?'+':'')+ctx.btc15.toFixed(2)+'% in 15 min'+(ctx.breadth!=null?' · '+Math.round(ctx.breadth*100)+'% of coins rising':''):'Market backdrop unknown',ctx.btc15!=null);
  const xe=deep&&deep.xex?(up?deep.xex.up:deep.xex.dn):null;
  set('xex',xe?xe.s:.4,xe?xe.txt:'Other venues not checked',!!xe);
  /* evidence strength, normalised over the families that were actually measured (so the live app and the
     price-only back-test are on the same 0-100 scale; unmeasured families are never counted as evidence) */
  let score=0, wk=0; Object.keys(fam).forEach(k=>{ if(fam[k].known){ score+=fam[k].w*fam[k].s; wk+=fam[k].w; } });
  score=wk?100*score/wk:0;
  const pen=[]; let p=0;
  if(man&&man.risk>0){ const x=man.risk*.35; p+=x; pen.push('manipulation risk −'+x.toFixed(0)); }
  if(S.div){ p+=10; pen.push('price pushes but net flow does not (divergence) −10'); }
  score=clip(score-p,0,100);
  const late=clip((S.z15-2.5)*.2,0,.7);          // how much of the move is already behind us (ranking only)
  const fams=['vol','aggr','accum','prox','struct','smc','deriv','xex'].filter(k=>fam[k].known&&fam[k].s>=.5).length;
  return {d,score,fam,ev,fams,pen,S,late,wk};
}

/* ---------------- 5-stage lifecycle ---------------- */
function stageOf(S,M,sc,man,o){
  o=o||{};
  /* exhaustion = the move is huge in absolute terms OR it is large and the buying/selling is visibly fading */
  const clues=(S.div?1:0)+(S.flip?1:0)+(S.uw>=.45?1:0)+((S.fade<.55&&S.peak>=3)?1:0)+((S.dN5<0&&S.persist5<=2)?1:0);
  const exh=(S.ret15>=8&&S.z15>=3)||(S.ret60>=15&&S.z60>=3)||(S.z15>=7&&S.ret15>=4)||(S.z15>=3&&S.ret15>=2&&clues>=2);
  if(exh) return 5;
  if(S.z15>=2.2&&S.ret15>=1.2&&M.rv5>=2&&S.persist5>=3&&S.pull<=.4&&S.bs5>=.55) return 4;
  if((S.z5>=1.8||(S.bo!=null&&S.bo<=2&&S.z5>=1))&&M.rv3>=2.5&&S.bs3>=.57&&S.z15<4&&S.ret5>=.5) return 3;
  if(sc.score>=(o.s2||55)&&sc.fams>=3&&S.z15<2&&M.rv5>=1.8&&(S.bs5>=.54||S.dN5>=.6)&&man.risk<60) return 2;
  if(sc.score>=(o.s1||38)&&M.rv5>=1.6&&(S.bs5>=.52||S.dN5>.3)&&S.z15<2) return 1;
  return 0;
}
function labelOf(up,stage,S,M,sc,man){
  if(!stage) return '';
  if(up){
    if(stage===1) return 'Very Early Opportunity';
    if(stage===2) return (sc.score>=65&&(M.comp>=.4||S.abs>=1))?'Strong Accumulation':'Potential Pre-Pump';
    if(stage===3) return 'Pump Starting';
    if(stage===4) return 'Confirmed Bullish Momentum';
    return (man.risk>=45||S.flip||S.uw>=.45)?'High Dump Risk':'Overextended Pump';
  }
  return ['','Early Dump Watch',(sc.score>=65&&(M.comp>=.4||S.abs>=1))?'Strong Distribution':'Potential Pre-Dump','Dump Starting','Confirmed Bearish Momentum','Capitulation — Bounce Risk'][stage];
}


/* ---------------- stage hysteresis: a lifecycle stage must not flicker ----------------
   up-moves are immediate; a downgrade needs `hold` consecutive bars of weaker evidence; once a move is
   EXHAUSTED nothing may be labelled "early" again for `cool` bars; exhaustion itself stays visible >= keep5 bars */
function newLatch(){ const one=()=>({stage:0,since:-1,below:0,lockUntil:-1,t5:-1}); return {up:one(),dn:one()}; }
function latchStep(st,raw,L,o){
  o=o||{}; const hold=o.hold||3, cool=o.cool||30, keep5=o.keep5||12;
  if(raw>0&&raw<5&&L<st.lockUntil) raw=0;
  if(raw>st.stage){ st.stage=raw; st.since=L; st.below=0; if(raw===5){ st.lockUntil=L+cool; st.t5=L; } }
  else if(raw===st.stage) st.below=0;
  else{ st.below++; const need=st.stage===5?Math.max(keep5-(L-st.t5),0)+hold:st.stage<=2?hold+3:hold; if(st.below>=need){ st.stage=raw; st.since=L; st.below=0; } }
  return st.stage;
}

/* ---------------- full evaluation at bar L ---------------- */
function evaluate(bars,L,ctx,deep,o,latch){
  ctx=ctx||{}; o=o||{};
  const M=computeA(bars,L,ctx); if(!M) return null;
  const man=manipCheck(M,Object.assign({bars},ctx),deep);
  if(deep&&deep.rep&&deep.rep.F&&!deep.adv){ const R=deep.rep, ao=advOpts(R,ctx,man,bars[L].c); deep.adv={up:advConfluence(R.F,R.t,1,ao),dn:advConfluence(R.F,R.t,-1,ao)}; }
  if(deep&&deep.rep&&deep.rep.F&&!deep.eng){ try{ deep.eng=engineBundle(deep.rep,ctx,deep); }catch(e){ deep.eng=null; } }
  const up=scoreSide(M.up,M,ctx,deep,man), dn=scoreSide(M.dn,M,ctx,deep,man);
  up.raw=stageOf(M.up,M,up,man,o); dn.raw=stageOf(M.dn,M,dn,man,o);
  const LM=bars[L].t!=null?Math.floor(bars[L].t/60):L; /* the latch counts absolute minutes, NOT array positions: the live buffer is capped, so L stops growing once it is full */
  up.stage=latch?latchStep(latch.up,up.raw,LM,o):up.raw; dn.stage=latch?latchStep(latch.dn,dn.raw,LM,o):dn.raw;
  up.label=labelOf(true,up.stage,M.up,M,up,man); dn.label=labelOf(false,dn.stage,M.dn,M,dn,man);
  /* ranking key: strong evidence EARLY in the move ranks above the same evidence after the move has happened */
  const SF=[0,.9,1,1,.8,.25]; up.opp=up.score*(1-up.late)*SF[up.stage]; dn.opp=dn.score*(1-dn.late)*SF[dn.stage];
  /* distribution at a high: heavy absorption by sellers after a rally */
  if(!up.stage&&M.up.ret60>=2.5&&dn.score>=50&&M.dn.abs>=1&&M.dn.bs15<.47){ up.label='Possible Distribution'; }
  return {M,man,up,dn};
}
function fmtMoney(x){ return x>=1e9?(x/1e9).toFixed(1)+'B':x>=1e6?(x/1e6).toFixed(1)+'M':x>=1e3?(x/1e3).toFixed(1)+'K':x.toFixed(0); }

/* ---------------- liquidation estimate for an isolated position ---------------- */
function liqPrice(entry,dir,lev){ return entry*(1-dir*(1/lev-.005)); }

/* ---------------- trade plan ---------------- */
function makePlan(dir,bars,L,M,atr5,levels,swing,ov){
  const px=bars[L].c; let lowLo=Infinity,highHi=-Infinity;
  for(let i=L-7;i<=L;i++){ lowLo=Math.min(lowLo,bars[i].l); highHi=Math.max(highHi,bars[i].h); }
  const a=Math.max(atr5||0,px*M.s1/100*Math.sqrt(5)*1.1);
  /* stop: beyond the last 8 minutes' extreme; a 5-minute swing point is used instead when it is a logical, reachable level */
  const sw=swing&&(dir>0?swing.low:swing.high), useSw=sw!=null&&Math.abs(px-sw)<=3.5*a;
  let sl=dir>0?Math.min(lowLo,useSw?sw:Infinity)-.25*a:Math.max(highHi,useSw?sw:-Infinity)+.25*a;
  let risk=(px-sl)*dir;
  if(ov&&fin(ov.sl)&&(px-ov.sl)*dir>=.3*a){ sl=ov.sl; risk=(px-sl)*dir; }          /* an engine setup brings its own invalidation level (the place where the idea is wrong) */
  if(risk<.8*a){ sl=px-dir*.8*a; risk=.8*a; }
  const tooWide=risk>4*a;
  const entry={mid:px,lo:dir>0?px-.2*a:px-.1*a,hi:dir>0?px+.1*a:px+.2*a};
  const cands=(levels||[]).concat(((ov&&ov.tgt)||[]).map(p=>({p,src:'engine target'}))).filter(v=>(v.p-px)*dir>0).sort((x,y)=>Math.abs(x.p-px)-Math.abs(y.p-px));
  const R=x=>Math.abs(x.p-px)/risk, tps=[];
  const t1=cands.find(x=>R(x)>=1.2&&R(x)<=3.2); tps.push(t1?{p:t1.p,r:R(t1),src:t1.src}:{p:px+dir*1.6*risk,r:1.6,src:'risk-multiple projection'});
  const t2=cands.find(x=>R(x)>=Math.max(2.2,tps[0].r+.5)&&R(x)<=6); tps.push(t2?{p:t2.p,r:R(t2),src:t2.src}:{p:px+dir*Math.max(2.6,tps[0].r+1)*risk,r:Math.max(2.6,tps[0].r+1),src:'risk-multiple projection'});
  const t3=cands.find(x=>R(x)>=tps[1].r+.8&&R(x)<=9); tps.push(t3?{p:t3.p,r:R(t3),src:t3.src}:{p:px+dir*Math.max(4.2,tps[1].r+1.4)*risk,r:Math.max(4.2,tps[1].r+1.4),src:'risk-multiple projection'});
  const near=cands.find(x=>x.block&&R(x)>0);      // only a strong opposing order block blocks the way; liquidity pools are targets, not walls
  return {dir,entry,px,sl,risk,riskPct:risk/px*100,atr:a,tps,room:near?R(near):9,roomSrc:near?near.src:'',tooWide,
    liq10:liqPrice(px,dir,10),liq25:liqPrice(px,dir,25)};
}

/* ---------------- presets: the in-app back-test measures all three on the same data ---------------- */
const PRESETS={
  ELITE:   {name:'Elite',   minScore:66,minFams:5,maxZ:3.2,maxRet15:5,minRR:2.4,advTier:'HIGH_CONVICTION',advVeto:true},
  STRICT:  {name:'Strict',  minScore:62,minFams:4,maxZ:3.6,maxRet15:7,minRR:2.2,advTier:'STANDARD',advVeto:true},
  BALANCED:{name:'Balanced',minScore:55,minFams:3,maxZ:5,  maxRet15:7,minRR:2},
  EARLY:   {name:'Early',   minScore:48,minFams:3,maxZ:3.2,maxRet15:5,minRR:1.8},
  /* Engine-led: ONE engine's setup (strength >= engMin) may raise a signal by itself; the pump/dump stage, evidence-score and family-count gates do not apply, every risk / liquidity / manipulation / institutional / higher-timeframe gate still does */
  ENGINE:  {name:'Engine-led',indep:true,engMin:.6,minScore:0,minFams:0,maxZ:5,maxRet15:8,minRR:2,advTier:'STANDARD',advVeto:true}};
const TIER_RANK={VETOED:-1,WEAK:0,STANDARD:1,HIGH_CONVICTION:2};
const tierName=t=>String(t||'').replace('_',' ').toLowerCase();
/* options for the institutional-confluence module: manipulation risk, SMT versus Bitcoin, and the live price */
let _BTCREF={key:null,ref:null};
function btcRefFor(ctx){
  if(!ctx||!ctx.btcBars||ctx.isBtc) return null; const A=ctx.btcBars, last=A[A.length-1]; if(A.length<400||!last) return null;
  const key=Math.floor(last.t/300)+'|'+A.length; if(_BTCREF.key!==key){ _BTCREF={key,ref:makeSmtRef(toCandles(aggBars(A,A.length-1,5)))}; } return _BTCREF.ref;
}
function smtFor(R,ctx){
  if(!R||!R.F) return null; const ref=btcRefFor(ctx); if(!ref) return null;
  try{ return smtAt(R.F,ref,R.t,20); }catch(e){ return null; }
}
/* every engine at the last closed 5-minute bar (+ the live engines when order book / derivatives / venues / tape were fetched).  Per direction: the engines that agree, counted per dependency cluster. */
function engineBundle(R,ctx,deep){
  /* the 5-minute features, and so every engine hit, only change when a 5-minute candle closes: the scan is reused for the other 1-minute evaluations inside the same candle (same BTC reference only) */
  const ref=btcRefFor(ctx); let hits; const memo=R._engMemo;
  if(memo&&memo.ref===ref&&memo.t===R.t) hits=memo.hits; else{ hits=engineScan(R.F,R.t,{smtRef:ref,btcRef:ref}); try{ Object.defineProperty(R,'_engMemo',{value:{ref,t:R.t,hits},writable:true,configurable:true,enumerable:false}); }catch(e){} }
  const mk=d=>{ const all=hits.concat(liveEngines(deep,d)); return engineAgg(all,d); };
  return {hits,up:mk(1),dn:mk(-1)};
}
function advOpts(R,ctx,man,px,hc){ return {manip:man?man.risk:null,smt:smtFor(R,ctx),px,htf:hc||null}; }
/* ---------------- signal gating: reject weak / unconfirmed / late setups ---------------- */
function gateSignal(ev,dir,bars,L,ctx,deep,o){
  o=o||{}; const sc=dir>0?ev.up:ev.dn, S=dir>0?ev.M.up:ev.M.dn, M=ev.M, man=ev.man;
  const g=[], add=(ok,txt,hard)=>g.push({ok,txt,hard:hard!==false});
  const eng=deep&&deep.eng?(dir>0?deep.eng.up:deep.eng.dn):null, top=eng?eng.top:null;
  if(o.indep){
    add(!!top&&top.strength>=(o.engMin||.6),top?'Engine '+top.id+' · '+top.setup+' — strength '+Math.round(top.strength*100)+'/100 (need '+Math.round((o.engMin||.6)*100)+'), '+eng.n+' independent cluster'+(eng.n===1?'':'s')+' agree':'No engine reports a setup in this direction');
    if(eng&&eng.conflict) add(false,'A strong engine setup points the other way ('+eng.against[0].id+' · '+eng.against[0].setup+')');
    const od=dir>0?ev.dn:ev.up; add(od.stage<3||od.stage>4,od.stage>=3&&od.stage<=4?'Confirmed '+(dir>0?'selling':'buying')+' momentum is running against this setup':'No confirmed momentum against the setup');
  }else{
    add(sc.stage>=3&&sc.stage<=4&&(sc.raw==null||(sc.raw>=3&&sc.raw<=4)),'Stage '+sc.stage+' ('+(dir>0?ENG.stageName:ENG.stageNameDn)[sc.stage]+') — an actionable signal needs confirmation (stage 3 or 4); stages 1-2 are watch alerts only');
    add(sc.score>=(o.minScore||62),'Evidence '+Math.round(sc.score)+'/100 (need '+(o.minScore||62)+')');
    add(sc.fams>=(o.minFams||4),sc.fams+' independent evidence families agree (need '+(o.minFams||4)+')');
  }
  add(man.risk<45,man.risk<45?'Manipulation risk '+man.level.toLowerCase()+' ('+Math.round(man.risk)+')':'Manipulation risk too high ('+Math.round(man.risk)+') — '+man.flags.map(x=>x.k).join(', '));
  add(M.tier!=='MICRO'||o.allowMicro,M.tier!=='MICRO'?'Liquidity '+M.tier.toLowerCase():'Micro-liquidity market — not tradable with real size');
  const mz=o.maxZ||5, mr=o.maxRet15||7; add(S.z15<=mz&&S.ret15<=mr,'Not late: '+S.ret15.toFixed(1)+'% in 15 min ('+S.z15.toFixed(1)+'σ)'+(S.z15>mz||S.ret15>mr?' — already extended':''));
  const dsc=dir>0?ev.dn:ev.up; if(!o.indep) add(dsc.score<=.7*sc.score,dsc.score<=.7*sc.score?'No strong opposing evidence':'Opposing evidence is strong ('+Math.round(dsc.score)+' vs '+Math.round(sc.score)+')');
  if(deep&&deep.struct){ const s=dir>0?deep.struct.up:deep.struct.dn; add(!s.veto,s.veto?s.veto:'5-minute structure does not oppose the trade'); }
  if(ctx&&ctx.fresh===false) add(false,'Data is stale — no signal from old prices');
  const adv=deep&&deep.adv?(dir>0?deep.adv.up:deep.adv.dn):null;
  if(adv){
    const txt='Institutional confluence: '+tierName(adv.tier)+' ('+Math.round(adv.score)+'/100, '+adv.nAgree+' of '+adv.nKnown+' concept families agree)';
    if(o.advTier){ const ok=TIER_RANK[adv.tier]>=TIER_RANK[o.advTier]; add(ok,txt+(ok?'':' — this preset needs '+tierName(o.advTier))); }
    else add(adv.tier!=='VETOED',txt,false);
    if(o.advVeto&&adv.veto.length) add(false,'Institutional veto: '+adv.veto[0]);
  }else if(o.advTier) add(false,'Institutional confluence could not be evaluated (not enough 5-minute history)');
  const plan=makePlan(dir,bars,L,M,deep&&deep.atr5,deep&&deep.levels,deep&&deep.swing,o.indep&&top?{sl:top.inval,tgt:top.tgt}:null);
  add(!plan.tooWide,!plan.tooWide?'Stop is logical ('+plan.riskPct.toFixed(2)+'% away, '+(plan.risk/plan.atr).toFixed(1)+' ATR)':'Stop would be '+(plan.risk/plan.atr).toFixed(1)+' ATR away — too wide (late entry)');
  add(plan.tps[1].r>=(o.minRR||2),'Reward to target 2 is '+plan.tps[1].r.toFixed(1)+'R (need '+(o.minRR||2)+'R)');
  add(plan.room>=.9,plan.room>=.9?'Room to run':'Blocked — '+plan.roomSrc+' is only '+plan.room.toFixed(1)+'R away');
  if(deep&&deep.book){ const sp=deep.book.spread; add(sp<=.5,sp<=.5?'Order-book spread '+sp.toFixed(3)+'%':'Illiquid book: spread '+sp.toFixed(2)+'% — fills would be poor'); }
  return {ok:g.every(x=>!x.hard||x.ok),gates:g,plan};
}

if(typeof module!=='undefined') module.exports={PRESETS,TIER_RANK,tierName,smtFor,btcRefFor,engineBundle,advOpts,newLatch,latchStep,computeA,manipCheck,scoreSide,stageOf,evaluate,gateSignal,makePlan,FAM_W,FAM_NAME,ENG,fmtMoney,liqPrice};
