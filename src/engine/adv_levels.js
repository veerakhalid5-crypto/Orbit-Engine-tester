/* ================================================================
   ICT TIME, OPENS, RANGES & DRAW ON LIQUIDITY (pure — no DOM, no network)
     • New-York clock with the real US daylight-saving rule  → killzones (Asia · London · NY AM · London close · NY PM) and the three "Silver Bullet" hours
     • reference opens: daily (UTC) · New-York midnight · 08:30 New York · weekly (Monday UTC) · monthly (UTC)
     • Judas swing: a false move away from an open that is taken back through it
     • IPDA look-back ranges: the high/low of the last 20 / 40 / 60 completed days (when that much history exists)
     • draw on liquidity: which unswept pool price is most likely being pulled toward
     • SMT divergence versus a reference market (e.g. Bitcoin): one market makes a new extreme, the other fails to
   Every value at bar t uses bars <= t only (tested by a prefix-invariance test).  Killzone hours are a convention, not a law of the market:
   the app reports how signals actually performed inside / outside them and never assumes they help.
   ================================================================ */
const KZ_NAMES=['','ASIA','LONDON','NY_AM','LONDON_CLOSE','NY_PM'], SB_NAMES=['','LONDON_SB','NY_AM_SB','NY_PM_SB'];
const KZ_TXT={ASIA:'Asian range',LONDON:'London killzone',NY_AM:'New York AM killzone',LONDON_CLOSE:'London close',NY_PM:'New York PM killzone'};
const SB_TXT={LONDON_SB:'London Silver Bullet hour (03:00–04:00 New York)',NY_AM_SB:'New York AM Silver Bullet hour (10:00–11:00)',NY_PM_SB:'New York PM Silver Bullet hour (14:00–15:00)'};

/* ---------- New York clock (US daylight-saving: second Sunday of March 02:00 → first Sunday of November 02:00) ---------- */
const _dstCache=new Map();
function _nthSunday(y,m,nth){ const first=new Date(Date.UTC(y,m,1)).getUTCDay(); return 1+((7-first)%7)+(nth-1)*7; }
function nyOffsetSec(ts){
  const y=new Date(ts*1000).getUTCFullYear(); let r=_dstCache.get(y);
  if(!r){ r={s:Date.UTC(y,2,_nthSunday(y,2,2),7)/1000,e:Date.UTC(y,10,_nthSunday(y,10,1),6)/1000}; _dstCache.set(y,r); }
  return ts>=r.s&&ts<r.e?-4*3600:-5*3600;
}
/* local New York wall clock for an epoch second: {day (local day number), h (hour 0-24), dow (0=Sunday)} */
function nyClock(ts){ const loc=ts+nyOffsetSec(ts), day=Math.floor(loc/86400); return {day,h:(loc-day*86400)/3600,dow:(day+4)%7}; }
/* killzone / Silver-Bullet id for a New-York hour */
function kzOf(h){ return h>=20?1:(h>=2&&h<5)?2:(h>=7&&h<10)?3:(h>=10&&h<12)?4:(h>=13.5&&h<16)?5:0; }
function sbOf(h){ return (h>=3&&h<4)?1:(h>=10&&h<11)?2:(h>=14&&h<15)?3:0; }
function ictTimeOf(ts){ const c=nyClock(ts); return {kz:KZ_NAMES[kzOf(c.h)]||null,sb:SB_NAMES[sbOf(c.h)]||null,nyHour:c.h,dow:c.dow}; }

function _liveP(P,t){ return P.b<=t&&(P.end==null||t<P.end)&&(P.taken==null||t<P.taken); }

function passICT(F){
  const {n,c,O,H,L,C,atr}=F, tf=F.opt.tfSec;
  F.kzId=new Int8Array(n); F.sbId=new Int8Array(n);
  F.nyMid=new Float64Array(n).fill(NaN); F.ny830=new Float64Array(n).fill(NaN); F.wOpen=new Float64Array(n).fill(NaN); F.mOpen=new Float64Array(n).fill(NaN);
  F.judas=new Array(n).fill(null); F.ipda=new Array(n).fill(null);
  const clock=tf<=3600, opens=tf<=1800, cal=tf<=86400;
  let nyDay=-1,nyMid=NaN,ny830=NaN,wk=-1,wOpen=NaN,mo=-1,mOpen=NaN;
  let jw=null; /* Judas-swing window state */
  let dKey=-1,dH=0,dL=0; const days=[]; let ipdaCur=null;
  for(let t=0;t<n;t++){
    const tm=c[t].time;
    if(clock){ const k=nyClock(tm); F.kzId[t]=kzOf(k.h); F.sbId[t]=sbOf(k.h);
      if(opens){
        /* an open is only recorded when this bar really contains that moment (a series that starts mid-day has no midnight open) */
        if(k.day!==nyDay){ nyDay=k.day; nyMid=(k.h<tf/3600+1e-9)?O[t]:NaN; ny830=NaN; jw=null; }
        if(isNaN(ny830)&&k.h>=8.5&&k.h<8.5+tf/3600+1e-9&&nyDay===k.day) ny830=O[t];
        /* Judas swing: from an open, price travels >= 0.5 ATR one way, then closes back through the open by >= 0.25 ATR */
        const win=(k.h<5&&fin(nyMid))?{open:nyMid,id:'MID'}:(k.h>=8.5&&k.h<11&&fin(ny830))?{open:ny830,id:'830'}:null;
        if(win){ if(!jw||jw.id!==win.id||jw.day!==k.day) jw={id:win.id,day:k.day,open:win.open,up:0,dn:0,fired:{}};
          const a=atr[t]; if(fin(a)&&a>0){
            jw.up=Math.max(jw.up,(H[t]-jw.open)/a); jw.dn=Math.max(jw.dn,(jw.open-L[t])/a);
            if(jw.up>=.5&&C[t]<jw.open-.25*a&&!jw.fired[-1]){ jw.fired[-1]=1; F.judas[t]={dir:-1,open:jw.open,ext:jw.up,win:jw.id,i:t}; }
            else if(jw.dn>=.5&&C[t]>jw.open+.25*a&&!jw.fired[1]){ jw.fired[1]=1; F.judas[t]={dir:1,open:jw.open,ext:jw.dn,win:jw.id,i:t}; } } }
        else if(jw&&jw.day!==k.day) jw=null;
      }
    }
    F.nyMid[t]=nyMid; F.ny830[t]=ny830;
    if(cal){
      const dd=Math.floor(tm/86400), wkN=Math.floor((dd+3)/7), dt=new Date(tm*1000), moN=dt.getUTCFullYear()*12+dt.getUTCMonth();
      if(wkN!==wk){ wk=wkN; wOpen=(tm-(wkN*7-3)*86400<tf+1)?O[t]:NaN; } if(moN!==mo){ mo=moN; mOpen=(tm-Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth(),1)/1000<tf+1)?O[t]:NaN; }
      F.wOpen[t]=wOpen; F.mOpen[t]=mOpen;
      /* IPDA ranges from COMPLETED days only */
      if(dd!==dKey){
        if(dKey>=0){ days.push({h:dH,l:dL}); if(days.length>70) days.shift(); }
        dKey=dd; dH=H[t]; dL=L[t];
        const mk=N=>{ if(days.length<N) return null; let hi=-Infinity,lo=Infinity; for(let j=days.length-N;j<days.length;j++){ if(days[j].h>hi) hi=days[j].h; if(days[j].l<lo) lo=days[j].l; } return {hi,lo,eq:(hi+lo)/2,n:N}; };
        ipdaCur={r20:mk(20),r40:mk(40),r60:mk(60)};
      }else{ if(H[t]>dH) dH=H[t]; if(L[t]<dL) dL=L[t]; }
      F.ipda[t]=ipdaCur;
    }
  }
  /* snapshot of all the ICT context at bar t */
  F.ictAt=function(t){
    const px=F.C[t], a=F.atr[t], kz=KZ_NAMES[F.kzId[t]]||null, sb=SB_NAMES[F.sbId[t]]||null;
    const sgn=(o)=>fin(o)?(px>o+.05*a?1:px<o-.05*a?-1:0):null;
    const ip=F.ipda[t], pos=r=>r?clip((px-r.lo)/Math.max(r.hi-r.lo,1e-12),-.5,1.5):null;
    const jud=[]; for(let j=Math.max(0,t-6);j<=t;j++) if(F.judas[j]) jud.push(F.judas[j]);
    return {kz,sb,kzTxt:kz?KZ_TXT[kz]:null,sbTxt:sb?SB_TXT[sb]:null,
      opens:{daily:F.dOpen[t],nyMid:F.nyMid[t],ny830:F.ny830[t],weekly:F.wOpen[t],monthly:F.mOpen[t]},
      vs:{daily:sgn(F.dOpen[t]),nyMid:sgn(F.nyMid[t]),ny830:sgn(F.ny830[t]),weekly:sgn(F.wOpen[t]),monthly:sgn(F.mOpen[t])},
      ipda:ip?{r20:ip.r20,r40:ip.r40,r60:ip.r60,pos20:pos(ip.r20),pos40:pos(ip.r40),pos60:pos(ip.r60)}:null,
      judas:jud.length?jud[jud.length-1]:null};
  };
  /* draw on liquidity: the unswept pool price is most likely being pulled toward. score = rank / (1 + distance in ATR) */
  F.drawAt=function(t){
    const px=F.C[t], a=F.atr[t]; if(!fin(a)||a<=0) return null;
    let up=null,dn=null;
    for(const P of F.pools){ if(!_liveP(P,t)||P.b>=t) continue; const rk=POOL_RANK[P.kind]||1, d=Math.abs(P.p-px)/a; if(d<.15||d>25) continue;
      const s=(rk+(P.n>1?.5*Math.min(P.n,4):0))/(1+d), o={p:P.p,kind:P.kind,n:P.n,rank:rk,dist:d,score:s};
      if(P.p>px){ if(!up||s>up.score) up=o; } else{ if(!dn||s>dn.score) dn=o; } }
    const su=up?up.score:0, sd=dn?dn.score:0, tot=su+sd;
    return {up,dn,vote:tot>0?(su-sd)/tot:0};
  };
  /* ICT directional bias in [-1, 1]: structure + draw on liquidity + the latest liquidity raid — a fixed-weight vote, documented, not fitted */
  F.ictBiasAt=function(t){
    const parts=[]; let s=0;
    const tr=F.trend[t]; if(tr){ s+=.4*tr; parts.push({k:'structure',v:tr,txt:'swing structure is '+(tr>0?'bullish':'bearish')}); }
    const dr=F.drawAt(t); if(dr&&dr.vote!==0&&(dr.up||dr.dn)){ s+=.3*dr.vote; const tgt=dr.vote>0?dr.up:dr.dn; if(tgt) parts.push({k:'draw',v:Math.sign(dr.vote),txt:'the strongest nearby liquidity is '+(dr.vote>0?'above':'below')+' ('+(KIND_TXT[tgt.kind]||'level')+', '+tgt.dist.toFixed(1)+' ATR)'}); }
    for(let j=t;j>=Math.max(0,t-12);j--){ const sw=F.sweepAt[j]; if(sw){ s+=.3*sw.dir; parts.push({k:'raid',v:sw.dir,txt:(sw.dir>0?'sell-side':'buy-side')+' liquidity ('+(KIND_TXT[sw.kind]||'level')+') was raided '+(t-j)+' bars ago and reclaimed'}); break; } }
    return {bias:clip(s,-1,1),parts};
  };
}

/* ---------- SMT divergence vs a reference market (both on the SAME timeframe) ---------- */
function makeSmtRef(candles){ const idx=new Map(); candles.forEach((k,i)=>idx.set(k.time,i)); return {c:candles,idx,H:candles.map(k=>k.high),L:candles.map(k=>k.low)}; }
/* compares the last `look` bars with the `look` bars before them.  Returns the divergence that exists at bar t, or null:
   bearish = one market made a higher high and the other did not · bullish = one made a lower low and the other did not */
function smtAt(F,R,t,look){
  look=look||20; if(!R||t<2*look) return null; const ti=R.idx.get(F.c[t].time); if(ti==null||ti<2*look) return null;
  const ext=(arr,a,b,hi)=>{ let m=hi?-Infinity:Infinity; for(let j=a;j<=b;j++){ const v=hi?arr[j]:arr[j]; if(hi?v>m:v<m) m=v; } return m; };
  const rH=R.H, rL=R.L;
  const cH1=ext(F.H,t-look+1,t,true), cH0=ext(F.H,t-2*look+1,t-look,true), cL1=ext(F.L,t-look+1,t,false), cL0=ext(F.L,t-2*look+1,t-look,false);
  const xH1=ext(rH,ti-look+1,ti,true), xH0=ext(rH,ti-2*look+1,ti-look,true), xL1=ext(rL,ti-look+1,ti,false), xL0=ext(rL,ti-2*look+1,ti-look,false);
  const a=F.atr[t], cHH=cH1>cH0+.05*a, cLL=cL1<cL0-.05*a, xHH=xH1>xH0*(1+1e-4), xLL=xL1<xL0*(1-1e-4);
  const out=[];
  if(cHH!==xHH) out.push({dir:-1,kind:'bearish',lead:cHH?'the coin':'the reference',txt:(cHH?'the coin':'the reference market')+' made a higher high but '+(cHH?'the reference market':'the coin')+' did not confirm it'});
  if(cLL!==xLL) out.push({dir:1,kind:'bullish',lead:cLL?'the coin':'the reference',txt:(cLL?'the coin':'the reference market')+' made a lower low but '+(cLL?'the reference market':'the coin')+' did not confirm it'});
  if(out.length===1) return out[0];
  return null;               /* both (or neither) diverged: no clean read */
}
if(typeof module!=='undefined') module.exports={nyOffsetSec,nyClock,ictTimeOf,passICT,makeSmtRef,smtAt,kzOf,sbOf};
