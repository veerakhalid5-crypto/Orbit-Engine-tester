/* ================================================================
   APPLICATION — browser-only parts: UI state, persistence (localStorage), alerts (sound / toast / notification)
   The signal pipeline itself lives in runtime.js (shared with the Node server) and talks to this file through HOOKS.
   ================================================================ */
const LS_KEY='orbit17_v1', LS_BT='orbit17_bt1';
const UI={tab:'sigs',dir:'L',stage:1,venue:'',tier:'',q:'',live:'live',pd:'all',mq:'',mf:'',ms:'q',sel:null,selTf:1,fq:'',fdir:'',fgrade:'',fhtf:'',fconv:'',feng:'',ftf:'',fvenue:'',fsort:'t',arrived:{},layers:{plan:1,engine:1,vp:1,levels:1,zones:1,structure:1}};
let toastN=0, audioCtx=null;
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const $q=(s,r)=>(r||document).querySelector(s), $$=(s,r)=>[].slice.call((r||document).querySelectorAll(s));
const money=x=>'$'+fmtMoney(x||0), pc=(x,d)=>fin(x)?(x>=0?'+':'')+x.toFixed(d==null?2:d)+'%':'–';
const hhmm=t=>{ const d=new Date(t*1000); return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); };
const dhm=t=>{ const d=new Date(t*1000); return d.toLocaleDateString([], {month:'short',day:'numeric'})+' '+hhmm(t); };
const ago=sec=>{ sec=Math.max(0,sec|0); return sec<90?sec+'s':sec<5400?Math.round(sec/60)+'m':(sec/3600).toFixed(1)+'h'; };

/* ---------------- persistence ---------------- */
function save(){
  try{ const sigs=REG.sigs; const keep=REG.sigs; REG.sigs=keep.map(slimSig); const txt=REG.dump(); REG.sigs=keep;
    localStorage.setItem(LS_KEY,JSON.stringify({set:SET,reg:txt,supp:SUPP.slice(0,100),ui:{dir:UI.dir,sens:SET.sens}}));
  }catch(e){ /* storage full or blocked: the signals stay in memory; try again with a smaller history */
    try{ const keep=REG.sigs; REG.sigs=keep.slice(-150).map(slimSig); const txt=REG.dump(); REG.sigs=keep; localStorage.setItem(LS_KEY,JSON.stringify({set:SET,reg:txt,supp:[],ui:{}})); }catch(e2){} }
}
function saveBT(){ try{ localStorage.setItem(LS_BT,JSON.stringify(BT)); }catch(e){} }
function loadAll(){
  try{ const o=JSON.parse(localStorage.getItem(LS_KEY)||'null'); if(o){ Object.assign(SET,o.set||{}); if(o.reg) REG.load(o.reg); (o.supp||[]).forEach(x=>SUPP.push(x)); } }catch(e){}
  try{ const b=JSON.parse(localStorage.getItem(LS_BT)||'null'); if(b&&b.trades){ BT.trades=b.trades; BT.alerts=b.alerts||[]; BT.at=b.at||0; BT.info=b.info||null; } }catch(e){}
  /* signals that were still open when the page was closed: the missed minutes are replayed from exchange history once data is loaded (see resumeOpen) */
}

/* ---------------- alerts ---------------- */
function beep(kind){
  if(!SET.sound) return; try{ audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)(); const o=audioCtx.createOscillator(), g=audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination);
    o.type='sine'; o.frequency.value=kind==='S'?330:kind==='W'?520:660; g.gain.setValueAtTime(.0001,audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(.18,audioCtx.currentTime+.02); g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.28); o.start(); o.stop(audioCtx.currentTime+.3);
    if(kind==='L'||kind==='S'){ const o2=audioCtx.createOscillator(), g2=audioCtx.createGain(); o2.connect(g2); g2.connect(audioCtx.destination); o2.type='sine'; o2.frequency.value=kind==='S'?247:880; g2.gain.setValueAtTime(.0001,audioCtx.currentTime+.14); g2.gain.exponentialRampToValueAtTime(.16,audioCtx.currentTime+.16); g2.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.45); o2.start(audioCtx.currentTime+.14); o2.stop(audioCtx.currentTime+.5); } }catch(e){}
}
function toast(html,cls,sym){
  const box=$('toast'); const d=document.createElement('div'); d.className=cls||''; d.innerHTML=html; if(sym){ d.style.cursor='pointer'; d.onclick=()=>{ openDetail(sym); d.remove(); }; }
  if(!sym) d.onclick=()=>d.remove(); box.appendChild(d); const maxT=window.innerWidth<600?2:4; while(box.children.length>maxT) box.firstChild.remove(); setTimeout(()=>d.remove(),cls==='warn'||!sym?8000:12000);
}
function notify(title,body){ if(!SET.notify||!('Notification' in window)||Notification.permission!=='granted') return; try{ new Notification(title,{body}); }catch(e){} }
function announceSignal(sig,rec){
  const L=sig.dir>0, p=sig.plan, nm=symName(rec);
  toast('<b class="'+(L?'up':'dn')+'">'+(sig.src==='test'?'TEST ':'')+(L?'LONG':'SHORT')+' SIGNAL · '+esc(nm)+'</b> <span class="mut mono">'+esc(sig.etype||sig.label)+(sig.htfTag&&sig.htfTag!=='UNKNOWN'?' · HTF '+sig.htfTag.toLowerCase():'')+'</span><br><span class="mono">entry '+pf(sig.px)+' · SL '+pf(p.sl)+' · TP1 '+pf(p.tps[0].p)+' · R:R '+p.tps[1].r.toFixed(1)+'</span><br><span class="mut" style="font-size:12px">'+(sig.src==='test'?'pipeline test — not an engine signal, excluded from statistics':'evidence '+Math.round(sig.score)+'/100 · '+sig.fams+' families agree · tap for details')+'</span>',L?'':'S',rec.sym);
  beep(L?'L':'S'); if(SET.vibrate&&navigator.vibrate) try{ navigator.vibrate([120,60,120]); }catch(e){}
  notify((L?'LONG ':'SHORT ')+nm+' — '+sig.label,'Entry '+pf(sig.px)+' · SL '+pf(p.sl)+' · TP1 '+pf(p.tps[0].p));
}
function announceWatch(al,rec){
  if(!SET.alertStage||al.stage<SET.alertStage) return; const L=al.dir>0, nm=symName(rec), ex=al.stage===5;
  toast('<b class="'+(ex?'vio':'amb')+'">'+(ex?(L?'EXHAUSTION WARNING (pump)':'CAPITULATION / BOUNCE RISK'):(L?'EARLY LONG WATCH':'EARLY SHORT WATCH'))+' · '+esc(nm)+'</b> <span class="mut mono">'+esc(al.label)+'</span><br><span class="mut" style="font-size:12px">stage '+al.stage+' · evidence '+Math.round(al.score)+'/100 · '+(ex?'late entries here are dangerous':'this is NOT a trade signal — it becomes one only after confirmation')+'</span>','W',rec.sym);
  beep('W'); notify((L?'Early long watch: ':'Early short watch: ')+nm,al.label);
}
function announceClose(s){
  const t=s.trade, L=s.dir>0; toast('<b>'+(t.outcome==='WIN'?'✔ ':t.outcome==='LOSS'?'✖ ':'• ')+esc(symName(MK.syms.get(s.sym)||{base:s.sym}))+' '+(L?'LONG':'SHORT')+' closed: '+t.outcome+'</b> <span class="mono">'+(t.R>=0?'+':'')+t.R.toFixed(2)+'R</span><br><span class="mut" style="font-size:12px">'+esc(t.exitWhy||'')+'</span>',t.outcome==='WIN'?'':'W',s.sym);
}

function testSignal(){ const s=makeTestSignal(); if(!s) toast('Market data is still loading — try again in a moment','W'); return s; }

/* ---------------- wiring: the shared runtime reports events through HOOKS ---------------- */
HOOKS.signal=(s,rec)=>{ UI.arrived[s.id]=Date.now(); announceSignal(s,rec); };
HOOKS.watch=announceWatch; HOOKS.closed=announceClose; HOOKS.persist=save;
HOOKS.sel=()=>UI.sel; HOOKS.cardChk=()=>UI.cardChk;
