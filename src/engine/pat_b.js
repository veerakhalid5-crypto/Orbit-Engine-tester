/* ---------- line-family: triangles, wedges, channels, rectangle, broadening ---------- */
function lsq(pts){
  const n=pts.length; let sx=0,sy=0; pts.forEach(p=>{ sx+=p.i; sy+=p.p; });
  const mx=sx/n, my=sy/n; let sxx=0,sxy=0;
  pts.forEach(p=>{ sxx+=(p.i-mx)*(p.i-mx); sxy+=(p.i-mx)*(p.p-my); });
  const b=sxx?sxy/sxx:0; return {b,at:i=>my+b*(i-mx)};
}
function envLine(pts,side){
  const ln=lsq(pts), r=pts.map(p=>p.p-ln.at(p.i)).sort((x,y)=>x-y), n=r.length;
  const off=side>0?r[Math.min(n-1,Math.floor(.92*(n-1)))]:r[Math.max(0,Math.ceil(.08*(n-1)))];
  return {b:ln.b,at:i=>ln.at(i)+off};
}
function trendBefore(c,i,len,a){
  const j=Math.max(0,i-len); const mv=c[i].close-c[j].close;
  return Math.abs(mv)<1.5*a?0:(mv>0?1:-1);
}
function patLines(P,c,atr,t){
  const out=[], a=atr[t]; if(!a) return out;
  const conf=P.filter(p=>p.conf!==false), best={};
  for(let m=4;m<=10&&m<=conf.length;m++){
    const W=conf.slice(-m), Hs=W.filter(p=>p.type==='H'), Ls=W.filter(p=>p.type==='L');
    if(Hs.length<2||Ls.length<2||t-W[W.length-1].i>25||W[0].i<t-170) continue;
    const U=lsq(Hs.map(p=>({i:p.i,p:p.price}))), L=lsq(Ls.map(p=>({i:p.i,p:p.price})));
    const sI=Math.min(Hs[0].i,Ls[0].i), len=t-sI; if(len<12) continue;
    const wS=U.at(sI)-L.at(sI), wN=U.at(t)-L.at(t);
    if(wS<3.5*a||wN<.3*a) continue;
    let res=0; Hs.forEach(p=>{ res=Math.max(res,Math.abs(p.price-U.at(p.i))); }); Ls.forEach(p=>{ res=Math.max(res,Math.abs(p.price-L.at(p.i))); });
    if(res>.8*a) continue;
    let inside=0,tot=0;
    for(let j=sI;j<=t-3;j++){ tot++; if(c[j].high<=U.at(j)+.4*a&&c[j].low>=L.at(j)-.4*a) inside++; }
    const cont=tot?inside/tot:0; if(cont<.85) continue;
    const cR=wN/wS, rU=(U.at(t)-U.at(sI))/wS, rL=(L.at(t)-L.at(sI))/wS;
    const pt=trendBefore(c,sI,30,a); let name=null,dir=0,fam='';
    if(cR<.75&&rU<-.2&&rL>.2){ name='Symmetrical Triangle'; fam='tri'; dir=pt; }
    else if(cR<.75&&Math.abs(rU)<.18&&rL>.25){ name='Ascending Triangle'; fam='tri'; dir=1; }
    else if(cR<.75&&Math.abs(rL)<.18&&rU<-.25){ name='Descending Triangle'; fam='tri'; dir=-1; }
    else if(cR<.75&&rU>.1&&rL>.2&&rL>rU){ name='Rising Wedge'; fam='wedge'; dir=-1; }
    else if(cR<.75&&rL<-.1&&rU<-.2&&rU<rL){ name='Falling Wedge'; fam='wedge'; dir=1; }
    else if(cR>1.35&&rU>.15&&rL<-.15){ name='Broadening Formation'; fam='broad'; dir=0; }
    else if(Math.abs(rU)<.18&&Math.abs(rL)<.18&&cR>.8&&cR<1.25&&Hs.length+Ls.length>=4){ name='Rectangle'; fam='rect'; dir=pt; }
    else if(rU>.25&&rL>.25&&Math.abs(rU-rL)<.25&&cR>.75&&cR<1.3){ name='Ascending Channel'; fam='chan'; dir=1; }
    else if(rU<-.25&&rL<-.25&&Math.abs(rU-rL)<.25&&cR>.75&&cR<1.3){ name='Descending Channel'; fam='chan'; dir=-1; }
    if(!name) continue;
    let brk=null,side=0; const lastP=Math.max(Hs[Hs.length-1].i,Ls[Ls.length-1].i);
    for(let j=lastP+1;j<=t;j++){ const cy=c[j].close; if(cy>U.at(j)+.1*a){ brk=j; side=1; break; } if(cy<L.at(j)-.1*a){ brk=j; side=-1; break; } }
    if(brk!=null){ if(t-brk>5) continue; if(side>0?c[t].close<U.at(t)-.6*a:c[t].close>L.at(t)+.6*a) continue; }
    else if(c[t].close>U.at(t)+.2*a||c[t].close<L.at(t)-.2*a) continue;
    const touches=Hs.length+Ls.length;
    let q=30+(Math.min(touches,8)-4)*6+(cont>=.97?12:cont>=.92?8:4)+(res<.3*a?10:res<.55*a?5:0)+(len>=15&&len<=120?4:0)+(wS>=4*a?3:0);
    if(fam==='tri'||fam==='wedge'){ const v1=vAvg(c,sI+Math.floor(len/6),Math.floor(len/6),t), v2=vAvg(c,t-Math.floor(len/6),Math.floor(len/6),t); if(v2<.85*v1) q+=6; }
    const expect=dir; let fdir=dir;
    if(brk!=null){ fdir=side; q+=6; if(c[brk].volume>1.3*vMean(c,brk,20)) q+=6; if(expect!==0) q+=(side===expect?5:-8); }
    if(fam==='chan'||fam==='broad'||fam==='rect') q-=4;
    const lvl=fdir>0?U.at(brk!=null?brk:t):fdir<0?L.at(brk!=null?brk:t):null;
    let stop=null,target=null;
    if(lvl!=null){
      const opp=fdir>0?L.at(t)-.3*a:U.at(t)+.3*a;
      stop=Math.abs(lvl-opp)<.9*a?lvl-fdir*.9*a:opp;
      target=lvl+fdir*Math.min(wS,8*a);
    }
    let apex=null; if(wN<wS){ const dw=(wN-wS)/len; apex=sI+wS/(-dw); }
    const eI=t+Math.max(4,Math.min(14,apex!=null?Math.round(apex-t):10));
    const prog=brk!=null?1:(fdir>0?clip((c[t].close-L.at(t))/(U.at(t)-L.at(t)),0,1):fdir<0?clip((U.at(t)-c[t].close)/(U.at(t)-L.at(t)),0,1):.5);
    const pat=mkPat({name,fam,dir:fdir,status:brk!=null?'breakout':'forming',q:clip(q,0,100),level:lvl,target,stop,startI:sI,endI:t,brkI:brk,progress:prog,
      info:apex!=null?'apex in '+Math.max(0,Math.round(apex-t))+' bars':'',
      lines:[{a:{i:sI,p:U.at(sI)},b:{i:eI,p:U.at(eI)},role:'upper'},{a:{i:sI,p:L.at(sI)},b:{i:eI,p:L.at(eI)},role:'lower'}],
      marks:W.map(p=>({i:p.i,p:p.price,t:'',type:p.type}))});
    if(!best[name]||best[name].q<pat.q) best[name]=pat;
  }
  Object.keys(best).forEach(k=>out.push(best[k]));
  return out.sort((x,y)=>y.q-x.q).slice(0,2);
}

/* ---------- flags & pennants ---------- */
function patFlag(P,c,atr,t){
  const out=[], a=atr[t]; if(!a||P.length<3) return out;
  for(let k=P.length-1;k>=1&&k>=P.length-4;k--){
    const pe=P[k], ps=P[k-1], Lp=Math.abs(pe.price-ps.price), dp=pe.price>ps.price?1:-1, pb=pe.i-ps.i;
    if(Lp<4.5*a||pb>25||pb<2||Lp/pb<.5*a) continue;
    const s=pe.i+1, e=t-2, len=e-s; if(len<5||len>32) continue;
    const hs=[],ls=[]; let worst=0,over=0;
    for(let j=s;j<=e;j++){
      hs.push({i:j,p:c[j].high}); ls.push({i:j,p:c[j].low});
      worst=Math.max(worst,dp>0?pe.price-c[j].low:c[j].high-pe.price);
      over=Math.max(over,dp>0?c[j].high-pe.price:pe.price-c[j].low);
    }
    if(worst>.55*Lp||over>.6*a) continue;
    const U=envLine(hs,1), Lw=envLine(ls,-1), sm=(U.b+Lw.b)/2;
    if(dp>0?sm>.05*a:sm<-.05*a) continue;
    const wS=U.at(s)-Lw.at(s), wN=U.at(e)-Lw.at(e);
    if(wS<1*a||wS>.7*Lp||wN<.3*a) continue;
    let ins=0; for(let j=s;j<=e;j++) if(c[j].high<=U.at(j)+.4*a&&c[j].low>=Lw.at(j)-.4*a) ins++;
    const cont=ins/(len+1); if(cont<.78) continue;
    const cR=wN/wS; if(cR>1.4) continue;
    let brk=null;
    for(let j=e+1;j<=t;j++){ const cy=c[j].close; if(dp>0?cy>U.at(j)+.1*a:cy<Lw.at(j)-.1*a){ brk=j; break; } if(dp>0?cy<Lw.at(j)-.6*a:cy>U.at(j)+.6*a){ brk=-1; break; } }
    if(brk===-1) continue;
    const cl=c[t].close;
    if(brk==null&&(cl>U.at(t)+.4*a||cl<Lw.at(t)-.4*a)) continue;
    if(brk!=null&&t-brk>4) continue;
    const pennant=cR<.65, ret=worst/Lp;
    let q=42+(Lp>=6*a?10:Lp>=5*a?5:0)+(ret<=.38?8:ret<=.5?4:0)+(len>=6&&len<=18?4:0)+(cont>=.95?6:3);
    if(vAvg(c,Math.round((s+e)/2),Math.round(len/2),t)<.8*vAvg(c,pe.i,2,t)) q+=8;
    if(brk!=null){ q+=6; if(c[brk].volume>1.3*vMean(c,brk,20)) q+=6; }
    const lvl=dp>0?U.at(brk!=null?brk:t):Lw.at(brk!=null?brk:t), opp=dp>0?Lw.at(t)-.3*a:U.at(t)+.3*a;
    const eI=t+8;
    out.push(mkPat({name:(dp>0?'Bull ':'Bear ')+(pennant?'Pennant':'Flag'),fam:'flag',dir:dp,status:brk!=null?'breakout':'forming',q:clip(q,0,100),
      level:lvl,target:lvl+dp*Lp,stop:Math.abs(lvl-opp)<.9*a?lvl-dp*.9*a:opp,startI:ps.i,endI:t,brkI:brk,
      progress:brk!=null?1:dp>0?clip((cl-Lw.at(t))/(U.at(t)-Lw.at(t)),0,1):clip((U.at(t)-cl)/(U.at(t)-Lw.at(t)),0,1),
      info:'pole '+(Lp/a).toFixed(1)+' ATR · retrace '+Math.round(ret*100)+'%',
      lines:[{a:{i:s,p:U.at(s)},b:{i:eI,p:U.at(eI)},role:'upper'},{a:{i:s,p:Lw.at(s)},b:{i:eI,p:Lw.at(eI)},role:'lower'}],
      marks:[{i:ps.i,p:ps.price,t:'P',type:ps.type},{i:pe.i,p:pe.price,t:'',type:pe.type}]}));
    break;
  }
  return out;
}

/* ---------- cup & handle / rounding bottom / inverted cup ---------- */
function fitQuad(xs,ys){
  const n=xs.length, x0=xs[0], w=(xs[n-1]-xs[0])||1; let s1=0,s2=0,s3=0,s4=0,t0=0,t1=0,t2=0;
  for(let k=0;k<n;k++){ const u=(xs[k]-x0)/w, y=ys[k]; s1+=u; s2+=u*u; s3+=u*u*u; s4+=u*u*u*u; t0+=y; t1+=u*y; t2+=u*u*y; }
  const D=(a,b,c,d,e,f,g,h,i)=>a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
  const det=D(s4,s3,s2,s3,s2,s1,s2,s1,n); if(Math.abs(det)<1e-12) return null;
  const qa=D(t2,s3,s2,t1,s2,s1,t0,s1,n)/det, qb=D(s4,t2,s2,s3,t1,s1,s2,t0,n)/det, qc=D(s4,s3,t2,s3,s2,t1,s2,s1,t0)/det;
  const my=t0/n; let ssr=0,sst=0;
  for(let k=0;k<n;k++){ const u=(xs[k]-x0)/w, f=qa*u*u+qb*u+qc; ssr+=(ys[k]-f)*(ys[k]-f); sst+=(ys[k]-my)*(ys[k]-my); }
  return {a:qa,r2:sst?1-ssr/sst:0};
}
function patCup(P,c,atr,t,d){
  const out=[], a=atr[t]; if(!a||P.length<3) return out;
  const isMin=p=>d>0?p.type==='L':p.type==='H', Y=v=>d*v, rims=P.filter(p=>!isMin(p));
  let best=null;
  for(let x=0;x<rims.length;x++) for(let z=x+1;z<rims.length;z++){
    const rl=rims[x], rr=rims[z], span=rr.i-rl.i; if(span<18||span>140||t-rr.i>45) continue;
    const yl=Y(rl.price), yr=Y(rr.price), rim=Math.max(yl,yr);
    let bot=Infinity,bi=-1; for(let j=rl.i;j<=rr.i;j++){ const lo=d>0?c[j].low:-c[j].high; if(lo<bot){ bot=lo; bi=j; } }
    const depth=Math.min(yl,yr)-bot; if(depth<4.5*a||Math.abs(yl-yr)>Math.max(.6*a,.15*depth)) continue;
    const pos=(bi-rl.i)/span; if(pos<.2||pos>.8) continue;
    const xs=[],ys=[]; let low40=0;
    for(let j=rl.i;j<=rr.i;j++){ xs.push(j); const y=Y(c[j].close); ys.push(y); if(y<bot+.4*depth) low40++; }
    const f=fitQuad(xs,ys); if(!f||f.a<=0||f.r2<.55||low40/xs.length<.45) continue;
    let hmin=Infinity; for(let j=rr.i+1;j<=t;j++){ const lo=d>0?c[j].low:-c[j].high; if(lo<hmin) hmin=lo; }
    const hd=hmin===Infinity?0:yr-hmin, hasH=t-rr.i>=3&&hd>=.25*a;
    if(hd>.5*depth) continue;
    let brk=null,fail=false;
    for(let j=rr.i+1;j<=t;j++){ const cy=Y(c[j].close); if(cy>rim+.1*a){ brk=j; break; } if(cy<rim-.55*depth){ fail=true; break; } }
    if(fail) continue;
    if(brk!=null){ if(t-brk>5||Y(c[t].close)<rim-.6*a) continue; }
    else if(Y(c[t].close)<rim-.5*depth) continue;
    let q=38+(f.r2>=.9?15:f.r2>=.8?10:5)+(low40/xs.length>=.6?5:0)+(Math.abs(yl-yr)<.1*depth?6:0)+(span>=30&&span<=100?4:0)+(hasH?6:0)+(depth>=5*a?4:0);
    if(vAvg(c,bi,Math.round(span/6),t)<.85*vAvg(c,rl.i,3,t)) q+=6;
    if(brk!=null){ q+=6; if(c[brk].volume>1.3*vMean(c,brk,20)) q+=6; }
    const nm=d>0?(hasH?'Cup & Handle':'Rounding Bottom'):(hasH?'Inverted Cup & Handle':'Rounding Top');
    const stopY=hasH?hmin-.3*a:bot+.3*depth;
    const pat=mkPat({name:nm,fam:'cup',dir:d,status:brk!=null?'breakout':'forming',q:clip(q,0,100),level:d*rim,target:d*(rim+depth),stop:d*stopY,
      startI:rl.i,endI:t,brkI:brk,progress:brk!=null?1:clip(1-(rim-Y(c[t].close))/(.5*depth),0,1),
      info:'depth '+(depth/a).toFixed(1)+' ATR · fit '+Math.round(f.r2*100)+'%',
      lines:[{a:{i:rl.i,p:d*rim},b:{i:t+8,p:d*rim},role:'neck'}],
      marks:[{i:rl.i,p:rl.price,t:'L',type:rl.type},{i:bi,p:d*bot,t:'B',type:d>0?'L':'H'},{i:rr.i,p:rr.price,t:'R',type:rr.type}]});
    if(!best||best.q<pat.q) best=pat;
  }
  if(best) out.push(best);
  return out;
}

/* ---------- driver ---------- */
function patDetect(c,atr,piv,t,opt){
  opt=opt||{}; const n=c.length; t=t==null?n-1:t;
  if(t<40||!atr[t]) return [];
  const P=pivotsAt(piv,t,c,atr); if(P.length<3) return [];
  let L=[];
  try{
    L=L.concat(patDouble(P,c,atr,t,1),patDouble(P,c,atr,t,-1),patTriple(P,c,atr,t,1),patTriple(P,c,atr,t,-1),
      patHS(P,c,atr,t,1),patHS(P,c,atr,t,-1),patLines(P,c,atr,t),patFlag(P,c,atr,t),patCup(P,c,atr,t,1),patCup(P,c,atr,t,-1));
  }catch(e){ console.error('pattern engine',e); return []; }
  L=L.filter(p=>p.q>=(opt.minQ||40)).sort((x,y)=>y.q-x.q);
  const out=[];
  L.forEach(p=>{
    if(out.some(o=>o.fam===p.fam&&o.dir===p.dir)) return;
    if(p.fam==='double'&&out.some(o=>(o.fam==='triple'||o.fam==='hs')&&o.dir===p.dir&&o.q>=p.q-10)) return;
    out.push(p);
  });
  const cont=out.filter(o=>o.fam==='tri'||o.fam==='wedge'||o.fam==='rect');
  for(let k=out.length-1;k>=0;k--){ const p=out[k]; if((p.fam==='double'||p.fam==='triple')&&cont.some(o=>o.startI<=p.startI+5&&o.q>=p.q-8)) out.splice(k,1); }
  if(opt.times&&n>1){
    const dt=c[n-1].time-c[n-2].time, tm=i=>i<=n-1?c[Math.max(0,i)].time:c[n-1].time+(i-(n-1))*dt;
    out.forEach(p=>{ p.lines.forEach(l=>{ l.ta=tm(l.a.i); l.tb=tm(l.b.i); }); p.marks.forEach(m=>{ m.time=tm(m.i); }); p.time=tm(p.brkI!=null?p.brkI:t); });
  }
  return out;
}
function patSeries(c,atr,piv){
  const n=c.length, score=new Array(n).fill(0);
  for(let t=70;t<n;t++){
    if(!atr[t]) continue;
    const ps=patDetect(c,atr,piv,t,{minQ:50}); let s=0;
    for(const p of ps){ if(!p.dir) continue; const w=p.status==='breakout'?Math.exp(-(t-p.brkI)/4):.45*p.progress; s+=p.dir*(p.q/100)*w*1.4; }
    score[t]=clip(s,-1,1);
  }
  return {score};
}
