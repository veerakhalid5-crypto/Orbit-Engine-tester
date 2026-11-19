/* ================================================================
   ORDER FLOW & VOLUME STRUCTURE (pure — no DOM, no network)
   Built from candles only (volume + taker-buy volume per candle).  True tick-level footprints are not available in candle data:
   "stacked imbalance" here means consecutive candles whose taker flow was one-sided, not price-level imbalances inside one candle.
   When a candle carries no taker-buy volume the delta is ESTIMATED from the candle shape and F.hasDelta is false — callers must label that.
     • stacked one-sided flow runs · absorption (heavy opposite flow that does not move price) · exhaustion (new extreme on fading volume and opposing flow)
     • volume profile over a rolling window: POC, value area, high-volume nodes (HVN), low-volume nodes (LVN)
     • previous-day value area and whether its POC is still untouched ("naked")
   Everything at bar t uses bars <= t only.
   ================================================================ */
function flowProfile(F,a,b,nb){
  nb=nb||48; let lo=Infinity,hi=-Infinity; for(let i=a;i<=b;i++){ if(F.L[i]<lo) lo=F.L[i]; if(F.H[i]>hi) hi=F.H[i]; }
  if(!(hi>lo)) return null; const st=(hi-lo)/nb, v=new Array(nb).fill(0);
  for(let i=a;i<=b;i++){ const vol=F.V[i]; if(!(vol>0)) continue; const i0=clip(Math.floor((F.L[i]-lo)/st),0,nb-1), i1=clip(Math.floor((F.H[i]-lo)/st),0,nb-1);
    if(i0===i1||!(F.H[i]>F.L[i])){ v[i0]+=vol; continue; } const r=F.H[i]-F.L[i];
    for(let j=i0;j<=i1;j++){ const ov=Math.min(F.H[i],lo+(j+1)*st)-Math.max(F.L[i],lo+j*st); if(ov>0) v[j]+=vol*ov/r; } }
  const tot=v.reduce((s,x)=>s+x,0); if(!(tot>0)) return null; let poc=0; for(let j=1;j<nb;j++) if(v[j]>v[poc]) poc=j;
  let acc=v[poc],l=poc,h=poc; while(acc<.7*tot&&(l>0||h<nb-1)){ const dn=l>0?v[l-1]:-1, up=h<nb-1?v[h+1]:-1; if(up>=dn){ h++; acc+=v[h]; } else{ l--; acc+=v[l]; } }
  const mean=tot/nb, pr=j=>lo+(j+.5)*st, hvn=[], lvn=[];
  /* HVN: a local maximum well above average (bins outside the range count as empty, so a cluster at the edge of the range still qualifies).
     LVN: a local minimum well below average, interior bins only (the thin edges of any range are not "nodes") */
  const at=k=>(k<0||k>=nb)?0:v[k];
  /* neighbouring qualifying bins are one node (a flat top or an empty stretch is a single node, reported at its middle) */
  const merge=(js)=>{ const out=[]; let g=[]; js.forEach((j,i)=>{ if(g.length&&j!==g[g.length-1]+1){ out.push(g); g=[]; } g.push(j); if(i===js.length-1) out.push(g); }); return out.map(g=>{ const m=g[g.length>>1]; return {p:pr(m),v:v[m]/mean,bins:g.length}; }); };
  const hj=[], lj=[];
  for(let j=0;j<nb;j++){ const nbh=[at(j-2),at(j-1),at(j+1),at(j+2)]; if(v[j]>=1.4*mean&&nbh.every(x=>v[j]>=x)) hj.push(j); }
  for(let j=2;j<nb-2;j++){ const nbh=[v[j-2],v[j-1],v[j+1],v[j+2]]; if(v[j]<=.5*mean&&nbh.every(x=>v[j]<=x)) lj.push(j); }
  hvn.push(...merge(hj)); lvn.push(...merge(lj));
  return {lo,hi,st,poc:pr(poc),vah:lo+(h+1)*st,val:lo+l*st,hvn,lvn,mean};
}

function passFlow(F){
  const {n,O,H,L,C,atr,rv,dr,dl,avgV}=F;
  F.stk=new Int8Array(n); F.absorb=new Int8Array(n); F.exh=new Int8Array(n);
  let run=0,rd=0;
  for(let t=0;t<n;t++){
    const a=atr[t]; if(!fin(a)||a<=0){ run=0; rd=0; continue; }
    const body=(C[t]-O[t])/a;
    const d=(dr[t]>=.35&&body>=.3)?1:(dr[t]<=-.35&&body<=-.3)?-1:0;
    if(d&&d===rd) run++; else{ rd=d; run=d?1:0; }
    F.stk[t]=rd*Math.min(run,100);
    const rng=H[t]-L[t], mid=(H[t]+L[t])/2;
    /* absorption: heavy volume, small range, aggressive flow one way while price closes the other half */
    if(rv[t]>=1.8&&rng<=.7*a&&rng>0){ if(dr[t]<=-.25&&C[t]>=mid) F.absorb[t]=1; else if(dr[t]>=.25&&C[t]<=mid) F.absorb[t]=-1; }
    /* exhaustion: a new 20-bar extreme on thin volume with the candle's flow pointing the other way */
    if(t>=20){ let hh=-Infinity,ll=Infinity; for(let j=t-20;j<t;j++){ if(H[j]>hh) hh=H[j]; if(L[j]<ll) ll=L[j]; }
      if(H[t]>hh&&rv[t]<.85&&dl[t]<0) F.exh[t]=-1; else if(L[t]<ll&&rv[t]<.85&&dl[t]>0) F.exh[t]=1; }
  }
  /* day ranges for the previous-day value area (intraday charts only) */
  const dayR=[], dayOf=new Int32Array(n).fill(-1), tf=F.opt.tfSec; F.vpCache=new Map(); F.pdvpCache=new Map();
  if(tf<=14400){ let dk=-1,s=0; for(let t=0;t<n;t++){ const dd=Math.floor(F.c[t].time/86400); if(dd!==dk){ if(dk>=0) dayR.push({s,e:t-1}); dk=dd; s=t; } dayOf[t]=dayR.length; } }
  F.vpAt=function(t,N,nb){
    N=N||150; nb=nb||48; const key=t+'|'+N+'|'+nb, hit=F.vpCache.get(key); if(hit!==undefined) return hit;
    const a=Math.max(0,t-N+1); let r=null;
    if(t-a>=30){ const P=flowProfile(F,a,t,nb); if(P){ const px=F.C[t];
      const up=P.hvn.filter(x=>x.p>px).sort((x,y)=>x.p-y.p)[0]||null, dn=P.hvn.filter(x=>x.p<px).sort((x,y)=>y.p-x.p)[0]||null;
      const lu=P.lvn.filter(x=>x.p>px).sort((x,y)=>x.p-y.p)[0]||null, ld=P.lvn.filter(x=>x.p<px).sort((x,y)=>y.p-x.p)[0]||null;
      const aNow=F.atr[t]||P.st, atLvn=P.lvn.some(x=>Math.abs(x.p-px)<=.5*aNow);
      r={poc:P.poc,vah:P.vah,val:P.val,pos:px>P.vah?'above':px<P.val?'below':'inside',hvnUp:up,hvnDn:dn,lvnUp:lu,lvnDn:ld,atLvn,nHvn:P.hvn.length,nLvn:P.lvn.length}; } }
    if(F.vpCache.size>400) F.vpCache.clear(); F.vpCache.set(key,r); return r;
  };
  F.pdvpAt=function(t){
    const d=dayOf[t]; if(d==null||d<1||!dayR.length) return null; const hit=F.pdvpCache.get(d); let P=hit;
    if(P===undefined){ const R=dayR[d-1]; P=(R&&R.e-R.s>=5)?flowProfile(F,R.s,R.e,32):null; F.pdvpCache.set(d,P); }
    if(!P) return null; const R=dayR[d-1]; let touched=false; for(let j=R.e+1;j<=t;j++){ if(F.L[j]<=P.poc&&F.H[j]>=P.poc){ touched=true; break; } }
    return {poc:P.poc,vah:P.vah,val:P.val,nakedPoc:!touched};
  };
  F.flowAt=function(t){
    const a=F.atr[t]; const sumD=(k)=>{ let s=0; for(let j=Math.max(0,t-k+1);j<=t;j++) s+=F.dl[j]; return s/Math.max(1e-12,(F.avgV[t]||1)*k); };
    const near=(arr,w)=>{ for(let j=t;j>=Math.max(0,t-w);j--) if(arr[j]) return {dir:arr[j],age:t-j}; return null; };
    const sk=F.stk[t];
    return {hasDelta:F.hasDelta,stack:{dir:Math.sign(sk),n:Math.abs(sk)},absorb:near(F.absorb,3),exhaust:near(F.exh,3),delta3:clip(sumD(3),-2,2),delta10:clip(sumD(10),-2,2),vp:F.vpAt(t),pdvp:F.pdvpAt(t)};
  };
}
if(typeof module!=='undefined') module.exports={passFlow,flowProfile};
