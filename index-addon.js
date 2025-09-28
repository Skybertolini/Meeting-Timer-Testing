// index-addon.js — v1.68
// Fix: Timeline is only locked WHILE playing. When paused/stopped, you can click/seek freely.
(function(){
  // --- CSS (icons; lock class only disables input, not visuals) ---
  (function ensureCSS(){
    const id='data-index-addon';
    if (document.querySelector(`style[${id}]`)) return;
    const style=document.createElement('style');
    style.setAttribute(id,'');
    style.textContent = `
      #timeline .para-slot i.frame-pin{position:absolute;left:50%;transform:translateX(-50%);top:-14px;bottom:auto;width:12px;height:12px;background:url('./img/box-icon.png') center/contain no-repeat;pointer-events:none}
      #timeline .para-slot i.read-pin{position:absolute;left:50%;transform:translateX(-50%);bottom:-14px;top:auto;width:16px;height:16px;background:url('./img/read-icon.png') center/contain no-repeat;pointer-events:none}
      #timeline.timeline-locked{ pointer-events:none; opacity:1; }
    `;
    document.head.appendChild(style);
  })();

  // ---- Playing state (robust heuristics) ----
  let isPlaying = false;
  let inactivityTimer = null;
  let recentChangeTs = 0;
  const CHANGE_BURST_MS = 500;  // two updates within this = playing
  const INACTIVITY_MS = 1200;   // no updates for this long = not playing

  function setPlaying(on){
    isPlaying = !!on;
    const tl = document.getElementById('timeline');
    if (tl) tl.classList.toggle('timeline-locked', isPlaying);
  }
  function noteMessageUpdate(){
    const now = performance.now ? performance.now() : Date.now();
    if (now - recentChangeTs < CHANGE_BURST_MS) {
      setPlaying(true);
    }
    recentChangeTs = now;
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(()=> setPlaying(false), INACTIVITY_MS);
  }

  // ---- Helpers ----
  function parseGroupsString(str){
    if (!str || typeof str !== 'string') return [];
    return str.split(',').map(s=>s.trim()).flatMap(token=>{
      const m = token.match(/^(\d+)(?:-(\d+))?$/);
      if (!m) return [];
      const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
      const arr=[]; for (let x=a; x<=b; x++) arr.push(x);
      return [arr];
    });
  }
  function getGroups(){
    if (Array.isArray(window.__VT_GROUPS)) return window.__VT_GROUPS;
    const it = window.currentItem || window.ITEM || null;
    if (it && typeof it.groups === 'string') return parseGroupsString(it.groups);
    return [];
  }
  function rangeLabel(nums){
    const s=[...new Set(nums)].sort((a,b)=>a-b);
    if (s.length===1) return `Avsnitt ${s[0]}`;
    if (s.length===2 && s[1]===s[0]+1) return `Avsnittene ${s[0]} og ${s[1]}`;
    return `Avsnittene ${s[0]}–${s[s.length-1]}`;
  }

  // ---- Two-tone (groups as one block) ----
  function applyGroupAwareTwoToneStrict(){
    const tl=document.getElementById('timeline'); if(!tl) return;
    const slots=Array.from(tl.querySelectorAll('.para-slot')); if(!slots.length) return;
    slots.forEach(el=>{ el.classList.remove('alt-alt','group-alt','grp','group','galt','alt'); el.style.background=''; el.style.backgroundImage=''; el.style.backgroundColor=''; });
    const groups=getGroups(); const starts=new Map(); groups.forEach(g=>{ if (g && g.length) starts.set(g[0], g); });
    let tone=false; let i=1;
    while(i<=slots.length){
      if(starts.has(i)){
        const g=starts.get(i);
        g.forEach(p=>{ const el=slots[p-1]; if (el && tone) el.classList.add('alt'); });
        tone=!tone; i=g[g.length-1]+1;
      }else{
        const el=slots[i-1]; if (el && tone) el.classList.add('alt');
        tone=!tone; i++;
      }
    }
  }

  // ---- Pins + click messages (respects lock) ----
  function layoutPinsAndBindMessages(){
    const tl=document.getElementById('timeline'); if(!tl) return;
    const slots=Array.from(tl.querySelectorAll('.para-slot')); if(!slots.length) return;

    const ord = window.__VT_ORD || new Map();
    const frameSet = window.__VT_FRAME_SET || new Set();
    const readSet  = (window.__VT_READ_SET2 instanceof Set) ? window.__VT_READ_SET2 : (window.readSet || new Set());

    const groups=getGroups(); const starts=new Map(); groups.forEach(g=>{ if (g && g.length) starts.set(g[0], g); });
    function findGroupFor(p){ for(const g of groups){ if (g.includes(p)) return g.slice(); } return [p]; }
    function buildSingleMsg(p){
      const o = ord.get(p) || {};
      const hasF = frameSet.has(p);
      const hasR = readSet.has(p);
      if (!hasF && !hasR) return rangeLabel([p]);
      if (hasF && hasR){
        const f=o.frame ?? 1, r=o.read ?? 2;
        return ( (f ?? 99) <= (r ?? 99) )
          ? `${rangeLabel([p])} + Ramme og Les-skriftsted`
          : `${rangeLabel([p])} + Les-skriftsted og Ramme`;
      }
      return hasF ? `${rangeLabel([p])} + Ramme` : `${rangeLabel([p])} + Les-skriftsted`;
    }
    function buildMsgFor(p){
      const g = starts.get(p) || findGroupFor(p);
      if (g.length>1) return rangeLabel(g);
      return buildSingleMsg(p);
    }
    window.__VT_BUILD_MSG_FOR = buildMsgFor;

    slots.forEach((slot, idx)=>{
      const p=idx+1;
      const hasF=frameSet.has(p), hasR=readSet.has(p);
      // pins
      slot.querySelectorAll('.read-pin,.frame-pin').forEach(n=>n.remove());
      if (hasF || hasR){
        const items=[];
        if (hasF) items.push({type:'frame', order:(ord.get(p)||{}).frame ?? 1});
        if (hasR) items.push({type:'read',  order:(ord.get(p)||{}).read  ?? 2});
        items.sort((a,b)=>(a.order??99)-(b.order??99));
        const gap=14, base=-((items.length-1)/2)*gap;
        items.forEach((it,i)=>{
          const el=document.createElement('i');
          el.className = it.type==='frame' ? 'frame-pin' : 'read-pin';
          el.style.left = `calc(50% + ${base + i*gap}px)`;
          slot.appendChild(el);
        });
      }
      // click -> message (skip if playing)
      slot.removeEventListener('click', slot.__addonClick || (()=>{}), true);
      const handler=(ev)=>{
        if (isPlaying){ ev.stopPropagation(); ev.preventDefault(); return; }
        const msg = document.getElementById('message'); if(!msg) return;
        msg.textContent = buildMsgFor(p);
      };
      slot.__addonClick = handler;
      slot.addEventListener('click', handler, true);
    });
  }

  // ---- Persistent message + playback detection ----
  function observeMessageAndNormalize(){
    const msg = document.getElementById('message'); if(!msg) return;
    const buildMsgFor = window.__VT_BUILD_MSG_FOR || (p => `Avsnitt ${p}`);

    let lastText = msg.textContent || '';
    const normalize = () => {
      const text = (msg.textContent || '').trim();
      if (text !== lastText) { lastText = text; noteMessageUpdate(); }
      const m = text.match(/^Avsnitt\s+(\d+)(?:\b|$)/);
      if (m){
        const p = Number(m[1]);
        const desired = buildMsgFor(p);
        if (desired && text !== desired) msg.textContent = desired;
      }
    };
    const obs = new MutationObserver(()=> normalize());
    obs.observe(msg, {childList:true, characterData:true, subtree:true});
    normalize();
  }

  // ---- Recognize Play/Pause/Stop controls (best-effort) ----
  function bindPlayPauseButtons(){
    const click = (on)=> (e)=>{ setPlaying(on); };
    document.addEventListener('click', (e)=>{
      const t = e.target;
      if (!t) return;
      const s = (txt)=> (txt||'').toLowerCase();
      const text=s(t.textContent), title=s(t.getAttribute?.('title')), aria=s(t.getAttribute?.('aria-label')), cls=s(t.className);
      const isPlay = /play|▶|⏵|start|spill av|avspill/.test(text+title+aria+cls);
      const isPauseStop = /pause|⏸|stop|⏹|stopp/.test(text+title+aria+cls);
      if (isPlay) setPlaying(true);
      if (isPauseStop) setPlaying(false);
    }, true);
  }

  // ---- Unlock safeguards ----
  function addUnlockGuards(){
    const tl = document.getElementById('timeline'); if(!tl) return;
    tl.addEventListener('mouseenter', ()=>{ if (!isPlaying) setPlaying(false); }, true);
    tl.addEventListener('mouseleave', ()=>{ if (!isPlaying) setPlaying(false); }, true);
    document.addEventListener('visibilitychange', ()=>{ if (document.visibilityState==='hidden') setPlaying(false); });
  }

  function applyAll(){
    applyGroupAwareTwoToneStrict();
    layoutPinsAndBindMessages();
    observeMessageAndNormalize();
    bindPlayPauseButtons();
    addUnlockGuards();
  }

  const orig = window.drawTimeline;
  if (typeof orig === 'function'){
    window.drawTimeline = function(){
      const r = orig.apply(this, arguments);
      requestAnimationFrame(applyAll);
      return r;
    };
  }
  const obs=new MutationObserver(()=>requestAnimationFrame(applyAll));
  function startObs(){ const tl=document.getElementById('timeline'); if(tl) obs.observe(tl,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']}); }
  if (document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', ()=>{ applyAll(); startObs(); }); }
  else { applyAll(); startObs(); }
})();
