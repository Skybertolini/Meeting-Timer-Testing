// index-addon.js — v1.77
// • Slår sammen grupper (f.eks. 4–5, 10–12) til ÉN boks på tidslinjen.
// • Kun to farger (lys/mørk). Hele gruppa arver første farge, flip først ETTER gruppa.
// • Pins (ramme/les) aggregeres i den sammenslåtte boksen (a/b-rekkefølge).
// • Meldingsfelt: korrekt tekst for enkelt + grupper (+ Ramme/Les).
// • Klikk før Play OK; under Play ignoreres tidslinje-klikk (bruker sidens egen lock/gråing).
// • Tellerlinje (avsnitt/les/rammer) oppdateres.
// • Re-applier automatisk når tidslinjen endres.

(function(){
  /* ================= CSS ================= */
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
      /* Nøytraliser evt. tredje-nyanse */
      #timeline .para-slot.active,
      #timeline .para-slot.current,
      #timeline .para-slot.selected,
      #timeline .para-slot.is-active{
        background-color: inherit !important;
        background-image: none !important;
      }
      #timeline .para-slot::before,
      #timeline .para-slot::after{ background: none !important; }

      /* Label for sammenslåtte bokser */
      #timeline .para-slot .vt-label{
        position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
        pointer-events:none; font-weight:600; opacity:.9;
      }

      /* Fallback-statistikk (om siden ikke har egne spans) */
      .vt-stats{ display:flex; gap:12px; align-items:center; font-size:.95em; opacity:.9; flex-wrap:wrap }
      .vt-stats b{ font-weight:600 }
      .vt-stats .ic{ width:14px; height:14px; vertical-align:middle; margin-right:6px; }
    `;
    document.head.appendChild(style);
  })();

  /* ================= Utils ================= */
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

  /* ================= Fargelegging (to-toner, gruppe = én blokk) ================= */
  function applyTwoToneWithGroups(){
    const tl = $('#timeline'); if(!tl) return;
    const slots = $$('.para-slot', tl); if(!slots.length) return;

    // Rydd temaklasser; bruk kun .alt
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
        dark = !dark;                 // flip én gang etter gruppa
        i = g[g.length-1] + 1;
      } else {
        const el = slots[i-1]; if (el && dark) el.classList.add('alt');
        dark = !dark;
        i++;
      }
    }
  }

  /* ================= Data fra basiskoden ================= */
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

  /* ================= Meldingsbygger ================= */
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

  /* ================= Slå sammen gruppeslott — prosent-bredder ================= */
  function mergeGroupedSlots(){
    const tl = $('#timeline'); if(!tl) return;
    const slots = $$('.para-slot', tl); if(!slots.length) return;

    const groups = getGroups();

    // Nullstill ev. tidligere merge
    slots.forEach(s=>{
      s.style.width=''; s.style.display=''; s.classList.remove('vt-merged');
      s.removeAttribute('data-vt-group');
      const lab = s.querySelector('.vt-label'); if (lab) lab.remove();
    });
    if (!groups.length){ window.__VT_HOST_FOR = new Map(); return; }

    // Map: paraIndex -> hostIndex (første i gruppa)
    const hostFor = new Map();

    groups.forEach(g=>{
      if (!g || g.length < 2) return;

      const first = slots[g[0]-1]; if (!first) return;

      // Summer prosent-bredder for alle slots i gruppa
      let sumW = 0;
      for (const p of g){
        const el = slots[p-1]; if (!el) continue;
        const wPct = parseFloat(el.style.width || '0');
        sumW += (isNaN(wPct) ? 0 : wPct);
      }

      // Skjul alle unntatt første
      for (let i=1; i<g.length; i++){
        const el = slots[g[i]-1];
        if (el){ el.style.display='none'; }
      }

      // Strekk første til total bredde i %
      first.style.width = sumW + '%';
      first.classList.add('vt-merged');

      // Label "x & y" eller "x–y"
      const label = (g.length===2) ? `${g[0]} & ${g[1]}` : `${g[0]}–${g[g.length-1]}`;
      const ov = document.createElement('div');
      ov.className = 'vt-label';
      ov.textContent = label;
      first.appendChild(ov);

      first.dataset.vtGroup = g.join(',');
      g.forEach(p => hostFor.set(p, g[0]));
    });

    window.__VT_HOST_FOR = hostFor;
  }

  /* ================= Pins (aggreger per gruppe-host) ================= */
  function layoutPins(){
    const tl = $('#timeline'); if(!tl) return;
    const slots = $$('.para-slot', tl); if(!slots.length) return;

    const ord   = getOrd();
    const frames= getFrameSet();
    const reads = getReadSet();

    // Fjern gamle pins
    slots.forEach(slot => $$('.read-pin,.frame-pin', slot).forEach(n=>n.remove()));

    const hostFor = window.__VT_HOST_FOR instanceof Map ? window.__VT_HOST_FOR : new Map();
    const perHost = new Map(); // hostIdx -> items[]

    function addItem(hostIdx, item){
      if (!perHost.has(hostIdx)) perHost.set(hostIdx, []);
      perHost.get(hostIdx).push(item);
    }

    for (let p=1; p<=slots.length; p++){
      const host = hostFor.get(p) || p;       // p er sin egen host hvis ikke i gruppe
      const hasF = frames.has(p), hasR = reads.has(p);
      const o = ord.get(p) || {};
      if (hasF) addItem(host, {type:'frame', order:o.frame ?? 1});
      if (hasR) addItem(host, {type:'read',  order:o.read  ?? 2});
    }

    perHost.forEach((items, host)=>{
      const slot = slots[host-1]; if (!slot) return;
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

  /* ================= Tellerlinje ================= */
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

  /* ================= Play/lock state (bruk sidens egen) ================= */
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

  /* ================= Interaksjon ================= */
  function bindSlotClicks(){
    const tl = $('#timeline'); if(!tl) return;
    const slots = $$('.para-slot', tl); if(!slots.length) return;
    slots.forEach((slot, idx)=>{
      const p=idx+1;
      if (slot.__vtBound) return;
      slot.__vtBound = true;
      slot.addEventListener('click', ()=>{
        if (isPlaying) return;  // under Play: ignorér
        const msg = $('#message'); if (!msg) return;
        // Gruppe-slot?
        const groupAttr = slot.dataset.vtGroup;
        if (groupAttr){
          const g = groupAttr.split(',').map(n=>+n);
          msg.textContent = buildGroupMsg(g);
        } else {
          msg.textContent = buildMsgFor(p);
        }
      });
    });
  }

  /* ================= Hold melding stabil ================= */
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

  /* ================= Apply & observers ================= */
  function applyAll(){
    applyTwoToneWithGroups(); // farger først
    mergeGroupedSlots();      // slå sammen grupper (i %)
    layoutPins();             // tegn pins i host-slot
    bindSlotClicks();         // klikk
    keepMessageStable();      // stabil melding
    updateStats();            // tellere
  }

  function startObservers(){
    const tl = $('#timeline'); if (!tl) return;
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
