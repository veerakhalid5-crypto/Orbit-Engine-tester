// synthetic 1-minute market generator for TESTS ONLY (never shipped in the app)
function mul(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function genBars(n,o){ o=o||{}; const rnd=mul(o.seed||1), gauss=()=>{let u=0,v=0;while(!u)u=rnd();while(!v)v=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
  const base=o.base||60000, sig=o.sigma||.12, sz=o.size||180; let p=o.price||1.0, t=o.t0||1700000000; const segs=(o.segs||[]).slice(), bars=[];
  // segs: [{at,n,drift,volMult,buy,sigMult,nMult,szMult,wickUp,wickDn}]
  for(let i=0;i<n;i++){ const sg=segs.find(s=>i>=s.at&&i<s.at+s.n)||{};
    const drift=sg.drift||0, vm=sg.volMult||1, buy=sg.buy==null?.5:sg.buy, sm=sg.sigMult||1;
    const ret=drift+sig*sm*gauss()-(o.rev||0)*Math.log(p/(o.price||1))*100, op=p, cl=op*(1+ret/100);
    const wu=Math.abs(gauss())*sig*.5*(sg.wickUp||1), wd=Math.abs(gauss())*sig*.5*(sg.wickDn||1);
    const hi=Math.max(op,cl)*(1+wu/100), lo=Math.min(op,cl)*(1-wd/100);
    const q=base*vm*Math.exp(.45*gauss()-.1), Q=q*Math.min(.97,Math.max(.03,buy+.06*gauss()));
    const szr=sz*(sg.szMult||1)*Math.exp(.25*gauss()); const nn=Math.max(1,Math.round(q/szr));
    bars.push({t:t+i*60,o:op,h:hi,l:lo,c:cl,v:q/cl,q,V:Q/cl,Q,n:nn}); p=cl; }
  return bars; }
if(typeof module!=='undefined') module.exports={genBars,mul};
