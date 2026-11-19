/* ================================================================
   STATISTICAL ESTIMATORS (pure — no DOM, no network).  All of them use bars <= t only.
     Hurst exponent · permutation entropy · CUSUM change-point · Kalman local-trend filter · regression channel · Ornstein-Uhlenbeck half-life
   These are DESCRIPTIVE measures of the recent past.  On a few hundred bars they are noisy: they are used as one family among many,
   and each carries the sample size it was computed on so the UI can show it.
   ================================================================ */
function _logRets(F,a,b){ const r=[]; for(let j=a+1;j<=b;j++){ const x=F.C[j-1], y=F.C[j]; if(x>0&&y>0) r.push(Math.log(y/x)); } return r; }
function _mean(a){ let s=0; for(const x of a) s+=x; return a.length?s/a.length:0; }
function _std(a){ const m=_mean(a); let s=0; for(const x of a) s+=(x-m)*(x-m); return a.length>1?Math.sqrt(s/(a.length-1)):0; }
function _ols(xs,ys){ const n=xs.length; let sx=0,sy=0,sxx=0,sxy=0; for(let i=0;i<n;i++){ sx+=xs[i]; sy+=ys[i]; sxx+=xs[i]*xs[i]; sxy+=xs[i]*ys[i]; } const d=n*sxx-sx*sx; if(!d) return null; const b=(n*sxy-sx*sy)/d, a=(sy-b*sx)/n; let ssr=0,sst=0; const my=sy/n; for(let i=0;i<n;i++){ const e=ys[i]-(a+b*xs[i]); ssr+=e*e; sst+=(ys[i]-my)*(ys[i]-my); } return {a,b,r2:sst>0?1-ssr/sst:0,sd:Math.sqrt(ssr/Math.max(1,n-2))}; }

/* Hurst exponent from the scaling of k-step log-price differences: std(k) ~ k^H.  0.5 = random walk, >0.5 persistent, <0.5 mean-reverting */
function qHurst(F,t,N){
  N=N||200; const a=Math.max(0,t-N); if(t-a<80) return null; const y=[]; for(let j=a;j<=t;j++) y.push(Math.log(F.C[j]));
  const ks=[1,2,4,8,16], xs=[], ys=[]; for(const k of ks){ const d=[]; for(let j=k;j<y.length;j++) d.push(y[j]-y[j-k]); if(d.length<20) continue; const s=_std(d); if(!(s>0)) return null; xs.push(Math.log(k)); ys.push(Math.log(s)); }
  if(xs.length<4) return null; const f=_ols(xs,ys); if(!f) return null; return {h:clip(f.b,0,1),n:y.length,kind:f.b>.58?'PERSISTENT':f.b<.42?'MEAN_REVERTING':'RANDOM'};
}
/* permutation entropy (order 3), normalised 0..1: 1 = no ordinal structure (random), low = predictable ordering */
function qEntropy(F,t,N){
  N=N||150; const a=Math.max(0,t-N); if(t-a<60) return null;
  /* 3-bar ordinal pattern code (x<y, y<z, x<z): of the 8 codes, 6 are real orderings (0,2,3,4,5,7); codes 1 and 6 are impossible and bars with ties are skipped */
  const c=new Array(8).fill(0); for(let j=a+2;j<=t;j++){ const x=F.C[j-2],y=F.C[j-1],z=F.C[j]; if(x===y||y===z||x===z) continue; c[(x<y?4:0)+(y<z?2:0)+(x<z?1:0)]++; }
  c[1]=0; c[6]=0; const tot=c.reduce((s,v)=>s+v,0); if(tot<40) return null;
  let H=0; for(const v of c) if(v>0){ const p=v/tot; H-=p*Math.log(p); } return {pe:clip(H/Math.log(6),0,1),n:tot};
}
/* CUSUM on standardised returns: a sustained one-sided drift versus the earlier baseline.  Fires when the cumulative sum crosses h=5 (k=0.5) in the last 3 bars */
function qCusum(F,t){
  const N=250; const a=Math.max(0,t-N); if(t-a<120) return null; const base=_logRets(F,a,t-40), mu=_mean(base), sd=_std(base); if(!(sd>0)) return null;
  let sp=0,sn=0,hit=null; const rs=_logRets(F,t-41,t);
  for(let i=0;i<rs.length;i++){ const z=(rs[i]-mu)/sd, p0=sp, n0=sn; sp=Math.max(0,sp+z-.5); sn=Math.max(0,sn-z-.5);
    /* a hit is the bar where the sum FIRST crosses the threshold (not every bar it stays above it), and only if that was in the last 3 bars */
    if(i>=rs.length-3){ if(p0<5&&sp>=5) hit={dir:1,s:sp,age:rs.length-1-i}; else if(n0<5&&sn>=5) hit={dir:-1,s:sn,age:rs.length-1-i}; } }
  return {hit,sp,sn,n:base.length};
}
/* Kalman local-linear-trend filter on log price: state = [level, slope per bar].  z = slope / its own uncertainty; flip = slope changed sign within the last 3 bars with |z| >= 1 */
function qKalman(F,t,N){
  N=N||150; const a=Math.max(0,t-N); if(t-a<60) return null; const rs=_logRets(F,a,t), sg=_std(rs); if(!(sg>0)) return null;
  let l=Math.log(F.C[a]), v=0, P00=sg*sg, P01=0, P11=(sg*.2)*(sg*.2); const R=sg*sg, Q00=sg*sg*.05, Q11=(sg*.03)*(sg*.03); const sl=[];
  for(let j=a+1;j<=t;j++){
    l+=v; const p00=P00+2*P01+P11+Q00, p01=P01+P11, p11=P11+Q11;                       /* predict */
    const y=Math.log(F.C[j])-l, S=p00+R, k0=p00/S, k1=p01/S;                          /* update */
    l+=k0*y; v+=k1*y; P00=(1-k0)*p00; P01=(1-k0)*p01; P11=p11-k1*p01; sl.push({v,z:v/Math.sqrt(Math.max(P11,1e-18))});
  }
  const cur=sl[sl.length-1], prev=sl[sl.length-4]; const flip=prev&&Math.sign(cur.v)!==Math.sign(prev.v)&&Math.abs(cur.z)>=1&&Math.abs(prev.z)>=.3;
  return {slope:cur.v,z:cur.z,dir:Math.sign(cur.v),flip:!!flip,n:sl.length};
}
/* least-squares regression channel on closes: slope, R², position in standard deviations from the fit line */
function qRegChannel(F,t,N){
  N=N||100; const a=Math.max(0,t-N+1); if(t-a<40) return null; const xs=[],ys=[]; for(let j=a;j<=t;j++){ xs.push(j-a); ys.push(F.C[j]); }
  const f=_ols(xs,ys); if(!f||!(f.sd>0)) return null; const fit=f.a+f.b*(t-a), at=F.atr[t]||f.sd;
  return {slope:f.b,slopeAtr:f.b/at,r2:f.r2,sd:f.sd,pos:(F.C[t]-fit)/f.sd,mid:fit,up:fit+2*f.sd,lo:fit-2*f.sd,n:xs.length};
}
/* Ornstein–Uhlenbeck half-life (in bars) of the deviation from a moving mean: dX = b·X + e, half-life = -ln2 / ln(1+b), only when mean-reverting (-1 < b < 0) */
function qOU(F,t,N){
  N=N||100; const a=Math.max(0,t-N+1); if(t-a<50) return null; const m=_mean(F.C.slice(a,t+1)), xs=[],ys=[]; for(let j=a;j<t;j++){ xs.push(F.C[j]-m); ys.push(F.C[j+1]-F.C[j]); }
  const f=_ols(xs,ys); if(!f) return null; const b=f.b; if(!(b<0&&b>-1)) return {halfLife:null,b,reverting:false,n:xs.length};
  const hl=-Math.log(2)/Math.log(1+b); if(hl>N) return {halfLife:null,b,reverting:false,n:xs.length};      /* a half-life longer than the window is not evidence of reversion */
  return {halfLife:hl,b,reverting:true,n:xs.length};
}
/* VPIN-lite: volume-synchronised probability of informed trading approximated with BARS as the volume buckets (each bar's |buy-sell| / volume, averaged over N bars),
   with its percentile against the previous 250 readings.  Needs real taker-buy volume (F.hasDelta).  It measures how one-sided the recent flow was (toxicity), NOT direction. */
function qVpin(F,t,N){
  if(!F.hasDelta) return null; N=N||50; if(t<N+80) return null;
  const x=j=>(F.V[j]>0?Math.min(1,Math.abs(F.dl[j])/F.V[j]):0), at=e=>{ let s=0; for(let j=e-N+1;j<=e;j++) s+=x(j); return s/N; };
  const now=at(t), hist=[]; for(let e=Math.max(N,t-250);e<t;e+=2) hist.push(at(e)); if(hist.length<30) return null;
  const le=hist.filter(v=>v<=now).length/hist.length; let sd=0,sg=0; for(let j=t-4;j<=t;j++) sd+=F.dl[j];
  return {vpin:now,pct:le,dir:sd>0?1:sd<0?-1:0,n:hist.length};
}
/* Beta-Binomial posterior of a measured hit rate (uniform prior): mean and 90% credible interval from a numeric grid.  Needs real outcomes; with few it simply stays wide. */
function betaPost(w,n){
  w=Math.max(0,w|0); n=Math.max(w,n|0); const a=w+1,b=n-w+1,G=400, lp=[], xs=[]; let mx=-Infinity;
  for(let i=1;i<G;i++){ const x=i/G; xs.push(x); const v=(a-1)*Math.log(x)+(b-1)*Math.log(1-x); lp.push(v); if(v>mx) mx=v; }
  let tot=0; const pd=lp.map(v=>{ const e=Math.exp(v-mx); tot+=e; return e; }); let c=0,lo=null,hi=null;
  for(let i=0;i<pd.length;i++){ c+=pd[i]/tot; if(lo==null&&c>=.05) lo=xs[i]; if(hi==null&&c>=.95) hi=xs[i]; }
  return {mean:a/(a+b),lo:lo==null?0:lo,hi:hi==null?1:hi,n};
}
if(typeof module!=='undefined') module.exports={qHurst,qEntropy,qCusum,qKalman,qRegChannel,qOU,qVpin,betaPost};
