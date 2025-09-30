// index-addon.js — v1.75 + group labels (refined)
// Two tones only; groups share first tone and we flip after whole group.
// Re-applies on any timeline DOM change (fix for timing where groups wasn't ready).
// NEW: One shared overlay label per group ("4&5" / "10–12"), centered across the group's total width,
// with the same typography as the slot numbers. Numbers inside grouped slots are hidden.

(function(){
  /* ========== CSS (base + overlays) ========== */
  (function ensureCSS(){
    if (document.querySelector('style[data-index-addon]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-index-addon','');
    style.textContent = `
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
      :root{
        --vt-tone-light: #EAF4EE;
        --vt-tone-dark:  #CFE7D6;
      }

      /* Ensure overlay positioning works */
      #timeline{ position:relative; }

      #timeline .para-slot{
        background-color: var(--vt-tone-light) !important;
        background-image: none !important;
        font-size: 12px;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
      }
      #timeline .para-slot.alt{
        background-color: var(--vt-tone-dark) !important;
        background-image: none !important;
      }
      #timeline .para-slot *{
        font-size: inherit !important;
        line-height: inherit;
      }
      #timeline .para-slot.active,
      #timeline .para-slot.current,
      #timeline .para-slot.selected,
      #timeline .para-slot.is-active{
        background-color: inherit !important;
        background-image: none !important;
      }
      #timeline .para-slot::before,
      #timeline .para-slot::after{ background: none !important; }

      .vt-stats{ display:flex; gap:12px; align-items:center; font-size:.95em; opacity:.9; flex-wrap:wrap }
      .vt-stats b{ font-weight:600 }
      .vt-stats .ic{ width:14px; height:14px; vertical-align:middle; margin-right:6px; }

      /* === NEW: group overlay labels matching slot number styling === */
      #timeline .vt-group-overlays{
        position:absolute; left:0; top:0; right:0; bottom:0;
        pointer-events:none;
      }
      #timeline .vt-group-overlay{
        position:absolute; top:0; height:100%;
        display:flex; align-items:center; justify-content:center;
        font-weight: 600;           /* same as slot numbers */
        font-size: 12px;            /* same as slot numbers */
        line-height: 1.2;
        color: inherit;
        opacity: .95;
      }
      /* Hide numbers inside grouped slots (overlay shows the shared label) */
      #timeline .para-slot.vt-in-group{ color: transparent !important; }
      #timeline .para-slot.vt-in-group *{ color: transparent !important; }
    `;
    document.head.appendChild(style);
  })();

  /* ========== utils ========== */
  const $ = (sel, root=document)=> root.querySelector(sel);
  const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));

  function parseGroupsString(str){
    if (!str || typeof str !== 'string') return [];
    return str.split(',').map(s=>s.trim()).flatMap(tok=>{
      const m = tok.match(/^(\d+)(?:-(\d+))?$/); if(!m) return [];
      const a=+m[1], b=m[2]?+m[2]:a; const arr=[]; for(let i=a;i<=b;i++) arr.push(i);
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

  /* ========== two-tone with groups as one block ========== */
  function applyTwoToneWithGroups(){
    const tl = $('#timeline'); if(!tl) return;
    const slots = $$('.para-slot', tl); if(!slots.length) return;

    // clean any theme classes and inline tints; we only use .alt
    slots.forEach(el=>{
      el.className = el.className
        .replace(/\b(alt-alt|group-alt|grp|group|galt|tone-a|tone-b|tone-c|tone-d)\b/g,'')
        .trim();
      el.classList.remove('alt');
      el.style.background=''; el.style.backgroundImage=''; el.style.backgroundColor='';
    });

    const groups = getGroups();
    const starts = new Map(); groups.forEach(g=>{ if (g && g.length) starts.set(g[0], g); });

    let dark = false; // false=light, true=dark
    let i = 1;
    while (i <= slots.length){
      if (starts.has(i)){
        const g = starts.get(i);
        g.forEach(p => { const el = slots[p-1]; if (el && dark) el.classList.add('alt'); });
        dark = !dark;                 // flip once after whole group
        i = g[g.length-1] + 1;
      } else {
        const el = slots[i-1]; if (el && dark) el.classList.add('alt');
        dark = !dark;                 // flip after single
        i++;
      }
    }
  }

  /* ========== base data access (unchanged) ========== */
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

  /* ========== messages ========== */
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

  /* ========== pins ========== */
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

  /* ========== info panel counts ========== */
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

  /* ========== play/lock state (use page's own) ========== */
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
    const syncPlaying = ()=>{ isPlaying = panelLooksLocked(lockPanel); };
    const obs = new MutationObserver(syncPlaying);
    obs.observe(lockPanel, {attributes:true, attributeFilter:['class','style']});
    syncPlaying();
  }

  /* ========== timeline interaction ========== */
  function bindSlotClicks(){
    const tl = $('#timeline'); if(!tl) return;
    const slots = $$('.para-slot', tl); if(!slots.length) return;
    slots.forEach((slot, idx)=>{
      const p=idx+1;
      if (slot.__vtBound) return;
      slot.__vtBound = true;
      slot.addEventListener('click', ()=>{
        if (isPlaying) return;
        const msg = $('#message'); if (!msg) return;
        msg.textContent = buildMsgFor(p);
      });
    });
  }

  /* ========== keep message stable ========== */
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

  /* ========== NEW: group overlays (labels, precise centering) ========== */
  // Create one overlay per group (centered across that group's width using px relative to the slot container),
  // and hide numbers inside the grouped slots.
  function placeGroupOverlays(){
    const tl = document.getElementById('timeline'); if (!tl) return;

    const slots = Array.from(tl.querySelectorAll('.para-slot')); if (!slots.length) return;

    // Use same parent as the slots to avoid padding/offset issues from #timeline
    const container = slots[0].parentElement || tl;

    // Remove previous overlays and clear markers
    const oldWrap = container.querySelector('.vt-group-overlays'); if (oldWrap) oldWrap.remove();
    slots.forEach(s => s.classList.remove('vt-in-group'));

    const groups = (typeof getGroups === 'function' ? getGroups() : []); if (!groups.length) return;

    // Ensure container is positioned for absolute children
    const cs = getComputedStyle(container);
    if (cs.position === 'static') container.style.position = 'relative';

    const wrap = document.createElement('div');
    wrap.className = 'vt-group-overlays';
    container.appendChild(wrap);

    const cref = container.getBoundingClientRect();
    const labelText = g => (g.length===2 ? `${g[0]}&${g[1]}` : `${g[0]}–${g[g.length-1]}`);

    groups.forEach(g=>{
      if (!g || !g.length) return;
      const firstIdx = g[0]-1, lastIdx = g[g.length-1]-1;
      const first = slots[firstIdx], last = slots[lastIdx];
      if (!first || !last) return;

      // Hide slot numbers inside the group
      g.forEach(p => { const el = slots[p-1]; if (el) el.classList.add('vt-in-group'); });

      // Exact px positioning relative to the slot container
      const r1 = first.getBoundingClientRect();
      const r2 = last.getBoundingClientRect();
      const leftPx  = r1.left  - cref.left;
      const widthPx = r2.right - r1.left;

      const ov = document.createElement('div');
      ov.className = 'vt-group-overlay';
      ov.style.left  = leftPx  + 'px';
      ov.style.width = widthPx + 'px';
      ov.textContent = labelText(g);

      wrap.appendChild(ov);
    });
  }

  /* ========== apply & re-apply on timeline changes ========== */
  function applyAll(){
    applyTwoToneWithGroups();
    layoutPins();
    placeGroupOverlays();   // NEW
    bindSlotClicks();
    keepMessageStable();
    updateStats();
  }

  // run once and every time the timeline DOM changes
  function startObservers(){
    const tl = $('#timeline');
    if (!tl) return;
    const mo = new MutationObserver(()=> requestAnimationFrame(applyAll));
    mo.observe(tl, {childList:true, subtree:true});
  }

  const orig = window.drawTimeline;
  if (typeof orig === 'function'){
    window.drawTimeline = function(){
      const r = orig.apply(this, arguments);
      requestAnimationFrame(applyAll);
      requestAnimationFrame(startObservers);
      return r;
    };
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ applyAll(); startObservers(); });
  } else {
    applyAll(); startObservers();
  }/* ========== Limit article dropdown to prev week + current + next 3 weeks ========== */
(function limitArticleDropdown(){
  // Finn mandag i en gitt dato
  function monday(d){
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = x.getUTCDay() || 7; // 1=man ... 7=søndag
    if (day !== 1) x.setUTCDate(x.getUTCDate() - (day - 1));
    x.setUTCHours(0,0,0,0);
    return x;
  }
  // Hjelper
  const fmt = d => d.toISOString().slice(0,10); // YYYY-MM-DD
  const addDays = (d,n)=>{ const x=new Date(d); x.setUTCDate(x.getUTCDate()+n); return x; };

  // Lag tillatt vindu (prev, current, +1w, +2w, +3w)
  function allowedWeekStarts(){
    const now = new Date();
    const curr = monday(now);
    const prev = addDays(curr, -7);
    const n1 = addDays(curr, 7);
    const n2 = addDays(curr, 14);
    const n3 = addDays(curr, 21);
    // Hvis du vil *ekskludere* inneværende uke, fjern "curr" under ↓
    return new Set([fmt(prev), fmt(curr), fmt(n1), fmt(n2), fmt(n3)]);
  }

  // Finn data-array uansett hva hovedsiden kaller den
  function getItemsRef(){
    const cand = [
      () => (window.DATA && Array.isArray(window.DATA.items)) ? window.DATA.items : null,
      () => (window.items && Array.isArray(window.items)) ? window.items : null,
      () => (window.ARTICLES && Array.isArray(window.ARTICLES)) ? window.ARTICLES : null
    ];
    for (const f of cand){ const r=f(); if (r) return r; }
    return null;
  }

  // Forsøk å finne dropdown/datalist
  function findListRoots(){
    const roots = [];
    const ids = ['#article-select','#articleSelect','#article-list','#articleList','#articles'];
    ids.forEach(id=>{
      const el = document.querySelector(id);
      if (el) roots.push(el);
    });
    // fallback: alle <select> eller <datalist> i "artikel-velger" seksjon
    document.querySelectorAll('select, datalist').forEach(el=>{
      if (!roots.includes(el) && /article|artikkel|week|uke|list/i.test(el.id+el.className))
        roots.push(el);
    });
    return roots;
  }

  function repopulateDropdown(){
    const items = getItemsRef(); if (!items) return false;
    const allow = allowedWeekStarts();

    // Lag (og husk) filtrert liste
    const filtered = items.filter(it => it && typeof it.week_start === 'string' && allow.has(it.week_start));
    window.__VT_ALLOWED_ITEMS = filtered;

    // Hvis hovedkoden har en kjent "render" kan vi gi hint
    if (typeof window.renderArticleList === 'function'){
      try { window.renderArticleList(filtered); return true; } catch(e){}
    }

    // Manuell: finn <select>/<datalist> og bygg options
    const roots = findListRoots(); if (!roots.length) return false;

    roots.forEach(root=>{
      // Tøm eks. options
      while (root.firstChild) root.removeChild(root.firstChild);

      filtered.forEach((it, idx)=>{
        const opt = document.createElement(root.tagName.toLowerCase()==='datalist' ? 'option' : 'option');
        opt.value = it.title || (`Uke ${it.week_start}`);
        opt.text  = it.title || (`Uke ${it.week_start}`);
        opt.dataset.week_start = it.week_start;
        // For <datalist> er 'label' nyttig; for <select> brukes text
        if (root.tagName.toLowerCase()==='datalist'){
          opt.label = it.title || (`Uke ${it.week_start}`);
        }
        root.appendChild(opt);
      });
    });

    return true;
  }

  // Kjør når data/DOM er klare
  function tryOnce(){
    repopulateDropdown();
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', tryOnce);
  } else {
    tryOnce();
  }

  // Hvis siden bytter dataset dynamisk, lytt etter endringer på <body>
  const bodyObs = new MutationObserver(()=> { tryOnce(); });
  bodyObs.observe(document.body, {childList:true, subtree:true});
})();
})();
