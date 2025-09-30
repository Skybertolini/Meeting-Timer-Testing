// index-addon.js — v1.75 + polish (group labels, css fixes, dropdown limit)
/*  Hva den gjør:
    - To grønntoner totalt. Grupper (f.eks. 4–5, 10–12) får samme tone som første,
      og vi veksler først etter hele gruppa.
    - Viser én felles label over gruppa ("4&5", "10–12") midtstilt over hele bredden.
    - Pins: les-ikon under, ramme-ikon litt lavere (ca 2mm lavere).
    - Fjerner hvit text-shadow på tallene.
    - Filtrerer artikkel-lista til: forrige uke, denne uken, + 3 neste uker.
*/

(function(){
  /* ========== CSS OVERRIDES (høy spesifisitet) ========== */
  (function ensureCSS(){
    if (document.querySelector('style[data-index-addon]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-index-addon','');
    style.textContent = `
      /* Fiks ikonplassering: les rett under, ramme litt lavere */
      #timeline .para-slot i.read-pin{
        position:absolute; left:50%; transform:translateX(-50%);
        bottom:-14px !important; top:auto; width:16px; height:16px;
        background:url('./img/read-icon.png') center/contain no-repeat; pointer-events:none; opacity:.95;
      }
      #timeline .para-slot i.frame-pin{
        position:absolute; left:50%; transform:translateX(-50%);
        bottom:-28px !important; top:auto; width:12px; height:12px;
        background:url('./img/box-icon.png') center/contain no-repeat; pointer-events:none; opacity:.95;
      }

      /* Fjern hvit skygge bak tallene i slottene */
      #timeline .para-slot{ text-shadow: none !important; }

      :root{
        --vt-tone-light: #EAF4EE;
        --vt-tone-dark:  #CFE7D6;
      }
      /* Vi bruker bare bakgrunnsfarge (to toner). */
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

      /* === Gruppe-labels (samme typografi som tallene, men bold) === */
      #timeline{ position:relative; } /* for overlay-posisjonering */
      #timeline .vt-group-overlays{
        position:absolute; left:0; top:0; right:0; bottom:0;
        pointer-events:none;
      }
      #timeline .vt-group-overlay{
        position:absolute; top:0; height:100%;
        display:flex; align-items:center; justify-content:center;
        font-weight: 900;      /* match slot-nummer-bold */
        font-size: 12px;       /* match slot-nummer-størrelse */
        line-height: 1.2;
        color: #2b3432;        /* fast, tydelig farge */
        opacity:.96;
      }
      /* Skjul KUN tallene i grupper (ikke hele slotten) */
      #timeline .para-slot.vt-in-group > div{ visibility: hidden; }
    `;
    document.head.appendChild(style);
  })();

  /* ========== Hjelpere ========== */
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
    // index.html (din) mappet allerede __VT_GROUPS i useItem()
    return window.__VT_GROUPS || [];
  }
  function rangeLabel(nums){
    const s=[...new Set(nums)].sort((a,b)=>a-b);
    if (s.length===1) return `Avsnitt ${s[0]}`;
    if (s.length===2 && s[1]===s[0]+1) return `Avsnittene ${s[0]} og ${s[1]}`;
    return `Avsnittene ${s[0]}–${s[s.length-1]}`;
  }

  /* ========== To toner, grupper som én blokk (override inline-stiler) ========== */
  function applyTwoToneWithGroups(){
    const tl = $('#timeline'); if(!tl) return;
    const slots = $$('.para-slot', tl); if(!slots.length) return;

    // Fjern inline farger som settes av siden, så CSS-ene våre gjelder
    slots.forEach(el=>{
      el.style.background=''; el.style.backgroundImage=''; el.style.backgroundColor='';
      el.classList.remove('alt');
    });

    // Bygg opp alternasjon per gruppe
    const groups = getGroups();
    const starts = new Map(); groups.forEach(g=>{ if (g && g.length) starts.set(g[0], g); });

    let dark=false; // false=lys, true=mørk
    let i=1;
    while(i<=slots.length){
      if (starts.has(i)){
        const g = starts.get(i);
        for (const p of g){ const el = slots[p-1]; if (el && dark) el.classList.add('alt'); }
        dark = !dark;                        // flip etter hele gruppa
        i = g[g.length-1] + 1;
      } else {
        const el = slots[i-1]; if (el && dark) el.classList.add('alt');
        dark = !dark;                        // flip etter enkeltavsnitt
        i++;
      }
    }
  }

  /* ========== Meldinger (for stabilitet ved play) ========== */
  const getReadSet  = ()=> window.__VT_READ_SET2 instanceof Set ? window.__VT_READ_SET2 : (window.readSet || new Set());
  const getFrameSet = ()=> window.__VT_FRAME_SET   instanceof Set ? window.__VT_FRAME_SET   : new Set();
  const getOrd      = ()=> window.__VT_ORD         instanceof Map ? window.__VT_ORD         : new Map();

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

  /* ========== Gruppe-overlays: midt over hele gruppa ========== */
  function placeGroupOverlays(){
    const tl = document.getElementById('timeline'); if (!tl) return;
    const slots = Array.from(tl.querySelectorAll('.para-slot')); if (!slots.length) return;

    const container = slots[0].parentElement || tl;

    // Fjern gamle overlays + vis tall igjen
    const oldWrap = container.querySelector('.vt-group-overlays'); if (oldWrap) oldWrap.remove();
    slots.forEach(s => s.classList.remove('vt-in-group'));

    const groups = getGroups(); if (!groups.length) return;

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

      // Skjul tallene i gruppa (behold bakgrunn/pins)
      g.forEach(p => { const el = slots[p-1]; if (el) el.classList.add('vt-in-group'); });

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

  /* ========== Påfør alt + reapply ved DOM-endringer ========== */
  function applyAll(){
    applyTwoToneWithGroups();
    placeGroupOverlays();
    keepMessageStable();
  }
  function startObservers(){
    const tl = $('#timeline');
    if (!tl) return;
    const mo = new MutationObserver(()=> requestAnimationFrame(applyAll));
    mo.observe(tl, {childList:true, subtree:true, attributes:true, attributeFilter:['style','class']});
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

  /* ========== Begrens nedtrekkslista: forrige uke + nå + 3 neste ========== */
  (function limitArticleDropdown(){
    function mondayLocal(d=new Date()){
      const day=d.getDay(); const diff=(day===0?-6:1-day);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()+diff);
    }
    function fmt(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}` }
    function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }

    const allowSet = (()=>{
      const curr = mondayLocal(new Date());
      const prev = addDays(curr, -7);
      const n1 = addDays(curr,  7);
      const n2 = addDays(curr, 14);
      const n3 = addDays(curr, 21);
      return new Set([fmt(prev), fmt(curr), fmt(n1), fmt(n2), fmt(n3)]);
    })();

    function filterWeekSel(){
      const sel = document.getElementById('weekSel');
      if (!sel) return;

      // Hvis options er "JSON.stringify(item)" (slik i index), filtrer basert på .week_start
      const opts = Array.from(sel.options);
      let changed=false;
      opts.forEach(opt=>{
        try{
          const it = JSON.parse(opt.value);
          if (!it || !allowSet.has(it.week_start)) {
            opt.remove(); changed=true;
          }
        }catch{
          // Hvis verdien ikke er JSON (fallback), skjul den
          opt.remove(); changed=true;
        }
      });

      // Hvis ingenting igjen (edge), ikke gjør noe mer
      if (!sel.options.length) return;

      // Velg nærmeste: preferer "denne uken" hvis finnes, ellers første
      let idx = Array.from(sel.options).findIndex(o=>{
        try{ return JSON.parse(o.value).week_start === Array.from(allowSet)[1]; }catch{return false;}
      });
      if (idx<0) idx=0;
      sel.selectedIndex = idx;

      // Trigger change slik at riktig artikkel lastes om nødvendig
      sel.dispatchEvent(new Event('change', {bubbles:true}));
    }

    // Kjør når DOM er klar, og også litt senere i tilfelle hydrateOptions kjører etterpå
    function run(){
      filterWeekSel();
      setTimeout(filterWeekSel, 300);  // etter hydrateOptions
      setTimeout(filterWeekSel, 1200); // ekstra sikkerhet
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }

    // Overvåk endringer i #weekSel (hvis siden repopulerer)
    const obs = new MutationObserver(()=> filterWeekSel());
    const hook = ()=>{ const sel=document.getElementById('weekSel'); if (sel) obs.observe(sel, {childList:true}); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', hook);
    } else {
      hook();
    }
  })();

})();
