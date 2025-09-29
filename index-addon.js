// index-addon.js — v1.75-group-labels
// Base: v1.75 (to-toner, grupper som blokk, pins, meldinger, tellere, klikk-låsing).
// Nytt: ÉN felles label over hver gruppe (4&5 / 10–12), midtstilt over hele gruppa,
// og skjul individuelle slot-tall i gruppa.

(function(){
  /* ========== CSS ========== */
  (function ensureCSS(){
    if (document.querySelector('style[data-index-addon]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-index-addon','');
    style.textContent = `
      /* Pins */
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

      /* To toner */
      :root{
        --vt-tone-light: #EAF4EE; /* lys grønn */
        --vt-tone-dark:  #CFE7D6; /* mørkere grønn */
      }
      #timeline{ position:relative; } /* for overlay posisjonering */
      #timeline .para-slot{
        background-color: var(--vt-tone-light) !important;
        background-image: none !important;
        font-size: 12px;                /* jevne tall */
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
        position: relative;
        overflow: hidden;
      }
      #timeline .para-slot.alt{
        background-color: var(--vt-tone-dark) !important;
        background-image: none !important;
      }
      #timeline .para-slot *{
        font-size: inherit !important;
        line-height: inherit;
      }
      /* ikke tillat en "tredje" nyanse */
      #timeline .para-slot.active,
      #timeline .para-slot.current,
      #timeline .para-slot.selected,
      #timeline .para-slot.is-active{
        background-color: inherit !important;
        background-image: none !important;
      }
      #timeline .para-slot::before,
      #timeline .para-slot::after{ background: none !important; }

      /* Overlays for gruppe-labels */
      #timeline .vt-group-overlays{
        position:absolute; left:0; top:0; right:0; bottom:0;
        pointer-events:none;
      }
      #timeline .vt-group-overlay{
        position:absolute; top:0; height:100%;
        display:flex; align-items:center; justify-content:center;
        font-weight:600; opacity:.9;
      }

      /* Skjul tall i slots som tilhører en gruppe (overlays viser felles label) */
      #timeline .para-slot.vt-in-group{ color: transparent !important; }
      #timeline .para-slot.vt-in-group *{ color: transparent !important; }

      /* Fallback liten statistikk-linje (om siden ikke har egne spans) */
      .vt-stats{ display:flex; gap:12px; align-items:center; font-size:.95em; opacity:.9; flex-wrap:wrap }
      .vt-stats b{ font-weight:600 }
      .vt-stats .ic{ width:14px; height:14px; vertical-align:middle; margin-right:6px; }
    `;
    document.head.appendChild(style);
  })();

  /* ========== Utils ========== */
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

  /* ========== To-toner med grupper som én blokk (men uten å slå sammen bokser) ========== */
  function applyTwoToneWithGroups(){
    const tl = $('#timeline'); if(!tl) return;
    const slots = $$('.para-slot', tl); if(!slots.length) return;

    // reset temaklasser; bruk kun .alt
    slots.forEach(el=>{
      el.className = el.className
        .replace(/\b(alt-alt|group-alt|grp|group|galt|tone-a|tone-b|tone-c|tone-d)\b/g,'')
        .trim();
      el.classList.remove('alt');
      el.style.background=''; el.style.backgroundImage=''; el.style.backgroundColor='';
    });

    const groups = getGroups();
    const starts = new Map(); groups.forEach(g=>{ if (g && g.length) starts.set(g[0], g); });

    let dark=false; let i=1;
    while(i<=slots.length){
      if (starts.has(i)){
        const g = starts.get(i);
        for(const p of g){ const el = slots[p-1]; if (el && dark) el.classList.add('alt'); }
        dark = !dark;                 // flip ÉN gang etter hele gruppa
        i = g[g.length-1] + 1;
      } else {
        const el = slots[i-1]; if (el && dark) el.classList.add('alt');
        dark = !dark;
        i++;
      }
    }
  }

  /* ========== Data fra basiskoden ========== */
  const getReadSet  = ()=> window.__VT_READ_SET2 instanceof Set ? window.__VT_READ_SET2 : (window.readSet || new Set());
  const getFrameSet = ()=> window.__VT_FRAME_SET   instanceof Set ? window.__VT_FRAME_SET   : new Set();
  const getOrd      = ()=> window.__VT_ORD         instanceof Map ? window.__VT_ORD         : new Map();

  function getParaCount(){
    const it = window.currentItem || window.ITEM || null;
    if (it && Array.isArray(it.words)) return it.words.length;
    if (it && Array.isArray(it.para_lengths)) return it.para_lengths.length;
    const tl = $('#timeline'); if (tl) return $$('.para-slot', tl).length;
    return 0;
  }

  /* ========== Meldingsbygger ========== */
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

  /* ========== Pins ========== */
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

  /* ========== Info-panel (tellerlinje) ========== */
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
    const it = window.currentItem || window.ITEM || null;
    const paraCount =
      (it && Array.isArray(it.words)) ? it.words.length :
      (it && Array.isArray(it.para_lengths)) ? it.para_lengths.length :
      getParaCount();
    const readCount  = getReadSet().size;
    const frameCount = getFrameSet().size;

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

  /* ========== Play/lock (bruk sidens egen) ========== */
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

  /* ========== Gruppe-overlays (NYTT) ========== */
  // Lager én overlay pr. gruppe (midtstilt over hele bredden) og skjuler tall i slots i gruppa.
  function placeGroupOverlays(){
    const tl = document.getElementById('timeline'); if (!tl) return;
    const slots = Array.from(tl.querySelectorAll('.para-slot')); if (!slots.length) return;

    // Fjern gamle overlays + in-group-markering
    const oldWrap = tl.querySelector('.vt-group-overlays'); if (oldWrap) oldWrap.remove();
    slots.forEach(s => s.classList.remove('vt-in-group'));

    const groups = getGroups(); if (!groups.length) return;

    // Hent prosent-bredder fra inline style (timeline setter width i % per slot)
    const widths = slots.map(el => parseFloat(el.style.width || '0') || 0);
    if (!widths.length) return;

    // Prefikssummer i % for venstrekant
    const leftPct = [0];
    for (let i=0; i<widths.length; i++) leftPct[i+1] = leftPct[i] + widths[i];

    // Container for overlays
    const wrap = document.createElement('div');
    wrap.className = 'vt-group-overlays';
    tl.appendChild(wrap);

    const labelText = g => (g.length===2 ? `${g[0]}&${g[1]}` : `${g[0]}–${g[g.length-1]}`);

    groups.forEach(g=>{
      if (!g || !g.length) return;
      const first = g[0], last = g[g.length-1];
      if (!slots[first-1] || !slots[last-1]) return;

      // Skjul tall i alle slots i gruppa
      g.forEach(p => { const el = slots[p-1]; if (el) el.classList.add('vt-in-group'); });

      // Beregn overlay-område i %
      const left = leftPct[first-1];
      const width = leftPct[last] - leftPct[first-1];

      const ov = document.createElement('div');
      ov.className = 'vt-group-overlay';
      ov.style.left = left + '%';
      ov.style.width = width + '%';
      ov.textContent = labelText(g);

      wrap.appendChild(ov);
    });
  }

  /* ========== Interaksjon ========== */
  function bindSlotClicks(){
    const tl = $('#timeline'); if(!tl) return;
    const slots = $$('.para-slot', tl); if(!slots.length) return;
    slots.forEach((slot, idx)=>{
      const p=idx+1;
      if (slot.__vtBound) return;
      slot.__vtBound = true;
      slot.addEventListener('click', ()=>{
        if (isPlaying) return; // under Play: ignorér
        const msg = $('#message'); if (!msg) return;
        msg.textContent = buildMsgFor(p);
      });
    });
  }

  /* ========== Hold melding stabil (overstyr "Avsnitt N") ========== */
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

  /* ========== Apply + observers ========== */
  function applyAll(){
    applyTwoToneWithGroups();  // to farger (grupper som blokk)
    layoutPins();              // pins
    placeGroupOverlays();      // NYTT: felles label over grupper
    bindSlotClicks();          // klikk
    keepMessageStable();       // lås meldingen
    updateStats();             // tellere
  }

  function startObservers(){
    const tl = $('#timeline');
    if (!tl) return;
    const mo = new MutationObserver(()=> requestAnimationFrame(applyAll));
    mo.observe(tl, {childList:true, subtree:true, attributes:true, attributeFilter:['class','style']});
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
  }
})();
