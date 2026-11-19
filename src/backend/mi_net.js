/* ================================================================
   NETWORK LAYER — universe discovery · history hydration · WebSocket surveillance · deep-data fetchers
   Binance USDT-M perpetuals + Binance spot (USDT pairs without a perpetual) · Bybit / OKX cross-checks · macro feeds
   Everything here talks to real exchanges. Nothing is simulated. A source that fails is shown as unavailable, never faked.
   ================================================================ */
const NET={
  fapi:'https://fapi.binance.com', spot:'https://data-api.binance.vision', hostsS:['https://data-api.binance.vision','https://api.binance.com'],
  wsF:['wss://fstream.binance.com/market/stream','wss://fstream-mm.binance.com/market/stream'],
  wsS:['wss://stream.binance.com:9443/stream','wss://data-stream.binance.vision/stream'],
  bybit:'https://api.bybit.com', okx:'https://www.okx.com',
  klineLimit:499, batch:150, maxBars:1500, deepMax:8,
  budget:{F:1700,S:4200}                         // request-weight per minute we allow ourselves (exchange limits: 2400 / 6000)
};
const STABLES=new Set(['USDC','FDUSD','TUSD','USDP','DAI','BUSD','USDD','USDE','USD1','EUR','AEUR','EURI','UST','USTC','PYUSD','XUSD','BFUSD','RLUSD']);
const MK={
  syms:new Map(), offset:0, conns:{}, health:{}, cnt:{msg:0,bars:0,reconn:0,req:0,err:0}, lastMsg:0, hydrate:{done:0,total:0,running:false},
  liq:new Map(), xex:{bybit:new Map(),okx:new Map(),at:0}, macro:{}, deepSet:[], deep:new Map(), fp:new Map(), sel:null,
  onBar:null, onTick:null, onStatus:null, onUniverse:null, log:[], wsOK:false, pollMode:false
};
const nowMs=()=>Date.now()+MK.offset, nowSec=()=>Math.floor(nowMs()/1000);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function mlog(msg,type){ MK.log.unshift({t:Date.now(),msg,type:type||''}); if(MK.log.length>120) MK.log.pop(); if(MK.onStatus) MK.onStatus(); }

/* ---------------- request budget + resilient GET ---------------- */
const BUCKET={F:{tokens:NET.budget.F,at:Date.now(),block:0},S:{tokens:NET.budget.S,at:Date.now(),block:0},X:{tokens:600,at:Date.now(),block:0}};
async function take(host,w){
  const b=BUCKET[host]||BUCKET.X, cap=NET.budget[host]||600;
  for(;;){
    const t=Date.now(); b.tokens=Math.min(cap,b.tokens+(t-b.at)*cap/60000); b.at=t;
    if(t<b.block){ await sleep(Math.min(b.block-t,2000)); continue; }
    if(b.tokens>=w){ b.tokens-=w; return; }
    await sleep(Math.max(50,(w-b.tokens)*60000/cap));
  }
}
async function jget(url,host,w,tries){
  tries=tries==null?2:tries; await take(host,w||1);
  const ac=new AbortController(), tm=setTimeout(()=>ac.abort(),12000); MK.cnt.req++;
  try{
    const r=await fetch(url,{signal:ac.signal,cache:'no-store'});
    if(r.status===429||r.status===418){ const ra=+(r.headers.get('retry-after')||(r.status===418?120:15)); BUCKET[host||'X'].block=Date.now()+ra*1000; mlog('Rate limit ('+r.status+') on '+(host||'?')+' — pausing '+ra+'s','warn'); throw new Error('HTTP '+r.status); }
    if(!r.ok) throw new Error('HTTP '+r.status);
    const u=r.headers.get('x-mbx-used-weight-1m'); if(u!=null&&host&&BUCKET[host]){ const used=+u, cap=NET.budget[host]; if(used>cap) BUCKET[host].tokens=Math.min(BUCKET[host].tokens,0); }
    return await r.json();
  }catch(e){
    MK.cnt.err++;
    if(tries>0&&!/HTTP 4(18|29)/.test(e.message)){ await sleep(600+Math.random()*600); return jget(url,host,w,tries-1); }
    /* the spot data host can be blocked by some ISPs: fall back to the other official host */
    if(host==='S'&&!/HTTP 4(18|29)/.test(e.message)){ const cur=NET.hostsS.find(h=>url.indexOf(h)===0), alt=NET.hostsS.find(h=>h!==cur);
      if(cur&&alt&&!jget.fb){ jget.fb=true; try{ const r=await jget(alt+url.slice(cur.length),host,w,0); NET.spot=alt; NET.hostsS=[alt,cur]; mlog('Spot REST switched to '+alt,'warn'); return r; }catch(e2){} finally{ jget.fb=false; } } }
    throw e;
  }finally{ clearTimeout(tm); }
}

/* ---------------- symbols ---------------- */
function baseOf(sym,quote){ return sym.endsWith(quote)?sym.slice(0,-quote.length):sym; }
const stripMult=b=>b.replace(/^(1000000|1000)/,'');
function mkRec(sym,venue,base,extra){
  return Object.assign({sym,venue,base,bars:[],hist:false,pending:[],st:newSymState(),ev:null,evAt:0,q24:0,chg24:0,last:0,lastTick:0,prevLast:0,live:null,
    stale:false,fund:null,mark:null,listedAt:null,ageDays:null,risk:[],sigAt:0,watch:false,fails:0},extra||{});
}
async function loadUniverse(){
  const first=MK.syms.size===0, seen=new Set(); let nPerp=0,nSpot=0;
  let fx=null, sx=null;
  try{ fx=await jget(NET.fapi+'/fapi/v1/exchangeInfo','F',1,2); MK.health.fapi=true; }catch(e){ MK.health.fapi=false; mlog('Futures exchangeInfo failed: '+e.message,'bad'); }
  try{ sx=await jget(NET.spot+'/api/v3/exchangeInfo?permissions=SPOT','S',20,2); MK.health.spot=true; }catch(e){ MK.health.spot=false; mlog('Spot exchangeInfo failed: '+e.message,'bad'); }
  const perpBases=new Set(), spotAll=new Set();
  if(fx&&fx.symbols){
    fx.symbols.forEach(s=>{
      if(s.contractType!=='PERPETUAL'||s.quoteAsset!=='USDT'||s.status!=='TRADING') return;
      seen.add(s.symbol); nPerp++; perpBases.add(stripMult(s.baseAsset));
      let r=MK.syms.get(s.symbol);
      if(!r){ r=mkRec(s.symbol,'F',s.baseAsset,{listedAt:s.onboardDate?s.onboardDate/1000:null}); r.isNew=!first; MK.syms.set(s.symbol,r); if(!first) mlog('New listing detected: '+s.symbol+' (perpetual)','ok'); }
      r.kind=(s.underlyingType&&s.underlyingType!=='COIN')?String(s.underlyingType):'crypto';
    });
  }
  if(sx&&sx.symbols){
    sx.symbols.forEach(s=>{
      if(s.quoteAsset!=='USDT'||s.status!=='TRADING'||s.isSpotTradingAllowed===false) return;
      if(STABLES.has(s.baseAsset)||/(UP|DOWN|BULL|BEAR)$/.test(s.baseAsset)&&s.baseAsset.length>4) return;
      spotAll.add(s.symbol);
      if(perpBases.has(stripMult(s.baseAsset))) return;                       // already covered by the perpetual feed
      seen.add(s.symbol); nSpot++;
      let r=MK.syms.get(s.symbol);
      if(!r){ r=mkRec(s.symbol,'S',s.baseAsset); r.isNew=!first; r.kind='spot'; MK.syms.set(s.symbol,r); if(!first) mlog('New listing detected: '+s.symbol+' (spot)','ok'); }
    });
  }
  /* remove delisted / halted symbols */
  if(fx&&sx) MK.syms.forEach((r,k)=>{ if(!seen.has(k)){ MK.syms.delete(k); mlog('Removed '+k+' (no longer trading)','warn'); } });
  if(sx&&sx.symbols) MK.spotSet=spotAll;                                   // spot twins of the perpetuals (for the spot-vs-futures check)
  MK.counts={perp:nPerp,spot:nSpot,total:MK.syms.size};
  if(MK.onUniverse) MK.onUniverse(first);
  return MK.syms.size;
}

/* ---------------- bars ---------------- */
function parseKline(k){ return {t:k[0]/1000,o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[5],q:+k[7],n:+k[8],V:+k[9],Q:+k[10]}; }
function wsBar(k){ return {t:k.t/1000,o:+k.o,h:+k.h,l:+k.l,c:+k.c,v:+k.v,q:+k.q,n:+k.n,V:+k.V,Q:+k.Q}; }
function pushBar(rec,b){
  const A=rec.bars, last=A.length?A[A.length-1]:null;
  if(!last){ A.push(b); return true; }
  if(b.t<last.t) return false;
  if(b.t===last.t){ A[A.length-1]=b; return false; }
  /* quiet markets send no kline for empty minutes: fill with flat zero-volume bars so indices stay one minute apart */
  const gap=Math.round((b.t-last.t)/60)-1; if(gap>0&&gap<=90){ for(let i=1;i<=gap;i++) A.push({t:last.t+i*60,o:last.c,h:last.c,l:last.c,c:last.c,v:0,q:0,n:0,V:0,Q:0}); }
  else if(gap>90){ A.length=0; rec.st=newSymState(); }
  A.push(b); if(A.length>NET.maxBars) A.splice(0,A.length-NET.maxBars);
  return true;
}
async function fetchBars(rec,limit,endMs){
  const base=rec.venue==='F'?NET.fapi+'/fapi/v1/klines':NET.spot+'/api/v3/klines', host=rec.venue;
  const k=await jget(base+'?symbol='+rec.sym+'&interval=1m&limit='+(limit||NET.klineLimit)+(endMs?'&endTime='+endMs:''),host,limit>=500?5:2,2);
  const now=nowSec(), out=k.map(parseKline).filter(b=>b.t+60<=now+1);       // only finished candles
  return out;
}
async function hydrateOne(rec){
  try{
    const bars=await fetchBars(rec,NET.klineLimit); rec.bars=bars; rec.st=newSymState();
    rec.pending.forEach(b=>pushBar(rec,b)); rec.pending=[]; rec.hist=bars.length>=ENG.minBars+10; rec.hydrated=true;
    if(bars.length){ const first=bars[0].t; if(rec.listedAt==null&&bars.length<NET.klineLimit-5) rec.listedAt=first; }
    if(rec.listedAt!=null) rec.ageDays=(nowSec()-rec.listedAt)/86400;
    if(rec.hist&&MK.onBar) MK.onBar(rec,true);
  }catch(e){ rec.fails++; rec.hydrated=false; }
  MK.hydrate.done++; if(MK.onStatus&&MK.hydrate.done%10===0) MK.onStatus();
}
async function hydrateAll(){
  const list=[...MK.syms.values()].filter(r=>!r.hydrated).sort((a,b)=>b.q24-a.q24);
  MK.hydrate={done:0,total:list.length,running:true}; let i=0;
  const worker=async()=>{ while(i<list.length){ const r=list[i++]; await hydrateOne(r); } };
  await Promise.all([worker(),worker(),worker(),worker(),worker(),worker()]);
  MK.hydrate.running=false;
  /* retry the failures once */
  const bad=[...MK.syms.values()].filter(r=>!r.hydrated&&r.fails<3); if(bad.length){ MK.hydrate={done:0,total:bad.length,running:true}; let j=0; const w2=async()=>{ while(j<bad.length){ await hydrateOne(bad[j++]); } }; await Promise.all([w2(),w2(),w2()]); MK.hydrate.running=false; }
  if(MK.onStatus) MK.onStatus();
}
/* a coin that has just come back from a disconnect: fetch only the minutes it missed */
async function gapFill(rec){
  const last=rec.bars.length?rec.bars[rec.bars.length-1].t:0, miss=Math.floor((nowSec()-last)/60)-1; if(miss<2) return;
  try{ const bars=await fetchBars(rec,Math.min(Math.max(miss+2,5),NET.klineLimit)); bars.forEach(b=>pushBar(rec,b)); rec.stale=false; }catch(e){}
}
async function deepenHistory(rec){
  if(rec.deepened||rec.bars.length>=1100||rec.bars.length<100) return; rec.deepened=true;
  try{ const first=rec.bars[0].t, older=await fetchBars(rec,1000,first*1000-1); if(older.length){ rec.bars=older.concat(rec.bars); rec.st=newSymState(); } }catch(e){}
}

/* ---------------- WebSocket surveillance ---------------- */
function openWS(name,bases,qs,onText,opt){
  opt=opt||{}; bases=[].concat(bases); const c=MK.conns[name]||(MK.conns[name]={name,ws:null,tries:0,last:0,hi:0,onText,opt,closing:false,ok:false});
  c.bases=bases; c.qs=qs; c.onText=onText; c.closing=false;
  const go=()=>{
    if(c.closing) return;
    let ws; c.url=c.bases[c.hi%c.bases.length]+c.qs;
    try{ ws=new WebSocket(c.url); }catch(e){ return retry(); }
    c.ws=ws; c.born=Date.now(); let opened=false;
    ws.onopen=()=>{ opened=true; c.ok=true; c.tries=0; c.last=Date.now(); mlog('WebSocket '+name+' connected'+(c.hi?' (fallback host '+c.hi+')':''),'ok'); if(c.opt.onOpen) c.opt.onOpen(c); updWS(); };
    ws.onmessage=e=>{ c.last=Date.now(); MK.lastMsg=c.last; MK.cnt.msg++; try{ c.onText(e.data); }catch(err){} };
    ws.onerror=()=>{};
    ws.onclose=()=>{ c.ok=false; updWS(); if(!c.closing){ if(!opened&&c.bases.length>1&&c.tries>=1) c.hi++; retry(); } };
  };
  const retry=()=>{ if(c.closing) return; c.tries++; MK.cnt.reconn++; const d=Math.min(30000,1000*Math.pow(2,Math.min(c.tries,5)))*(.7+Math.random()*.6); setTimeout(go,d); };
  c.go=go; c.reopen=()=>{ try{ if(c.ws) c.ws.close(); }catch(e){} };
  go(); return c;
}
function closeWS(name){ const c=MK.conns[name]; if(!c) return; c.closing=true; try{ c.ws&&c.ws.close(); }catch(e){} delete MK.conns[name]; }
function updWS(){ const cs=Object.values(MK.conns).filter(c=>c.opt&&c.opt.core); MK.wsOK=cs.length>0&&cs.every(c=>c.ok); if(MK.onStatus) MK.onStatus(); }

function onKlineText(text){
  /* cheap pre-filter: in-progress candles arrive several times a second per coin; only finished candles matter here */
  if(text.indexOf('"x":true')<0) return;
  const m=JSON.parse(text), d=m.data||m, k=d.k; if(!k||!k.x) return;
  const rec=MK.syms.get(d.s); if(!rec) return; const b=wsBar(k);
  if(!rec.hydrated){ rec.pending.push(b); if(rec.pending.length>200) rec.pending.shift(); return; }
  rec.stale=false;
  if(pushBar(rec,b)){ MK.cnt.bars++; if(rec.hist&&MK.onBar) MK.onBar(rec,false); }
}
function onTickerText(text){
  const m=JSON.parse(text), d=m.data||m, ts=Date.now(); if(!Array.isArray(d)) return;
  const mn=Math.floor(nowMs()/60000);
  for(const x of d){
    const rec=MK.syms.get(x.s); if(!rec||rec.venue!=='F') continue;
    const c=+x.c; if(!(c>0)) continue;
    rec.prevLast=rec.last||c; rec.last=c; rec.q24=+x.q; rec.chg24=+x.P; rec.lastTick=ts; rec.hi24=+x.h; rec.lo24=+x.l;
    if(!rec.live||rec.live.m!==mn) rec.live={m:mn,o:rec.prevLast,h:Math.max(rec.prevLast,c),l:Math.min(rec.prevLast,c),c};
    else{ if(c>rec.live.h) rec.live.h=c; if(c<rec.live.l) rec.live.l=c; rec.live.c=c; }
  }
  if(MK.onTick) MK.onTick();
}
function onMarkText(text){
  const m=JSON.parse(text), d=m.data||m; if(!Array.isArray(d)) return;
  for(const x of d){ const rec=MK.syms.get(x.s); if(rec){ rec.fund=+x.r*100; rec.mark=+x.p; rec.idx=+x.i; } }
}
function onForceText(text){
  const m=JSON.parse(text), d=m.data||m, o=d.o; if(!o) return; const sym=o.s, usd=(+o.ap||+o.p)*(+o.z||+o.q), t=d.E||Date.now();
  let a=MK.liq.get(sym); if(!a){ a=[]; MK.liq.set(sym,a); } a.push({side:o.S,usd,t}); const lim=t-1800000; while(a.length&&a[0].t<lim) a.shift();
}
function onSpotText(text){
  if(text.indexOf('"x":true')<0&&text.indexOf('24hrMiniTicker')<0) return; const m=JSON.parse(text), d=m.data||m;
  if(Array.isArray(d)){ const ts=Date.now(); d.forEach(x=>{ const rec=MK.syms.get(x.s); if(rec&&rec.venue==='S'){ rec.prevLast=rec.last||+x.c; rec.last=+x.c; rec.q24=+x.q; rec.chg24=(+x.o>0)?((+x.c/+x.o-1)*100):0; rec.lastTick=ts; } }); if(MK.onTick) MK.onTick(); return; }
  if(d.e==='kline'&&d.k&&d.k.x){ const rec=MK.syms.get(d.s); if(!rec) return; const b=wsBar(d.k); if(!rec.hydrated){ rec.pending.push(b); return; } rec.stale=false; if(pushBar(rec,b)){ MK.cnt.bars++; if(rec.hist&&MK.onBar) MK.onBar(rec,false); } }
}
function connectAll(){
  Object.keys(MK.conns).filter(n=>/^(F|S)\d|^core|^spotMini/.test(n)).forEach(closeWS);
  openWS('coreF',NET.wsF,'?streams=!ticker@arr/!markPrice@arr@1s/!forceOrder@arr',t=>{
    if(t.indexOf('"!ticker@arr"')>=0||t.indexOf('24hrTicker')>=0) onTickerText(t);
    else if(t.indexOf('markPriceUpdate')>=0) onMarkText(t);
    else if(t.indexOf('forceOrder')>=0) onForceText(t);
  },{core:true,onOpen:()=>{ MK.syms.forEach(r=>{ if(r.venue==='F'&&r.hydrated) gapFill(r); }); }});
  const perps=[...MK.syms.values()].filter(r=>r.venue==='F').map(r=>r.sym), spots=[...MK.syms.values()].filter(r=>r.venue==='S').map(r=>r.sym);
  for(let i=0;i<perps.length;i+=NET.batch){
    const part=perps.slice(i,i+NET.batch), n='F'+(i/NET.batch);
    openWS(n,NET.wsF,'?streams='+part.map(s=>s.toLowerCase()+'@kline_1m').join('/'),onKlineText,{core:true,onOpen:()=>{ part.forEach(s=>{ const r=MK.syms.get(s); if(r&&r.hydrated) gapFill(r); }); }});
  }
  for(let i=0;i<spots.length;i+=NET.batch){
    const part=spots.slice(i,i+NET.batch), n='S'+(i/NET.batch);
    openWS(n,NET.wsS,'?streams='+part.map(s=>s.toLowerCase()+'@kline_1m').join('/'),onSpotText,{core:true,onOpen:()=>{ part.forEach(s=>{ const r=MK.syms.get(s); if(r&&r.hydrated) gapFill(r); }); }});
  }
  if(spots.length) openWS('spotMini',NET.wsS,'?streams=!miniTicker@arr',onSpotText,{core:false});
}

/* ---------------- freshness watchdog ---------------- */
function watchdog(){
  const now=Date.now(), exp=Math.floor(nowSec()/60)*60-60;
  Object.values(MK.conns).forEach(c=>{ if(c.ws&&c.ok&&c.opt.core&&now-c.last>(c.name==='coreF'?20000:150000)){ mlog('No data on '+c.name+' for '+Math.round((now-c.last)/1000)+'s — reconnecting','warn'); c.reopen(); } if(c.ws&&c.ok&&now-c.born>23*3600*1000) c.reopen(); });
  let stale=0;
  MK.syms.forEach(r=>{ if(!r.hist) return; const lb=r.bars.length?r.bars[r.bars.length-1].t:0;
    const quiet=(r.venue==='F'?(now-r.lastTick>45000):false);
    r.stale=quiet||(exp-lb>180&&MK.wsOK&&r.q24>2e6); if(r.stale) stale++; });
  MK.staleCount=stale; MK.globalStale=(MK.lastMsg&&now-MK.lastMsg>20000); if(MK.onStatus) MK.onStatus();
}
/* REST fallback if sockets cannot connect at all (blocked network): reduced coverage, clearly labelled */
async function pollFallback(){
  if(MK.wsOK) { MK.pollMode=false; return; }
  if(!MK.hydrate.running&&Date.now()-(MK.lastMsg||0)>60000){
    MK.pollMode=true; const top=[...MK.syms.values()].filter(r=>r.hist).sort((a,b)=>b.q24-a.q24).slice(0,60);
    for(const r of top){ try{ const b=await fetchBars(r,3); b.forEach(x=>{ if(pushBar(r,x)&&MK.onBar) MK.onBar(r,false); }); r.stale=false; }catch(e){} }
  }
}

/* ---------------- 24h statistics (volume ranking, spot volumes) ---------------- */
async function refreshTickers(){
  try{ const a=await jget(NET.fapi+'/fapi/v1/ticker/24hr','F',40,1); a.forEach(x=>{ const r=MK.syms.get(x.symbol); if(r){ r.q24=+x.quoteVolume; r.chg24=+x.priceChangePercent; if(!r.last) r.last=+x.lastPrice; } }); MK.health.fapiT=true; }catch(e){ MK.health.fapiT=false; }
  try{ const a=await jget(NET.spot+'/api/v3/ticker/24hr?type=MINI','S',80,1); a.forEach(x=>{ const r=MK.syms.get(x.symbol); if(r&&r.venue==='S'){ r.q24=+x.quoteVolume; r.chg24=(+x.openPrice>0)?((+x.lastPrice/+x.openPrice-1)*100):0; r.last=+x.lastPrice; } }); MK.health.spotT=true; }catch(e){ MK.health.spotT=false; }
}

/* ---------------- other venues + macro ---------------- */
async function refreshXex(){
  const R=await Promise.allSettled([jget(NET.bybit+'/v5/market/tickers?category=linear','X',1,1),jget(NET.okx+'/api/v5/market/tickers?instType=SWAP','X',1,1)]);
  if(R[0].status==='fulfilled'&&R[0].value&&R[0].value.result){ const m=new Map(); R[0].value.result.list.forEach(x=>{ m.set(x.symbol,{px:+x.lastPrice,chg24:+x.price24hPcnt*100,fund:+x.fundingRate*100,oiUsd:+x.openInterestValue,q24:+x.turnover24h}); }); MK.xex.bybit=m; MK.health.bybit=true; } else MK.health.bybit=false;
  if(R[1].status==='fulfilled'&&R[1].value&&R[1].value.data){ const m=new Map(); R[1].value.data.forEach(x=>{ if(!/-USDT-SWAP$/.test(x.instId)) return; const o=+x.open24h, l=+x.last; m.set(x.instId.replace('-USDT-SWAP','USDT'),{px:l,chg24:o>0?(l/o-1)*100:0,q24:+x.volCcy24h}); }); MK.xex.okx=m; MK.health.okx=true; } else MK.health.okx=false;
  MK.xex.at=Date.now();
}
function xexFor(rec){
  const out=[]; if(rec.venue!=='F'||!rec.last) return null;
  const add=(ex,m)=>{ const x=m.get(rec.sym)||m.get(stripMult(rec.base)+'USDT'); if(x&&x.px>0){ const ratio=x.px/rec.last; if(ratio>.8&&ratio<1.25) out.push({ex,px:x.px,chg24:x.chg24}); } };
  add('Bybit',MK.xex.bybit); add('OKX',MK.xex.okx);
  return out.length?xexAnalysis(rec.last,rec.chg24,out):null;
}
async function refreshMacro(){
  const R=await Promise.allSettled([jget('https://api.alternative.me/fng/?limit=2&format=json','X',1,1),jget('https://api.coinpaprika.com/v1/global','X',1,1)]);
  const m={};
  if(R[0].status==='fulfilled'&&R[0].value&&R[0].value.data&&R[0].value.data[0]){ const f=R[0].value.data; m.fng={v:+f[0].value,label:f[0].value_classification,prev:f[1]?+f[1].value:null}; MK.health.fng=true; } else MK.health.fng=false;
  if(R[1].status==='fulfilled'&&R[1].value){ const g=R[1].value; m.dom=+g.bitcoin_dominance_percentage; m.cap=+g.market_cap_usd; m.capChg=+g.market_cap_change_24h; m.vol=+g.volume_24h_usd; MK.health.global=true; } else MK.health.global=false;
  MK.macro=m;
}

/* ---------------- deep data for the few candidates (order book · derivatives · tape) ---------------- */
async function fetchDeep(rec){
  if(rec.venue!=='F') return;
  const prev=MK.deep.get(rec.sym)||{}, now=Date.now(), out=Object.assign({},prev);
  const jobs=[];
  if(now-(prev.bookAt||0)>20000) jobs.push(jget(NET.fapi+'/fapi/v1/depth?symbol='+rec.sym+'&limit=100','F',5,1).then(d=>{ const k=bookAnalysis(d,rec.last||+d.bids[0][0],prev.book); out.book=k; out.bookAt=Date.now(); }).catch(()=>{}));
  if(now-(prev.dAt||0)>60000){
    const q=p=>NET.fapi+'/futures/data/'+p+'?symbol='+rec.sym+'&period=5m&limit=';
    jobs.push(Promise.allSettled([jget(q('openInterestHist')+'7','F',1,1),jget(q('globalLongShortAccountRatio')+'1','F',1,1),jget(q('takerlongshortRatio')+'3','F',1,1)]).then(r=>{
      out.oi=r[0].status==='fulfilled'?r[0].value.map(x=>({t:x.timestamp,v:+x.sumOpenInterestValue})).sort((a,b)=>a.t-b.t):null;
      out.ls=r[1].status==='fulfilled'?r[1].value.map(x=>({ratio:+x.longShortRatio})):null;
      out.taker=r[2].status==='fulfilled'?r[2].value.map(x=>({ratio:+x.buySellRatio})):null; out.dAt=Date.now(); }));
  }
  if(MK.spotSet&&MK.spotSet.has(rec.sym)&&now-(prev.spAt||0)>45000) jobs.push(jget(NET.spot+'/api/v3/klines?symbol='+rec.sym+'&interval=1m&limit=30','S',2,1).then(k=>{ out.spot=k.map(parseKline).filter(b=>b.t+60<=nowSec()+1); out.spAt=Date.now(); }).catch(()=>{}));
  if(jobs.length) await Promise.all(jobs);
  MK.deep.set(rec.sym,out);
}
function buildExtra(rec,ev){
  const d=MK.deep.get(rec.sym)||{}, ex={};
  if(d.book&&Date.now()-d.bookAt<90000) ex.book=d.book;
  if(d.oi||d.ls||d.taker||rec.fund!=null){
    const liqs=(MK.liq.get(rec.sym)||[]).filter(x=>Date.now()-x.t<900000);
    ex.deriv=derivAnalysis({oi:d.oi,ls:d.ls,taker:d.taker,fund:rec.fund,liqs,ret15:ev?ev.M.up.ret15:0,q24:rec.q24});
  }
  const x=xexFor(rec); if(x) ex.xex=x;
  /* spot vs futures on Binance: folded into the cross-venue family (it is a different venue, so it is independent of the aggressor flow on the perpetual) */
  if(d.spot&&Date.now()-d.spAt<150000){ const sp=spotFutAnalysis(rec.bars,d.spot);
    if(sp&&(ex.xex||sp.up.adj||sp.dn.adj)){ const b=ex.xex||{dev:0,agree:1,up:{s:.5,txt:''},dn:{s:.5,txt:''},others:[]};
      ex.xex={dev:b.dev,agree:b.agree,others:b.others,spot:sp,up:{s:clip(b.up.s+sp.up.adj,0,1),txt:[b.up.txt,sp.up.txt].filter(Boolean).join(' · ')},dn:{s:clip(b.dn.s+sp.dn.adj,0,1),txt:[b.dn.txt,sp.dn.txt].filter(Boolean).join(' · ')}}; } }
  const fp=MK.fp.get(rec.sym); if(fp){ const s=fp.snapshot(rec.last,Date.now(),.05); if(s) ex.fp=s; }
  return Object.keys(ex).length?ex:null;
}
/* aggTrade tape for the current candidates + the coin being inspected */
function syncDeepSockets(syms,sel){
  const want=[...new Set(syms)].slice(0,NET.deepMax); MK.deepSet=want;
  const streams=want.map(s=>s.toLowerCase()+'@aggTrade'); if(sel) streams.push(sel.toLowerCase()+'@kline_1m');
  const key=streams.join('/'); if(MK.deepKey===key) return; MK.deepKey=key;
  if(!streams.length){ closeWS('deepF'); return; }
  if(Date.now()-(MK.deepAt||0)<15000&&MK.conns.deepF){ clearTimeout(MK.deepT); MK.deepT=setTimeout(()=>{ MK.deepKey=null; syncDeepSockets(MK.deepSet,MK.sel); },15000); return; }
  MK.deepAt=Date.now(); closeWS('deepF');
  openWS('deepF',NET.wsF,'?streams='+key,t=>{
    const m=JSON.parse(t), d=m.data||m;
    if(d.e==='aggTrade'){ let f=MK.fp.get(d.s); if(!f){ f=new Footprint(900,25000); MK.fp.set(d.s,f); } f.add(+d.p,+d.q,!!d.m,d.T); }
    else if(d.e==='kline'&&MK.onSelKline) MK.onSelKline(d.s,d.k);
  },{core:false});
}

/* ---------------- multi-timeframe candles (real exchange klines for the few coins being analysed) ---------------- */
async function fetchHtf(rec){
  if(rec.htfBusy) return rec.htfBusy;
  const job=(async()=>{
    const prev=rec.htfRaw||(rec.htfRaw={}), now=Date.now(), F=rec.venue==='F', base=F?NET.fapi+'/fapi/v1/klines':NET.spot+'/api/v3/klines', host=rec.venue;
    const due=HTF.native.filter(id=>now-((prev[id]&&prev[id].at)||0)>HTF.ttl[id]*1000), lim={'15m':150,'1d':250};
    if(!due.length&&rec.htf&&now-rec.htf.at<60000) return false;
    await Promise.all(due.map(id=>{ const n=lim[id]||99; return jget(base+'?symbol='+rec.sym+'&interval='+id+'&limit='+n,host,F?(n>=100?2:1):2,1)
      .then(k=>{ prev[id]={at:Date.now(),bars:k.map(parseKline)}; }).catch(()=>{ rec.htfErr=(rec.htfErr||0)+1; }); }));
    if(!Object.keys(prev).length) return false;
    rec.htf=buildHtf(rec.bars,prev,nowSec()); return true;
  })();
  rec.htfBusy=job; try{ return await job; }catch(e){ return false; } finally{ rec.htfBusy=null; }
}
const htfFresh=rec=>!!(rec&&rec.htf&&rec.htf.ok&&Date.now()-rec.htf.at<HTF.maxAge*1000);

/* ---------------- start-up ---------------- */
async function netStart(){
  try{ const t=await jget(NET.fapi+'/fapi/v1/time','F',1,1); MK.offset=t.serverTime-Date.now(); MK.health.time=true; }catch(e){ try{ const t=await jget(NET.spot+'/api/v3/time','S',1,1); MK.offset=t.serverTime-Date.now(); MK.health.time=true; }catch(e2){ MK.health.time=false; } }
  await loadUniverse(); await refreshTickers();
  if(MK.syms.size===0){ mlog('No markets could be loaded — check the network connection','bad'); return false; }
  connectAll();
  hydrateAll().then(()=>{ mlog('History hydrated for '+[...MK.syms.values()].filter(r=>r.hist).length+' markets','ok'); });
  refreshXex(); refreshMacro();
  setInterval(watchdog,5000); setInterval(pollFallback,60000);
  setInterval(refreshXex,45000); setInterval(refreshMacro,300000); setInterval(refreshTickers,120000);
  setInterval(async()=>{ const before=MK.syms.size; await loadUniverse(); const nw=[...MK.syms.values()].filter(r=>!r.hydrated&&!r.hydrating); if(nw.length){ nw.forEach(r=>{ r.hydrating=true; }); await Promise.all(nw.map(hydrateOne)); connectAll(); } },300000);
  return true;
}
