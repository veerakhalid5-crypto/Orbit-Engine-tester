/* ================================================================
   COIN DETAIL · CHART · RESULTS · BACK-TEST UI · BOOT
   ================================================================ */
/* ---------------- chart (canvas, no external library) ---------------- */
function drawChart(cv,rec,tf,ov){
  if(!cv||!rec||!rec.bars.length) return; ov=(ov||[]).filter(o=>UI.layers[o.layer||'plan']);
  const dpr=window.devicePixelRatio||1, W=cv.clientWidth||600, H=Math.round(Math.min(400,Math.max(250,W*.52)));
  cv.style.height=H+'px'; cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr); const g=cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0);
  let bars=tf===5?aggBars(rec.bars,rec.bars.length-1,5).slice(-90):rec.bars.slice(-120).slice();
  if(tf===1&&rec.live&&rec.live.m===Math.floor(nowMs()/60000)) bars=bars.concat([{t:rec.live.m*60,o:rec.live.o,h:rec.live.h,l:rec.live.l,c:rec.live.c,q:0,Q:0}]);
  const n=bars.length; if(n<2) return;
  const padR=64, padT=10, padB=18, ph=Math.round(H*.74), vh=H-ph-padB, cw=(W-padR)/n;
  let hi=-Infinity,lo=Infinity,vmax=0; bars.forEach(b=>{ if(b.h>hi) hi=b.h; if(b.l<lo) lo=b.l; if(b.q>vmax) vmax=b.q; });
  (ov||[]).forEach(o=>{ if(o.p>lo*.9&&o.p<hi*1.1&&o.fit){ hi=Math.max(hi,o.p); lo=Math.min(lo,o.p); } });
  const rng=(hi-lo)||hi*.01, Y=p=>padT+(hi-p)/rng*(ph-padT-6), X=i=>i*cw+cw/2;
  g.clearRect(0,0,W,H); g.font='10px ui-monospace,Menlo,monospace'; g.textBaseline='middle';
  g.strokeStyle='#1F2937'; g.lineWidth=1; g.fillStyle='#8B96A5';
  for(let k=0;k<=4;k++){ const p=lo+rng*k/4, y=Y(p); g.beginPath(); g.moveTo(0,y); g.lineTo(W-padR,y); g.stroke(); g.fillText(pf(p),W-padR+5,y); }
  bars.forEach((b,i)=>{ const up=b.c>=b.o, col=up?'#10B981':'#EF4444', x=X(i); g.strokeStyle=col; g.fillStyle=col; g.beginPath(); g.moveTo(x,Y(b.h)); g.lineTo(x,Y(b.l)); g.stroke();
    const y1=Y(Math.max(b.o,b.c)), y2=Y(Math.min(b.o,b.c)); g.fillRect(x-cw*.35,y1,Math.max(cw*.7,1),Math.max(y2-y1,1));
    if(vmax>0&&b.q>0){ g.globalAlpha=.35; const vhh=b.q/vmax*vh; g.fillRect(x-cw*.35,H-padB-vhh,Math.max(cw*.7,1),vhh); g.globalAlpha=1; } });
  const vis=(ov||[]).filter(o=>o.p>=lo&&o.p<=hi); vis.forEach(o=>{ if(o.zone){ const y1=Y(Math.min(hi,o.top)), y2=Y(Math.max(lo,o.bot)); g.globalAlpha=.14; g.fillStyle=o.c; g.fillRect(0,y1,W-padR,Math.max(2,y2-y1)); g.globalAlpha=.55; g.strokeStyle=o.c; g.lineWidth=1; g.setLineDash([]); g.strokeRect(0,y1,W-padR,Math.max(2,y2-y1)); g.globalAlpha=1; return; } const y=Y(o.p); g.strokeStyle=o.c; g.lineWidth=o.w||1; g.setLineDash(o.dash||[]); g.beginPath(); g.moveTo(0,y); g.lineTo(W-padR,y); g.stroke(); g.setLineDash([]); });
  { /* labels: plan lines (entry/stop/targets) get priority; a label that would sit on top of another moves to the right-hand side, or is dropped */
    g.font='9.5px ui-monospace,Menlo,monospace'; const used={l:[],r:[]}, pri=o=>o.fit!==undefined?0:1, free=(a,y)=>a.every(v=>Math.abs(v-y)>=14);
    vis.slice().sort((a,b)=>pri(a)-pri(b)).forEach(o=>{ const y=Y(o.p), t=o.t+' '+pf(o.p), tw=g.measureText(t).width+8; let x;
      if(free(used.l,y)){ used.l.push(y); x=4; } else if(free(used.r,y)){ used.r.push(y); x=W-padR-tw-4; } else return;
      g.globalAlpha=.9; g.fillStyle='#0A0F16'; g.fillRect(x,y-8,tw,14); g.globalAlpha=1; g.fillStyle=o.c; g.fillText(t,x+4,y-1); }); }
  g.fillStyle='#8B96A5'; g.font='10px ui-monospace,Menlo,monospace';
  for(let k=0;k<5;k++){ const i=Math.floor((n-1)*k/4); g.fillText(hhmm(bars[i].t),Math.min(X(i)-14,W-padR-34),H-7); }
}
/* every overlay carries a layer name; the layer chips under the chart switch them on and off */
const CHART_LAYERS=[['plan','Entry · SL · TP'],['engine','Engine setup'],['zones','OB · FVG · S/D'],['structure','BOS · CHoCH'],['vp','Volume profile'],['levels','Levels & liquidity']];
function chartOverlays(rec,sig){
  const ov=[], ev=rec.ev, dp=ev&&ev.deep, px=rec.last||rec.bars[rec.bars.length-1].c;
  if(dp&&dp.vp){ ov.push({p:dp.vp.poc,c:'#A855F7',t:'POC',dash:[5,4],layer:'vp'},{p:dp.vp.vah,c:'#8B96A5',t:'VAH',dash:[2,4],layer:'vp'},{p:dp.vp.val,c:'#8B96A5',t:'VAL',dash:[2,4],layer:'vp'}); }
  if(dp&&dp.levels) dp.levels.filter(l=>Math.abs(l.p-px)/px<.03).sort((a,b)=>Math.abs(a.p-px)-Math.abs(b.p-px)).slice(0,5).forEach(l=>ov.push({p:l.p,c:'#F59E0B99',t:l.src.slice(0,18),dash:[1,4],layer:'levels'}));
  const R=dp&&dp.rep;
  if(R&&R.F){ try{
    R.F.zonesAt(R.t,{reach:3}).filter(z=>z.kind!=='VOID'&&z.qNow>=40&&Math.abs((z.top+z.bot)/2-px)/px<.04).sort((a,b)=>b.qNow-a.qNow).slice(0,6)
      .forEach(z=>ov.push({zone:true,top:z.top,bot:z.bot,p:(z.top+z.bot)/2,c:z.dir>0?'#10B981':'#EF4444',t:zoneLabel(z).slice(0,16),layer:'zones'}));
    R.F.struct.filter(e=>!e.init&&R.t-e.i<=40&&Math.abs(e.lvl-px)/px<.04).slice(-3).forEach(e=>ov.push({p:e.lvl,c:e.dir>0?'#34D399':'#F87171',t:e.kind+(e.mss?'/MSS':'')+(e.dir>0?' ▲':' ▼'),dash:[3,3],layer:'structure'}));
  }catch(e){} }
  if(sig&&sig.eng){ const g=sig.eng; if(g.entry) ov.push({zone:true,top:g.entry[1],bot:g.entry[0],p:(g.entry[0]+g.entry[1])/2,c:'#6366F1',t:g.id+' zone',layer:'engine'}); if(g.inval!=null) ov.push({p:g.inval,c:'#F472B6',t:g.id+' invalid',w:1.2,dash:[6,3],layer:'engine'}); }
  else if(dp&&dp.eng){ [[dp.eng.up,'#34D399'],[dp.eng.dn,'#F87171']].forEach(([a,c])=>{ if(a&&a.top) ov.push({p:a.top.inval,c,t:a.top.id+' inval.',dash:[6,3],layer:'engine'}); }); }
  if(sig){ const p=sig.plan; ov.push({p:p.entry.lo+(p.entry.hi-p.entry.lo)/2,c:'#6366F1',t:'ENTRY',w:1.4,fit:true},{p:p.sl,c:'#EF4444',t:'SL',w:1.4,fit:true}); p.tps.forEach((x,i)=>ov.push({p:x.p,c:'#10B981',t:'TP'+(i+1),w:1.2,fit:i<2})); }
  return ov;
}

/* ---------------- coin detail sheet ---------------- */
function openDetail(sym){
  const r=MK.syms.get(sym); if(!r) return; UI.sel=sym; MK.sel=sym; const sh=$('sheet'); sh.classList.add('on'); document.body.style.overflow='hidden';
  $('sheetIn').innerHTML='<div class="hd"><button class="btn" id="dtClose">← Back</button><div style="flex:1"><b style="font-size:19px" id="dtName"></b> <span class="mono" id="dtPx"></span><div class="mut mono" style="font-size:11px" id="dtSub"></div></div><div class="seg" id="segTf"><button data-v="1" class="'+(UI.selTf===1?'on':'')+'">1m</button><button data-v="5" class="'+(UI.selTf===5?'on':'')+'">5m</button></div></div><canvas id="dtCv"></canvas><div class="layer-bar" id="dtLayers"></div><div id="dtBody" style="margin-top:14px"></div>';
  $('dtLayers').innerHTML=CHART_LAYERS.map(([k,n])=>'<button class="chip'+(UI.layers[k]?' on':'')+'" data-l="'+k+'">'+n+'</button>').join('');
  $('dtLayers').onclick=e=>{ const b=e.target.closest('button'); if(!b) return; const k=b.dataset.l; UI.layers[k]=UI.layers[k]?0:1; b.classList.toggle('on',!!UI.layers[k]); renderDetail(); };
  $('dtClose').onclick=closeDetail; $$('#segTf button').forEach(b=>b.onclick=()=>{ UI.selTf=+b.dataset.v; $$('#segTf button').forEach(x=>x.classList.toggle('on',x===b)); renderDetail(); });
  r.deepWanted=true; renderDetail(); deepTick();
}
function closeDetail(){ UI.sel=null; MK.sel=null; $('sheet').classList.remove('on'); document.body.style.overflow=''; }
function famBlock(sc,L){
  const keys=Object.keys(sc.fam); return '<div class="fam">'+keys.map(k=>{ const f=sc.fam[k]; return '<span class="n">'+esc(FAM_NAME[k])+(f.known?'':' <span class="mut">(not measured)</span>')+'</span><div class="bar '+(L?'':'dnb')+'" style="margin:0;opacity:'+(f.known?1:.35)+'"><i style="width:'+Math.round(f.s*100)+'%"></i></div><small>'+esc(sc.ev[k])+'</small>'; }).join('')+'</div>';
}
function sideBlock(r,L){
  const e=r.ev, sc=L?e.up:e.dn, g=r.gate&&r.gate[L?1:-1];
  let gates=''; const gg=gateSignal(e,L?1:-1,r.bars,r.bars.length-1,r.ctx||ctxFor(r),e.deep,PRESETS[SET.preset]);
  gates='<ul class="ev">'+gg.gates.map(x=>'<li class="'+(x.ok?'ok':'no')+'">'+esc(x.txt)+'</li>').join('')+'</ul>';
  return '<div class="panel"><div class="ph"><h2>'+(L?'PUMP / LONG SIDE':'DUMP / SHORT SIDE')+'</h2><span class="sub">'+chip(sc.stage,L)+' '+esc(sc.label||'')+'</span></div><div class="pb"><div style="margin-bottom:10px"><b class="mono" style="font-size:22px">'+Math.round(sc.score)+'</b><span class="mut"> / 100 evidence · '+sc.fams+' families agree</span>'+(sc.pen.length?'<div class="note">'+sc.pen.map(esc).join(' · ')+'</div>':'')+'</div>'+famBlock(sc,L)+'<details style="margin-top:10px"><summary class="mut" style="cursor:pointer">Confirmation gates ('+SET.preset.toLowerCase()+' preset) — '+(gg.ok?'<b class="up">all passed</b>':'<b class="amb">'+gg.gates.filter(x=>!x.ok).length+' not passed</b>')+'</summary>'+gates+'</details></div></div>';
}
function deepBlock(r){
  const e=r.ev, d=e.deep||{}, ex=r.st.extra||{}, o=[];
  const row=(k,v)=>'<tr><td class="mut">'+k+'</td><td>'+v+'</td></tr>';
  if(d.vp) o.push(row('Volume profile (4h)','POC '+pf(d.vp.poc)+' · value area '+pf(d.vp.val)+' – '+pf(d.vp.vah)+' · price is '+esc(d.vp.pos)));
  if(d.wyckoff) o.push(row('Wyckoff',esc(d.wyckoff.txt)));
  if(ex.book){ const b=ex.book; o.push(row('Order book (±0.5%)','imbalance '+(b.imb>=0?'+':'')+Math.round(b.imb*100)+'% '+(b.imb>=0?'bid':'ask')+' heavy · depth $'+fmtMoney(b.depth05)+' · spread '+b.spread.toFixed(3)+'%'+(b.bidWall?' · bid wall $'+fmtMoney(b.bidWall.n)+' @ '+pf(b.bidWall.p):'')+(b.askWall?' · ask wall $'+fmtMoney(b.askWall.n)+' @ '+pf(b.askWall.p):'')+(b.spoof?'<br><span class="amb">⚠ '+esc(b.spoof)+'</span>':''))); }
  else if(r.venue==='F') o.push(row('Order book','<span class="mut">fetched for top candidates and the coin you open — loading…</span>'));
  if(ex.deriv){ const v=ex.deriv; o.push(row('Derivatives',(v.oiChg30!=null?'OI '+(v.oiChg30>=0?'+':'')+v.oiChg30.toFixed(1)+'% (30m) · ':'')+(r.fund!=null?'funding '+r.fund.toFixed(4)+'% · ':'')+(v.ls!=null?'long/short '+v.ls.toFixed(2)+' · ':'')+(v.taker!=null?'taker buy/sell '+v.taker.toFixed(2):'')+(v.liq?'<br>liquidations 15m: $'+fmtMoney(v.liq.total)+' ('+Math.round(v.liq.shortShare*100)+'% shorts)'+(v.squeeze?' <span class="amb">— looks like a '+(v.squeeze>0?'short squeeze, not fresh buying':'long flush')+'</span>':''):''))); }
  if(ex.xex) o.push(row('Other venues',esc(ex.xex.up.txt)));
  if(ex.fp){ const f=ex.fp; o.push(row('Trade tape (15 min)',f.count+' trades · '+Math.round(f.aggBuyShare*100)+'% aggressive buys · large orders: '+f.largeBuys+' buy ($'+fmtMoney(f.largeBuyUsd)+') / '+f.largeSells+' sell ($'+fmtMoney(f.largeSellUsd)+') · tape POC '+pf(f.poc)+(f.uniform?'<br><span class="amb">⚠ order sizes are unusually uniform (bot-like) — treat the volume with caution</span>':''))); }
  else if(r.venue==='F') o.push(row('Trade tape','<span class="mut">live trade stream attaches to candidates — loading…</span>'));
  const lv=(d.levels||[]).filter(l=>Math.abs(l.p-r.last)/r.last<.05).sort((a,b)=>a.p-b.p); if(lv.length) o.push(row('Nearby levels',lv.map(l=>pf(l.p)+' '+esc(l.src)).join(' · ')));
  if(e.man.flags.length) o.push(row('Manipulation checks','<span class="amb">'+e.man.flags.map(f=>esc(f.txt)).join('<br>')+'</span>')); else o.push(row('Manipulation checks','<span class="up">no wash-trade, spoof, trap or volume-without-progress flags</span> (risk '+Math.round(e.man.risk)+'/100)'));
  return '<div class="panel"><div class="ph"><h2>INSTITUTIONAL DETAIL</h2><span class="sub">candidates get the deep data</span></div><div class="pb tw"><table class="t">'+o.join('')+'</table></div></div>';
}
function renderDetail(){
  const r=MK.syms.get(UI.sel); if(!r||!UI.sel) return; const e=r.ev, px=r.last||r.bars[r.bars.length-1].c;
  $('dtName').textContent=symName(r)+'/USDT'; $('dtPx').innerHTML=pf(px)+' <span class="'+(r.chg24>=0?'up':'dn')+'" style="font-size:13px">'+pc(r.chg24,1)+'</span>';
  $('dtSub').textContent=(r.venue==='F'?'USDT-M perpetual':'Spot')+' · 24h volume '+money(r.q24)+(r.ageDays!=null&&r.ageDays<90?' · listed '+Math.floor(r.ageDays)+' days ago':'')+(r.stale?' · STALE DATA':'');
  const sig=REG.sigs.filter(s=>s.sym===r.sym&&s.trade.state!=='CLOSED').sort((a,b)=>b.t-a.t)[0];
  drawChart($('dtCv'),r,UI.selTf,chartOverlays(r,sig));
  if(!e){ setHTML('dtBody','<div class="empty">'+(r.hist?'Analysing…':'Loading history for this coin…')+'</div>'); return; }
  let h=''; if(sig) h+=sigCard(sig);
  const L=e.up.score>=e.dn.score;
  h+='<div class="grid g2">'+sideBlock(r,L)+sideBlock(r,!L)+'</div>'+deepBlock(r);
  h+='<div class="panel"><div class="ph"><h2>RAW MEASUREMENTS</h2></div><div class="pb tw"><table class="t"><tr><td class="mut">Volume vs normal (1m / 3m / 5m)</td><td>×'+e.M.rv1.toFixed(1)+' / ×'+e.M.rv3.toFixed(1)+' / ×'+e.M.rv5.toFixed(1)+'</td><td class="mut">Normal volume / minute</td><td>'+money(e.M.B)+'</td></tr><tr><td class="mut">Move 5m / 15m / 60m</td><td>'+pc(e.M.up.ret5,2)+' / '+pc(e.M.up.ret15,2)+' / '+pc(e.M.up.ret60,2)+'</td><td class="mut">15m move in σ</td><td>'+e.M.up.z15.toFixed(1)+'</td></tr><tr><td class="mut">Aggressive buys (5m)</td><td>'+Math.round(e.M.up.bs5*100)+'%</td><td class="mut">Liquidity tier</td><td>'+esc(e.M.tier)+'</td></tr></table></div></div>';
  setHTML('dtBody',h);
}

/* ---------------- PERFORMANCE · BACKTEST LAB ---------------- */
const fCI=p=>Math.round(p.winRate*100)+'% <span class="mut">['+Math.round(p.wlo*100)+'–'+Math.round(p.whi*100)+']</span>';
const fR=x=>'<span class="'+(x>=0?'up':'dn')+'">'+(x>=0?'+':'')+x.toFixed(2)+'R</span>';
const fRat=x=>x==null?'–':x.toFixed(2);
function perfTable(map,labelFn){
  const keys=Object.keys(map).filter(k=>map[k].n); if(!keys.length) return '<div class="note">No closed trades yet.</div>';
  return '<div class="tw"><table class="t"><tr><th></th><th>n</th><th>Win rate [95% CI]</th><th>Avg R</th><th>Profit factor</th><th>Sharpe*</th><th>Sortino*</th><th>TP1 reached</th><th>Avg MFE</th><th>Avg MAE</th><th>False signals</th></tr>'+keys.map(k=>{ const p=map[k]; return '<tr><td>'+esc(labelFn?labelFn(k):k)+'</td><td>'+p.n+'</td><td>'+fCI(p)+'</td><td>'+fR(p.avgR)+'</td><td>'+(p.pf===Infinity?'∞':p.pf.toFixed(2))+'</td><td>'+fRat(p.sharpe)+'</td><td>'+fRat(p.sortino)+'</td><td>'+Math.round(p.tp1Rate*100)+'%</td><td>'+p.avgMFE.toFixed(2)+'R</td><td>'+p.avgMAE.toFixed(2)+'R</td><td>'+Math.round(p.falseRate*100)+'%</td></tr>'; }).join('')+'</table></div>';
}
const SHARPE_NOTE='<div class="note">*Sharpe / Sortino here are per-trade ratios (mean R ÷ standard deviation of R, downside deviation for Sortino), not annualised, and are shown only from 5 trades. With few trades they are very noisy.</div>';
function breakdowns(T){
  const g=(title,fn,lab)=>'<h4 class="mut" style="margin:16px 0 6px">'+title+'</h4>'+perfTable(groupPerf(T,fn),lab);
  return g('By side',t=>t.dir>0?'LONG':'SHORT')+g('By entry type',t=>t.etype)+g('By higher-timeframe alignment',t=>t.htf)+g('By trading session (UTC)',t=>t.sess)+g('By market regime',t=>t.regime)+g('By liquidity tier',t=>t.tier)+g('By evidence grade',t=>t.grade)+g('By institutional conviction tier',t=>t.conv?tierName(t.conv):null)+g('By signal mode',t=>t.mode==='ENGINE'?'Engine-led':t.mode?'Momentum (pump/dump)':null)+g('By engine',t=>t.eng,k=>k+' · '+(ENG_BY[k]?ENG_BY[k].name:k))+g('By lifecycle stage at entry',t=>t.stage,k=>'Stage '+k)+g('By BTC condition',t=>t.cond)+g('By strongest evidence family',t=>t.top&&t.top[0],k=>FAM_NAME[k]||k);
}
/* earlier part vs later part, and k chronological folds — the rules are fixed, so this tests stability, it does not fit anything */
function stabilityBlock(trades,label){
  const T=chrono(trades); if(T.length<10) return '<div class="note">'+(label?esc(label)+': ':'')+'needs at least 10 closed trades for an earlier/later split ('+T.length+' so far).</div>';
  const s=isOos(trades,.7), f=foldPerf(trades,4), r=(l,p)=>p.n?'<tr><td>'+l+'</td><td>'+p.n+'</td><td>'+fCI(p)+'</td><td>'+fR(p.avgR)+'</td><td>'+(p.pf===Infinity?'∞':p.pf.toFixed(2))+'</td><td>'+fRat(p.sharpe)+'</td><td>'+fRat(p.sortino)+'</td><td>'+p.maxDD.toFixed(1)+'R</td></tr>':'<tr><td>'+l+'</td><td colspan="7" class="mut">no trades</td></tr>';
  return '<div class="tw"><table class="t"><tr><th>'+(label?esc(label):'Chronological split')+'</th><th>n</th><th>Win rate [CI]</th><th>Avg R</th><th>PF</th><th>Sharpe*</th><th>Sortino*</th><th>Max DD</th></tr>'+r('Earlier 70% (in-sample)',s.is)+r('Later 30% (out-of-sample)',s.oos)+f.map((p,i)=>r('Fold '+(i+1)+' of '+f.length,p)).join('')+'</table></div>';
}
function alertTable(st){
  const keys=Object.keys(st).sort(); if(!keys.length) return '<div class="note">No stage alerts recorded yet.</div>';
  const names=['','Early watch','Pre-pump / pre-dump','Initiation','Confirmation','Exhaustion'];
  return '<div class="tw"><table class="t"><tr><th>Stage</th><th>Alerts judged</th><th>Followed through [95% CI]</th><th>Median lead</th><th>Avg best move</th><th>Avg worst move</th><th>+15m</th><th>+30m</th><th>+60m</th><th>+120m</th></tr>'+keys.map(k=>{ const s=st[k]; if(!s.n) return '<tr><td>'+names[k]+'</td><td colspan="9" class="mut">'+s.pending+' pending</td></tr>'; const f=v=>v==null?'–':'<span class="'+(v>=0?'up':'dn')+'">'+pc(v,2)+'</span>';
    return '<tr><td>'+names[k]+'</td><td>'+s.n+(s.pending?' <span class="mut">(+'+s.pending+' pending)</span>':'')+'</td><td>'+Math.round(s.rate*100)+'% <span class="mut">['+Math.round(s.lo*100)+'–'+Math.round(s.hi*100)+']</span></td><td>'+(s.leadMed!=null?Math.round(s.leadMed)+' min':'–')+'</td><td class="up">'+pc(s.avgMFE,2)+'</td><td class="dn">'+pc(s.avgMAE,2)+'</td><td>'+f(s.f15)+'</td><td>'+f(s.f30)+'</td><td>'+f(s.f60)+'</td><td>'+f(s.f120)+'</td></tr>'; }).join('')+'</table></div><div class="note">"Followed through" = the coin moved at least max(1.5%, 5× its own 1-minute volatility) in the alert\'s direction within 60 minutes. Direction-adjusted returns: positive means the alert was right.</div>';
}
function calTable(){
  const c=calFor(), rows=c.live;
  return '<div class="tw"><table class="t"><tr><th>Evidence score</th><th>Live n</th><th>Live target-1 rate [CI]</th><th>Back-test n</th><th>Back-test rate [CI]</th><th>Used for confidence</th></tr>'+rows.map((r,i)=>{ const b=c.backtest[i], used=confidenceFor((CAL_EDGES[i]+CAL_EDGES[i+1]-1)/2+.5,c);
    const f=x=>x.n?Math.round(x.rate*100)+'% <span class="mut">['+Math.round(x.lo*100)+'–'+Math.round(x.hi*100)+']</span>':'–';
    return '<tr><td>'+r.label+'</td><td>'+r.n+'</td><td>'+f(r)+'</td><td>'+b.n+'</td><td>'+f(b)+'</td><td>'+(used.calibrated?'<b class="up">'+used.src+'</b>':'<span class="amb">not calibrated (need '+used.need+')</span>')+'</td></tr>'; }).join('')+'</table></div><div class="note">Shown for the "'+SET.preset.toLowerCase()+'" preset. A confidence figure is only displayed on a signal once its score bucket has ≥ '+TRK.minCalib+' real outcomes.</div>';
}
function drawEquity(cv,curve){
  if(!cv||curve.length<2) return; const dpr=window.devicePixelRatio||1, W=cv.clientWidth||500, H=150; cv.style.height=H+'px'; cv.width=W*dpr; cv.height=H*dpr; const g=cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,W,H);
  const v=curve.map(p=>p.eq), lo=Math.min(...v), hi=Math.max(...v), r=(hi-lo)||1; g.strokeStyle='#10B981'; g.lineWidth=2; g.beginPath(); v.forEach((e,i)=>{ const x=i/(v.length-1)*(W-10)+5, y=H-14-(e-lo)/r*(H-28); i?g.lineTo(x,y):g.moveTo(x,y); }); g.stroke();
  g.fillStyle='#8B96A5'; g.font='10px ui-monospace,monospace'; g.fillText('$'+hi.toFixed(0),6,10); g.fillText('$'+lo.toFixed(0),6,H-3);
}
function mcBlock(T,label){
  const rs=T.filter(t=>t.state==='CLOSED'&&t.outcome!=='MISSED').map(t=>t.R), mc=monteCarlo(rs,SET.riskPct,1000);
  return mc?'<div class="grid g4"><div class="metric"><label>Monte-Carlo p5 / p50 / p95</label><b style="font-size:15px">'+pc(mc.p05,1)+' / '+pc(mc.p50,1)+' / '+pc(mc.p95,1)+'</b><small>'+mc.runs+' reshuffles of '+mc.n+' trades at '+SET.riskPct+'% risk</small></div><div class="metric"><label>Bad-luck drawdown (p95)</label><b class="dn">'+mc.ddP95.toFixed(1)+'%</b></div><div class="metric"><label>Chance of ending negative</label><b>'+Math.round(mc.probLoss*100)+'%</b></div></div>':'<div class="note">Monte-Carlo needs at least 8 closed trades'+(label?' ('+label+')':'')+'.</div>';
}
function renderPerf(){
  const live=REG.trades('live'), lp=perf(live), open=REG.sigs.filter(s=>s.trade.state!=='CLOSED'&&s.src!=='test').length;
  $('perfWarn').innerHTML='<b>How to read this page.</b> Nothing here is a promise. Every number is <u>measured</u>: live signals this app generated in this browser (test signals are excluded), judged by the same fixed rules — fill at the next candle open, stop assumed first when one candle touches both stop and target, 50/30/20 scale-out, stop to break-even after TP1 and to TP1 after TP2, and an <u>assumed</u> round-trip cost by liquidity tier ('+['DEEP','GOOD','THIN','MICRO'].map(k=>k.toLowerCase()+' '+TRK.costByTier[k]+'%').join(' · ')+') plus funding. Short samples are noisy — the intervals show by how much.';
  let h='<div class="panel"><div class="ph"><h2>LIVE SIGNAL PERFORMANCE</h2><span class="sub">'+lp.n+' closed · '+open+' open</span></div><div class="pb">';
  if(!lp.n) h+='<div class="empty"><b>No closed live signals yet.</b><br>A signal is only counted once its stop or targets are actually reached. Leave the app running — or run the back-test in the Lab to get a first measurement now.</div>';
  else{
    h+='<div class="grid g4"><div class="metric"><label>Win rate [95% CI]</label><b>'+fCI(lp)+'</b><small>'+lp.wins+' wins · '+lp.losses+' losses · '+lp.flat+' flat</small></div><div class="metric"><label>Average R</label><b>'+fR(lp.avgR)+'</b><small>profit factor '+(lp.pf===Infinity?'∞':lp.pf.toFixed(2))+' · max drawdown '+lp.maxDD.toFixed(1)+'R</small></div><div class="metric"><label>Avg MFE / MAE</label><b>'+lp.avgMFE.toFixed(2)+'R / '+lp.avgMAE.toFixed(2)+'R</b><small>best / worst excursion</small></div><div class="metric"><label>False signals</label><b>'+Math.round(lp.falseRate*100)+'%</b><small>stopped before target 1 · planned R:R '+lp.plannedRR.toFixed(1)+'</small></div></div>'+SHARPE_NOTE+breakdowns(live);
    h+='<h4 class="mut" style="margin:16px 0 6px">By detection preset</h4>'+perfTable(groupPerf(live,t=>t.preset),k=>(PRESETS[k]||{name:k}).name);
    if(lp.n>=30&&lp.avgWinR>0&&lp.avgLossR<0){ const kf=kellyFraction(lp.winRate,lp.avgWinR,lp.avgLossR); h+='<div class="note" style="margin-top:10px">Informational: the capped Kelly fraction implied by this sample is '+(kf*100).toFixed(1)+'% of equity per trade — treat it as an upper bound, never a target.</div>'; }
  }
  h+='</div></div>';
  h+='<div class="panel"><div class="ph"><h2>STABILITY (EARLIER vs LATER TRADES)</h2><span class="sub">live signals, chronological</span></div><div class="pb">'+stabilityBlock(live)+'<div class="note" style="margin-top:6px">The detection rules are fixed — nothing is fitted to these trades — so a large gap between the earlier and later part, or between folds, means the result is not stable.</div></div></div>';
  if(lp.n) h+='<details class="panel"><summary class="ph"><h2>LIVE BREAKDOWNS — SIDE · ENGINE · CONVICTION TIER · SESSION · REGIME …</h2><span class="sub">'+lp.n+' closed live signals</span></summary><div class="pb">'+breakdowns(live)+'<div class="note">Small groups are noisy — read the n and the interval, not the headline percentage.</div></div></details>';
  const acc=paperAccount(live,SET.acct,SET.riskPct), pfo=portfolio();
  h+='<div class="panel"><div class="ph"><h2>PAPER ACCOUNT &amp; EXPOSURE</h2><span class="sub">$'+SET.acct.toLocaleString()+' start · '+SET.riskPct+'% risked per trade</span></div><div class="pb"><div class="grid g4"><div class="metric"><label>Equity</label><b>$'+acc.equity.toFixed(0)+'</b><small class="'+(acc.ret>=0?'up':'dn')+'">'+pc(acc.ret,1)+'</small></div><div class="metric"><label>Max drawdown</label><b class="dn">'+acc.maxDD.toFixed(1)+'%</b><small>current '+pfo.dd.toFixed(1)+'% (breaker '+SET.ddBreaker+'%)</small></div><div class="metric"><label>Open exposure</label><b>'+pfo.n+' signals</b><small>'+pfo.longs+' long / '+pfo.shorts+' short · heat '+pfo.heat.toFixed(1)+'% (limit '+SET.maxHeat+'%)</small></div></div><div style="margin-top:12px">'+mcBlock(live)+'</div><canvas id="eqCv" style="margin-top:12px"></canvas></div></div>';
  h+='<div class="panel"><div class="ph"><h2>EARLY-ALERT PRECISION (LIVE)</h2><span class="sub">do early alerts really come before the move?</span></div><div class="pb">'+alertTable(alertStats(REG.alerts.filter(a=>a.src!=='backtest')))+'</div></div>';
  h+='<div class="panel"><div class="ph"><h2>CONFIDENCE CALIBRATION</h2></div><div class="pb">'+calTable()+'</div></div>';
  setHTML('perfBody',h); setTimeout(()=>drawEquity($('eqCv'),acc.curve),0);
}
let BTrun=false;
function renderBT(){
  $('btWarn').innerHTML='<b>What this back-test is — and is not.</b> It replays the identical engine bar by bar (no look-ahead) over real Binance 1-minute history of the most liquid perpetuals and judges Elite / Strict / Balanced / Early / Engine-led on the same data, with the same fill, stop, scale-out and cost rules as live signals. It covers price, volume, aggressive flow and 5-minute structure. <u>Not</u> covered, because free history does not exist: higher-timeframe alignment, order book, open interest, funding, liquidations, cross-venue. A short window means few trades and wide intervals; treat it as a way to compare presets and to start calibrating, not as proof that the system makes money.';
  const by={}; BT.trades.forEach(t=>{ (by[t.preset]=by[t.preset]||[]).push(t); }); const cur=by[SET.preset]||[];
  let h='<div class="panel"><div class="ph"><h2>RUN BACK-TEST</h2><span class="sub">'+(BT.info?BT.info.symbols+' coins · '+BT.info.days+' day(s) · '+new Date(BT.info.at).toLocaleString():'not run yet')+'</span></div><div class="pb">'+
    '<div class="tb"><label class="mut">Coins</label><select class="ctl" data-set="btSyms">'+[10,20,40].map(x=>'<option'+(SET.btSyms===x?' selected':'')+'>'+x+'</option>').join('')+'</select><label class="mut">History</label><select class="ctl" data-set="btDays">'+[1,2,3,5].map(x=>'<option value="'+x+'"'+(SET.btDays===x?' selected':'')+'>'+x+' day'+(x>1?'s':'')+'</option>').join('')+'</select><button class="btn pri" id="btRun"'+(BTrun?' disabled':'')+'>'+(BTrun?'Running…':'Run back-test')+'</button><span class="note" id="btProg"></span></div>'+
    '<div class="note">Uses ~'+Math.ceil(SET.btSyms*SET.btDays*1440/1500)*10+' request-weight of exchange quota.</div></div></div>';
  if(!BT.trades.length&&!BT.alerts.length) h+='<div class="panel"><div class="pb"><div class="empty">No back-test results yet. Press <b>Run back-test</b>.</div></div></div>';
  else{
    const map={}; ['ELITE','STRICT','BALANCED','EARLY','ENGINE'].forEach(k=>{ if(by[k]) map[k]=perf(by[k]); });
    h+='<div class="panel"><div class="ph"><h2>PRESET COMPARISON (SAME DATA)</h2><span class="sub">'+(BT.info?BT.info.evals.toLocaleString()+' evaluations · '+BT.info.bars.toLocaleString()+' candles':'')+'</span></div><div class="pb">'+perfTable(map,k=>PRESETS[k].name)+SHARPE_NOTE+'</div></div>';
    h+='<div class="panel"><div class="ph"><h2>STABILITY — EARLIER vs LATER TRADES</h2><span class="sub">chronological in-sample / out-of-sample and 4 folds</span></div><div class="pb">'+['ELITE','STRICT','BALANCED','EARLY','ENGINE'].filter(k=>by[k]).map(k=>'<div style="margin-bottom:12px">'+stabilityBlock(by[k],PRESETS[k].name)+'</div>').join('')+'<div class="note">The rules are fixed and were not tuned on this data, so the later part is a genuine out-of-sample check of the same rules — but on a short window it is still a small sample.</div></div></div>';
    h+='<div class="panel"><div class="ph"><h2>BREAKDOWN — '+PRESETS[SET.preset].name.toUpperCase()+' PRESET</h2><span class="sub">'+cur.length+' simulated signals</span></div><div class="pb">'+(cur.length?breakdowns(cur):'<div class="note">No simulated signals for this preset.</div>')+'<div class="note" style="margin-top:8px">Higher-timeframe alignment is "N/A" in the back-test (no history).</div></div></div>';
    h+='<div class="panel"><div class="ph"><h2>MONTE-CARLO — '+PRESETS[SET.preset].name.toUpperCase()+'</h2></div><div class="pb">'+mcBlock(cur,PRESETS[SET.preset].name)+'</div></div>';
    h+='<div class="panel"><div class="ph"><h2>STAGE-ALERT PRECISION (BACK-TEST)</h2></div><div class="pb">'+alertTable(alertStats(BT.alerts))+'</div></div>';
    h+='<div class="panel"><div class="ph"><h2>CONFIDENCE CALIBRATION</h2></div><div class="pb">'+calTable()+'</div></div>';
  }
  setHTML('btBody',h);
}
async function runBacktestUI(){
  if(BTrun) return; BTrun=true; renderBT(); const prog=t=>{ const e=$('btProg'); if(e) e.textContent=t; };
  const r=await runBacktestCore({},prog); if(!r.ok) prog(r.error.indexOf('No coins')===0?r.error:'Back-test failed: '+r.error); else saveBT();
  BTrun=false; renderBT();
}

/* ---------------- status · header · ticker · frame loop ---------------- */
const TITLES={sigs:'LIVE SIGNALS',radar:'RADAR',opps:'OPPORTUNITIES',mkts:'MARKETS',bt:'BACKTEST LAB',perf:'PERFORMANCE',eng:'ENGINES',sys:'SYSTEM'};
function renderStatus(){
  const h=MK.hydrate, hyd=recs().filter(r=>r.hist).length, tot=MK.syms.size; let txt, cls;
  if(!MK.syms.size){ txt='CONNECTING'; cls=''; }
  else if(MK.pollMode){ txt='REST POLLING · REDUCED'; cls=''; }
  else if(!MK.wsOK){ txt='RECONNECTING'; cls='bad'; }
  else if(MK.globalStale){ txt='STALE DATA'; cls='bad'; }
  else if(h.running||hyd<tot*.9){ txt='HYDRATING '+hyd+'/'+tot; cls=''; }
  else{ txt='LIVE · '+tot+' MARKETS'; cls='ok'; }
  if(!RUN.on&&cls==='ok'){ txt='PAUSED · '+tot+' MARKETS'; cls=''; }
  const t=$('tStatus'); if(t.textContent!==txt){ t.textContent=txt; $('dStatus').className='dot '+cls; }
  /* boot overlay: leaves as soon as enough history is analysable, or after a fixed wait */
  const ov=$('bootOverlay'); if(ov&&!ov.classList.contains('off')){ const pct=tot?Math.max(6,Math.round(hyd/tot*100)):4; $('bootBar').style.width=pct+'%'; $('bootText').textContent=!tot?'Connecting to Binance…':'Loading market history '+hyd+' / '+tot;
    if((tot&&(hyd>=Math.min(30,tot*.5)))||Date.now()-BOOT_AT>28000) ov.classList.add('off'); }
}
/* market regime label for the header: efficiency ratio of the last 2 hours + current 1-minute range vs its own 5-hour median (a label only — it does not change any score) */
function regime1m(bars){
  const L=bars.length-1; if(L<300) return 'UNKNOWN'; let path=0; for(let j=L-119;j<=L;j++) path+=Math.abs(bars[j].c-bars[j-1].c);
  const er=path>0?Math.abs(bars[L].c-bars[L-120].c)/path:0, rg=j=>bars[j].h-bars[j].l; let a=0; for(let j=L-29;j<=L;j++) a+=rg(j); a/=30;
  const arr=[]; for(let j=L-299;j<=L;j++) arr.push(rg(j)); const vr=a/Math.max(med(arr),1e-12);
  return vr>=1.8?'HIGH_VOL':er>=.35?'TRENDING':er<=.15?'RANGING':'TRANSITION';
}
function renderHeader(){
  const b=MK.syms.get('BTCUSDT'), rg=b&&b.bars.length?regime1m(b.bars):'UNKNOWN', fa=feedAudit(), tot=MK.syms.size, hyd=recs().filter(r=>r.hist).length, htfN=recs().filter(r=>r.htf&&r.htf.ok).length, open=REG.sigs.filter(s=>s.trade.state!=='CLOSED').length;
  $('hSession').textContent=sessionOf(nowSec())+' SESSION'; $('hRegime').textContent='BTC '+rg.replace('_',' ');
  setHTML('healthStrip',[['Markets',tot],['Hydrated',tot?Math.round(hyd/tot*100)+'%':'–'],['Armed (stage 3–4)',MKT.up3+MKT.dn3],['Open signals',open],['Multi-TF',htfN+' coins'],['Feed',fa.ok?'<span class="up">✔ OK</span>':'<span class="dn">⚠ check</span>'],['Streams',MK.wsOK?'<span class="up">live</span>':MK.pollMode?'<span class="amb">REST</span>':'<span class="amb">…</span>']].map(x=>'<span class="hs">'+x[0]+'<b>'+x[1]+'</b></span>').join(''));
  const c=$('sideClock'); if(c) c.textContent=new Date().toLocaleTimeString();
}
function renderTicker(){
  const L=recs().filter(r=>r.venue==='F'&&r.last).sort((a,b)=>b.q24-a.q24).slice(0,30); if(!L.length) return;
  setHTML('tickerInner',L.map(r=>'<span data-sym="'+r.sym+'"><b>'+esc(symName(r))+'</b>'+pf(r.last)+' <i class="'+(r.chg24>=0?'up':'dn')+'" style="font-style:normal">'+pc(r.chg24,1)+'</i></span>').join(''));
}
function renderScanBtn(){ const b=$('scanBtn'); b.textContent=RUN.on?'● SCANNING':'■ STOPPED'; b.className='btn '+(RUN.on?'go':'stop'); b.title=RUN.on?'Press to stop issuing signals and alerts (markets keep streaming and open signals keep being tracked)':'Press to resume issuing signals'; }
function renderCurrent(tickN){
  const tab=UI.tab;
  if(tab==='sigs'&&tickN%2===0) renderSignals();
  else if(tab==='radar'){ renderMood(); renderLive(); if(tickN%3===0) renderNine(); }
  else if(tab==='opps'&&tickN%2===0) renderOpps();
  else if(tab==='mkts'&&tickN%3===0) renderMarkets();
  else if(tab==='sys'&&tickN%2===0) renderSystem();
  if(tab!=='sigs'&&tickN%4===0){ const n=REG.sigs.filter(s=>s.trade.state!=='CLOSED').length, bd=$('bdSigs'); bd.hidden=!n; bd.textContent=n; }
  if(tab!=='opps'&&tickN%6===0){ const n=recs().filter(r=>r.ev&&((r.ev.up.stage>=3&&r.ev.up.stage<=4)||(r.ev.dn.stage>=3&&r.ev.dn.stage<=4))).length, b=$('bdOpps'); b.hidden=!n; b.textContent=n; }
  if(UI.sel&&tickN%2===1) renderDetail();
}
let tickN=0, BOOT_AT=Date.now();
function tick(){ tickN++; try{ scanLive(); if(tickN%2===0) updateMarket(); renderStatus(); renderCurrent(tickN); if(tickN%2===0) renderHeader(); if(tickN%10===1) renderTicker(); }catch(e){ ERR++; MK.lastErr=e; } if(tickN%60===0){ CAL=null; } }
/* ---------------- engines tab: the 50-engine registry with honest status and each engine's MEASURED results ---------------- */
function renderEngines(){
  const cov=engineCoverage(), L=REG.trades('live').filter(t=>t.eng), B=BT.trades.filter(t=>t.eng), gl=groupPerf(L,t=>t.eng), gb=groupPerf(B,t=>t.eng);
  $('engWarn').innerHTML='<b>How to read this page.</b> '+cov.total+' engines are registered. <b>'+cov.signal+'</b> raise signals from candles, <b>'+cov.live+'</b> raise them from live order-book / derivatives / other-venue / trade-tape data (candidates only), <b>'+cov.context+'</b> are context engines (they gate, rank or measure the others) and <b>'+cov.none+'</b> are <u>not built</u> because the data or a validated method is not available here — they are listed, never faked. A hit-rate is shown only from closed signals this app actually produced; a strength score ranks how cleanly a setup is formed, it is <u>not</u> a probability.';
  const mcell=(p,tag)=>p&&p.n?fCI(p)+' <span class="mut">n='+p.n+' · avg '+fR(p.avgR)+'</span>':'<span class="mut">'+tag+'</span>';
  const bayes=p=>{ if(!p||p.n<10) return '<span class="mut">needs ≥10</span>'; const b=betaPost(p.wins,p.n); return Math.round(b.mean*100)+'% <span class="mut">['+Math.round(b.lo*100)+'–'+Math.round(b.hi*100)+']</span>'; };
  const stat=e=>e.kind==='none'?'<span class="badge test">NOT BUILT</span>':e.kind==='context'?'<span class="badge regime">CONTEXT</span>':e.kind==='live'?'<span class="badge etype">LIVE DATA</span>':'<span class="badge confirmed">SIGNAL</span>';
  const row=e=>'<tr><td class="mono">'+e.id+'</td><td><b>'+esc(e.name)+'</b><br><small class="mut">'+esc(ENG_CL[e.cluster]||e.cluster)+' · '+esc(e.data)+'</small></td><td>'+stat(e)+'<br><small class="mut">'+(e.built==='full'?'complete':e.built==='partial'?'partial':'—')+'</small></td>'+
    '<td><small>'+(e.setups.length?esc(e.setups.join(' · ')):'<span class="mut">—</span>')+'</small></td>'+
    (e.setups.length?'<td>'+mcell(gl[e.id],'no closed live signals')+'</td><td>'+mcell(gb[e.id],'not back-tested')+'</td><td>'+bayes(gl[e.id]&&gl[e.id].n>=(gb[e.id]?gb[e.id].n:0)?gl[e.id]:gb[e.id])+'</td>':'<td colspan="3"><small class="mut">'+(e.kind==='none'?'—':'does not raise signals')+'</small></td>')+
    '<td><small class="mut">'+esc(e.note||'')+'</small></td></tr>';
  const sect=(title,kinds,open)=>{ const D=ENGINE_DEFS.filter(e=>kinds.includes(e.kind)); return '<details class="panel" '+(open?'open':'')+'><summary class="ph" style="cursor:pointer"><h2>'+title+'</h2><span class="sub">'+D.length+' engines</span></summary><div class="pb tw"><table class="t"><tr><th>#</th><th>Engine</th><th>Status</th><th>Setup types</th><th>Live result [95% CI]</th><th>Back-test [95% CI]</th><th>Bayesian rate [90%]</th><th>What is missing / how it works</th></tr>'+D.map(row).join('')+'</table></div></details>'; };
  $('engBody').innerHTML='<div class="grid g4"><div class="metric"><label>Candle engines</label><b>'+cov.signal+'</b><small>raise signals alone</small></div><div class="metric"><label>Live-data engines</label><b>'+cov.live+'</b><small>on candidates</small></div><div class="metric"><label>Context engines</label><b>'+cov.context+'</b><small>gate / rank / measure</small></div><div class="metric"><label>Not built</label><b>'+cov.none+'</b><small>no honest data or method</small></div></div>'+
    sect('SIGNAL ENGINES (CANDLES)',['signal'],true)+sect('LIVE-DATA ENGINES',['live'],false)+sect('CONTEXT ENGINES',['context'],false)+sect('NOT BUILT — AND WHY',['none'],true)+
    '<div class="note">Dependency: engines that read the same underlying event share a cluster ('+Object.keys(ENG_CL).filter(k=>k!=='CTX').map(k=>esc(ENG_CL[k])).join(' · ')+'). A signal\'s "independent clusters" counts each cluster once, so one sweep seen through three lenses is not three confirmations.</div>';
}
function showTab(t){
  UI.tab=t; $('viewTitle').textContent=TITLES[t]||''; Object.keys(TITLES).forEach(x=>{ const e=$('v-'+x); if(e) e.hidden=(x!==t); }); $$('.tab').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));
  if(t==='sigs') renderSignals(); if(t==='radar'){ renderMood(); renderLive(); renderNine(); } if(t==='opps') renderOpps(); if(t==='mkts') renderMarkets(); if(t==='bt') renderBT(); if(t==='perf') renderPerf(); if(t==='eng') renderEngines(); if(t==='sys'){ renderSystem(); renderCoverage(); }
  window.scrollTo(0,0);
}
function seg(id,fn){ const el=$(id); el.onclick=e=>{ const b=e.target.closest('button'); if(!b) return; $$('button',el).forEach(x=>x.classList.toggle('on',x===b)); fn(b.dataset.v); }; }
function setPop(on){ const p=$('setPop'); p.classList.toggle('on',on==null?!p.classList.contains('on'):on); if(p.classList.contains('on')) renderSettings(); }
function fillEngineFilter(){ const el=$('fEng'); if(!el||el.options.length>1) return; ENGINE_DEFS.filter(e=>e.setups.length).forEach(e=>{ const o=document.createElement('option'); o.value=e.id; o.textContent=e.id+' · '+e.name; el.appendChild(o); }); }
function bind(){ fillEngineFilter();
  UI.open={};
  $$('.tab').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
  $('scanBtn').onclick=()=>{ RUN.on=!RUN.on; renderScanBtn(); renderStatus(); toast(RUN.on?'<b>Scanner running</b> — new signals and early alerts will be issued.':'<b>Scanner stopped</b> — markets are still measured and open signals still tracked, but nothing new is issued.','W'); };
  $('testBtn').onclick=()=>{ const s=testSignal(); if(s&&UI.tab!=='sigs') showTab('sigs'); else if(s) renderSignals(); };
  $('clearBtn').onclick=()=>{ REG.sigs=REG.sigs.filter(s=>s.src!=='test'); save(); renderSignals(); };
  $('setBtn').onclick=e=>{ e.stopPropagation(); setPop(); };
  $('presetSel').onchange=e=>{ SET.preset=e.target.value; CAL=null; save(); renderSettings(); if(UI.tab==='sigs') renderSignals(); };
  $('bSound').onclick=()=>{ SET.sound=!SET.sound; $('bSound').textContent=SET.sound?'🔔':'🔕'; if(SET.sound) beep('W'); save(); }; $('bSound').textContent=SET.sound?'🔔':'🔕';
  seg('segLive',v=>{ UI.live=v; renderLive(); }); seg('segPD',v=>{ UI.pd=v; renderLive(); });
  $('selSens').value=String(SET.sens); $('selSens').onchange=e=>{ SET.sens=+e.target.value; save(); renderLive(); };
  seg('segDir',v=>{ UI.dir=v; renderOpps(); }); seg('segStage',v=>{ UI.stage=+v; renderOpps(); });
  $('qSearch').oninput=e=>{ UI.q=e.target.value; renderOpps(); }; $('selVenue').onchange=e=>{ UI.venue=e.target.value; renderOpps(); }; $('selTier').onchange=e=>{ UI.tier=e.target.value; renderOpps(); };
  $('mSearch').oninput=e=>{ UI.mq=e.target.value; renderMarkets(); }; seg('segM',v=>{ UI.mf=v; renderMarkets(); }); seg('segMS',v=>{ UI.ms=v; renderMarkets(); });
  $('fSearch').oninput=e=>{ UI.fq=e.target.value; renderSignals(); }; [['fDir','fdir'],['fGrade','fgrade'],['fHtf','fhtf'],['fConv','fconv'],['fEng','feng'],['fTf','ftf'],['fVenue','fvenue'],['fSort','fsort']].forEach(([id,k])=>{ $(id).onchange=e=>{ UI[k]=e.target.value; renderSignals(); }; });
  $('stRun').onclick=renderSelfTest;
  document.addEventListener('toggle',e=>{ const d=e.target; if(d&&d.tagName==='DETAILS'&&d.dataset&&d.dataset.k) UI.open[d.dataset.k]=d.open; },true);
  document.addEventListener('click',e=>{
    const pop=$('setPop'); if(pop.classList.contains('on')&&!e.target.closest('#setPop')&&!e.target.closest('#setBtn')) setPop(false);
    const t=e.target.closest('[data-sym]'); if(t&&!e.target.closest('summary,details')&&!e.target.closest('#sheet')){ openDetail(t.dataset.sym); return; }
    if(e.target.id==='btRun') runBacktestUI();
    if(e.target.id==='btClear'&&confirm('Delete all recorded signals, alerts and suppressed-setup records from this browser?')){ REG.sigs=[]; REG.alerts=[]; REG.lastKey={}; SUPP.length=0; save(); renderSettings(); renderSignals(); }
    if(e.target.id==='btExport'){ const blob=new Blob([JSON.stringify({exported:new Date().toISOString(),signals:REG.sigs.map(slimSig),alerts:REG.alerts,suppressed:SUPP,backtest:{info:BT.info,trades:BT.trades}},null,1)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='orbit-signals.json'; a.click(); }
    if(e.target.id==='btNotif'&&'Notification' in window){ Notification.requestPermission().then(p=>{ SET.notify=(p==='granted'); save(); toast(p==='granted'?'Browser notifications enabled':'Notifications were not allowed by the browser','W'); }); } });
  document.addEventListener('change',e=>{ const k=e.target.dataset&&e.target.dataset.set; if(!k) return; let v=e.target.value; if(v==='true') v=true; else if(v==='false') v=false; else if(v!==''&&!isNaN(+v)) v=+v; if(k==='acct'&&!(v>=100)) v=SET.acct; SET[k]=v; CAL=null; save(); renderSettings(); if(UI.tab==='sigs') renderSignals(); if(UI.tab==='perf') renderPerf(); if(UI.tab==='bt') renderBT(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ if(UI.sel) closeDetail(); else setPop(false); } });
  window.addEventListener('resize',()=>{ if(UI.sel) renderDetail(); });
}
async function boot(){
  loadAll(); bind(); renderSettings(); renderCoverage(); renderScanBtn(); MK.onStatus=renderStatus; showTab('sigs'); setInterval(tick,1000); setInterval(save,30000);
  window.addEventListener('beforeunload',save);
  const ok=await netStart();
  if(!ok){ $('bootText').textContent='Could not reach Binance — check the network connection (the app will keep retrying only after a reload).'; setTimeout(()=>$('bootOverlay').classList.add('off'),4500); }
  if(ok){ setTimeout(()=>{ deepTick(); setInterval(deepTick,15000); },25000); setTimeout(resumeOpen,20000); }
}
window.addEventListener('DOMContentLoaded',boot);
