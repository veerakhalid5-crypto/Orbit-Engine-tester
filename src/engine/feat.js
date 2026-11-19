/* ================================================================
   AI SIGNAL ENGINE — FEATURES
   Every pass below walks the candles forward once and only ever uses bars <= t,
   so a signal found on bar t is exactly what the engine would have said live.
   passes: candles · liquidity & sweeps · structure (BOS/CHoCH) · zones (OB/FVG) ·
           divergence · break & retest · trendlines · power of 3
   ================================================================ */
function fractals(c,k){
  const out=[];
  for(let i=k;i<c.length-k;i++){
    let hh=true,ll=true;
    for(let j=1;j<=k;j++){
      if(c[i].high<c[i-j].high||c[i].high<c[i+j].high) hh=false;
      if(c[i].low>c[i-j].low||c[i].low>c[i+j].low) ll=false;
    }
    if(hh) out.push({i,ci:i+k,p:c[i].high,t:'H'});
    if(ll) out.push({i,ci:i+k,p:c[i].low,t:'L'});
  }
  return out;
}
function byConfirm(fr){ const m={}; fr.forEach(p=>{ (m[p.ci]=m[p.ci]||[]).push(p); }); return m; }
const utcHour=t=>((t%86400)/3600);

/* ---------- pass 0: indicators & per-bar volume facts ---------- */
function passBase(F){
  const {c,n}=F;
  F.O=c.map(k=>k.open); F.H=c.map(k=>k.high); F.L=c.map(k=>k.low); F.C=c.map(k=>k.close); F.V=c.map(k=>k.volume);
  F.atr=atrArr(c,14); F.ema20=emaArr(F.C,20); F.ema50=emaArr(F.C,50); F.ema200=emaArr(F.C,200);
  F.rsi=rsiArr(F.C,14); const m=macdArr(F.C); F.macd=m.line; F.mh=m.hist; F.rv=rvolArr(F.V,20);
  F.dl=new Array(n); F.dr=new Array(n); F.cvd=new Array(n); F.hasDelta=false; let cum=0;
  for(let i=0;i<n;i++){
    const k=c[i], rng=k.high-k.low; let d;
    if(fin(k.buy)&&k.volume>0&&k.buy>=0&&k.buy<=k.volume*1.0001){ d=2*k.buy-k.volume; F.hasDelta=true; }
    else d=rng>0?((k.close-k.low)-(k.high-k.close))/rng*k.volume:0;
    F.dl[i]=d; F.dr[i]=k.volume>0?clip(d/k.volume,-1,1):0; cum+=d; F.cvd[i]=cum;
  }
  F.avgV=emaArr(F.V,20);
}

/* (pass 1 removed in v17: candlestick patterns such as engulfing / pin bars are not computed and never used as a signal or as confirmation) */

/* ---------- pass 2: liquidity pools, sweeps, breakouts ---------- */
const POOL_RANK={PMH:4,PML:4,PDH:4,PDL:4,PWH:4,PWL:4,EQH:3,EQL:3,ASH:3,ASL:3,LSH:2,LSL:2,NSH:2,NSL:2,SWH:1,SWL:1};
function passLiquidity(F){
  const {c,n,atr,O,H,L,C,rv,dr}=F, o=F.opt, fr=fractals(c,o.ksw), by=byConfirm(fr);
  const pools=[]; let aliveH=[],aliveL=[]; const rec=[];
  F.sweeps=[]; F.sweepAt=new Array(n).fill(null); F.brks=[]; F.brkAt=new Array(n).fill(null);
  F.dOpen=new Float64Array(n); F.kz=new Array(n).fill(null); F.pools=pools;
  const intra=o.tfSec<=14400, sess=o.tfSec<=3600;
  let day=-1,dH=0,dL=0,pdOpen=0,week=-1,wH=0,wL=0,asH=-Infinity,asL=Infinity,asDone=false;
  let month=-1,mH=0,mL=0,lonH=-Infinity,lonL=Infinity,lonDone=false,nyH=-Infinity,nyL=Infinity,nyDone=false;
  const mk=(side,p,i,b,kind,n2)=>{ const P={side,p,i,b,kind,n:n2||1,taken:null,end:null,lastSw:-99}; pools.push(P); (side==='H'?aliveH:aliveL).push(P); return P; };
  const endKind=(arr,kinds,t)=>{ arr.forEach(P=>{ if(kinds.indexOf(P.kind)>=0&&P.end==null) P.end=t; }); };
  for(let t=0;t<n;t++){
    const a=atr[t], tm=c[t].time, hr=utcHour(tm);
    /* calendar levels (intraday charts) */
    const dd=Math.floor(tm/86400);
    if(dd!==day){
      if(intra&&day>=0){
        endKind(aliveH,['PDH','ASH'],t); endKind(aliveL,['PDL','ASL'],t);
        mk('H',dH,t-1,t,'PDH'); mk('L',dL,t-1,t,'PDL');
      }
      day=dd; dH=H[t]; dL=L[t]; pdOpen=O[t]; asH=-Infinity; asL=Infinity; asDone=false; lonH=-Infinity; lonL=Infinity; lonDone=false; nyH=-Infinity; nyL=Infinity; nyDone=false;
      if(intra){ const dt=new Date(tm*1000), mo=dt.getUTCFullYear()*12+dt.getUTCMonth(); if(mo!==month){ if(month>=0){ endKind(aliveH,['PMH'],t); endKind(aliveL,['PML'],t); mk('H',mH,t-1,t,'PMH'); mk('L',mL,t-1,t,'PML'); } month=mo; mH=H[t]; mL=L[t]; } }
      if(intra){ const wk=Math.floor((dd+3)/7); if(wk!==week){ if(week>=0){ endKind(aliveH,['PWH'],t); endKind(aliveL,['PWL'],t); mk('H',wH,t-1,t,'PWH'); mk('L',wL,t-1,t,'PWL'); } week=wk; wH=H[t]; wL=L[t]; } }
    }else{ if(H[t]>dH) dH=H[t]; if(L[t]<dL) dL=L[t]; if(intra){ if(H[t]>wH) wH=H[t]; if(L[t]<wL) wL=L[t]; if(H[t]>mH) mH=H[t]; if(L[t]<mL) mL=L[t]; } }
    F.dOpen[t]=pdOpen;
    if(sess){
      if(hr<8){ if(H[t]>asH) asH=H[t]; if(L[t]<asL) asL=L[t]; }
      else if(!asDone&&asH>-Infinity){ asDone=true; mk('H',asH,t-1,t,'ASH'); mk('L',asL,t-1,t,'ASL'); }
      /* London (07-12 UTC) and New York (13-21 UTC) session highs/lows become liquidity once the session is over */
      if(hr>=7&&hr<12){ if(H[t]>lonH) lonH=H[t]; if(L[t]<lonL) lonL=L[t]; } else if(hr>=12&&!lonDone&&lonH>-Infinity){ lonDone=true; endKind(aliveH,['LSH'],t); endKind(aliveL,['LSL'],t); mk('H',lonH,t-1,t,'LSH'); mk('L',lonL,t-1,t,'LSL'); }
      if(hr>=13&&hr<21){ if(H[t]>nyH) nyH=H[t]; if(L[t]<nyL) nyL=L[t]; } else if(hr>=21&&!nyDone&&nyH>-Infinity){ nyDone=true; endKind(aliveH,['NSH'],t); endKind(aliveL,['NSL'],t); mk('H',nyH,t-1,t,'NSH'); mk('L',nyL,t-1,t,'NSL'); }
      F.kz[t]=hr<3?'ASIA':(hr>=7&&hr<10)?'LONDON':(hr>=12.5&&hr<15.5)?'NEW YORK':null;
    }
    /* new swing pivots become liquidity pools; near-equal ones merge into EQH / EQL */
    const ps=by[t]; if(ps) ps.forEach(p=>{
      const arr=p.t==='H'?aliveH:aliveL, tol=.12*a;
      const ex=arr.find(P=>P.end==null&&P.taken==null&&(P.kind==='SWH'||P.kind==='SWL'||P.kind==='EQH'||P.kind==='EQL')&&Math.abs(P.p-p.p)<=tol);
      if(ex){ ex.end=t; const lvl=p.t==='H'?Math.max(ex.p,p.p):Math.min(ex.p,p.p); mk(p.t,lvl,p.i,t,p.t==='H'?'EQH':'EQL',Math.min(ex.n+1,6)); }
      else mk(p.t,p.p,p.i,t,p.t==='H'?'SWH':'SWL');
    });
    /* sweeps / takes */
    const cand=[], rng=H[t]-L[t]||1e-12;
    const scan=(arr,side)=>{
      for(const P of arr){
        if(P.end!=null||P.taken!=null||P.b>=t) continue;
        if(side==='H'){
          if(C[t]>P.p+.1*a){ P.taken=t; rec.push({P,at:t,side}); const body=(C[t]-O[t])/a;
            if(body>=.6||rv[t]>=1.3){ const e={i:t,dir:1,lvl:P.p,kind:P.kind,n:P.n,body,rv:rv[t],P}; F.brks.push(e); (F.brkAt[t]=F.brkAt[t]||[]).push(e); } }
          else if(H[t]>P.p+.02*a&&C[t]<P.p&&t-P.lastSw>8){
            const e={i:t,dir:-1,lvl:P.p,kind:P.kind,n:P.n,ex:(H[t]-P.p)/a,cb:(P.p-C[t])/a,rej:(H[t]-Math.max(O[t],C[t]))/rng,rv:rv[t],flip:dr[t]<-.05,ext:H[t],bars:1,P};
            if(e.rej>=.25||e.cb>=.25) cand.push(e);
          }
        }else{
          if(C[t]<P.p-.1*a){ P.taken=t; rec.push({P,at:t,side}); const body=(O[t]-C[t])/a;
            if(body>=.6||rv[t]>=1.3){ const e={i:t,dir:-1,lvl:P.p,kind:P.kind,n:P.n,body,rv:rv[t],P}; F.brks.push(e); (F.brkAt[t]=F.brkAt[t]||[]).push(e); } }
          else if(L[t]<P.p-.02*a&&C[t]>P.p&&t-P.lastSw>8){
            const e={i:t,dir:1,lvl:P.p,kind:P.kind,n:P.n,ex:(P.p-L[t])/a,cb:(C[t]-P.p)/a,rej:(Math.min(O[t],C[t])-L[t])/rng,rv:rv[t],flip:dr[t]>.05,ext:L[t],bars:1,P};
            if(e.rej>=.25||e.cb>=.25) cand.push(e);
          }
        }
      }
    };
    scan(aliveH,'H'); scan(aliveL,'L');
    if(F.brkAt[t]&&F.brkAt[t].length>1){          // several stacked pools taken by one candle -> keep the most significant
      const L2=F.brkAt[t].slice().sort((x,y)=>((POOL_RANK[y.kind]||1)+y.n*.2)-((POOL_RANK[x.kind]||1)+x.n*.2)), keep=[];
      L2.forEach(e=>{ if(!keep.some(k=>k.dir===e.dir&&Math.abs(k.lvl-e.lvl)<=.6*a)) keep.push(e); });
      F.brks=F.brks.filter(e=>e.i!==t||keep.indexOf(e)>=0); F.brkAt[t]=keep;
    }
    /* failed breakout: a level was taken 1-2 bars ago and price is back inside (turtle soup) */
    for(let k=rec.length-1;k>=0;k--){
      const r=rec[k]; if(t-r.at>2){ rec.splice(k,1); continue; } if(t===r.at||r.done) continue;
      const P=r.P;
      if(r.side==='H'&&C[t]<P.p&&C[t]<O[t]){
        let ext=-Infinity; for(let j=r.at;j<=t;j++) ext=Math.max(ext,H[j]);
        cand.push({i:t,dir:-1,lvl:P.p,kind:P.kind,n:P.n,ex:(ext-P.p)/a,cb:(P.p-C[t])/a,rej:(ext-Math.max(O[t],C[t]))/(ext-L[t]||1e-12),rv:Math.max(rv[t],rv[r.at]),flip:dr[t]<-.05,ext,bars:t-r.at+1,P}); r.done=true;
      }else if(r.side==='L'&&C[t]>P.p&&C[t]>O[t]){
        let ext=Infinity; for(let j=r.at;j<=t;j++) ext=Math.min(ext,L[j]);
        cand.push({i:t,dir:1,lvl:P.p,kind:P.kind,n:P.n,ex:(P.p-ext)/a,cb:(C[t]-P.p)/a,rej:(Math.min(O[t],C[t])-ext)/(H[t]-ext||1e-12),rv:Math.max(rv[t],rv[r.at]),flip:dr[t]>.05,ext,bars:t-r.at+1,P}); r.done=true;
      }
    }
    if(cand.length){
      cand.sort((x,y)=>((POOL_RANK[y.kind]||1)+y.n*.2+y.ex*.1)-((POOL_RANK[x.kind]||1)+x.n*.2+x.ex*.1));
      const e=cand[0]; e.P.lastSw=t; e.P.swept=(e.P.swept||[]); e.P.swept.push(t);
      F.sweeps.push(e); F.sweepAt[t]=e;
    }
    /* prune dead pools */
    if(t%16===0){ aliveH=aliveH.filter(P=>P.end==null&&P.taken==null&&t-P.b<600); aliveL=aliveL.filter(P=>P.end==null&&P.taken==null&&t-P.b<600); }
  }
}

/* ---------- pass 3: market structure (swings, BOS, CHoCH, dealing range) ---------- */
function passStructure(F){
  const {c,n,atr,O,H,L,C}=F, o=F.opt, fr=fractals(c,o.kst), by=byConfirm(fr);
  F.struct=[]; F.structAt=new Array(n).fill(null); F.piv=[];
  F.trend=new Int8Array(n); F.shP=new Float64Array(n).fill(NaN); F.slP=new Float64Array(n).fill(NaN);
  F.shI=new Int32Array(n).fill(-1); F.slI=new Int32Array(n).fill(-1); F.shB=new Uint8Array(n); F.slB=new Uint8Array(n);
  F.rHi=new Float64Array(n).fill(NaN); F.rLo=new Float64Array(n).fill(NaN); F.pd=new Float64Array(n).fill(NaN);
  let acc=null,lastSH=null,lastSL=null,trend=0,runHi=-Infinity,runLo=Infinity;
  const accept=(p,t)=>{
    acc=p; F.piv.push({i:p.i,ci:t,p:p.p,t:p.t});
    if(p.t==='H'){ lastSH={i:p.i,p:p.p,brk:false}; runLo=Infinity; for(let j=p.i;j<=t;j++) if(L[j]<runLo) runLo=L[j]; }
    else{ lastSL={i:p.i,p:p.p,brk:false}; runHi=-Infinity; for(let j=p.i;j<=t;j++) if(H[j]>runHi) runHi=H[j]; }
  };
  for(let t=0;t<n;t++){
    const a=atr[t], ps=by[t];
    if(ps) ps.sort((x,y)=>x.i-y.i).forEach(p=>{
      if(!acc){ accept(p,t); return; }
      if(acc.t===p.t){ if(p.t==='H'?p.p>acc.p:p.p<acc.p) accept(p,t); return; }
      if(Math.abs(p.p-acc.p)>=o.minSwing*a) accept(p,t);
    });
    if(H[t]>runHi) runHi=H[t]; if(L[t]<runLo) runLo=L[t];
    const dispAt=()=>{ let m=0; for(let j=Math.max(0,t-2);j<=t;j++) m=Math.max(m,Math.abs(C[j]-O[j])/atr[j]); return m; };
    if(lastSH&&!lastSH.brk&&C[t]>lastSH.p+.05*a){
      const kind=trend<0?'CHoCH':'BOS', disp=dispAt(); let sw=false;
      for(let j=Math.max(0,t-8);j<=t;j++) if(F.sweepAt[j]&&F.sweepAt[j].dir===1) sw=true;
      const e={i:t,kind,dir:1,lvl:lastSH.p,lvlI:lastSH.i,orgI:lastSL?lastSL.i:Math.max(0,t-10),prot:lastSL?lastSL.p:L[t],disp,beyond:(C[t]-lastSH.p)/a,mss:kind==='CHoCH'&&sw&&disp>=1,sweep:sw,init:trend===0};
      F.struct.push(e); (F.structAt[t]=F.structAt[t]||[]).push(e); trend=1; lastSH.brk=true;
    }else if(lastSL&&!lastSL.brk&&C[t]<lastSL.p-.05*a){
      const kind=trend>0?'CHoCH':'BOS', disp=dispAt(); let sw=false;
      for(let j=Math.max(0,t-8);j<=t;j++) if(F.sweepAt[j]&&F.sweepAt[j].dir===-1) sw=true;
      const e={i:t,kind,dir:-1,lvl:lastSL.p,lvlI:lastSL.i,orgI:lastSH?lastSH.i:Math.max(0,t-10),prot:lastSH?lastSH.p:H[t],disp,beyond:(lastSL.p-C[t])/a,mss:kind==='CHoCH'&&sw&&disp>=1,sweep:sw,init:trend===0};
      F.struct.push(e); (F.structAt[t]=F.structAt[t]||[]).push(e); trend=-1; lastSL.brk=true;
    }
    F.trend[t]=trend;
    if(lastSH){ F.shP[t]=lastSH.p; F.shI[t]=lastSH.i; F.shB[t]=lastSH.brk?1:0; }
    if(lastSL){ F.slP[t]=lastSL.p; F.slI[t]=lastSL.i; F.slB[t]=lastSL.brk?1:0; }
    let hi=NaN,lo=NaN;
    if(trend===1&&lastSL){ lo=lastSL.p; hi=runHi; } else if(trend===-1&&lastSH){ hi=lastSH.p; lo=runLo; }
    if(fin(hi)&&hi-lo>=1.5*a){ F.rHi[t]=hi; F.rLo[t]=lo; F.pd[t]=(C[t]-lo)/(hi-lo); }
  }
}

/* ---------- pass 4: order blocks, fair-value gaps, breakers ---------- */
function passZones(F){
  const {n,O,H,L,C,atr}=F; const zones=[]; let act=[]; F.zones=zones; F.zr=new Array(n).fill(null);
  const mkZ=(kind,dir,top,bot,born,i,x)=>{ const Z=Object.assign({kind,dir,top,bot,born,i,end:null,tb:[],inPrev:false},x||{}); zones.push(Z); act.push(Z); return Z; };
  for(let t=0;t<n;t++){
    const a=atr[t];
    for(const Z of act){
      if(Z.born>=t||Z.end!=null) continue;
      const bull=Z.dir>0;
      if(bull?C[t]<Z.bot-.1*a:C[t]>Z.top+.1*a){
        Z.end=t; if(Z.kind==='OB') mkZ('BRK',-Z.dir,Z.top,Z.bot,t,Z.i,{src:'OB'}); continue;
      }
      if(t-Z.born>220){ Z.end=t; continue; }
      const inZ=bull?(L[t]<=Z.top&&H[t]>=Z.bot):(H[t]>=Z.bot&&L[t]<=Z.top);
      if(inZ){
        if(!Z.inPrev) Z.tb.push(t); Z.inPrev=true;
        const rng=H[t]-L[t]; let ok=false;
        if(rng>=.3*a){
          if(bull) ok=(C[t]>O[t]&&(C[t]-L[t])/rng>=.5&&C[t]>Z.bot);   /* reaction = where price closed inside/around the zone — candlestick patterns (engulfing/pin) are NOT used as confirmation */
          else ok=(C[t]<O[t]&&(H[t]-C[t])/rng>=.5&&C[t]<Z.top);
        }
        if(ok){ const e={i:t,dir:Z.dir,z:Z,first:Z.tb.length===1,n:Z.tb.length}; (F.zr[t]=F.zr[t]||[]).push(e); }
      }else Z.inPrev=false;
    }
    act=act.filter(Z=>Z.end==null);
    if(act.length>40){ act.slice(0,act.length-40).forEach(Z=>{ Z.end=t; }); act=act.filter(Z=>Z.end==null); }
    /* new fair-value gaps */
    if(t>=2){
      const body1=Math.abs(C[t-1]-O[t-1]);
      if(L[t]>H[t-2]&&L[t]-H[t-2]>=.12*a&&C[t-1]>O[t-1]&&body1>=.6*a) mkZ('FVG',1,L[t],H[t-2],t,t-1);
      else if(H[t]<L[t-2]&&L[t-2]-H[t]>=.12*a&&C[t-1]<O[t-1]&&body1>=.6*a) mkZ('FVG',-1,L[t-2],H[t],t,t-1);
    }
    /* order blocks come from structure breaks */
    const se=F.structAt[t];
    if(se) se.forEach(e=>{
      if(e.init) return;
      const d=e.dir, lo=Math.max(0,e.orgI-2), hi=Math.min(t-1,e.orgI+4); let best=-1;
      for(let j=lo;j<=hi;j++){
        const opp=d>0?C[j]<O[j]:C[j]>O[j]; if(!opp) continue;
        if(best<0||(d>0?L[j]<=L[best]:H[j]>=H[best])) best=j;
      }
      if(best<0){ best=e.orgI; if(best<0||best>=t) return; }
      let top=H[best],bot=L[best];
      if(top-bot>2.5*a){ if(d>0) top=Math.max(O[best],C[best]); else bot=Math.min(O[best],C[best]); }
      mkZ('OB',d,top,bot,t,best,{strong:e.disp>=.9||e.kind==='CHoCH',src:e.kind});
    });
  }
}

/* ---------- pass 5: divergence (RSI · MACD · cumulative volume delta) ---------- */
function passDivergence(F){
  const {c,n,atr,C,rsi,macd,cvd,avgV}=F, o=F.opt, fr=fractals(c,o.ksw), by=byConfirm(fr);
  F.div=[]; F.divAt=new Array(n).fill(null); const lastH=[],lastL=[];
  for(let t=0;t<n;t++){
    const ps=by[t]; if(!ps) continue;
    ps.forEach(p=>{
      const arr=p.t==='L'?lastL:lastH, q=arr.length?arr[arr.length-1]:null; arr.push(p);
      if(!q||p.i-q.i<5||p.i-q.i>70) return;
      const a=atr[p.i], bull=p.t==='L';
      const dP=(p.p-q.p)/a;                       // + = higher
      const rs=rsi[p.i]-rsi[q.i], ms=(macd[p.i]-macd[q.i])/a, cs=(cvd[p.i]-cvd[q.i])/(avgV[p.i]||1);
      let kind=null,dir=0,ind=[];
      if(bull&&dP<-.05){ kind='reg'; dir=1; if(rs>2&&rsi[q.i]<=55) ind.push('RSI'); if(ms>.05) ind.push('MACD'); if(cs>.6) ind.push('Volume delta'); }
      else if(!bull&&dP>.05){ kind='reg'; dir=-1; if(rs<-2&&rsi[q.i]>=45) ind.push('RSI'); if(ms<-.05) ind.push('MACD'); if(cs<-.6) ind.push('Volume delta'); }
      else if(bull&&dP>.05&&F.trend[t]===1){ kind='hid'; dir=1; if(rs<-2) ind.push('RSI'); if(ms<-.05) ind.push('MACD'); }
      else if(!bull&&dP<-.05&&F.trend[t]===-1){ kind='hid'; dir=-1; if(rs>2) ind.push('RSI'); if(ms>.05) ind.push('MACD'); }
      if(!kind) return;
      if(kind==='reg'&&!(ind.indexOf('RSI')>=0||ind.indexOf('MACD')>=0||(ind.length&&Math.abs(cs)>1.5))) return;
      if(kind==='hid'&&!ind.length) return;
      const e={i:t,dir,kind,ind,n:ind.length,p1:q.i,p2:p.i,pr1:q.p,pr2:p.p,rsi1:rsi[q.i],rsi2:rsi[p.i]};
      F.div.push(e); (F.divAt[t]=F.divAt[t]||[]).push(e);
    });
  }
}

/* ---------- pass 6: break & retest of liquidity levels ---------- */
function passRetest(F){
  const {n,O,H,L,C,atr,rv}=F; F.retest=[]; F.retestAt=new Array(n).fill(null); let watch=[];
  for(let t=0;t<n;t++){
    const a=atr[t], rng=H[t]-L[t]||1e-12;
    watch=watch.filter(w=>{
      if(t<=w.at||t-w.at>25||w.done) return !w.done&&t-w.at<=25&&t<=w.at;
      if(w.dir>0){
        if(C[t]<w.lvl-.25*a) return false;
        if(L[t]<=w.lvl+.25*a&&C[t]>w.lvl+.02*a&&C[t]>O[t]){
          const e={i:t,dir:1,lvl:w.lvl,kind:w.kind,src:w.src,brkI:w.at,pierce:Math.max(0,(w.lvl-L[t])/a),rej:(Math.min(O[t],C[t])-L[t])/rng,healthy:rv[t]<=w.rv,rv:rv[t],gap:t-w.at,struct:w.struct};
          F.retest.push(e); (F.retestAt[t]=F.retestAt[t]||[]).push(e); w.done=true; return false;
        }
      }else{
        if(C[t]>w.lvl+.25*a) return false;
        if(H[t]>=w.lvl-.25*a&&C[t]<w.lvl-.02*a&&C[t]<O[t]){
          const e={i:t,dir:-1,lvl:w.lvl,kind:w.kind,src:w.src,brkI:w.at,pierce:Math.max(0,(H[t]-w.lvl)/a),rej:(H[t]-Math.max(O[t],C[t]))/rng,healthy:rv[t]<=w.rv,rv:rv[t],gap:t-w.at,struct:w.struct};
          F.retest.push(e); (F.retestAt[t]=F.retestAt[t]||[]).push(e); w.done=true; return false;
        }
      }
      return true;
    });
    const bs=F.brkAt[t];
    if(bs) bs.forEach(b=>{
      const st=(F.structAt[t]||[]).some(s=>s.dir===b.dir);
      watch.push({dir:b.dir,lvl:b.lvl,at:t,kind:b.kind,src:'level',rv:b.rv,struct:st,done:false});
    });
    if(watch.length>14) watch=watch.slice(-14);
  }
}

/* ---------- pass 7: trendlines (support / resistance through confirmed swings) ---------- */
function passTrendlines(F){
  const {c,n,atr,O,H,L,C}=F, o=F.opt, fr=fractals(c,o.ksw), by=byConfirm(fr);
  F.tl=[]; F.tlAt=new Array(n).fill(null); F.lines=[]; let act=[]; const lows=[],highs=[]; const watch=[];
  const val=(Z,i)=>Z.p1+Z.slope*(i-Z.i1);
  for(let t=0;t<n;t++){
    const a=atr[t], ps=by[t];
    if(ps) ps.forEach(p=>{
      const side=p.t==='L'?'S':'R', arr=p.t==='L'?lows:highs;
      for(let k=arr.length-1;k>=0&&k>=arr.length-6;k--){
        const q=arr[k], gap=p.i-q.i; if(gap<8||gap>160) continue;
        const slope=(p.p-q.p)/gap;
        if(side==='S'?slope<=0:slope>=0) continue;
        if(Math.abs(slope)>.4*a) continue;
        const Z={side,i1:q.i,p1:q.p,i2:p.i,p2:p.p,slope,born:t,touches:2,lastTouch:p.i,end:null,rt:false};
        let ok=true;
        for(let j=q.i+1;j<=t;j++){
          const lv=val(Z,j);
          if(side==='S'?(C[j]<lv-.2*atr[j]||L[j]<lv-.6*atr[j]):(C[j]>lv+.2*atr[j]||H[j]>lv+.6*atr[j])){ ok=false; break; }
        }
        if(!ok) continue;
        if(act.some(x=>x.side===side&&Math.abs(x.i1-Z.i1)<3&&Math.abs(x.i2-Z.i2)<3)) continue;
        act.push(Z); F.lines.push(Z);
      }
      arr.push(p);
      const mine=act.filter(x=>x.side===side);
      if(mine.length>6){ mine.sort((x,y)=>y.touches*5+y.born/1e3-x.touches*5-x.born/1e3); mine.slice(6).forEach(x=>{ x.end=t; x.drop=true; }); act=act.filter(x=>x.end==null); }
    });
    for(const Z of act){
      if(Z.end!=null||Z.born>=t) continue;
      const lv=val(Z,t), rng=H[t]-L[t]||1e-12;
      if(Z.side==='S'){
        if(C[t]<lv-.15*a){ Z.end=t; Z.broke=t; const e={i:t,dir:-1,kind:'break',line:Z,touches:Z.touches}; F.tl.push(e); (F.tlAt[t]=F.tlAt[t]||[]).push(e); watch.push({Z,at:t}); }
        else if(L[t]<=lv+.3*a&&C[t]>lv&&t-Z.lastTouch>=4){
          Z.touches++; Z.lastTouch=t;
          if(C[t]>O[t]&&(C[t]-L[t])/rng>=.55&&Z.touches>=3){ const e={i:t,dir:1,kind:'bounce',line:Z,touches:Z.touches}; F.tl.push(e); (F.tlAt[t]=F.tlAt[t]||[]).push(e); }
        }
      }else{
        if(C[t]>lv+.15*a){ Z.end=t; Z.broke=t; const e={i:t,dir:1,kind:'break',line:Z,touches:Z.touches}; F.tl.push(e); (F.tlAt[t]=F.tlAt[t]||[]).push(e); watch.push({Z,at:t}); }
        else if(H[t]>=lv-.3*a&&C[t]<lv&&t-Z.lastTouch>=4){
          Z.touches++; Z.lastTouch=t;
          if(C[t]<O[t]&&(H[t]-C[t])/rng>=.55&&Z.touches>=3){ const e={i:t,dir:-1,kind:'bounce',line:Z,touches:Z.touches}; F.tl.push(e); (F.tlAt[t]=F.tlAt[t]||[]).push(e); }
        }
      }
    }
    act=act.filter(x=>x.end==null);
    for(let k=watch.length-1;k>=0;k--){
      const w=watch[k], Z=w.Z; if(t-w.at>20){ watch.splice(k,1); continue; } if(t===w.at) continue;
      const lv=val(Z,t), a2=atr[t];
      if(Z.side==='S'){
        if(C[t]>lv+.3*a2){ watch.splice(k,1); continue; }
        if(H[t]>=lv-.3*a2&&C[t]<lv&&C[t]<O[t]){ const e={i:t,dir:-1,kind:'retest',line:Z,touches:Z.touches}; F.tl.push(e); (F.tlAt[t]=F.tlAt[t]||[]).push(e); watch.splice(k,1); }
      }else{
        if(C[t]<lv-.3*a2){ watch.splice(k,1); continue; }
        if(L[t]<=lv+.3*a2&&C[t]>lv&&C[t]>O[t]){ const e={i:t,dir:1,kind:'retest',line:Z,touches:Z.touches}; F.tl.push(e); (F.tlAt[t]=F.tlAt[t]||[]).push(e); watch.splice(k,1); }
      }
    }
  }
  F.tlVal=val;
}

/* ---------- pass 8: Power of 3 (accumulation → manipulation → distribution) ---------- */
function passPO3(F){
  const {n,O,H,L,C,atr,rv}=F; F.po3=[]; F.po3At=new Array(n).fill(null); let cands=[];
  for(let t=0;t<n;t++){
    const a=atr[t];
    cands=cands.filter(k=>{
      if(t-k.s>10||k.done) return false;
      if(k.dir>0?C[t]<k.ext-.1*a:C[t]>k.ext+.1*a) return false;      // manipulation extreme broken -> idea dead
      if(t===k.s) return true;
      const body=Math.abs(C[t]-O[t])/a, mid=(k.rHi+k.rLo)/2;
      const beyondMid=k.dir>0?C[t]>mid+.2*a:C[t]<mid-.2*a, aligned=k.dir>0?C[t]>O[t]:C[t]<O[t];
      const beyondEdge=k.dir>0?C[t]>k.rHi:C[t]<k.rLo;
      if(aligned&&beyondMid&&(body>=.8||beyondEdge)){
        const e={i:t,dir:k.dir,s:k.s,rHi:k.rHi,rLo:k.rLo,L:k.L,tight:k.tight,ext:k.ext,disp:body,edge:beyondEdge,rv:Math.max(rv[t],rv[k.s]),belowOpen:k.belowOpen};
        F.po3.push(e); (F.po3At[t]=F.po3At[t]||[]).push(e); k.done=true; return false;
      }
      return true;
    });
    const sw=F.sweepAt[t]; if(!sw) continue;
    for(let Lb=40;Lb>=10;Lb-=6){
      if(t-Lb<0) continue;
      let hi=-Infinity,lo=Infinity; for(let j=t-Lb;j<t;j++){ if(H[j]>hi) hi=H[j]; if(L[j]<lo) lo=L[j]; }
      if(hi-lo>4.0*a||hi-lo<.8*a) continue;
      let th=0,tl=0; for(let j=t-Lb;j<t;j++){ if(H[j]>=hi-.25*a) th++; if(L[j]<=lo+.25*a) tl++; }
      if(th<2||tl<2) continue;
      if(sw.dir<0&&!(H[t]>hi+.05*a&&C[t]<=hi+.2*a)) continue;
      if(sw.dir>0&&!(L[t]<lo-.05*a&&C[t]>=lo-.2*a)) continue;
      const open=F.dOpen[t];
      cands.push({s:t,dir:sw.dir,rHi:hi,rLo:lo,L:Lb,tight:(hi-lo)/a,ext:sw.dir<0?H[t]:L[t],done:false,belowOpen:sw.dir>0?L[t]<open:H[t]>open});
      break;
    }
  }
}

/* ---------- build everything ---------- */
function buildFeatures(c,opt){
  opt=Object.assign({kst:4,ksw:3,minSwing:1.0,tfSec:c.length>1?c[1].time-c[0].time:60},opt||{});
  const F={n:c.length,c,opt}; F._pat={};
  passBase(F); passLiquidity(F); passStructure(F); passZones(F);
  passDivergence(F); passRetest(F); passTrendlines(F); passPO3(F);
  passSMCx(F);
  passICT(F);
  passQuant(F);
  passFlow(F); passRegime(F);
  F.zz=(F.n>=40)?zigzag(c,F.atr,3.0):[];
  F.patAt=function(t){
    if(t<70) return [];
    const k=F._pat[t]; if(k) return k;
    return (F._pat[t]=patDetect(c,F.atr,F.zz,t,{minQ:55}));
  };
  return F;
}
if(typeof module!=='undefined') module.exports={fractals,buildFeatures};
