/* ================================================================
   AI SIGNAL ENGINE — CORE
   utilities · indicators · 18 timeframes · resampling
   ================================================================ */
const clip=(x,a,b)=>x<a?a:x>b?b:x;
const sgn=x=>x>0?1:x<0?-1:0;
const fin=Number.isFinite;
const $=id=>document.getElementById(id);

/* price formatting that adapts to magnitude (BTC 71,240.5 · PEPE 0.00001234) */
function pf(x){
  if(!fin(x)) return '–';
  const a=Math.abs(x);
  if(a>=1000) return x.toLocaleString('en-US',{maximumFractionDigits:2});
  if(a>=100) return x.toFixed(2);
  if(a>=1) return x.toFixed(3);
  if(a>=.01) return x.toFixed(5);
  if(a>=1e-4) return x.toFixed(7);
  return x.toPrecision(4);
}
const pct=(x,d)=>fin(x)?(x*100).toFixed(d==null?0:d)+'%':'–';
const sg=(x,d)=>(x>=0?'+':'')+x.toFixed(d==null?2:d);

/* ---------------- timeframes ----------------
   Binance serves 1m 3m 5m 15m 30m 1h 2h 4h 6h 8h 12h 1d 3d 1w 1M.
   10m / 45m / 5d are built by merging candles (f = how many base candles per bar).
   24h is the same candle as 1d on Binance, so it is an alias. */
const TFS=[
  {id:'1m', sec:60,     bin:'1m',  f:1, htf:'15m'},
  {id:'3m', sec:180,    bin:'3m',  f:1, htf:'1h'},
  {id:'5m', sec:300,    bin:'5m',  f:1, htf:'1h'},
  {id:'10m',sec:600,    bin:'5m',  f:2, htf:'2h'},
  {id:'15m',sec:900,    bin:'15m', f:1, htf:'4h'},
  {id:'30m',sec:1800,   bin:'30m', f:1, htf:'4h'},
  {id:'45m',sec:2700,   bin:'15m', f:3, htf:'4h'},
  {id:'1h', sec:3600,   bin:'1h',  f:1, htf:'4h'},
  {id:'2h', sec:7200,   bin:'2h',  f:1, htf:'8h'},
  {id:'4h', sec:14400,  bin:'4h',  f:1, htf:'1d'},
  {id:'6h', sec:21600,  bin:'6h',  f:1, htf:'1d'},
  {id:'8h', sec:28800,  bin:'8h',  f:1, htf:'1d'},
  {id:'12h',sec:43200,  bin:'12h', f:1, htf:'3d'},
  {id:'24h',sec:86400,  bin:'1d',  f:1, htf:'1w', alias:'1d'},
  {id:'1d', sec:86400,  bin:'1d',  f:1, htf:'1w'},
  {id:'3d', sec:259200, bin:'3d',  f:1, htf:'1w'},
  {id:'5d', sec:432000, bin:'1d',  f:5, htf:'1M'},
  {id:'1w', sec:604800, bin:'1w',  f:1, htf:'1M'},
  {id:'1M', sec:2592000,bin:'1M',  f:1, htf:null}
];
const TFMAP={}; TFS.forEach(t=>{ TFMAP[t.id]=t; });
const tfOf=id=>TFMAP[id]||TFMAP['15m'];

/* end time of a bar (monthly bars have variable length) */
function barEnd(t,tf){
  if(tf.id==='1M'){ const d=new Date(t*1000); return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)/1000; }
  return t+tf.sec;
}

/* merge base candles into bigger bars. The first bucket is dropped if it is incomplete,
   the last one keeps its candle count so the caller can tell whether it is finished. */
function resample(c,tf){
  if(!tf||tf.f<=1) return c.map(k=>Object.assign({n:1},k));
  const out=[]; let cur=null;
  for(const k of c){
    const b=Math.floor(k.time/tf.sec)*tf.sec;
    if(!cur||cur.time!==b){ cur={time:b,open:k.open,high:k.high,low:k.low,close:k.close,volume:k.volume,buy:k.buy,n:1}; out.push(cur); }
    else{ if(k.high>cur.high) cur.high=k.high; if(k.low<cur.low) cur.low=k.low; cur.close=k.close; cur.volume+=k.volume; cur.buy+=k.buy; cur.n++; }
  }
  if(out.length&&out[0].n<tf.f) out.shift();
  return out;
}
/* only finished bars are analysed — a signal never repaints */
function closedBars(c,tf,nowSec){
  nowSec=nowSec||Math.floor(Date.now()/1000);
  let m=c.length;
  while(m>0){
    const k=c[m-1], done=barEnd(k.time,tf)<=nowSec+1 && (tf.f<=1||(k.n||tf.f)>=tf.f);
    if(done) break; m--;
  }
  return c.slice(0,m);
}

/* ---------------- indicators ---------------- */
function atrArr(c,n){
  n=n||14; const out=new Array(c.length); let a=0;
  for(let i=0;i<c.length;i++){
    const k=c[i], tr=i?Math.max(k.high-k.low,Math.abs(k.high-c[i-1].close),Math.abs(k.low-c[i-1].close)):k.high-k.low;
    a=i<n?(a*i+tr)/(i+1):(a*(n-1)+tr)/n; out[i]=a||1e-12;
  }
  return out;
}
function emaArr(v,n){
  const k=2/(n+1), out=new Array(v.length); let e=v[0];
  for(let i=0;i<v.length;i++){ e=i?v[i]*k+e*(1-k):v[0]; out[i]=e; }
  return out;
}
function rsiArr(cl,n){
  n=n||14; const out=new Array(cl.length).fill(50); let ag=0,al=0;
  for(let i=1;i<cl.length;i++){
    const d=cl[i]-cl[i-1], g=d>0?d:0, l=d<0?-d:0;
    if(i<=n){ ag+=g/n; al+=l/n; if(i===n) out[i]=al===0?100:100-100/(1+ag/al); }
    else{ ag=(ag*(n-1)+g)/n; al=(al*(n-1)+l)/n; out[i]=al===0?100:100-100/(1+ag/al); }
  }
  return out;
}
function macdArr(cl){
  const e1=emaArr(cl,12), e2=emaArr(cl,26), line=e1.map((v,i)=>v-e2[i]), sig=emaArr(line,9);
  return {line,hist:line.map((v,i)=>v-sig[i])};
}
function rvolArr(v,len){
  len=len||20; const out=new Array(v.length).fill(1); let s=0;
  for(let i=0;i<v.length;i++){
    if(i>=5){ const m=s/Math.min(i,len); out[i]=m>0?v[i]/m:1; }
    s+=v[i]; if(i>=len) s-=v[i-len];
  }
  return out;
}

/* Wilson score interval for a win rate — honest about small samples */
function wilson(w,n){
  if(!n) return [0,1]; const z=1.96, p=w/n, d=1+z*z/n, m=p+z*z/(2*n), s=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n));
  return [Math.max(0,(m-s)/d),Math.min(1,(m+s)/d)];
}
if(typeof module!=='undefined') module.exports={clip,sgn,fin,pf,TFS,TFMAP,tfOf,barEnd,resample,closedBars,atrArr,emaArr,rsiArr,macdArr,rvolArr,wilson};
