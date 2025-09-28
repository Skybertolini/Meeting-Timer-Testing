// index-addon.js — v1.63
// Tweaks: (1) strict two-tone with group-as-one-block, (2) tighter icon offsets
(function(){
  // --- CSS: tighten icon offsets (closer to timeline) ---
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

  // --- Helpers ---
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

  // --- Strict two-tone: groups treated as one block; no custom group colors ---
  function applyGroupAwareTwoToneStrict(){
    const tl=document.getElementById('timeline'); if(!tl) return;
    const slots=Array.from(tl.querySelectorAll('.para-slot')); if(!slots.length) return;

    // 1) Reset any previous per-slot coloring classes/styles that could force a third tone
    slots.forEach(el=>{
      el.classList.remove('alt-alt','group-alt','grp','group','galt');
      el.style.background=''; el.style.backgroundImage=''; el.style.backgroundColor='';
      el.classList.remove('alt'); // we'll re-apply below
    });

    // 2) Compute tones where a group shares the first member's tone
    const groups=getGroups();
    const starts=new Map(); groups.forEach(g=>{ if (g && g.length) starts.set(g[0], g); });
    let tone=false; // false=light (no 'alt'), true=dark ('alt')
    let i=1;
    while(i<=slots.length){
      if(starts.has(i)){
        const g=starts.get(i);
        g.forEach(p=>{ const el=slots[p-1]; if(!el) return; if(tone) el.classList.add('alt'); });
        tone=!tone;
        i=g[g.length-1]+1;
      }else{
        const el=slots[i-1]; if(el && tone) el.classList.add('alt');
        tone=!tone;
        i++;
      }
    }
  }

  // Keep previous pin placement & messages (from your current add-on) if present
  function reflowPinsAndBindMessagesIfAvailable(){
    if (typeof window.drawTimeline === 'function'){
      // assume existing handlers will run; we only redo colors here
      return;
    }
  }

  function applyAll(){ applyGroupAwareTwoToneStrict(); }

  // Hook after base draw
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
