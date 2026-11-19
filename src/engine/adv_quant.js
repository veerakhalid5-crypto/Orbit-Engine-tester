/* ================================================================
   QUANTITATIVE & TECHNICAL EVIDENCE (pure — no DOM, no network)
   Bollinger · Keltner · Donchian · squeeze · Supertrend · ADX/DI · Stochastic · ROC · z-scores · VWAP · anchored VWAP ·
   Fibonacci retracement / extension · adaptive RSI · variance ratio (trend vs mean-reversion) · BTC beta / correlation / spread z-score.
   These are SUPPORTING evidence only: they colour the explanation and feed one modest evidence family — they never create a signal on their own.
   Every array is causal: the value at bar t uses bars <= t only (tested by a prefix-invariance test).
   ================================================================ */
const Q_NaN=NaN;
function qSma(a,n,t){ if(t<n-1) return Q_NaN; let s=0; for(let j=t-n+1;j<=t;j++){ if(!fin(a[j])) return Q_NaN; s+=a[j]; } return s/n; }
function qStd(a,n,t,m){ if(t<n-1||!fin(m)) return Q_NaN; let s=0; for(let j=t-n+1;j<=t;j++){ const d=a[j]-m; s+=d*d; } return Math.sqrt(s/n); }

/* Wilder smoothing helper: returns an array where out[i] is the smoothed value (NaN until warm-up complete) */
function qWilder(src,p){
  const n=src.length, out=new Array(n).fill(Q_NaN); let s=0,cnt=0,prev=Q_NaN;
  for(let i=0;i<n;i++){
    const v=src[i]; if(!fin(v)) continue;
    if(!fin(prev)){ s+=v; cnt++; if(cnt===p){ prev=s/p; out[i]=prev; } }
    else{ prev=(prev*(p-1)+v)/p; out[i]=prev; }
  }
  return out;
}

function passQuant(F){
  const {n,O,H,L,C,V,c}=F, atr=F.atr, o=F.opt, Q={};
  F.q=Q;
  /* ---- Bollinger(20,2), Keltner(20, 1.5 ATR), Donchian(20), squeeze ---- */
  Q.bbMid=new Array(n).fill(Q_NaN); Q.bbUp=new Array(n).fill(Q_NaN); Q.bbLo=new Array(n).fill(Q_NaN); Q.pctB=new Array(n).fill(Q_NaN); Q.bw=new Array(n).fill(Q_NaN); Q.bwRank=new Array(n).fill(Q_NaN);
  Q.kcUp=new Array(n).fill(Q_NaN); Q.kcLo=new Array(n).fill(Q_NaN); Q.sqz=new Uint8Array(n);
  Q.dcHi=new Array(n).fill(Q_NaN); Q.dcLo=new Array(n).fill(Q_NaN); Q.dcMid=new Array(n).fill(Q_NaN); Q.dcBrk=new Int8Array(n);
  for(let t=0;t<n;t++){
    const m=qSma(C,20,t);
    if(fin(m)){
      const sd=qStd(C,20,t,m); Q.bbMid[t]=m; Q.bbUp[t]=m+2*sd; Q.bbLo[t]=m-2*sd;
      Q.bw[t]=m>0?4*sd/m:Q_NaN; Q.pctB[t]=sd>0?(C[t]-(m-2*sd))/(4*sd):.5;
      let le=0,tot=0; for(let j=Math.max(0,t-100);j<t;j++){ if(fin(Q.bw[j])){ tot++; if(Q.bw[j]<=Q.bw[t]) le++; } } Q.bwRank[t]=tot>=30?le/tot:Q_NaN;
      const e=F.ema20[t]; if(fin(e)&&fin(atr[t])){ Q.kcUp[t]=e+1.5*atr[t]; Q.kcLo[t]=e-1.5*atr[t]; Q.sqz[t]=(Q.bbUp[t]<Q.kcUp[t]&&Q.bbLo[t]>Q.kcLo[t])?1:0; }
    }
    if(t>=20){ let hi=-Infinity,lo=Infinity; for(let j=t-20;j<t;j++){ if(H[j]>hi) hi=H[j]; if(L[j]<lo) lo=L[j]; } Q.dcHi[t]=hi; Q.dcLo[t]=lo; Q.dcMid[t]=(hi+lo)/2; Q.dcBrk[t]=C[t]>hi?1:C[t]<lo?-1:0; }
  }
  /* ---- Supertrend(10, 3) ---- */
  const a10=atrArr(c,10); Q.st=new Array(n).fill(Q_NaN); Q.stDir=new Int8Array(n);
  { let fu=Q_NaN,fl=Q_NaN,dir=0;
    for(let t=0;t<n;t++){
      if(!fin(a10[t])) continue;
      const hl=(H[t]+L[t])/2, bu=hl+3*a10[t], bl=hl-3*a10[t];
      if(!fin(fu)){ fu=bu; fl=bl; dir=C[t]>=hl?1:-1; }
      else{
        const pfu=fu,pfl=fl;
        fu=(bu<pfu||C[t-1]>pfu)?bu:pfu; fl=(bl>pfl||C[t-1]<pfl)?bl:pfl;
        if(dir<0&&C[t]>pfu) dir=1; else if(dir>0&&C[t]<pfl) dir=-1;
      }
      Q.st[t]=dir>0?fl:fu; Q.stDir[t]=dir;
    } }
  /* ---- ADX(14) with +DI / -DI ---- */
  { const pdm=new Array(n).fill(Q_NaN), mdm=new Array(n).fill(Q_NaN), tr=new Array(n).fill(Q_NaN);
    for(let t=1;t<n;t++){ const up=H[t]-H[t-1], dn=L[t-1]-L[t]; pdm[t]=(up>dn&&up>0)?up:0; mdm[t]=(dn>up&&dn>0)?dn:0; tr[t]=Math.max(H[t]-L[t],Math.abs(H[t]-C[t-1]),Math.abs(L[t]-C[t-1])); }
    const spd=qWilder(pdm,14), smd=qWilder(mdm,14), str=qWilder(tr,14);
    Q.pdi=new Array(n).fill(Q_NaN); Q.mdi=new Array(n).fill(Q_NaN); const dx=new Array(n).fill(Q_NaN);
    for(let t=0;t<n;t++){ if(fin(str[t])&&str[t]>0){ Q.pdi[t]=100*spd[t]/str[t]; Q.mdi[t]=100*smd[t]/str[t]; const s=Q.pdi[t]+Q.mdi[t]; dx[t]=s>0?100*Math.abs(Q.pdi[t]-Q.mdi[t])/s:0; } }
    Q.adx=qWilder(dx,14); }
  /* ---- Stochastic(14,3,3), ROC(12), z-scores ---- */
  { const raw=new Array(n).fill(Q_NaN);
    for(let t=13;t<n;t++){ let hh=-Infinity,ll=Infinity; for(let j=t-13;j<=t;j++){ if(H[j]>hh) hh=H[j]; if(L[j]<ll) ll=L[j]; } raw[t]=hh>ll?100*(C[t]-ll)/(hh-ll):50; }
    Q.stK=new Array(n).fill(Q_NaN); Q.stD=new Array(n).fill(Q_NaN);
    for(let t=0;t<n;t++) Q.stK[t]=qSma(raw,3,t); for(let t=0;t<n;t++) Q.stD[t]=qSma(Q.stK,3,t); }
  Q.roc=new Array(n).fill(Q_NaN); Q.zC=new Array(n).fill(Q_NaN); Q.zR=new Array(n).fill(Q_NaN);
  { const ret=new Array(n).fill(Q_NaN); for(let t=1;t<n;t++) ret[t]=C[t-1]>0?C[t]/C[t-1]-1:Q_NaN;
    for(let t=0;t<n;t++){
      if(t>=12&&C[t-12]>0) Q.roc[t]=C[t]/C[t-12]-1;
      const m=qSma(C,50,t); if(fin(m)){ const sd=qStd(C,50,t,m); Q.zC[t]=sd>0?(C[t]-m)/sd:0; }
      if(t>=51){ const m2=qSma(ret,50,t-1); const sd2=qStd(ret,50,t-1,m2); if(fin(sd2)&&sd2>0&&fin(ret[t])) Q.zR[t]=(ret[t]-m2)/sd2; }
    } }
  /* ---- efficiency ratio(20) and adaptive RSI (length 8 in clean trends … 30 in chop) ---- */
  Q.er=new Array(n).fill(Q_NaN); Q.arsi=new Array(n).fill(Q_NaN);
  for(let t=20;t<n;t++){ let path=0; for(let j=t-19;j<=t;j++) path+=Math.abs(C[j]-C[j-1]); Q.er[t]=path>0?Math.abs(C[t]-C[t-20])/path:0; }
  for(let t=40;t<n;t++){
    const er=Q.er[t]; if(!fin(er)) continue; const p=Math.round(clip(30-22*er,8,30)), w=Math.min(t,p*4); let g=0,l=0,cnt=0;
    for(let j=t-w+1;j<=t;j++){ const d=C[j]-C[j-1]; if(d>0) g+=d; else l-=d; cnt++; }
    Q.arsi[t]=(g+l)>0?100*g/(g+l):50;
  }
  /* ---- VWAP: per UTC day on intraday charts, rolling 20 bars on higher timeframes ---- */
  Q.vwap=new Array(n).fill(Q_NaN);
  { const intra=o.tfSec<=14400; let day=-1,pv=0,vv=0;
    for(let t=0;t<n;t++){
      const tp=(H[t]+L[t]+C[t])/3, v=V[t]||0;
      if(intra){ const dd=Math.floor(c[t].time/86400); if(dd!==day){ day=dd; pv=0; vv=0; } pv+=tp*v; vv+=v; Q.vwap[t]=vv>0?pv/vv:Q_NaN; }
      else{ let a=0,b=0; for(let j=Math.max(0,t-19);j<=t;j++){ const tj=(H[j]+L[j]+C[j])/3; a+=tj*(V[j]||0); b+=V[j]||0; } Q.vwap[t]=b>0?a/b:Q_NaN; }
    } }
  /* ---- anchored VWAP from the latest CONFIRMED swing low (support-side) and swing high (resistance-side) ---- */
  Q.avwapL=new Array(n).fill(Q_NaN); Q.avwapH=new Array(n).fill(Q_NaN);
  { const piv=F.piv||[]; let pi=0,aL=null,aH=null,sL=0,vL=0,sH=0,vH=0;
    for(let t=0;t<n;t++){
      let newL=false,newH=false;
      while(pi<piv.length&&piv[pi].ci<=t){ const p=piv[pi++];
        if(p.t==='L'){ aL=p.i; sL=0; vL=0; newL=true; for(let j=aL;j<=t;j++){ const tp=(H[j]+L[j]+C[j])/3; sL+=tp*(V[j]||0); vL+=V[j]||0; } }
        else{ aH=p.i; sH=0; vH=0; newH=true; for(let j=aH;j<=t;j++){ const tp=(H[j]+L[j]+C[j])/3; sH+=tp*(V[j]||0); vH+=V[j]||0; } } }
      /* a freshly re-anchored line already includes bar t; otherwise this bar is added to the running sums */
      const tp=(H[t]+L[t]+C[t])/3, v=V[t]||0;
      if(aL!=null&&!newL&&t>aL){ sL+=tp*v; vL+=v; } if(aH!=null&&!newH&&t>aH){ sH+=tp*v; vH+=v; }
      if(aL!=null&&vL>0) Q.avwapL[t]=sL/vL; if(aH!=null&&vH>0) Q.avwapH[t]=sH/vH;
    } }
  F.fibAt=function(t){ return qFib(F,t); };
  F.vrAt=function(t){ return qVarianceRatio(F,t); };
  F.quantAt=function(t){ return qSnapshot(F,t); };
}

/* Fibonacci retracement / extension of the latest confirmed swing leg (leg must be at least 2 ATR) + the ICT "optimal trade entry" band (0.62–0.79) */
function qFib(F,t){
  const piv=F.piv||[]; let B=null,A=null;
  for(let k=piv.length-1;k>=0;k--){ const p=piv[k]; if(p.ci>t) continue; if(!B){ B=p; continue; } if(p.t!==B.t){ A=p; break; } }
  if(!A||!B) return null;
  const a=F.atr[t]; if(!fin(a)||Math.abs(B.p-A.p)<2*a) return null;
  const up=B.t==='H', size=Math.abs(B.p-A.p), px=F.C[t];
  const lvl=r=>up?B.p-size*r:B.p+size*r, ext=e=>up?A.p+size*e:A.p-size*e;
  const ratio=up?(B.p-px)/size:(px-B.p)/size;     // 0 = at the swing extreme, 1 = fully retraced
  const ret={}; [.236,.382,.5,.618,.705,.786].forEach(r=>{ ret[r]=lvl(r); });
  return {dir:up?1:-1,a:A.p,b:B.p,size,ratio,ret,ext:{1.272:ext(1.272),1.618:ext(1.618)},ote:{lo:Math.min(lvl(.62),lvl(.79)),hi:Math.max(lvl(.62),lvl(.79))},inOte:ratio>=.62&&ratio<=.79,age:t-B.i};
}
/* Lo–MacKinlay variance ratio over the last 100 returns, with the homoskedastic z-statistic.
   A series is only called TRENDING / MEAN_REVERTING when |z| >= 1.96 (95 %); with 100 samples a ratio of 0.8 or 1.2 is well inside the noise, so anything weaker is INCONCLUSIVE. */
function qVarianceRatio(F,t,q){
  q=q||4; const C=F.C, N=100; if(t<N+q) return null;
  const r1=[],rq=[]; for(let j=t-N+1;j<=t;j++){ if(!(C[j-1]>0)) return null; r1.push(Math.log(C[j]/C[j-1])); }
  for(let j=t-N+q;j<=t;j++){ if(!(C[j-q]>0)) return null; rq.push(Math.log(C[j]/C[j-q])); }
  const mean=a=>a.reduce((s,x)=>s+x,0)/a.length, v=a=>{ const m=mean(a); return a.reduce((s,x)=>s+(x-m)*(x-m),0)/(a.length-1); };
  const v1=v(r1); if(!(v1>0)) return null; const vr=v(rq)/(q*v1);
  const se=Math.sqrt(2*(2*q-1)*(q-1)/(3*q*N)), z=(vr-1)/se;
  return {vr,z,q,n:N,kind:z>=1.96?'TRENDING':z<=-1.96?'MEAN_REVERTING':'INCONCLUSIVE'};
}

/* one-line read of every quant tool at bar t.  `bias` is in [-1,+1]: a fixed-weight vote (a design choice, not an optimised value). */
function qSnapshot(F,t){
  const Q=F.q, C=F.C, g=a=>a[t], out={t};
  out.supertrend=Q.stDir[t]||0; out.adx=fin(Q.adx[t])?Q.adx[t]:null; out.pdi=fin(Q.pdi[t])?Q.pdi[t]:null; out.mdi=fin(Q.mdi[t])?Q.mdi[t]:null;
  out.diDir=(out.pdi!=null&&out.mdi!=null)?(out.pdi>out.mdi?1:-1):0;
  out.stoch=fin(Q.stK[t])?{k:Q.stK[t],d:Q.stD[t],zone:Q.stK[t]>80?'overbought':Q.stK[t]<20?'oversold':'neutral'}:null;
  out.pctB=fin(Q.pctB[t])?Q.pctB[t]:null; out.bwRank=fin(Q.bwRank[t])?Q.bwRank[t]:null; out.squeeze=!!Q.sqz[t];
  out.donchian=Q.dcBrk[t]||0; out.roc=fin(Q.roc[t])?Q.roc[t]:null; out.zClose=fin(Q.zC[t])?Q.zC[t]:null; out.zRet=fin(Q.zR[t])?Q.zR[t]:null;
  out.vwap=fin(Q.vwap[t])?Q.vwap[t]:null; out.vsVwap=out.vwap!=null?(C[t]>out.vwap?1:-1):0; out.avwapL=fin(Q.avwapL[t])?Q.avwapL[t]:null; out.avwapH=fin(Q.avwapH[t])?Q.avwapH[t]:null;
  out.er=fin(Q.er[t])?Q.er[t]:null; out.arsi=fin(Q.arsi[t])?Q.arsi[t]:null; out.rsi=fin(F.rsi[t])?F.rsi[t]:null; out.macdHist=fin(F.mh[t])?F.mh[t]:null;
  out.vr=F.vrAt(t); out.fib=F.fibAt(t);
  /* fixed-weight directional vote */
  let s=0,w=0; const vote=(d,wt)=>{ if(d!==0&&d!=null){ s+=d*wt; } w+=wt; };
  vote(out.supertrend,1.2); vote(out.diDir*(out.adx!=null?clip((out.adx-15)/20,0,1):0),1.2); vote(out.vsVwap,.8);
  vote(fin(F.ema20[t])&&fin(F.ema50[t])?(F.ema20[t]>F.ema50[t]?1:-1):0,.8); vote(out.macdHist!=null?(out.macdHist>0?1:-1):0,.6); vote(out.roc!=null?(out.roc>0?1:-1):0,.4);
  out.bias=w>0?clip(s/w,-1,1):0;
  /* what kind of market the tools describe (never a trade instruction) */
  out.mode=(out.vr&&out.vr.kind!=='INCONCLUSIVE')?out.vr.kind:(out.adx!=null?(out.adx>=25?'TRENDING':out.adx<18?'RANGING':'INCONCLUSIVE'):'INCONCLUSIVE');
  return out;
}

/* beta / correlation / relative strength / spread z-score of a coin against BTC over the last n aligned closes.
   Informational only: pairs mean-reversion ("statistical arbitrage") is NOT tested in this project. */
function relStrength(coin,btc,n){
  n=n||60; const m=Math.min(coin.length,btc.length); if(m<n+2) return null;
  const a=coin.slice(coin.length-m), b=btc.slice(btc.length-m), ra=[],rb=[];
  for(let i=m-n;i<m;i++){ if(!(a[i-1]>0&&b[i-1]>0)) return null; ra.push(Math.log(a[i]/a[i-1])); rb.push(Math.log(b[i]/b[i-1])); }
  const mean=x=>x.reduce((s,v)=>s+v,0)/x.length, ma=mean(ra), mb=mean(rb); let cov=0,va=0,vb=0;
  for(let i=0;i<n;i++){ cov+=(ra[i]-ma)*(rb[i]-mb); va+=(ra[i]-ma)**2; vb+=(rb[i]-mb)**2; }
  const beta=vb>0?cov/vb:null, corr=(va>0&&vb>0)?cov/Math.sqrt(va*vb):null;
  const retA=a[m-1]/a[m-1-n]-1, retB=b[m-1]/b[m-1-n]-1;
  const lr=[]; for(let i=Math.max(0,m-200);i<m;i++){ if(a[i]>0&&b[i]>0) lr.push(Math.log(a[i]/b[i])); }
  let sz=null; if(lr.length>=60){ const mu=mean(lr), sd=Math.sqrt(lr.reduce((s,v)=>s+(v-mu)**2,0)/(lr.length-1)); sz=sd>0?(lr[lr.length-1]-mu)/sd:0; }
  return {beta,corr,retCoin:retA,retBtc:retB,excess:beta!=null?retA-beta*retB:null,relPerf:retA-retB,spreadZ:sz,n};
}
if(typeof module!=='undefined') module.exports={passQuant,qFib,qVarianceRatio,qSnapshot,relStrength,qWilder};
