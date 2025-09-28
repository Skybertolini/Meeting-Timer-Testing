// index-addon.js — trygg overlay for VT-tidslinje
(function(){
  // --- Minimal CSS ---
  (function ensureCSS(){
    if (document.querySelector('style[data-index-addon]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-index-addon','');
    style.textContent = `
      #timeline .para-slot i.frame-pin{position:absolute;left:50%;transform:translateX(-50%);top:-24px;bottom:auto;width:12px;height:12px;background:url('./img/box-icon.png') center/contain no-repeat;pointer-events:none}
      #timeline .para-slot i.read-pin{position:absolute;left:50%;transform:translateX(-50%);bottom:-24px;top:auto;width:16px;height:16px;background:url('./img/read-icon.png') center/contain no-repeat;pointer-events:none}
      #message{margin-top:22px}
    `;
    document.head.appendChild(style);
  })();

  // Helpers
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
    const s = [...new Set(nums)].sort((a,b)=>a-b);
    if (s.length === 1) return `Avsnitt ${s[0]}`;
    if (s.length === 2 && s[1] === s[0] + 1) return `Avsnittene ${s[0]} og ${s[1]}`;
    return `Avsnittene ${s[0]}–${s[s.length-1]}`;
  }

  function applyGroupAwareTwoTone(){
    const tl = document.getElementById('timeline'); if(!tl) return;
    const slots = Array.from(tl.querySelectorAll('.para-slot')); if(!slots.length) return;
    const groups = getGroups();
    const starts = new Map(); groups.forEach(g=>{ if (g && g.length) starts.set(g[0], g); });
    let tone = false; // false = lys, true = mørk
    let i = 1;
    while (i <= slots.length){
      if (starts.has(i)){
        const g = starts.get(i);
        g.forEach(p => { const el = slots[p-1]; if(!el) return; el.classList.remove('alt'); if (tone) el.classList.add('alt'); });
        tone = !tone;
        i = g[g.length-1] + 1;
      } else {
        const el = slots[i-1]; if (el){ el.classList.remove('alt'); if (tone) el.classList.add('alt'); }
        tone = !tone;
        i++;
      }
    }
  }

  function reflowPinsAndBindMessages(){
    const tl = document.getElementById('timeline'); if(!tl) return;
    const slots = Array.from(tl.querySelectorAll('.para-slot')); if(!slots.length) return;

    const ord = window.__VT_ORD || new Map();
    const frameSet = window.__VT_FRAME_SET || new Set();
    const readSet  = (window.__VT_READ_SET2 instanceof Set) ? window.__VT_READ_SET2 : (window.readSet || new Set());
    const groups = getGroups();
    const starts = new Map(); groups.forEach(g=>{ if (g && g.length) starts.set(g[0], g); });
    function findGroupFor(p){ for (const g of groups){ if (g.includes(p)) return g.slice(); } return [p]; }

    slots.forEach((slot, idx)=>{
      const p = idx + 1;
      const hasF = frameSet.has(p);
      const hasR = readSet.has(p);

      // (Re)place pins
      slot.querySelectorAll('.read-pin,.frame-pin').forEach(n=>n.remove());
      if (hasF || hasR){
        const items = [];
        if (hasF) items.push({type:'frame', order:(ord.get(p)||{}).frame ?? 1});
        if (hasR) items.push({type:'read',  order:(ord.get(p)||{}).read  ?? 2});
        items.sort((a,b)=>(a.order??99)-(b.order??99));
        const gap = 14, base = -((items.length-1)/2)*gap;
        items.forEach((it, i)=>{
          const el = document.createElement('i');
          el.className = it.type==='frame' ? 'frame-pin' : 'read-pin';
          el.style.left = `calc(50% + ${base + i*gap}px)`;
          slot.appendChild(el);
        });
      }

      // message on click
      slot.removeEventListener('click', slot.__addonClick || (()=>{}));
      const handler = ()=>{
        const group = starts.get(p) || findGroupFor(p);
        const msg = document.getElementById('message'); if(!msg) return;
        if (group.length > 1){
          msg.textContent = rangeLabel(group);
        } else {
          const extras=[];
          const o = ord.get(p) || {};
          if (hasF && hasR){
            const f=o.frame ?? 1, r=o.read ?? 2;
            if ((f ?? 99) <= (r ?? 99)) extras.push('Ramme','Les-skriftsted');
            else extras.push('Les-skriftsted','Ramme');
          } else if (hasF) extras.push('Ramme');
          else if (hasR) extras.push('Les-skriftsted');
          msg.textContent = extras.length ? `${rangeLabel([p])} + ${extras.join(' og ')}` : rangeLabel([p]);
        }
      };
      slot.__addonClick = handler;
      slot.addEventListener('click', handler);
    });
  }

  function applyAll(){ try{applyGroupAwareTwoTone();}catch(e){} try{reflowPinsAndBindMessages();}catch(e){} }

  const orig = window.drawTimeline;
  if (typeof orig === 'function'){
    window.drawTimeline = function(){
      const r = orig.apply(this, arguments);
      requestAnimationFrame(applyAll);
      return r;
    };
  }
  const obs = new MutationObserver(()=>requestAnimationFrame(applyAll));
  function startObs(){
    const tl=document.getElementById('timeline');
    if (tl) obs.observe(tl, {childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ applyAll(); startObs(); });
  } else {
    applyAll(); startObs(); 
  }
})();
