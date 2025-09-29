// index-addon.js — v1.73
// Kun to farger på tidslinjen (lys/mørk). Grupper arver første avsnitts farge, veksling fortsetter etter gruppa.
// Beholder alt fra v1.72: pinner, meldinger (inkl. Ramme/Les og a/b), tellere, “ignorer klikk under Play”.

(function(){
  /* ---------- Minimal CSS for pins ---------- */
 (function ensureCSS(){
  if (document.querySelector('style[data-index-addon]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-index-addon','');
  style.textContent = `
    /* Pins (som før) */
    #timeline .para-slot i.frame-pin{
      position:absolute; left:50%; transform:translateX(-50%);
      top:-14px; bottom:auto; width:12px; height:12px;
      background:url('./img/box-icon.png') center/contain no-repeat; pointer-events:none;
    }
    #timeline .para-slot i.read-pin{
      position:absolute; left:50%; transform:translateX(-50%);
      bottom:-14px; top:auto; width:16px; height:16px;
      background:url('./img/read-icon.png') center/contain no-repeat; pointer-events:none;
    }

    /* NYTT: Konsistent tallstørrelse i tidslinjen */
    #timeline .para-slot{
      font-size: 12px;           /* match den minste størrelsen */
      line-height: 1.2;          /* stabil vertikal plassering */
      font-variant-numeric: tabular-nums; /* jevn bredde */
    }
    #timeline .para-slot *{
      font-size: inherit !important;   /* ikke la barn blåse opp fonten */
      line-height: inherit;
    }
    #timeline .para-slot b,
    #timeline .para-slot strong{
      font-weight: 600;               /* ok å være fet, men ikke større */
      font-size: inherit !important;
    }
  `;
  document.head.appendChild(style);
})();

  /* ---------- Utils ---------- */
  const $ = (sel, root=document)=> root.querySelector(sel);
  const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));

  function parseGroupsString(str){
    if (!str || typeof str !== 'string') return [];
    return str.split(',').map(s=>s.trim()).flatMap(tok=>{
      const m = tok.match(/^(\d+)(?:-(\d+))?$/); if(!m) return [];
      const a=+m[1], b=m[2]?+m[2]:a; const arr=[]; for(let i=a;i<=b;i++) arr.push(i); return [arr];
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

  /* ---------- To-toner med grupper som blokk (kun lys/mørk) ---------- */
  function applyTwoToneWithGroups(){
    const tl = $('#timeline'); if(!tl) return;
    const slots = $$('.para-slot', tl); if(!slots.length) return;

    // 1) Nullstill all gruppe-spesifikk farging – vi tillater KUN klassen 'alt' som mørk tone.
    slots.forEach(el=>{
      el.classList.remove('alt-alt','group-alt','grp','group','galt','tone-a','tone-b','tone-c','tone-d','alt');
      el.style.background=''; el.style.backgroundImage=''; el.style.backgroundColor='';
    });

    // 2) Alternér: false = lys (ingen 'alt'), true = mørk ('alt').
    const groups = getGroups();
    const starts = new Map(); groups.forEach(g=>{ if (g && g.length) starts.set(g[0], g); });

    let dark = false; // starter lys
    let i = 1;
    while (i <= slots.length){
      if (starts.has(i)){
        const g = starts.get(i);
        g.forEach(p => { const el = slots[p-1]; if (!el) return; if (dark) el.classList.add('alt'); });
        dark = !dark;                // flip ÉN gang for hele gruppa
        i = g[g.length - 1] + 1;     // hopp til etter gruppa
      } else {
        const el = slots[i-1]; if (el && dark) el.classList.add('alt');
        dark = !dark;
        i++;
      }
    }
  }

  /* ---------- Data fra basiskoden ---------- */
  const getReadSet  = ()=> window.__VT_READ_SET2 instanceof Set ? window.__VT_READ_SET2 : (window.readSet || new Set());
  const getFrameSet = ()=> window.__VT_FRAME_SET instanceof Set ? window.__VT_FRAME_SET : new Set();
  const getOrd      = ()=> window.__VT_ORD instanceof Map ? window.__VT_ORD : new Map();

  function getParaCount(){
    const it = window.currentItem || window.ITEM || null;
    if (it && Array.isArray(it.words)) return it.words.length;
    if (it && Array.isArray(it.para_lengths)) return it.para_lengths.length;
    const tl = $('#timeline'); if (tl) return $$('.para-slot', tl).length;
    return 0;
  }

  /* ---------- Meldingsbygger (uendret logikk) ---------- */
  function buildSingleMsg(p){
    const ord=getOrd(), frames=getFrameSet(), reads=getReadSet();
    const o=ord.get(p)||{}, hasF=frames.has(p), hasR=reads.has(p);
    if (!hasF && !hasR) return rangeLabel([p]);
    if (hasF && hasR){
      const f=o.frame ?? 1, r=o.read ?? 2;
      return ((f ?? 99) <= (r ?? 99))
        ? `${rangeLabel([p])} + Ramme og Les-skriftsted`
        : `${rangeLabel([p])} + Les-skriftsted og Ramme`;
    }
    return hasF ? `${rangeLabel([p])} + Ramme` : `${rangeLabel([p])} + Les-skriftsted`;
  }
  function buildGroupMsg(g){
    const frames=getFrameSet(), reads=getReadSet();
    const hasFrameAny = g.some(p => frames.has(p));
    const hasReadAny  = g.some(p => reads.has(p));
    let label = rangeLabel(g);
    if (hasFrameAny && hasReadAny) label += ` + Ramme og Les-skriftsted`;
    else if (hasFrameAny)          label += ` + Ramme`;
    else if (hasReadAny)           label += ` + Les-skriftsted`;
    return label;
  }
  function buildMsgFor(p){
    const groups=getGroups();
    for (const g of groups){ if (g.includes(p)) return buildGroupMsg(g); }
    return buildSingleMsg(p);
  }

  /* ---------- Pins ---------- */
  function layoutPins(){
    const tl = $('#timeline'); if(!tl) return;
    const slots = $$('.para-slot', tl); if(!slots.length) return;
    const ord=getOrd(), frames=getFrameSet(), reads=getReadSet();
    slots.forEach((slot, idx)=>{
      const p=idx+1, hasF=frames.has(p), hasR=reads.has(p);
      $$('.read-pin,.frame-pin', slot).forEach(n=>n.remove());
      if (!hasF && !hasR) return;
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
    });
  }

  /* ---------- Infofelt-tellere ---------- */
  function findInfoPanel(){
    const candidates = [
      '#article-info','#articleInfo','#article-panel','#articlePanel',
      '.article-info','.article-meta','.article-details','#info'
    ];
    for (const sel of candidates){ const el = $(sel); if (el) return el; }
    return null;
  }
  function updateStats(){
    const panel = findInfoPanel(); if (!panel) return;
    const paraCount = getParaCount();
    const readCount = getReadSet().size;
    const frameCount= getFrameSet().size;

    const setText = (sel, text)=>{
      const el = $(sel, panel);
      if (el) el.textContent = text;
      return !!el;
    };
    const updated =
      setText('#paraCount', String(paraCount)) |
      setText('#readCount', String(readCount)) |
      setText('#frameCount', String(frameCount));

    if (!updated){
      if (!$('#vt-stats', panel)){
        const div = document.createElement('div');
        div.className = 'vt-stats'; div.id = 'vt-stats';
        div.innerHTML = `
          <span><b>Avsnitt:</b> <span id="vt-paras">${paraCount}</span></span>
          <span>📖 <b>Les-skriftsteder:</b> <span id="vt-reads">${readCount}</span></span>
          <span><img class="ic" src="./img/box-icon.png" alt=""> <b>Rammer:</b> <span id="vt-frames">${frameCount}</span></span>
        `;
        panel.appendChild(div);
      } else {
        $('#vt-paras', panel).textContent  = String(paraCount);
        $('#vt-reads', panel).textContent  = String(readCount);
        $('#vt-frames', panel).textContent = String(frameCount);
      }
    }
  }

  /* ---------- Spiller/ikke spiller (bruk sidens lock/gråing) ---------- */
  let isPlaying = false;
  window.__VT_SET_PLAYING = (on)=>{ isPlaying = !!on; };

  const lockPanel = findInfoPanel();
  function panelLooksLocked(el){
    if (!el) return false;
    const cls = (el.className||'').toLowerCase();
    if (/(^|\s)(playing|is-playing|running|locked|disabled|dim|inactive)(\s|$)/.test(cls)) return true;
    const cs = getComputedStyle(el);
    if (cs.pointerEvents === 'none') return true;
    const f = cs.filter || '';
    if (/grayscale\(\s*(0\.[3-9]|[1-9]|\d+\.\d+)\s*\)/.test(f)) return true;
    return false;
  }
  if (lockPanel){
    const updatePlaying = ()=>{ isPlaying = panelLooksLocked(lockPanel); };
    const obs = new MutationObserver(updatePlaying);
    obs.observe(lockPanel, {attributes:true, attributeFilter:['class','style']});
    updatePlaying();
  }

  /* ---------- Interaksjon på tidslinjen ---------- */
  function bindSlotClicks(){
    const tl = $('#timeline'); if(!tl) return;
    const slots = $$('.para-slot', tl); if(!slots.length) return;
    slots.forEach((slot, idx)=>{
      const p=idx+1;
      if (slot.__vtBound) return;
      slot.__vtBound = true;
      slot.addEventListener('click', ()=>{
        if (isPlaying) return; // under Play: ignorér tidslinje-klikk
        const msg = $('#message'); if (!msg) return;
        msg.textContent = buildMsgFor(p);
      });
    });
  }

  /* ---------- Hold melding stabil ---------- */
  function keepMessageStable(){
    const msg = $('#message'); if(!msg) return;
    const mo = new MutationObserver(()=>{
      const text = (msg.textContent || '').trim();
      const m = text.match(/^Avsnitt\s+(\d+)(?:\b|$)/);
      if (!m) return;
      const p = Number(m[1]);
      const desired = buildMsgFor(p);
      if (desired && text !== desired) msg.textContent = desired;
    });
    mo.observe(msg, {childList:true, characterData:true, subtree:true});
  }

  /* ---------- Init ---------- */
  function applyAll(){
    applyTwoToneWithGroups(); // <— kun to farger
    layoutPins();
    bindSlotClicks();
    keepMessageStable();
    updateStats();
  }

  const orig = window.drawTimeline;
  if (typeof orig === 'function'){
    window.drawTimeline = function(){
      const r = orig.apply(this, arguments);
      requestAnimationFrame(applyAll);
      return r;
    };
  } else {
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', applyAll);
    } else {
      applyAll();
    }
  }
})();
