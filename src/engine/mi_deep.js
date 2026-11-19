/* ================================================================
   DEEP ANALYSIS (pure) — runs only on candidates, never on the whole universe
   5-minute market structure & liquidity map · Wyckoff · volume profile (POC / VAH / VAL) ·
   order-book depth & spoof clues · open interest / funding / positioning / liquidations ·
   cross-venue check · trade-level footprint
   ================================================================ */
const KIND_TXT={PDH:'previous-day high',PDL:'previous-day low',PWH:'previous-week high',PWL:'previous-week low',PMH:'previous-month high',PML:'previous-month low',LSH:'London session high',LSL:'London session low',NSH:'New York session high',NSL:'New York session low',EQH:'equal highs',EQL:'equal lows',ASH:'Asia high',ASL:'Asia low',SWH:'swing high',SWL:'swing low'};

/* merge 1-minute bars into k-minute bars (complete groups only) */
function aggBars(bars,L,k,from){
  const out=[]; let cur=null, step=60*k;
  for(let i=from>0?from:0;i<=L;i++){
    const b=bars[i], key=Math.floor(b.t/step)*step;
    if(!cur||cur.t!==key){ cur={t:key,o:b.o,h:b.h,l:b.l,c:b.c,v:b.v,q:b.q,V:b.V,Q:b.Q,n:b.n,cnt:1}; out.push(cur); }
    else{ if(b.h>cur.h) cur.h=b.h; if(b.l<cur.l) cur.l=b.l; cur.c=b.c; cur.v+=b.v; cur.q+=b.q; cur.V+=b.V; cur.Q+=b.Q; cur.n+=b.n; cur.cnt++; }
  }
  if(out.length&&out[0].cnt<k) out.shift();
  if(out.length&&out[out.length-1].cnt<k) out.pop();
  return out;
}
const toCandles=a=>a.map(b=>({time:b.t,open:b.o,high:b.h,low:b.l,close:b.c,volume:b.q,buy:b.Q}));

/* ---------------- volume profile ---------------- */
function volProfile(bars,L,N,nb){
  N=N||120; nb=nb||40; const a=Math.max(0,L-N+1); let lo=Infinity,hi=-Infinity;
  for(let i=a;i<=L;i++){ if(bars[i].l<lo) lo=bars[i].l; if(bars[i].h>hi) hi=bars[i].h; }
  if(!(hi>lo)) return null; const st=(hi-lo)/nb, v=new Array(nb).fill(0);
  for(let i=a;i<=L;i++){ const b=bars[i], i0=clip(Math.floor((b.l-lo)/st),0,nb-1), i1=clip(Math.floor((b.h-lo)/st),0,nb-1);
    if(i0===i1||!(b.h>b.l)){ v[i0]+=b.q; continue; }
    const r=b.h-b.l; for(let j=i0;j<=i1;j++){ const ov=Math.min(b.h,lo+(j+1)*st)-Math.max(b.l,lo+j*st); if(ov>0) v[j]+=b.q*ov/r; } }
  let poc=0; for(let j=1;j<nb;j++) if(v[j]>v[poc]) poc=j;
  const tot=v.reduce((s,x)=>s+x,0); let acc=v[poc],l=poc,h=poc;
  while(acc<.7*tot&&(l>0||h<nb-1)){ const dn=l>0?v[l-1]:-1, up=h<nb-1?v[h+1]:-1; if(up>=dn){ h++; acc+=v[h]; } else { l--; acc+=v[l]; } }
  const P=lo+(poc+.5)*st, VAH=lo+(h+1)*st, VAL=lo+l*st, px=bars[L].c;
  return {poc:P,vah:VAH,val:VAL,pos:px>VAH?'above value area':px<VAL?'below value area':'inside value area',lo,hi};
}

/* ---------------- 5-minute structure, liquidity map, Wyckoff ---------------- */
function wyckoffLite(F){
  const t=F.n-1, a=F.atr[t]; if(t<40) return null;
  for(const W of [60,40,28]){
    let hi=-Infinity,lo=Infinity; for(let j=t-W;j<=t;j++){ if(F.H[j]>hi) hi=F.H[j]; if(F.L[j]<lo) lo=F.L[j]; }
    if(hi-lo>5*a||hi-lo<1*a) continue;
    let th=0,tl=0; for(let j=t-W;j<=t;j++){ if(F.H[j]>=hi-.3*a) th++; if(F.L[j]<=lo+.3*a) tl++; } if(th<2||tl<2) continue;
    const spring=F.sweeps.find(e=>e.dir>0&&e.i>t-W&&t-e.i<=W&&e.ext<=lo+.25*a), ut=F.sweeps.find(e=>e.dir<0&&e.i>t-W&&t-e.i<=W&&e.ext>=hi-.25*a);
    let sos=null,sow=null; for(let j=Math.max(t-8,0);j<=t;j++){ if(F.C[j]>hi+.1*a&&F.rv[j]>=1.4) sos=j; if(F.C[j]<lo-.1*a&&F.rv[j]>=1.4) sow=j; }
    if(spring&&!sow) return {phase:'accumulation',dir:1,state:sos!=null?'SOS (sign of strength)':'Spring (phase C)',txt:'Wyckoff accumulation: range '+pf(lo)+' – '+pf(hi)+' ('+W+' bars), spring below the low was bought back'+(sos!=null?', then a high-volume break above the range':''),range:{hi,lo,W}};
    if(ut&&!sos) return {phase:'distribution',dir:-1,state:sow!=null?'SOW (sign of weakness)':'Upthrust (phase C)',txt:'Wyckoff distribution: range '+pf(lo)+' – '+pf(hi)+' ('+W+' bars), upthrust above the high was sold back'+(sow!=null?', then a high-volume break below the range':''),range:{hi,lo,W}};
    if(sos!=null) return {phase:'markup',dir:1,state:'SOS',txt:'Breakout above a '+W+'-bar range on volume (sign of strength)',range:{hi,lo,W}};
    if(sow!=null) return {phase:'markdown',dir:-1,state:'SOW',txt:'Breakdown below a '+W+'-bar range on volume (sign of weakness)',range:{hi,lo,W}};
    return {phase:'range',dir:0,state:'Trading range',txt:'Trading range '+pf(lo)+' – '+pf(hi)+' ('+W+' bars) — no spring or upthrust yet',range:{hi,lo,W}};
  }
  return null;
}
function deepStruct(bars,L){ return deepStruct5(aggBars(bars,L,5),bars[L].c); }
/* b5 = finished 5-minute bars {t,o,h,l,c,v,q,V,Q,n} (live: fetched klines; back-test: merged 1-minute bars) */
function deepStruct5(b5,pxNow){
  if(b5.length<90) return null;
  const F=buildFeatures(toCandles(b5),{tfSec:300}), t=F.n-1, a=F.atr[t], px=fin(pxNow)?pxNow:F.C[t], rep={F,t,atr5:a,trend:F.trend[t]};
  let hh=-Infinity,ll=Infinity; for(let j=Math.max(0,t-24);j<=t;j++){ if(F.H[j]>hh) hh=F.H[j]; if(F.L[j]<ll) ll=F.L[j]; }
  const near=(w,f)=>f.filter(e=>t-e.i<=w);
  const sideCalc=d=>{
    let s=0; const tx=[]; let veto=null;
    const tr=F.trend[t]; if(tr===d){ s+=.3; tx.push('5-minute swing structure is '+(d>0?'bullish':'bearish')); } else if(tr===-d) tx.push('5-minute swing structure is '+(d>0?'bearish':'bullish'));
    /* live range break (the 5-minute swing structure itself only confirms several bars later) */
    if(d>0?px>hh+.05*a:px<ll-.05*a){ s+=.3; tx.push('price is beyond the 2-hour '+(d>0?'high':'low')+' ('+pf(d>0?hh:ll)+')'); }
    else if(tr===-d&&(d>0?px>F.shP[t]:px<F.slP[t])){ s+=.15; tx.push('price reclaimed the last 5-minute swing '+(d>0?'high':'low')+' — structure is flipping'); }
    const ch=near(12,F.struct.filter(e=>e.dir===d&&e.kind==='CHoCH')), bo=near(12,F.struct.filter(e=>e.dir===d&&e.kind==='BOS'));
    if(ch.length){ s+=.3; tx.push('CHoCH '+(d>0?'up':'down')+' '+(t-ch[ch.length-1].i)+' bars ago'); } else if(bo.length&&tr===d){ s+=.2; tx.push('BOS '+(d>0?'up':'down')+' '+(t-bo[bo.length-1].i)+' bars ago'); }
    const sw=near(12,F.sweeps.filter(e=>e.dir===d)); if(sw.length){ const e=sw[sw.length-1]; s+=.25; tx.push('swept '+(d>0?'sell':'buy')+'-side liquidity ('+(KIND_TXT[e.kind]||'level')+') and reclaimed it'); }
    const zn=F.zones.filter(Z=>Z.dir===d&&zoneAlive(Z,t)&&px>=Z.bot-.3*a&&px<=Z.top+.3*a); if(zn.length){ s+=.1; tx.push('price is at a '+(d>0?'bullish':'bearish')+' '+zn[0].kind); }
    const rt=near(4,F.retest.filter(e=>e.dir===d)); if(rt.length){ s+=.1; tx.push('break & retest held'); }
    const pd=F.pd[t]; if(fin(pd)){ if(d>0?pd<=.5:pd>=.5){ s+=.1; tx.push((d>0?'discount':'premium')+' of the range'); } else if(d>0?pd>.8:pd<.2){ s-=.15; tx.push((d>0?'premium':'discount')+' — chasing the range extreme'); } }
    const po=near(12,F.po3.filter(e=>e.dir===d)); if(po.length){ s+=.1; tx.push('Power of 3 sequence completed'); }
    const pats=F.patAt(t).filter(p=>p.dir===d&&p.status==='breakout'&&t-p.brkI<=6); if(pats.length){ s+=.1; tx.push(pats[0].name+' breakout'); }
    const lvlOpp=d>0?F.shP[t]:F.slP[t];
    if(tr===-d&&!ch.length&&!sw.length&&fin(lvlOpp)&&(d>0?px<lvlOpp-1.5*a:px>lvlOpp+1.5*a)) veto='5-minute structure is '+(d>0?'bearish':'bullish')+' and price is still '+(Math.abs(lvlOpp-px)/a).toFixed(1)+' ATR '+(d>0?'below':'above')+' the last swing '+(d>0?'high':'low')+' — this would be counter-trend';
    return {s:clip(s,0,1),txt:tx.join(' · ')||'no 5-minute structure evidence',veto};
  };
  rep.up=sideCalc(1); rep.dn=sideCalc(-1);
  const levels=[]; F.pools.forEach(P=>{ if(poolAlive(P,t)) levels.push({p:P.p,src:KIND_TXT[P.kind]+(P.n>1?' ×'+P.n:''),major:(POOL_RANK[P.kind]||1)>=3||P.n>=2}); });
  F.zones.forEach(Z=>{ if(zoneAlive(Z,t)&&Z.kind==='OB'&&Z.born<t){ levels.push({p:Z.dir>0?Z.top:Z.bot,src:(Z.dir>0?'bullish':'bearish')+' order block',major:!!Z.strong,block:!!Z.strong,dir:Z.dir}); } });
  /* institutional supply/demand zones of quality >= 70 are walls as well (their quality is a rule-based score, see adv_smc.js) */
  F.zonesAt(t,{reach:12,px}).forEach(z=>{ if(z.kind==='SD'&&z.qNow>=70) levels.push({p:z.dir>0?z.top:z.bot,src:zoneLabel(z)+' (quality '+z.qNow+')',major:true,block:true,dir:z.dir}); });
  rep.levels=levels;
  /* stops: the far edge of a live quality zone under (over) price is where the idea is wrong; otherwise the last 5-minute swing */
  const sl=F.slP[t], sh=F.shP[t]; rep.swing={low:fin(sl)&&sl<px?sl:null,high:fin(sh)&&sh>px?sh:null};
  const zn=F.zonesAt(t,{reach:3,px}).filter(z=>z.kind!=='VOID'&&z.kind!=='VI'&&z.qNow>=60);
  const sup=zn.filter(z=>z.dir>0&&z.bot<px).sort((x,y)=>y.qNow-x.qNow)[0], res=zn.filter(z=>z.dir<0&&z.top>px).sort((x,y)=>y.qNow-x.qNow)[0];
  rep.zoneSwing={low:sup?sup.bot:null,high:res?res.top:null,lowSrc:sup?zoneLabel(sup):null,highSrc:res?zoneLabel(res):null};
  rep.wyckoff=wyckoffLite(F);
  rep.sweepsRecent=near(12,F.sweeps).map(e=>({dir:e.dir,kind:e.kind,lvl:e.lvl,age:t-e.i}));
  return rep;
}
function zoneAlive(Z,t){ return Z.born<=t&&(Z.end==null||t<Z.end); }
function poolAlive(P,t){ return P.b<=t&&(P.end==null||t<P.end)&&(P.taken==null||t<P.taken); }

/* ---------------- order-book depth ---------------- */
function bookAnalysis(depth,px,prev){
  const num=a=>a.map(x=>({p:+x[0],n:+x[0]*+x[1]})).filter(x=>x.n>0);
  const bids=num(depth.bids||[]), asks=num(depth.asks||[]); if(!bids.length||!asks.length) return null;
  const bb=bids[0].p, ba=asks[0].p, mid=(bb+ba)/2, within=(arr,pct,side)=>arr.filter(x=>side>0?x.p>=mid*(1-pct/100):x.p<=mid*(1+pct/100)).reduce((s,x)=>s+x.n,0);
  const B=[.25,.5,1].map(p=>within(bids,p,1)), A=[.25,.5,1].map(p=>within(asks,p,-1));
  const imb=(B[1]-A[1])/Math.max(B[1]+A[1],1), md=med(bids.concat(asks).map(x=>x.n));
  const wall=(arr)=>{ let w=null; arr.forEach(x=>{ if(x.n>=Math.max(6*md,15000)&&(!w||x.n>w.n)) w=x; }); return w?{p:w.p,n:w.n,dist:Math.abs(w.p-mid)/mid*100}:null; };
  const bw=wall(bids), aw=wall(asks);
  let spoof=null;
  if(prev&&prev.bidsRaw){ const pm=med(prev.bidsRaw.concat(prev.asksRaw).map(x=>x.n));
    const gone=(oldArr,newArr,isBid)=>{ for(const o of oldArr){ if(o.n<Math.max(6*pm,25000)) continue; const nw=newArr.find(x=>Math.abs(x.p-o.p)/o.p<1e-6); const left=nw?nw.n/o.n:0;
        const reached=isBid?px<=o.p*1.0005:px>=o.p*.9995; if(left<.25&&!reached&&Math.abs(o.p-mid)/mid<.01) return '$'+fmtMoney(o.n)+' '+(isBid?'bid':'ask')+' wall at '+pf(o.p)+' vanished without price ever trading there — spoof-like'; } return null; };
    spoof=gone(prev.bidsRaw,bids,true)||gone(prev.asksRaw,asks,false); }
  const spr=(ba-bb)/mid*100, thin=B[1]+A[1]<20000;
  const mkSide=d=>{ const my=d>0?bw:aw, opp=d>0?aw:bw, im=d*imb; let s=.5+.35*im;
    if(opp&&opp.dist<.4){ s-=.2; } if(my&&my.dist<.6) s+=.1; if(thin) s-=.2; if(spr>.15) s-=.1;
    const tx=['book within 0.5%: bids $'+fmtMoney(B[1])+' vs asks $'+fmtMoney(A[1])+' ('+(imb>=0?'+':'')+Math.round(imb*100)+'% '+(imb>=0?'bid':'ask')+' heavy)'];
    if(opp&&opp.dist<.4) tx.push((d>0?'ask':'bid')+' wall $'+fmtMoney(opp.n)+' just '+opp.dist.toFixed(2)+'% away'); if(thin) tx.push('thin book'); if(spr>.15) tx.push('wide spread '+spr.toFixed(2)+'%');
    return {s:clip(s,0,1),txt:tx.join(' · ')}; };
  return {up:mkSide(1),dn:mkSide(-1),imb,spread:spr,depth05:B[1]+A[1],bidWall:bw,askWall:aw,spoof,bidsRaw:bids,asksRaw:asks,t:Date.now()};
}

/* ---------------- derivatives: OI · funding · positioning · liquidations ---------------- */
function derivAnalysis(d){
  d=d||{}; const out={oiChg5:null,oiChg30:null,fund:d.fund,ls:null,taker:null,liq:null,squeeze:false};
  const oi=d.oi||[]; if(oi.length>=7){ const n=oi.length, now=oi[n-1].v; out.oiChg5=(now/oi[n-2].v-1)*100; out.oiChg30=(now/oi[Math.max(0,n-7)].v-1)*100; }
  if(d.ls&&d.ls.length) out.ls=d.ls[d.ls.length-1].ratio;
  if(d.taker&&d.taker.length){ const l=d.taker.slice(-3); out.taker=mean(l.map(x=>x.ratio)); }
  const lq=d.liqs||[]; if(lq.length){ let buy=0,sell=0; lq.forEach(x=>{ if(x.side==='BUY') buy+=x.usd; else sell+=x.usd; }); const tot=buy+sell;
    out.liq={shortLiqUsd:buy,longLiqUsd:sell,total:tot,shortShare:tot?buy/tot:.5}; }
  const mk=dir=>{ let s=.45; const tx=[], px=dir>0?d.ret15:-d.ret15;
    if(out.oiChg30!=null){ const rising=out.oiChg30>=1, falling=out.oiChg30<=-1;
      if(rising&&px>=-.2){ s+=.2; tx.push('open interest +'+out.oiChg30.toFixed(1)+'% in 30 min — new '+(dir>0?'longs':'shorts')+' entering'); }
      else if(falling&&px>.5){ s-=.1; tx.push('open interest '+out.oiChg30.toFixed(1)+'% while price '+(dir>0?'rises':'falls')+' — '+(dir>0?'short covering':'long closing')+', not fresh '+(dir>0?'buying':'selling')); }
      else tx.push('open interest '+(out.oiChg30>=0?'+':'')+out.oiChg30.toFixed(1)+'% in 30 min'); }
    if(d.fund!=null){ const f=d.fund*dir; if(d.fund*dir>.08){ s-=.2; tx.push('funding '+d.fund.toFixed(3)+'% — crowd already positioned this way'); } else if(f<-.02){ s+=.15; tx.push('funding '+d.fund.toFixed(3)+'% — the other side pays (squeeze fuel)'); } else tx.push('funding '+d.fund.toFixed(3)+'% neutral'); }
    if(out.ls!=null){ if(dir>0?out.ls>2:out.ls<.55){ s-=.15; tx.push('crowd long/short '+out.ls.toFixed(2)+' — one-sided'); } else if(dir>0?out.ls<.9:out.ls>1.3){ s+=.1; tx.push('crowd long/short '+out.ls.toFixed(2)+' — opposite side crowded'); } }
    if(out.taker!=null){ if(dir>0?out.taker>1.1:out.taker<.9){ s+=.15; tx.push('taker buy/sell ratio '+out.taker.toFixed(2)); } }
    if(out.liq&&out.liq.total>0){ const own=dir>0?out.liq.shortShare:1-out.liq.shortShare;
      if(own>.7&&out.liq.total>=Math.max(20000,.0005*(d.q24||0))){ s-=.25; tx.push('liquidations: '+Math.round(own*100)+'% were '+(dir>0?'shorts':'longs')+' ($'+fmtMoney(out.liq.total)+') — the move is a '+(dir>0?'short squeeze':'long flush')); out.squeeze=out.squeeze||dir; } }
    return {s:clip(s,0,1),txt:tx.join(' · ')||'no derivatives data'}; };
  out.up=mk(1); out.dn=mk(-1); return out;
}

/* ---------------- other venues ---------------- */
function xexAnalysis(binPx,binChg24,others){
  if(!others||!others.length) return null; const devs=others.map(o=>(binPx/o.px-1)*100), dev=devs.reduce((m,x)=>Math.abs(x)>Math.abs(m)?x:m,0);
  const agree=others.filter(o=>Math.sign(o.chg24)===Math.sign(binChg24)||Math.abs(binChg24)<.5).length/others.length;
  const mk=d=>({s:clip(.35+.4*agree-(Math.abs(dev)>.6?.25:0),0,1),txt:others.map(o=>o.ex+' '+(o.chg24>=0?'+':'')+o.chg24.toFixed(1)+'%').join(' · ')+' · price gap '+(dev>=0?'+':'')+dev.toFixed(2)+'%'+(Math.abs(dev)>.6?' (venue-specific move)':'')});
  return {dev,agree,up:mk(1),dn:mk(-1),others};
}

/* ---------------- trade-level footprint (aggTrade stream) ---------------- */
function Footprint(maxAgeSec,largeUsd){ this.tr=[]; this.maxAge=maxAgeSec||600; this.large=largeUsd||25000; }
Footprint.prototype.add=function(p,q,sellAggr,tms){ this.tr.push({p,n:p*q,s:sellAggr?1:0,t:tms}); if(this.tr.length>8000) this.tr.splice(0,2000); };
Footprint.prototype.snapshot=function(px,nowMs,binPct){
  const lim=nowMs-this.maxAge*1000, t=this.tr.filter(x=>x.t>=lim); if(!t.length) return null;
  const step=Math.max(px*(binPct||.05)/100,px*1e-7), bins=new Map(); let buy=0,sell=0,lb=0,ls=0,lbU=0,lsU=0;
  t.forEach(x=>{ const k=Math.round(x.p/step); let b=bins.get(k); if(!b){ b={p:k*step,buy:0,sell:0}; bins.set(k,b); } if(x.s){ b.sell+=x.n; sell+=x.n; if(x.n>=this.large){ ls++; lsU+=x.n; } } else { b.buy+=x.n; buy+=x.n; if(x.n>=this.large){ lb++; lbU+=x.n; } } });
  const arr=[...bins.values()].sort((a,b)=>a.p-b.p); let poc=arr[0]; arr.forEach(b=>{ if(b.buy+b.sell>poc.buy+poc.sell) poc=b; });
  const mean_=t.reduce((s,x)=>s+x.n,0)/t.length, cv=Math.sqrt(t.reduce((s,x)=>s+(x.n-mean_)*(x.n-mean_),0)/t.length)/Math.max(mean_,1e-9);
  /* stacked imbalances: >=3 neighbouring price levels where one side traded >=3x the other (a footprint pattern of one-sided aggression) */
  const stack={buy:null,sell:null}, minV=Math.max(mean_*3,1);
  [['buy','sell','buy'],['sell','buy','sell']].forEach(([a,b,key])=>{ let run=[]; const flush=()=>{ if(run.length>=3&&(!stack[key]||run.length>stack[key].n)) stack[key]={n:run.length,from:run[0].p,to:run[run.length-1].p}; run=[]; };
    arr.forEach(x=>{ if(x[a]>=3*Math.max(x[b],1e-9)&&x[a]>=minV&&(!run.length||Math.abs(x.p-run[run.length-1].p)<=step*1.5)) run.push(x); else{ flush(); if(x[a]>=3*Math.max(x[b],1e-9)&&x[a]>=minV) run=[x]; } }); flush(); });
  return {cv,uniform:t.length>=200&&cv<.3,stack,bins:arr,buyUsd:buy,sellUsd:sell,aggBuyShare:buy/Math.max(buy+sell,1),count:t.length,largeBuys:lb,largeSells:ls,largeBuyUsd:lbU,largeSellUsd:lsU,poc:poc.p};
};

/* spot vs futures on the same coin (both from Binance): is the move backed by spot demand or only by leveraged futures flow?
   fb / sb = finished 1-minute bars {c,o,q,Q} of the perpetual and of the spot market; the last 15 are used. */
function spotFutAnalysis(fb,sb){
  const n=15, f=(fb||[]).slice(-n), s=(sb||[]).slice(-n); if(f.length<10||s.length<10) return null;
  const sum=(a,k)=>a.reduce((x,b)=>x+(b[k]||0),0), fq=sum(f,'q'), sq=sum(s,'q'); if(!(fq>0)||!(sq>0)) return null;
  const fBuy=sum(f,'Q')/fq, sBuy=sum(s,'Q')/sq, share=sq/(sq+fq), basis=(s[s.length-1].c/f[f.length-1].c-1)*100;
  const mk=d=>{ const fa=d>0?fBuy:1-fBuy, sa=d>0?sBuy:1-sBuy, tx=['spot taker '+(d>0?'buy':'sell')+' '+Math.round(sa*100)+'% vs futures '+Math.round(fa*100)+'% (spot = '+Math.round(share*100)+'% of volume)']; let adj=0;
    if(fa>=.55&&sa>=.53){ adj=.15; tx.push('spot confirms the futures flow'); }
    else if(fa>=.58&&sa<=.47){ adj=-.2; tx.push('futures-led move — spot is not '+(d>0?'buying':'selling')+' (leveraged, squeeze-prone)'); }
    else if(sa>=.58&&fa<.5){ adj=.05; tx.push('spot leads, futures lag'); }
    return {adj,txt:tx.join(' · ')}; };
  return {up:mk(1),dn:mk(-1),share,spotBuy:sBuy,futBuy:fBuy,basis};
}
if(typeof module!=='undefined') module.exports={spotFutAnalysis,aggBars,volProfile,deepStruct,deepStruct5,wyckoffLite,bookAnalysis,derivAnalysis,xexAnalysis,Footprint,KIND_TXT};
