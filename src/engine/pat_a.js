/* ================================================================
   CHART PATTERN ENGINE  (ATR zig-zag pivots, causal, geometry + volume scoring)
   Double / triple tops & bottoms · Head & Shoulders (+inverse) · triangles ·
   wedges · channels · rectangles · broadening · flags · pennants · cup & handle
   ================================================================ */
const PAT_BASE = {name:'',fam:'',dir:0,status:'forming',q:0,lines:[],marks:[],level:null,target:null,stop:null,startI:0,endI:0,brkI:null,progress:0,info:''};
function mkPat(o){ return Object.assign({},PAT_BASE,o); }

function zigzag(c,atr,mult){
  mult=mult||2.2; const n=c.length, piv=[]; if(n<30) return piv;
  let hiI=0,hiP=c[0].high,loI=0,loP=c[0].low,up=null;
  for(let t=1;t<n;t++){
    const a=atr[t]||atr[t-1];
    if(!a){ if(c[t].high>hiP){ hiP=c[t].high; hiI=t; } if(c[t].low<loP){ loP=c[t].low; loI=t; } continue; }
    const thr=mult*a;
    if(up===null){
      if(c[t].high>hiP){ hiP=c[t].high; hiI=t; } if(c[t].low<loP){ loP=c[t].low; loI=t; }
      if(hiP-loP>=thr){ if(hiI>loI){ piv.push({i:loI,price:loP,type:'L',ci:t}); up=true; } else { piv.push({i:hiI,price:hiP,type:'H',ci:t}); up=false; } }
    } else if(up){
      if(c[t].high>hiP){ hiP=c[t].high; hiI=t; }
      else if(hiP-c[t].low>=thr){ piv.push({i:hiI,price:hiP,type:'H',ci:t}); up=false; loP=c[t].low; loI=t; }
    } else {
      if(c[t].low<loP){ loP=c[t].low; loI=t; }
      else if(c[t].high-loP>=thr){ piv.push({i:loI,price:loP,type:'L',ci:t}); up=true; hiP=c[t].high; hiI=t; }
    }
  }
  return piv;
}
function pivotsAt(piv,t,c,atr){
  const P=[];
  for(let k=piv.length-1;k>=0&&P.length<16;k--) if(piv[k].ci<=t) P.unshift(piv[k]);
  const last=P[P.length-1]; if(!last) return P;
  let bi=-1,bp=null;
  if(last.type==='H'){ bp=Infinity; for(let j=last.i+1;j<=t;j++) if(c[j].low<bp){ bp=c[j].low; bi=j; } }
  else { bp=-Infinity; for(let j=last.i+1;j<=t;j++) if(c[j].high>bp){ bp=c[j].high; bi=j; } }
  if(bi>0&&Math.abs(bp-last.price)>=.6*(atr[t]||0)) P.push({i:bi,price:bp,type:last.type==='H'?'L':'H',conf:false,ci:t});
  return P;
}
function vAvg(c,i,r,t){ let s=0,k=0; for(let j=Math.max(0,i-r);j<=Math.min(t,i+r);j++){ s+=c[j].volume; k++; } return k?s/k:0; }
function vMean(c,t,len){ let s=0,k=0; for(let j=Math.max(0,t-len);j<t;j++){ s+=c[j].volume; k++; } return k?s/k:1; }
function priorMove(c,i,d,len){
  let m=-Infinity; for(let j=Math.max(0,i-len);j<=i;j++){ const h=d>0?c[j].high:-c[j].low; if(h>m) m=h; }
  return m-(d>0?c[i].low:-c[i].high);
}

/* d = +1 -> bullish "bottom" shapes (pivots that are lows); d = -1 -> mirrored "top" shapes.
   All maths run in a transformed space Y = d*price so one routine serves both. */
function patDouble(P,c,atr,t,d){
  const out=[], n=P.length, a=atr[t]; if(n<3||!a) return out;
  const isMin=p=>d>0?p.type==='L':p.type==='H', Y=v=>d*v;
  for(let e=n-1;e>=Math.max(2,n-2);e--){
    const p1=P[e-2],p2=P[e-1],p3=P[e];
    if(!(isMin(p1)&&!isMin(p2)&&isMin(p3))) continue;
    const y1=Y(p1.price),y2=Y(p2.price),y3=Y(p3.price), lo=Math.min(y1,y3), sep=p3.i-p1.i, depth=y2-Math.max(y1,y3);
    if(Math.abs(y1-y3)>Math.max(.7*a,.12*depth)||depth<3.5*a||sep<10||sep>150||t-p3.i>60) continue;
    let brk=null,fail=false;
    for(let j=p3.i+1;j<=t;j++){ const cy=Y(c[j].close); if(cy>y2+.1*a){ brk=j; break; } if(cy<lo-.6*a){ fail=true; break; } }
    if(fail) continue;
    if(brk!=null){ if(t-brk>5||Y(c[t].close)<y2-.6*a) continue; }
    else if(Y(c[t].close)-y3<.5*a) continue;
    const h=y2-(y1+y3)/2, pre=priorMove(c,p1.i,d,30);
    let q=38+(Math.abs(y1-y3)<Math.max(.25*a,.05*depth)?12:Math.abs(y1-y3)<Math.max(.45*a,.09*depth)?6:0)+(depth>=3*a?8:depth>=2.5*a?4:0)+(pre>=4*a?10:pre>=2.5*a?5:0);
    if(vAvg(c,p3.i,2,t)<vAvg(c,p1.i,2,t)) q+=8;
    if(brk!=null){ q+=6; if(c[brk].volume>1.3*vMean(c,brk,20)) q+=7; }
    out.push(mkPat({name:d>0?'Double Bottom':'Double Top',fam:'double',dir:d,status:brk!=null?'breakout':'forming',q:clip(q,0,100),
      level:d*y2,target:d*(y2+h),stop:d*(lo-.3*a),startI:p1.i,endI:t,brkI:brk,progress:brk!=null?1:clip((Y(c[t].close)-y3)/(y2-y3),0,1),
      lines:[{a:{i:p1.i,p:p2.price},b:{i:t+8,p:p2.price},role:'neck'}],
      marks:[{i:p1.i,p:p1.price,t:'1',type:p1.type},{i:p2.i,p:p2.price,t:'N',type:p2.type},{i:p3.i,p:p3.price,t:'2',type:p3.type}]}));
    break;
  }
  return out;
}
function patTriple(P,c,atr,t,d){
  const out=[], n=P.length, a=atr[t]; if(n<5||!a) return out;
  const isMin=p=>d>0?p.type==='L':p.type==='H', Y=v=>d*v;
  for(let e=n-1;e>=Math.max(4,n-2);e--){
    const w=P.slice(e-4,e+1);
    if(!(isMin(w[0])&&!isMin(w[1])&&isMin(w[2])&&!isMin(w[3])&&isMin(w[4]))) continue;
    const m=[Y(w[0].price),Y(w[2].price),Y(w[4].price)], M=[Y(w[1].price),Y(w[3].price)];
    const mlo=Math.min(...m), mhi=Math.max(...m), neck=Math.max(...M);
    const dp3=Math.min(...M)-mhi;
    if(mhi-mlo>Math.max(.8*a,.12*dp3)||Math.abs(M[0]-M[1])>Math.max(1.2*a,.2*dp3)||dp3<3*a||t-w[4].i>60) continue;
    let brk=null,fail=false;
    for(let j=w[4].i+1;j<=t;j++){ const cy=Y(c[j].close); if(cy>neck+.1*a){ brk=j; break; } if(cy<mlo-.6*a){ fail=true; break; } }
    if(fail) continue;
    if(brk!=null){ if(t-brk>5||Y(c[t].close)<neck-.6*a) continue; }
    else if(Y(c[t].close)-m[2]<.5*a) continue;
    const avg=(m[0]+m[1]+m[2])/3, h=neck-avg, pre=priorMove(c,w[0].i,d,30);
    let q=42+(mhi-mlo<.3*a?12:6)+(h>=3*a?6:0)+(pre>=3*a?8:0);
    if(vAvg(c,w[4].i,2,t)<vAvg(c,w[0].i,2,t)) q+=8;
    if(brk!=null){ q+=6; if(c[brk].volume>1.3*vMean(c,brk,20)) q+=6; }
    out.push(mkPat({name:d>0?'Triple Bottom':'Triple Top',fam:'triple',dir:d,status:brk!=null?'breakout':'forming',q:clip(q,0,100),
      level:d*neck,target:d*(neck+h),stop:d*(mlo-.3*a),startI:w[0].i,endI:t,brkI:brk,progress:brk!=null?1:clip((Y(c[t].close)-m[2])/(neck-m[2]),0,1),
      lines:[{a:{i:w[0].i,p:d*neck},b:{i:t+8,p:d*neck},role:'neck'}],
      marks:[{i:w[0].i,p:w[0].price,t:'1',type:w[0].type},{i:w[2].i,p:w[2].price,t:'2',type:w[2].type},{i:w[4].i,p:w[4].price,t:'3',type:w[4].type}]}));
    break;
  }
  return out;
}
function patHS(P,c,atr,t,d){
  const out=[], n=P.length, a=atr[t]; if(n<5||!a) return out;
  const isMin=p=>d>0?p.type==='L':p.type==='H', Y=v=>d*v;
  for(let e=n-1;e>=Math.max(4,n-2);e--){
    const [ls,n1,hd,n2,rs]=P.slice(e-4,e+1);
    if(!(isMin(ls)&&!isMin(n1)&&isMin(hd)&&!isMin(n2)&&isMin(rs))) continue;
    const yl=Y(ls.price),y1=Y(n1.price),yh=Y(hd.price),y2=Y(n2.price),yr=Y(rs.price), nk=(y1+y2)/2, H=nk-yh;
    if(H<3.5*a||!(yl>yh+.25*H&&yr>yh+.25*H)||!(yl<nk-.2*H&&yr<nk-.2*H)||Math.abs(yl-yr)>.5*H||Math.abs(y2-y1)>.9*H||t-rs.i>60) continue;
    const t1=hd.i-ls.i, t2=rs.i-hd.i, ratio=t1/(t2||1); if(ratio<.35||ratio>2.8) continue;
    const neck=i=>y1+(y2-y1)*(i-n1.i)/((n2.i-n1.i)||1);
    let brk=null,fail=false;
    for(let j=rs.i+1;j<=t;j++){ const cy=Y(c[j].close); if(cy>neck(j)+.1*a){ brk=j; break; } if(cy<yh-.3*a){ fail=true; break; } }
    if(fail) continue;
    if(brk!=null){ if(t-brk>5||Y(c[t].close)<neck(t)-.7*a) continue; }
    else if(Y(c[t].close)-yr<.5*a) continue;
    const sh=Math.abs(yl-yr)/H, pre=priorMove(c,ls.i,d,40);
    let q=40+(sh<=.15?12:sh<=.3?6:0)+(ratio>=.6&&ratio<=1.7?6:0)+(H>=4*a?8:H>=3*a?4:0)+(pre>=4*a?8:pre>=2.5*a?4:0)+(Math.abs(y2-y1)<.3*H?4:0);
    if(vAvg(c,rs.i,2,t)<vAvg(c,ls.i,2,t)) q+=6;
    if(brk!=null){ q+=6; if(c[brk].volume>1.3*vMean(c,brk,20)) q+=6; }
    const base=neck(brk!=null?brk:t);
    out.push(mkPat({name:d>0?'Inverse Head & Shoulders':'Head & Shoulders',fam:'hs',dir:d,status:brk!=null?'breakout':'forming',q:clip(q,0,100),
      level:d*base,target:d*(base+H),stop:d*(yr-.3*a),startI:ls.i,endI:t,brkI:brk,progress:brk!=null?1:clip((Y(c[t].close)-yr)/((base-yr)||1),0,1),
      lines:[{a:{i:n1.i,p:n1.price},b:{i:t+8,p:d*neck(t+8)},role:'neck'}],
      marks:[{i:ls.i,p:ls.price,t:'LS',type:ls.type},{i:hd.i,p:hd.price,t:'H',type:hd.type},{i:rs.i,p:rs.price,t:'RS',type:rs.type}]}));
    break;
  }
  return out;
}
