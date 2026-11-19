/* browser-side mock of Binance/Bybit/OKX/etc. for testing the app offline. TEST ONLY. */
(function(){
  const NOW0=Date.now(); const ANCHOR=Math.floor(NOW0/60000)*60000-60000; const lastClosedOpen=()=>ANCHOR;
  const perps=['BTCUSDT','ETHUSDT','SOLUSDT','DOGEUSDT','XRPUSDT','PUMPUSDT','DUMPUSDT','NEWUSDT','ADAUSDT','LINKUSDT','AVAXUSDT','TRXUSDT','LTCUSDT','DOTUSDT','BCHUSDT','NEARUSDT','APTUSDT','ARBUSDT','OPUSDT','INJUSDT','SUIUSDT','SEIUSDT','TIAUSDT','FETUSDT','RNDRUSDT','1000PEPEUSDT','WIFUSDT','FILUSDT','ATOMUSDT','ETCUSDT','XAUUSDT'];
  const spots=['SPOTAUSDT','SPOTBUSDT','PEPEUSDT','USDCUSDT','BTCUPUSDT'];
  const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
  const baseOf=s=>({BTCUSDT:3e6,ETHUSDT:1.5e6,SOLUSDT:8e5,XAUUSDT:4e5})[s]||(60e3+hash(s)%200e3);
  const priceOf=s=>({BTCUSDT:71000,ETHUSDT:3400,XAUUSDT:2650})[s]||(0.5+(hash(s)%500)/100);
  window.__segsFor=function(sym,n){
    const O=n-60; // accumulation starts 60 bars before the end of the history
    const ev=(m,O)=>[{at:O,n:30,drift:.015*m,volMult:3.2,buy:m>0?.62:.38,sigMult:.55},{at:O+30,n:10,drift:.28*m,volMult:6,buy:m>0?.68:.32,sigMult:1.2},{at:O+40,n:14,drift:.30*m,volMult:7,buy:m>0?.70:.30,sigMult:1.4},{at:O+54,n:25,drift:-.10*m,volMult:3,buy:m>0?.42:.58,sigMult:1}];
    if(window.__rich&&(sym==='PUMPUSDT'||sym==='DUMPUSDT')){ const m=sym==='PUMPUSDT'?1:-1; const extra=[]; for(const k of [600,1400,2300,3200]) extra.push(...ev(m,k+(sym==='PUMPUSDT'?0:37))); return extra.concat(ev(m,n-60).slice(0,1)); }
    if(sym==='PUMPUSDT') return [{at:O,n:30,drift:.015,volMult:3.2,buy:.62,sigMult:.55}];
    if(sym==='DUMPUSDT') return [{at:O,n:30,drift:-.015,volMult:3.2,buy:.38,sigMult:.55}];
    return [];
  };
  window.__series=function(sym,count,endOpenMs){ // bars ending at endOpenMs (open time of the last bar)
    const t0=endOpenMs/1000-(count-1)*60; const segs=window.__segsFor(sym,count);
    return genBars(count,{seed:hash(sym)%100000+7,base:baseOf(sym),sigma:sym==='BTCUSDT'?.05:.12,rev:.04,price:priceOf(sym),segs,t0});
  };
  const toK=b=>[b.t*1000,String(b.o),String(b.h),String(b.l),String(b.c),String(b.v),b.t*1000+59999,String(b.q),b.n,String(b.V),String(b.Q),'0'];
  const J=(o)=>Promise.resolve(new Response(JSON.stringify(o),{status:200,headers:{'content-type':'application/json'}}));
  window.__reqs=[];
  const realFetch=window.fetch.bind(window);
  window.fetch=function(url,opt){
    url=String(url); window.__reqs.push(url.replace(/^https?:\/\/[^/]+/,'').slice(0,60));
    const u=new URL(url); const p=u.pathname, q=u.searchParams;
    if(/\/fapi\/v1\/time|\/api\/v3\/time/.test(p)) return J({serverTime:Date.now()});
    if(p==='/fapi/v1/exchangeInfo') return J({symbols:perps.map((s,i)=>({symbol:s,pair:s,contractType:'PERPETUAL',quoteAsset:'USDT',baseAsset:s.replace('USDT',''),status:'TRADING',onboardDate:s==='NEWUSDT'?Date.now()-5*86400000:1600000000000,underlyingType:s==='XAUUSDT'?'COMMODITY':'COIN'}))});
    if(p==='/api/v3/exchangeInfo') return J({symbols:spots.map(s=>({symbol:s,quoteAsset:'USDT',baseAsset:s.replace('USDT',''),status:'TRADING',isSpotTradingAllowed:true}))});
    if(p==='/fapi/v1/ticker/24hr') return J(perps.map(s=>({symbol:s,quoteVolume:String(baseOf(s)*1440),priceChangePercent:String(((hash(s)%200)-100)/20),lastPrice:String(priceOf(s))})));
    if(p==='/api/v3/ticker/24hr') return J(spots.map(s=>({symbol:s,quoteVolume:String(baseOf(s)*300),openPrice:'1',lastPrice:'1.02'})));
    if(p==='/fapi/v1/klines'||p==='/api/v3/klines'){
      const sym=q.get('symbol'), lim=+q.get('limit')||499, end=q.get('endTime')?Math.floor((+q.get('endTime')+1)/60000)*60000-60000:lastClosedOpen();
      const known=perps.concat(spots); if(known.indexOf(sym)<0) return Promise.resolve(new Response('{}',{status:400}));
      // each symbol's series is anchored to "now" so history pages line up
      const total=3*1440+200, endAnchor=lastClosedOpen(); const full=window.__full||(window.__full={}); if(!full[sym]) full[sym]=window.__series(sym,total,endAnchor);
      const arr=full[sym]; const t0=arr[0].t*1000; const lastIdx=Math.floor((end-t0)/60000); const from=Math.max(0,lastIdx-lim+1);
      if(lastIdx<0) return J([]); return J(arr.slice(from,lastIdx+1).map(toK));
    }
    if(p==='/fapi/v1/depth'){ const m=priceOf(q.get('symbol')); const mk=(sgn)=>Array.from({length:40},(_,i)=>[(m*(1+sgn*.0004*(i+1))).toFixed(6),(2000/m*(1+(i%5)*.2)).toFixed(3)]); return J({bids:mk(-1),asks:mk(1)}); }
    if(p==='/futures/data/openInterestHist') return J(Array.from({length:+q.get('limit')||7},(_,i)=>({timestamp:Date.now()-(7-i)*300000,sumOpenInterestValue:String(1e7*(1+i*.01))})));
    if(p==='/futures/data/globalLongShortAccountRatio') return J([{longShortRatio:'1.15'}]);
    if(p==='/futures/data/takerlongshortRatio') return J([{buySellRatio:'1.1'},{buySellRatio:'1.2'},{buySellRatio:'1.25'}]);
    if(/bybit/.test(url)) return J({result:{list:perps.map(s=>({symbol:s,lastPrice:String(priceOf(s)),price24hPcnt:'0.01',fundingRate:'0.0001',openInterestValue:'1e7',turnover24h:'1e8'}))}});
    if(/okx/.test(url)) return J({data:perps.map(s=>({instId:s.replace('USDT','-USDT-SWAP'),last:String(priceOf(s)),open24h:String(priceOf(s)*.99),volCcy24h:'1e8'}))});
    if(/alternative\.me/.test(url)) return J({data:[{value:'61',value_classification:'Greed'},{value:'58'}]});
    if(/coinpaprika/.test(url)) return J({bitcoin_dominance_percentage:57.3,market_cap_usd:2.6e12,market_cap_change_24h:1.4,volume_24h_usd:9e10});
    return Promise.resolve(new Response('{}',{status:404}));
  };
  /* mock WebSocket: connects, lets the test push frames */
  window.__sockets=[];
  window.WebSocket=class{
    constructor(url){ this.url=url; this.readyState=0; window.__sockets.push(this); setTimeout(()=>{ this.readyState=1; this.onopen&&this.onopen({}); },30); }
    send(){} close(){ this.readyState=3; setTimeout(()=>this.onclose&&this.onclose({}),5); }
  };
  window.__push=function(match,obj){ const txt=typeof obj==='string'?obj:JSON.stringify(obj); let n=0; window.__sockets.forEach(s=>{ if(s.readyState===1&&s.url.indexOf(match)>=0){ s.onmessage&&s.onmessage({data:txt}); n++; } }); return n; };
  window.__pushKline=function(sym,b,closed){ const k={t:b.t*1000,T:b.t*1000+59999,s:sym,i:'1m',o:String(b.o),c:String(b.c),h:String(b.h),l:String(b.l),v:String(b.v),n:b.n,x:closed!==false,q:String(b.q),V:String(b.V),Q:String(b.Q),B:'0'}; const n=window.__push('kline_1m',{stream:sym.toLowerCase()+'@kline_1m',data:{e:'kline',E:Date.now(),s:sym,k}}); try{ const r=MK.syms.get(sym); if(closed!==false&&r&&r.venue==='F') window.__pushTicker([{s:sym,c:String(b.c),q:String(r.q24||1e8),P:String(r.chg24||0),h:String(r.hi24||b.h),l:String(r.lo24||b.l)}]); }catch(e){} return n; };
  window.__pushTicker=function(rows){ return window.__push('!ticker@arr',{stream:'!ticker@arr',data:rows.map(r=>Object.assign({e:'24hrTicker',E:Date.now(),s:'X',P:'1',c:'1',o:'1',h:'1',l:'1',v:'1',q:'1e8'},r))}); };
})();
