// index-addon.js — v1.76
// Merge grouped paragraphs into single timeline boxes.
// Two tones only; groups share first tone and we flip after the whole group.
// Pins (frame/read) aggregated into the merged box. Messages/tallies unchanged.
// Timeline clicks allowed before Play; ignored during Play. Uses page's own lock/gray as play-signal.

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

      /* Two tones only */
      :root{
        --vt-tone-light: #EAF4EE;
        --vt-tone-dark:  #CFE7D6;
      }
      #timeline .para-slot{
        background-color: var(--vt-tone-light) !important;
        background-image: none !important;
        font-size: 12px;
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
      #timeline .para-slot.active,
      #timeline .para-slot.current,
      #timeline .para-slot.selected,
      #timeline .para-slot.is-active{
        background-color: inherit !important;
        background-image: none !important;
      }
      #timeline .para-slot::before,
      #timeline .para-slot::after{
        background: none !important;
      }

      /* Label-overlay for merged groups (keeps layout stable even if internal markup differs) */
      #timeline .para-slot .vt-label{
        position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
        pointer-events:none; font-weight:600; opacity:.9;
      }

      /* Compact stats line (fallback if we must inject) */
      .vt-stats{ display:flex; gap:12px; align-items:center; font-size:.95em; opacity:.9; flex-wrap:wrap }
      .vt-stats b{ font-weight:600 }
      .vt-stats .ic{ width:14px; height:14px; vertical-align:middle; margin-right:6px; }
    `;
    document.head.appendChild(style);
  })();

  /* ========== Utils ========== */
  const $  = (sel, root=document)=> root.querySelector(sel);
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
  function groupSlotLabel(g){
    if (g.length===2) return `${g[0]} & ${g[1]}`;
    return `${g[0]}–${g[g.length-1]}`;
  }

  /* ========== Two-tone (groups as one block) ========== */
  function applyTwoToneWithGroups(){
    const tl = $('#timeline'); if(!tl) return;
    const slots = $$('.para-slot', tl); if(!slots.length) return;

    // reset (keep only 'alt' as our dark tone flag)
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
        dark = !dark;
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

  /* ========== Slå sammen gruppe-bokser på tidslinjen ========== */
  function mergeGroupedSlots(){
    const tl = $('#timeline'); if(!tl) return;
    const slots = $$('.para-slot', tl); if(!slots.length) return;
    const groups = getGroups(); if (!groups.length) {
      // ensure any previous merging is cleared
      slots.forEach(s=>{
        s.style.width=''; s.style.display=''; s.classList.remove('vt-merged');
        const lab = $('.vt-label', s); if (lab) lab.remove();
      });
      return;
    }

    // Map hvert avsnitt til sin verts-slot (første i gruppa)
    const hostFor = new Map(); // paraIndex -> hostIndex
    const isInGroup = new Set();
    groups.forEach(g=>{
      const host = g[0];
      g.forEach(p=>{ hostFor.set(p, host); isInGroup.add(p); });
    });

    // Nullstill tidligere merge
    slots.forEach(s=>{
      s.style.width=''; s.style.display=''; s.classList.remove('vt-merged');
      const lab = $('.vt-label', s); if (lab) lab.remove();
    });

    // Slå sammen: for hver gruppe, skjul "andre" og strekk første til total bredde
    groups.forEach(g=>{
      if (g.length < 2) return;
      const first = slots[g[0]-1]; if (!first) return;

      // Finn venstre kant av første og høyre kant av siste
      const rectFirst = first.getBoundingClientRect();
      const last = slots[g[g.length-1]-1]; if (!last) return;
      const rectLast  = last.getBoundingClientRect();
      const totalPx = Math.max(0, rectLast.right - rectFirst.left);

      // Skjul alle i gruppa unntatt første
      for (let i=1;i<g.length;i++){
        const el = slots[g[i]-1]; if (el){ el.style.display='none'; }
      }

      // Strekk første visuelt til å dekke hele området
      // NB: fungerer i fleks/grid/inline-block – vi bruker px-bredde etter layout.
      first.style.width = totalPx + 'px';
      first.classList.add('vt-merged');

      // Legg på en label-overlay med f.eks. "4 & 5" / "10–12"
      const label = groupSlotLabel(g);
      const ov = document.createElement('div');
      ov.className = 'vt-label';
      ov.textContent = label;
      first.appendChild(ov);

      // Merk vert for senere (klikk/pins)
      first.dataset.vtGroup = g.join(',');
    });

    // Eksponer for andre funksjoner
    window.__VT_HOST_FOR = hostFor;
  }

  /* ========== Pins (samlet for grupper) ========== */
  function layoutPins(){
    const tl = $('#timeline'); if(!tl) return;
    const slots = $$('.para-slot', tl); if(!slots.length) return;

    const ord   = getOrd();
    const frames= getFrameSet();
    const reads = getReadSet();

    // Rydd gamle pins
    slots.forEach(slot => $$('.read-pin,.frame-pin', slot).forEach(n=>n.remove()));

    // Håndter host mapping (fra merge)
    const hostFor = window.__VT_HOST_FOR instanceof Map ? window.__VT_HOST_FOR : new Map();

    // Bygg samlet liste per host-slot
    const perHost = new Map(); // hostIdx -> items[]
    const totalParas = slots.length;

    function addItem(hostIdx, item){
      if (!perHost.has(hostIdx)) perHost.set(hostIdx, []);
      perHost.get(hostIdx).push(item);
    }

    for (let p=1; p<=totalParas; p++){
      // hopp over skjulte (display:none) ved å sjekke computed style? Vi bruker hostFor.
      const host = hostFor.get(p) || p;
      const hasF = frames.has(p), hasR = reads.has(p);
      const o = ord.get(p) || {};
      if (hasF) addItem(host, {type:'frame', order:o.frame ?? 1});
      if (hasR) addItem(host, {type:'read',  order:o.read  ?? 2});
    }

    // Plasser pins per host
    perHost.forEach((items, host)=>{
      const slot = slots[host-1]; if (!slot) return;
      // Sorter a/b – frame vs read sammen i felles rekkefølge
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

  /* ========== Info panel counts ========== */
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
    // Avsnitt = antall opprinnelige avsnitt, ikke antall bokser
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

  /* ========== Play/lock state (use page's own) ========== */
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

  /* ========== Timeline interaction ========== */
  function bindSlotClicks(){
    const tl = $('#timeline'); if(!tl) return;
    const slots = $$('.para-slot', tl); if(!slots.length) return;

    // map for quick group resolution
    const mapParaToGroup = new Map();
    getGroups().forEach(g => g.forEach(p => mapParaToGroup.set(p, g)));

    slots.forEach((slot, idx)=>{
      const p=idx+1;
      if (slot.__vtBound) return;
      slot.__vtBound = true;
      slot.addEventListener('click', ()=>{
        if (isPlaying) return;
        const msg = $('#message'); if (!msg) return;
        // Hvis slot representerer en gruppe (via data-vtGroup), bruk gruppa
        const groupAttr = slot.dataset.vtGroup;
        if (groupAttr){
          const g = groupAttr.split(',').map(n=>+n);
          msg.textContent = buildGroupMsg(g);
        }else{
          msg.textContent = buildMsgFor(p);
        }
      });
    });
  }

  /* ========== Keep message stable (override "Avsnitt N") ========== */
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

  /* ========== Apply (re-apply on changes) ========== */
  function applyAll(){
    applyTwoToneWithGroups();   // farger først
    mergeGroupedSlots();        // så slår vi sammen boksene for grupper
    layoutPins();               // og tegner pins i merged bokser
    bindSlotClicks();           // klikk/labels
    keepMessageStable();
    updateStats();
  }

  function startObservers(){
    const tl = $('#timeline'); if(!tl) return;
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
