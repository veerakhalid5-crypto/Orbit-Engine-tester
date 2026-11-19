/* ================================================================
   INSTITUTIONAL ZONES & SMART-MONEY CONCEPTS (pure — no DOM, no network)
   Adds to the base zone pass (order blocks, FVG, breakers):
     • quality scoring + consequent encroachment for every order block and fair-value gap  (Z.q, Z.qf, Z.ce, Z.sub)
     • institutional supply / demand zones — base + displacement departure, typed RBR / DBR / RBD / DBD, scored 0-100
     • inverse FVG (IFVG), balanced price range (BPR), volume imbalance (VI), rejection block, propulsion block, liquidity void
     • displacement runs, minor-swing inducement sweeps
   Every detector uses only bars <= t (tested by a prefix-invariance test).  Quality scores are rule-based heuristics with FIXED weights —
   they rank zones against each other; they are NOT probabilities and have not been optimised on data.
   ================================================================ */
const ZX_MAX_AGE=220;

/* ---------- state of any zone at bar t: penetration depth, touches, consequent-encroachment hit ---------- */
function zoneState(F,Z,t){
  const {H,L}=F, h=Z.top-Z.bot; if(!(h>0)||Z.born>t) return {alive:false,pen:0,touches:0,fresh:true,ceHit:false,age:0};
  const alive=Z.end==null||Z.end>t; let pen=0,ce=false;
  const to=Math.min(t,Z.end==null?t:Z.end);
  for(let j=Z.born+1;j<=to;j++){
    if(Z.dir>0){ if(L[j]<=Z.top){ pen=Math.max(pen,Math.min(1,(Z.top-L[j])/h)); if(L[j]<=Z.ce) ce=true; } }
    else{ if(H[j]>=Z.bot){ pen=Math.max(pen,Math.min(1,(H[j]-Z.bot)/h)); if(H[j]>=Z.ce) ce=true; } }
  }
  /* visits = separate times price entered the zone; a visit that is still in progress at t is the CURRENT one, not a prior test */
  let visits=0; for(const b of Z.tb){ if(b<=t) visits++; }
  const inside=H[t]>=Z.bot&&L[t]<=Z.top, touches=inside&&visits>0?visits-1:visits;
  return {alive,pen,touches,visits,inside,fresh:touches===0,ceHit:ce,age:t-Z.born};
}
/* effective quality now: the stored quality, reduced for depth of penetration and for repeated testing (fixed multipliers) */
function zoneQualityNow(Z,st){ const q=Z.q==null?50:Z.q; return Math.round(q*(1-.35*st.pen)*(st.touches===0?1:st.touches===1?.85:st.touches===2?.7:.55)); }

function passSMCx(F){
  const {n,O,H,L,C,atr,rv}=F, base=F.zones||[];
  const zx=[]; F.zx=zx; F.zxr=new Array(n).fill(null); F.dsp=new Int8Array(n); F.dspMag=new Float64Array(n); F.indAt=new Array(n).fill(null); F.vi=[];
  const sub=(Z,s)=>{ Z.sub=s; return Z; };

  /* ---------- A: quality + consequent encroachment for the base zones (order blocks, FVG) ---------- */
  for(const Z of base){
    Z.ce=(Z.top+Z.bot)/2; const a=atr[Z.born]; if(!fin(a)||a<=0){ Z.q=40; Z.qf=[]; continue; }
    const qf=[]; let q=0; const add=(pts,txt)=>{ q+=pts; qf.push('+'+pts+' '+txt); };
    if(Z.kind==='OB'){
      const ev=(F.structAt[Z.born]||[]).find(e=>e.dir===Z.dir)||null;
      if(ev){
        if(ev.disp>=1.5) add(20,'strong displacement ('+ev.disp.toFixed(1)+' ATR)'); else if(ev.disp>=.9) add(10,'displacement ('+ev.disp.toFixed(1)+' ATR)');
        if(ev.kind==='CHoCH'){ add(15,ev.mss?'market-structure shift with a liquidity sweep':'change of character'); sub(Z,ev.sweep?'REVERSAL_OB':'MITIGATION_BLOCK'); }
        else{ add(8,'break of structure (continuation)'); sub(Z,'CONTINUATION_OB'); }
        if(ev.sweep) add(15,'liquidity swept before the break');
      }
      const fvgAfter=base.find(f=>f.kind==='FVG'&&f.dir===Z.dir&&f.born>Z.i&&f.born<=Z.born); if(fvgAfter) add(15,'left a fair-value gap (imbalance)');
      if((Z.top-Z.bot)<=1.5*a) add(10,'compact zone ('+((Z.top-Z.bot)/a).toFixed(1)+' ATR)');
      const pd=F.pd[Z.born]; if(fin(pd)&&(Z.dir>0?pd<.5:pd>.5)) add(10,Z.dir>0?'formed in discount':'formed in premium');
      if(rv[Z.i]>=1.3) add(5,'volume on the origin candle ×'+rv[Z.i].toFixed(1));
    }else if(Z.kind==='FVG'){
      const gap=(Z.top-Z.bot)/a; if(gap>=.4) add(20,'large gap ('+gap.toFixed(2)+' ATR)'); else if(gap>=.2) add(10,'gap '+gap.toFixed(2)+' ATR');
      const body=Math.abs(C[Z.i]-O[Z.i])/a; if(body>=1) add(20,'displacement candle ('+body.toFixed(1)+' ATR)'); else if(body>=.6) add(10,'strong candle');
      if(rv[Z.i]>=1.3) add(15,'volume ×'+rv[Z.i].toFixed(1));
      const tr=F.trend[Z.born]; if(tr===Z.dir) add(15,'with the prevailing structure');
      let sb=false; for(let j=Math.max(0,Z.born-3);j<=Z.born;j++){ const se=F.structAt[j]; if(se&&se.some(e=>e.dir===Z.dir)) sb=true; } if(sb) add(20,'created with a structure break');
      const pd=F.pd[Z.born]; if(fin(pd)&&(Z.dir>0?pd<.5:pd>.5)) add(10,Z.dir>0?'in discount':'in premium');
    }else if(Z.kind==='BRK'){ q=45; qf.push('breaker block (failed order block)'); }
    Z.q=Math.min(100,q); Z.qf=qf;
  }

  /* ---------- zone bookkeeping shared by every advanced zone ---------- */
  let act=[];
  const mkZ=(kind,dir,top,bot,born,i,x)=>{ if(!(top>bot)) return null; const Z=Object.assign({kind,dir,top,bot,born,i,end:null,tb:[],inPrev:false,ce:(top+bot)/2,q:50,qf:[]},x||{}); zx.push(Z); act.push(Z); return Z; };
  const endAt=new Map(); base.forEach(Z=>{ if(Z.end!=null&&Z.kind==='FVG'){ (endAt.get(Z.end)||endAt.set(Z.end,[]).get(Z.end)).push(Z); } });
  const fvgBorn=new Map(); base.forEach(Z=>{ if(Z.kind==='FVG') (fvgBorn.get(Z.born)||fvgBorn.set(Z.born,[]).get(Z.born)).push(Z); });
  const overlapFrac=(a1,a2,b1,b2)=>{ const lo=Math.max(a1,b1),hi=Math.min(a2,b2); return hi>lo?(hi-lo)/Math.min(a2-a1,b2-b1):0; };
  let run=null; const piv=F.piv||[]; let pi=0; const minor=[]; /* minor swing pivots (k=2) for inducement */
  const minorBy={}; { const fr=fractals(F.c,2); fr.forEach(p=>{ (minorBy[p.ci]=minorBy[p.ci]||[]).push(p); }); }

  for(let t=0;t<n;t++){
    const a=atr[t]; if(!fin(a)||a<=0) continue;
    /* B: lifecycle of the advanced zones (invalidated by a close beyond the far edge, aged out, touches, reactions) */
    for(const Z of act){
      if(Z.born>=t||Z.end!=null) continue; const bull=Z.dir>0;
      if(bull?C[t]<Z.bot-.1*a:C[t]>Z.top+.1*a){ Z.end=t; continue; }
      if(t-Z.born>ZX_MAX_AGE){ Z.end=t; continue; }
      const inZ=L[t]<=Z.top&&H[t]>=Z.bot;
      if(inZ){
        if(!Z.inPrev) Z.tb.push(t); Z.inPrev=true;
        const rng=H[t]-L[t];
        if(rng>=.3*a){ const ok=bull?(C[t]>O[t]&&(C[t]-L[t])/rng>=.5&&C[t]>Z.bot):(C[t]<O[t]&&(H[t]-C[t])/rng>=.5&&C[t]<Z.top);
          if(ok) (F.zxr[t]=F.zxr[t]||[]).push({i:t,dir:Z.dir,z:Z,first:Z.tb.length===1,n:Z.tb.length}); }
      }else Z.inPrev=false;
    }
    act=act.filter(Z=>Z.end==null); if(act.length>60){ act.slice(0,act.length-60).forEach(Z=>{ Z.end=t; }); act=act.filter(Z=>Z.end==null); }

    /* C: displacement bar + runs */
    const body=C[t]-O[t], rng=H[t]-L[t]||1e-12, ab=Math.abs(body)/a;
    if(ab>=1.2&&((body>0&&(C[t]-L[t])/rng>=.65)||(body<0&&(H[t]-C[t])/rng>=.65))){ F.dsp[t]=body>0?1:-1; F.dspMag[t]=ab; }
    const d=body>0?1:body<0?-1:0;
    if(d!==0&&ab>=.5){ if(run&&run.dir===d) run.e=t; else run={s:t,e:t,dir:d,sd:false,vd:false}; } else run=null;
    if(run){
      const s=run.s, net=(C[t]-O[s])*run.dir/atr[s];
      if(!run.sd&&net>=1.8&&(()=>{ let m=0; for(let j=s;j<=t;j++) m=Math.max(m,Math.abs(C[j]-O[j])/atr[s]); return m>=1; })()){
        run.sd=true; supplyDemand(s,t,run.dir,net);
        propulsion(s,t,run.dir,net);
      }
      if(!run.vd&&t-s>=2&&net>=3){ let ov=0,cnt=0; for(let j=s+1;j<=t;j++){ const lo=Math.max(L[j],L[j-1]),hi=Math.min(H[j],H[j-1]); ov+=(hi>lo?(hi-lo)/(H[j]-L[j]||1e-12):0); cnt++; }
        if(ov/cnt<=.45){ run.vd=true; const top=run.dir>0?H[t]:H[s], bot=run.dir>0?L[s]:L[t]; const Z=mkZ('VOID',run.dir,top,bot,t,s,{sub:'LIQUIDITY_VOID'}); if(Z){ Z.q=Math.min(100,40+Math.round(net*5)); Z.qf=['+'+Math.round(net*5)+' displacement run of '+net.toFixed(1)+' ATR with little overlap']; } } }
    }

    /* D: volume imbalance (body gap with overlapping wicks) */
    if(t>=1&&fin(atr[t-1])){
      const pb=Math.max(O[t-1],C[t-1]), pl=Math.min(O[t-1],C[t-1]), cb=Math.max(O[t],C[t]), cl=Math.min(O[t],C[t]);
      if(C[t]>O[t]&&C[t-1]>O[t-1]&&cl>pb&&L[t]<=H[t-1]&&cl-pb>=.1*a){ const Z=mkZ('VI',1,cl,pb,t,t-1,{sub:'VOLUME_IMBALANCE'}); if(Z){ Z.q=Math.min(60,30+Math.round((cl-pb)/a*20)); Z.qf=['body gap with overlapping wicks']; F.vi.push(Z); } }
      else if(C[t]<O[t]&&C[t-1]<O[t-1]&&cb<pl&&H[t]>=L[t-1]&&pl-cb>=.1*a){ const Z=mkZ('VI',-1,pl,cb,t,t-1,{sub:'VOLUME_IMBALANCE'}); if(Z){ Z.q=Math.min(60,30+Math.round((pl-cb)/a*20)); Z.qf=['body gap with overlapping wicks']; F.vi.push(Z); } }
    }
    /* E: inverse FVG — a quality gap that is closed through by a displacement candle flips polarity (like a breaker, for gaps) */
    (endAt.get(t)||[]).forEach(f=>{
      if((f.q||0)<40) return;
      const broke=f.dir>0?C[t]<f.bot-.2*a:C[t]>f.top+.2*a, dsp=Math.abs(C[t]-O[t])/a; if(!broke||dsp<.8||(f.dir>0?C[t]>=O[t]:C[t]<=O[t])) return;
      const q=Math.min(100,Math.round(35+(f.q||40)*.3+(dsp>=1.2?15:8)+(rv[t]>=1.3?10:0))); if(q<55) return;
      const Z=mkZ('IFVG',-f.dir,f.top,f.bot,t,f.i,{sub:'INVERSE_FVG',src:'FVG'}); if(Z){ Z.q=q; Z.qf=['gap (quality '+(f.q||0)+') invalidated by a '+dsp.toFixed(1)+' ATR close through it']; }
    });
    /* F: balanced price range — two opposite quality fair-value gaps that overlap */
    (fvgBorn.get(t)||[]).forEach(f=>{
      if((f.q||0)<40) return;
      for(const g of base){ if(g.kind!=='FVG'||g.dir===f.dir||g.born>=t||t-g.born>20||(g.q||0)<40) continue;
        const lo=Math.max(f.bot,g.bot), hi=Math.min(f.top,g.top);
        if(hi-lo>=.15*a){ const q=Math.min(100,Math.round(40+(hi-lo)/a*12+((f.q||0)+(g.q||0))*.15)); if(q<55) break;
          const Z=mkZ('BPR',f.dir,hi,lo,t,g.i,{sub:'BALANCED_PRICE_RANGE'}); if(Z){ Z.q=q; Z.qf=['two opposite quality fair-value gaps overlap by '+((hi-lo)/a).toFixed(2)+' ATR']; } break; } }
    });
    /* G: rejection block — the wick of a swing-extreme candle, known once the pivot is confirmed */
    while(pi<piv.length&&piv[pi].ci<=t){ const p=piv[pi++]; if(p.ci!==t) continue; const i=p.i, r=H[i]-L[i], ai=atr[i]; if(!(r>0)||!fin(ai)||r<ai) continue;
      if(p.t==='H'){ const w=H[i]-Math.max(O[i],C[i]); if(w/r>=.55&&w>=.5*ai){ const Z=mkZ('REJ',-1,H[i],Math.max(O[i],C[i]),t,i,{sub:'REJECTION_BLOCK'}); if(Z){ Z.q=Math.min(100,Math.round(35+w/r*20+(w>=1.5*ai?10:0)+(F.sweepAt[i]?15:0))); Z.qf=['upper wick '+(w/ai).toFixed(1)+' ATR at a confirmed swing high']; } } }
      else{ const w=Math.min(O[i],C[i])-L[i]; if(w/r>=.55&&w>=.5*ai){ const Z=mkZ('REJ',1,Math.min(O[i],C[i]),L[i],t,i,{sub:'REJECTION_BLOCK'}); if(Z){ Z.q=Math.min(100,Math.round(35+w/r*20+(w>=1.5*ai?10:0)+(F.sweepAt[i]?15:0))); Z.qf=['lower wick '+(w/ai).toFixed(1)+' ATR at a confirmed swing low']; } } } }

    /* H: inducement — a minor swing taken (wick + reclaim) while price is inside / right at a zone that supports the reversal */
    (minorBy[t]||[]).forEach(p=>{ minor.push({i:p.i,p:p.p,t:p.t,b:t,taken:false}); });
    for(const m of minor){ if(m.taken||t-m.b>20||t<=m.b) continue;
      if(m.t==='H'&&H[t]>m.p&&C[t]<m.p){ m.taken=true; const zs=zonesAtPrice(t,-1); if(zs.length) F.indAt[t]={dir:-1,lvl:m.p,i:t,zone:zs[0]}; }
      else if(m.t==='L'&&L[t]<m.p&&C[t]>m.p){ m.taken=true; const zs=zonesAtPrice(t,1); if(zs.length) F.indAt[t]={dir:1,lvl:m.p,i:t,zone:zs[0]}; }
      else if(m.t==='H'?C[t]>m.p:C[t]<m.p) m.taken=true; }
    if(minor.length>60) minor.splice(0,minor.length-40);
  }

  /* ---------- zones that overlap price at t and would support a move in `dir` (used by inducement) ---------- */
  function zonesAtPrice(t,dir){
    const out=[]; const cand=base.concat(zx);
    for(const Z of cand){ if(Z.dir!==dir||Z.born>=t||(Z.end!=null&&Z.end<=t)||Z.kind==='VOID') continue; if(L[t]<=Z.top&&H[t]>=Z.bot) out.push(Z); }
    return out.sort((x,y)=>(y.q||0)-(x.q||0));
  }

  /* ---------- institutional supply / demand zone: a tight base followed by a displacement leaving it ---------- */
  function supplyDemand(s,t,d,net){
    let b0=s-1, cnt=0; const lim=Math.max(0,s-5);
    while(b0>=lim&&cnt<5){ const a=atr[b0]; if(!fin(a)) break; const r=H[b0]-L[b0], bd=Math.abs(C[b0]-O[b0]); if(r<=1.0*a&&bd<=.6*r+1e-12){ b0--; cnt++; } else break; }
    b0++; if(cnt<1) return;
    let hi=-Infinity,lo=Infinity,bodyHi=-Infinity,bodyLo=Infinity; const baseN=()=>s-b0;
    const agg=()=>{ hi=-Infinity; lo=Infinity; bodyHi=-Infinity; bodyLo=Infinity; for(let j=b0;j<s;j++){ hi=Math.max(hi,H[j]); lo=Math.min(lo,L[j]); bodyHi=Math.max(bodyHi,O[j],C[j]); bodyLo=Math.min(bodyLo,O[j],C[j]); } };
    agg(); const a=atr[s]; while(baseN()>3&&hi-lo>1.8*a){ b0++; agg(); }
    if(hi-lo>1.8*a||!fin(a)) return;
    const top=d>0?bodyHi:hi, bot=d>0?lo:bodyLo; if(top-bot<.1*a) return;
    const lead=(O[b0]-(b0>=5?C[b0-5]:O[b0]))/a, L1=lead>=0?'R':'D', type=L1+'B'+(d>0?'R':'D');
    const cont=Math.abs(lead)>.8&&((L1==='R'&&d>0)||(L1==='D'&&d<0));
    for(const Z of act){ if(Z.kind==='SD'&&Z.dir===d&&Z.end==null&&overlapFrac(bot,top,Z.bot,Z.top)>=.5) return; }
    let q=0; const qf=[]; const add=(p,x)=>{ if(p>0){ q+=p; qf.push('+'+p+' '+x); } };
    add(net>=3.5?30:net>=2.5?20:10,'departure of '+net.toFixed(1)+' ATR');
    add(baseN()<=2?10:baseN()===3?6:3,baseN()+' base candle'+(baseN()>1?'s':'')); if(hi-lo<=.8*a) add(5,'tight base');
    if(base.some(f=>f.kind==='FVG'&&f.dir===d&&f.born>=s&&f.born<=t)) add(15,'departure left a fair-value gap');
    let mrv=0; for(let j=s;j<=t;j++) mrv=Math.max(mrv,rv[j]||0); add(mrv>=1.5?10:mrv>=1.2?5:0,'volume ×'+mrv.toFixed(1));
    for(let j=Math.max(0,b0-6);j<=b0+1;j++){ const sw=F.sweepAt[j]; if(sw&&sw.dir===d){ add(10,'liquidity swept at the base'); break; } }
    let sb=null; for(let j=s;j<=t;j++){ const se=F.structAt[j]; if(se){ const e=se.find(x=>x.dir===d); if(e){ sb=e; break; } } } if(sb) add(sb.kind==='CHoCH'?15:10,'departure broke structure ('+sb.kind+')');
    const pd=F.pd[b0]; if(fin(pd)&&(d>0?pd<.5:pd>.5)) add(10,d>0?'base in discount':'base in premium');
    if(q<35) return;
    const Z=mkZ('SD',d,top,bot,t,b0,{sub:d>0?'DEMAND':'SUPPLY',sdType:type,continuation:cont,depart:net,baseN:baseN()}); if(Z){ Z.q=Math.min(100,q); Z.qf=qf; }
  }
  /* ---------- propulsion block: the candle that tapped an older order block and then launched a displacement ---------- */
  function propulsion(s,t,d,net){
    for(let j=s-1;j>=Math.max(0,s-3);j--){
      const ob=base.find(z=>z.kind==='OB'&&z.dir===d&&z.born<=j&&(z.end==null||z.end>j)&&L[j]<=z.top&&H[j]>=z.bot); if(!ob) continue;
      const a=atr[j]; if(!fin(a)) return; const bt=Math.max(O[j],C[j]), bb=Math.min(O[j],C[j]);
      const top=(bt-bb)>=.15*a?bt:H[j], bot=(bt-bb)>=.15*a?bb:L[j];
      const Z=mkZ('PROP',d,top,bot,t,j,{sub:'PROPULSION_BLOCK',src:'OB'}); if(Z){ Z.q=Math.min(100,Math.round(40+(ob.q||40)*.3+Math.min(15,net*3))); Z.qf=['tapped an order block (q '+(ob.q||'?')+') then launched a '+net.toFixed(1)+' ATR displacement']; } return;
    }
  }

  /* index of every zone (base + advanced) by the bar it became known, so callers can ask "what formed in the last few bars" without scanning the future */
  F.bornAt=new Array(n).fill(null); base.concat(zx).forEach(Z=>{ if(Z.born<n) (F.bornAt[Z.born]=F.bornAt[Z.born]||[]).push(Z); });
  F.zonesAt=function(t,opts){
    opts=opts||{}; const px=fin(opts.px)?opts.px:F.C[t], a=F.atr[t], out=[], cand=base.concat(zx), reach=(opts.reach!=null?opts.reach:2.5)*a;
    for(const Z of cand){
      if(Z.born>=t||(Z.end!=null&&Z.end<=t)) continue; const st=zoneState(F,Z,t);
      if(!st.alive) continue; const dist=px>Z.top?px-Z.top:px<Z.bot?Z.bot-px:0; if(dist>reach) continue;
      out.push({z:Z,kind:Z.kind,sub:Z.sub||null,sdType:Z.sdType||null,dir:Z.dir,top:Z.top,bot:Z.bot,ce:Z.ce,q:Z.q==null?50:Z.q,qNow:zoneQualityNow(Z,st),qf:Z.qf||[],pen:st.pen,touches:st.touches,fresh:st.fresh,ceHit:st.ceHit,age:st.age,dist:dist/a,inside:dist===0});
    }
    return out.sort((x,y)=>(y.qNow-x.qNow)||(x.dist-y.dist));
  };
}
if(typeof module!=='undefined') module.exports={passSMCx,zoneState,zoneQualityNow};
