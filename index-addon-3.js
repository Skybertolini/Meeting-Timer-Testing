// index-addon.js — v1.65
// New: keep group label visible while timer runs (message-normalizer on updates)
// Also: strict two-tone with groups as one block, icons closer to timeline, single-para a/b ordering
(function(){
  // --- CSS: icons close to the timeline ---
  (function ensureCSS(){
    const id='data-index-addon';
    if (document.querySelector(`style[${id}]`)) return;
    const style=document.createElement('style');
    style.setAttribute(id,'');
    style.textContent = `
      #timeline .para-slot i.frame-pin{position:absolute;left:50%;transform:translateX(-50%);top:-14px;bottom:auto;width:12px;height:12px;background:url('./img/box-icon.png') center/contain no-repeat;pointer-events:none}
      #timeline .para-slot i.read-pin{position:absolute;left:50%;transform:translateX(-50%);bottom:-14px;top:auto;width:16px;height:16px;background:url('./img/read-icon.png') center/contain no-repeat;pointer-events:none}
    `;
    document.head.appendChild(style);
  })();

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

  function layoutPinsAndBindMessages(){
    const tl=document.getElementById('timeline'); if(!tl) return;
    const slots=Array.from(tl.querySelectorAll('.para-slot')); if(!slots.length) return;

    const ord = window.__VT_ORD || new Map();
    const frameSet = window.__VT_FRAME_SET || new Set();
    const readSet  = (window.__VT_READ_SET2 instanceof Set) ? window.__VT_READ_SET2 : (window.readSet || new Set());
    const groups=getGroups(); const starts=new Map(); groups.forEach(g=>{ if (g && g.length) starts.set(g[0], g); });
    function findGroupFor(p){ for(const g of groups){ if (g.includes(p)) return g.slice(); } return [p]; }

    slots.forEach((slot, idx)=>{
      const p=idx+1;
      const hasF=frameSet.has(p), hasR=readSet.has(p);
      // rebuild pins
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

      // click -> build message
      slot.removeEventListener('click', slot.__addonClick || (()=>{}));
      const handler=()=>{
        const group = starts.get(p) || findGroupFor(p);
        const msg = document.getElementById('message'); if(!msg) return;
        if (group.length > 1){
          msg.textContent = rangeLabel(group);
          return;
        }
        const o = ord.get(p) || {};
        const hasFrame = frameSet.has(p);
        const hasRead  = readSet.has(p);
        if (!hasFrame && !hasRead){
          msg.textContent = rangeLabel([p]);
          return;
        }
        if (hasFrame && hasRead){
          const f = o.frame ?? 1;
          const r = o.read  ?? 2;
          msg.textContent = ( (f ?? 99) <= (r ?? 99) )
            ? `${rangeLabel([p])} + Ramme og Les-skriftsted`
            : `${rangeLabel([p])} + Les-skriftsted og Ramme`;
        } else if (hasFrame){
          msg.textContent = `${rangeLabel([p])} + Ramme`;
        } else {
          msg.textContent = `${rangeLabel([p])} + Les-skriftsted`;
        }
      };
      slot.__addonClick = handler;
      slot.addEventListener('click', handler);
    });
  }

  // Keep group label during playback by normalizing message updates
  function observeMessageAndNormalize(){
    const msg = document.getElementById('message'); if(!msg) return;
    const groups = getGroups();
    if (!groups.length) return;

    const map = new Map();
    groups.forEach(g => g.forEach(p => map.set(p, g)));

    const normalize = () => {
      const text = (msg.textContent || '').trim();
      const m = text.match(/^Avsnitt\s+(\d+)(?:\b|$)/);
      if (!m) return;
      const p = Number(m[1]);
      const grp = map.get(p);
      if (grp && grp.length > 1){
        const label = rangeLabel(grp);
        if (text !== label) msg.textContent = label;
      }
    };

    const obs = new MutationObserver(() => normalize());
    obs.observe(msg, {childList:true, characterData:true, subtree:true});
    normalize();
  }

  function applyAll(){ applyGroupAwareTwoToneStrict(); layoutPinsAndBindMessages(); observeMessageAndNormalize(); }

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
