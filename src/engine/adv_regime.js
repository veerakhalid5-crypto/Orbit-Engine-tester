/* ================================================================
   MARKET REGIME (pure — no DOM, no network)
   A rule-based classifier with FIXED thresholds (not a fitted model).  It answers: is the market trending, ranging, compressing before a break,
   expanding, or chopping in a volatile but directionless way — so that setups that need a trend are not taken in chop and vice-versa.
   inputs: ADX, efficiency ratio, variance-ratio z, ATR percentile, Bollinger/Keltner squeeze, structure and supertrend direction.
   ================================================================ */
const REGIME_TXT={TREND_UP:'Trending up',TREND_DOWN:'Trending down',RANGE:'Ranging',SQUEEZE:'Compressed (breakout pending)',EXPANSION:'Volatility expansion',CHOP:'Volatile chop (no direction)',QUIET:'Quiet',TRANSITION:'Transition'};
function passRegime(F){
  F.regimeAt=function(t){
    const Q=F.q; if(!Q||t<60) return {state:'UNKNOWN',txt:'not enough history',dir:0,trendiness:null,volRank:null,fit:{trend:.5,reversal:.5}};
    const adx=Q.adx[t], er=Q.er[t], a=F.atr[t], px=F.C[t]; if(!fin(adx)||!fin(er)||!fin(a)) return {state:'UNKNOWN',txt:'indicators not warmed up',dir:0,trendiness:null,volRank:null,fit:{trend:.5,reversal:.5}};
    let le=0,tot=0; const rel=a/px; for(let j=Math.max(0,t-100);j<t;j++){ if(fin(F.atr[j])){ tot++; if(F.atr[j]/F.C[j]<=rel) le++; } } const volRank=tot>=40?le/tot:.5;
    const vr=F.vrAt(t), vz=vr&&fin(vr.z)?vr.z:0;
    const trendiness=clip(.4*clip((adx-15)/20,0,1)+.35*clip(er/.5,0,1)+.25*clip(vz/3,0,1),0,1);
    const dir=Q.stDir[t]===F.trend[t]?F.trend[t]:(Q.pdi[t]>Q.mdi[t]?1:-1);
    const sq=Q.sqz[t]===1&&fin(Q.bwRank[t])&&Q.bwRank[t]<=.3;
    let recentDsp=0; for(let j=Math.max(0,t-3);j<=t;j++) if(F.dsp[j]) recentDsp++;
    let state, txt;
    if(sq){ state='SQUEEZE'; txt='Bollinger bands are inside the Keltner channel — volatility is compressed'; }
    else if(trendiness>=.6){ state=dir>0?'TREND_UP':'TREND_DOWN'; txt='ADX '+adx.toFixed(0)+', efficiency '+er.toFixed(2)+(vr&&vr.kind==='TRENDING'?', variance ratio says trending':''); }
    else if(volRank>=.7&&recentDsp>=1&&trendiness>=.35){ state='EXPANSION'; txt='range is expanding with displacement candles, trend not yet established'; }
    else if(volRank>=.6&&trendiness<.3){ state='CHOP'; txt='volatility is high but price is going nowhere (efficiency '+er.toFixed(2)+')'; }
    else if(trendiness<.35&&volRank<.6){ state='RANGE'; txt='low trend strength (ADX '+adx.toFixed(0)+')'+(vr&&vr.kind==='MEAN_REVERTING'?', mean-reverting':''); }
    else if(volRank<=.2){ state='QUIET'; txt='volatility is in the bottom fifth of its recent range'; }
    else{ state='TRANSITION'; txt='mixed signals (ADX '+adx.toFixed(0)+', efficiency '+er.toFixed(2)+')'; }
    /* how well each kind of setup fits this regime, 0..1 (a design table, not a measurement) */
    const fit=({TREND_UP:{trend:1,reversal:.35},TREND_DOWN:{trend:1,reversal:.35},EXPANSION:{trend:.8,reversal:.4},SQUEEZE:{trend:.6,reversal:.5},RANGE:{trend:.35,reversal:.85},QUIET:{trend:.45,reversal:.6},CHOP:{trend:.2,reversal:.3},TRANSITION:{trend:.5,reversal:.55}})[state];
    return {state,txt,label:REGIME_TXT[state],dir,trendiness,volRank,adx,er,vrZ:vz,fit};
  };
}
if(typeof module!=='undefined') module.exports={passRegime,REGIME_TXT};
