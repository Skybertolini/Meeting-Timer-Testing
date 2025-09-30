// index-addon.js — v1.75 + images (pins, counts, messages) + group labels + pin stacking + dropdown limit
// - Two tones total; groups share first tone and flip after whole group
// - One overlay label per group ("4&5" / "10–12"), centered across the group's width
// - Read/Frame/Image icons on the same line under the timeline; A > B > C (z-index & order)
// - Info panel shows Avsnitt, Les-skriftsteder, Rammer, Bilder (with icons)
// - Message builder includes + Ramme / + Les-skriftsted / + Bilde in A/B/C order
// - Supports a/b/c suffix in data for frames/reads/images on single numbers AND ranges (&, - / –)
// - Dropdown limited to prev week + current + next 3

(function(){
  /* ================= CSS ================= */
  (function ensureCSS(){
    if (document.querySelector('style[data-index-addon]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-index-addon','');
    style.textContent = `
      /* Icons: all types on the same line under the timeline */
      #timeline .para-slot i.read-pin,
      #timeline .para-slot i.frame-pin,
      #timeline .para-slot i.image-pin{
        position:absolute; left:50%; transform:translateX(-50%);
        bottom:-20px !important; top:auto; pointer-events:none; opacity:.95;
      }
      #timeline .para-slot i.read-pin{
        width:16px; height:16px;
        background:url('./img/read-icon.png') center/contain no-repeat;
      }
      #timeline .para-slot i.frame-pin{
        width:16px; height:16px;
        background:url('./img/box-icon.png')  center/contain no-repeat;
      }
      #timeline .para-slot i.image-pin{
        width:16px; height:16px;
        background:url('./img/image-icon.png') center/contain no-repeat;
      }

      /* Clean slot number rendering */
      #timeline .para-slot{ text-shadow:none !important; }

      :root{
        --vt-tone-light:#EAF4EE;
        --vt-tone-dark:#CFE7D6;
      }
      #timeline{ position:relative; } /* for overlays */
      #timeline .para-slot{
        background-color:var(--vt-tone-light) !important;
        background-image:none !important;
        font-size:12px; line-height:1.2; font-variant-numeric:tabular-nums;
      }
      #timeline .para-slot.alt{
        background-color:var(--vt-tone-dark) !important;
        background-image:none !important;
      }
      #timeline .para-slot *{ font-size:inherit !important; line-height:inherit; }
      #timeline .para-slot.active,
      #timeline .para-slot.current,
      #timeline .para-slot.selected,
      #timeline .para-slot.is-active{
        background-color:inherit !important; background-image:none !important;
      }
      #timeline .para-slot::before,
      #timeline .para-slot::after{ background:none !important; }

      /* Group overlay labels (bold, same size as slot numbers) */
      #timeline .vt-group-overlays{
        position:absolute; left:0; top:0; right:0; bottom:0; pointer-events:none;
      }
      #timeline .vt-group-overlay{
        position:absolute; top:0; height:100%;
        display:flex; align-items:center; justify-content:center;
        font-weight:900; font-size:12px; line-height:1.2;
        color:#2b3432; opacity:.96;
      }

      /* Hide only the number content inside grouped slots (not the background/pins) */
      #timeline .para-slot.vt-in-group > div{ visibility:hidden; }

      /* Info line (fallback if page has no dedicated spans) */
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
      const a=+m[1], b=m[2]?+m[2]:a, arr=[]; for(let i=a;i<=b;i++) arr.push(i); return [arr];
    });
  }
  function getGroups(){
    if (Array.isArray(window.__VT_GROUPS)) return window.__VT_GROUPS;
    const it = window.currentItem || window.ITEM || null;
    if (it && typeof it.groups === 'string') return parseGroupsString(it.groups);
    return window.__VT_GROUPS || [];
  }
  function rangeLabel(nums){
    const s=[...new Set(nums)].sort((a,b)=>a-b);
    if (s.length===1) return `Avsnitt ${s[0]}`;
    if (s.length===2 && s[1]===s[0]+1) return `Avsnittene ${s[0]} og ${s[1]}`;
    return `Avsnittene ${s[0]}–${s[s.length-1]}`;
  }

  // Expand references with optional order suffix "a"/"b"/"c" on single or grouped tokens.
  // Examples: "5a", "4-5b", "10–12c", "7&8a"
  // Returns { set:Set<number>, ord: Map<number, 1|2|3> } where 1=a,2=b,3=c (or undefined if none)
  function expandRefsWithOrder(refs){
    const set = new Set();
    const ord = new Map();
    if (!Array.isArray(refs)) return {set, ord};

    function applyToRange(a,b,order){
      const lo=Math.min(a,b), hi=Math.max(a,b);
      for(let i=lo;i<=hi;i++){ set.add(i); if (order) ord.set(i, order); }
    }
    function orderFromSuffix(ch){
      if (!ch) return undefined;
      const x = ch.toLowerCase();
      if (x==='a') return 1;
      if (x==='b') return 2;
      if (x==='c') return 3;
      return undefined;
    }

    refs.forEach(v=>{
      if (typeof v === 'number' && Number.isFinite(v)) { set.add(v); return; }
      if (typeof v !== 'string') return;
      const s = v.trim();

      // a-bX  (hyphen)  or a–bX (en dash)
      let m = s.match(/^(\d+)[\-–](\d+)([abc])?$/i);
      if (m){
        const a=+m[1], b=+m[2], o=orderFromSuffix(m[3]);
        applyToRange(a,b,o); return;
      }
      // a&bX
      m = s.match(/^(\d+)&(\d+)([abc])?$/i);
      if (m){
        const a=+m[1], b=+m[2], o=orderFromSuffix(m[3]);
        set.add(a); set.add(b);
        if (o){ ord.set(a,o); ord.set(b,o); }
        return;
      }
      // single number with optional suffix
      m = s.match(/^(\d+)([abc])?$/i);
      if (m){
        const p=+m[1], o=orderFromSuffix(m[2]);
        set.add(p); if (o) ord.set(p,o);
      }
    });
    return {set, ord};
  }

  /* ================= Two tones with group blocks ================= */
  function applyTwoToneWithGroups(){
    const tl = $('#timeline'); if(!tl) return;
    const slots = $$('.para-slot', tl); if(!slots.length) return;

    slots.forEach(el=>{
      el.style.background=''; el.style.backgroundImage=''; el.style.backgroundColor='';
      el.classList.remove('alt');
    });

    const groups = getGroups();
    const starts = new Map(); groups.forEach(g=>{ if (g && g.length) starts.set(g[0], g); });

    let dark=false, i=1;
    while(i<=slots.length){
      if (starts.has(i)){
        const g = starts.get(i);
        g.forEach(p=>{ const el=slots[p-1]; if (el && dark) el.classList.add('alt'); });
        dark=!dark; i=g[g.length-1]+1;
      } else {
        const el=slots[i-1]; if (el && dark) el.classList.add('alt');
        dark=!dark; i++;
      }
    }
  }

  /* ================= Data access ================= */
  const getReadSet  = ()=> window.__VT_READ_SET2 instanceof Set ? window.__VT_READ_SET2 : (window.readSet || new Set());
  const getFrameSet = ()=> window.__VT_FRAME_SET   instanceof Set ? window.__VT_FRAME_SET   : new Set();
  const getOrd      = ()=> window.__VT_ORD         instanceof Map ? window.__VT_ORD         : new Map(); // frame/read orders from main page

  function getImageData(){
    const it = window.currentItem || window.ITEM || null;
    if (!it || !Array.isArray(it.images)) return {set:new Set(), ord:new Map()};
    return expandRefsWithOrder(it.images);
  }

  function getParaCount(){
    const it = window.currentItem || window.ITEM || null;
    if (it && Array.isArray(it.words)) return it.words.length;
    if (it && Array.isArray(it.para_lengths)) return it.para_lengths.length;
    const tl = $('#timeline'); if (tl) return $$('.para-slot', tl).length;
    return 0;
  }

  /* ================= Messages ================= */
  function buildSingleMsg(p){
    const frames=getFrameSet(), reads=getReadSet(), imgData=getImageData();
    const hasF=frames.has(p), hasR=reads.has(p), hasI=imgData.set.has(p);

    if (!hasF && !hasR && !hasI) return rangeLabel([p]);

    // determine A/B/C order using available order maps
    const ord=getOrd(), o = ord.get(p)||{};
    const oF = hasF ? (o.frame ?? 2) : null;  // historically frame defaulted to 1; we keep 2 to avoid always-first if unknown
    const oR = hasR ? (o.read  ?? 2) : null;
    const oI = hasI ? (imgData.ord.get(p) ?? 3) : null; // images default to C

    const parts = [];
    if (hasF) parts.push({label:'Ramme', order:oF??99});
    if (hasR) parts.push({label:'Les-skriftsted', order:oR??99});
    if (hasI) parts.push({label:'Bilde', order:oI??99});
    parts.sort((a,b)=>a.order-b.order);

    const tail = joinParts(parts.map(x=>x.label));
    return `${rangeLabel([p])} + ${tail}`;
  }

  function buildGroupMsg(g){
    const frames=getFrameSet(), reads=getReadSet(), imgData=getImageData();

    // For grupper: ta MIN rekkefølge innen gruppen for hver type
    let hasF=false, hasR=false, hasI=false;
    let oF=Infinity, oR=Infinity, oI=Infinity;

    const ord=getOrd();
    for (const p of g){
      if (frames.has(p)){ hasF=true; oF=Math.min(oF, (ord.get(p)||{}).frame ?? 2); }
      if (reads.has(p)){  hasR=true; oR=Math.min(oR, (ord.get(p)||{}).read  ?? 2); }
      if (imgData.set.has(p)){ hasI=true; oI=Math.min(oI, imgData.ord.get(p) ?? 3); }
    }

    if (!hasF && !hasR && !hasI) return rangeLabel(g);

    const parts=[];
    if (hasF) parts.push({label:'Ramme', order:oF});
    if (hasR) parts.push({label:'Les-skriftsted', order:oR});
    if (hasI) parts.push({label:'Bilde', order:oI});
    parts.sort((a,b)=>a.order-b.order);

    const tail = joinParts(parts.map(x=>x.label));
    return `${rangeLabel(g)} + ${tail}`;
  }

  function buildMsgFor(p){
    const groups=getGroups();
    for (const g of groups){ if (g.includes(p)) return buildGroupMsg(g); }
    return buildSingleMsg(p);
  }

  function joinParts(arr){
    if (arr.length===1) return arr[0];
    if (arr.length===2) return `${arr[0]} og ${arr[1]}`;
    return `${arr.slice(0,-1).join(', ')} og ${arr[arr.length-1]}`;
  }

  function keepMessageStable(){
    const msg = $('#message'); if(!msg) return;
    const mo = new MutationObserver(()=>{
      const text=(msg.textContent||'').trim();
      const m = text.match(/^Avsnitt\s+(\d+)(?:\b|$)/);
      if (!m) return;
      const p = Number(m[1]);
      const desired = buildMsgFor(p);
      if (desired && text !== desired) msg.textContent = desired;
    });
    mo.observe(msg, {childList:true, characterData:true, subtree:true});
  }

  /* ================= Group overlays (precise centering) ================= */
  function placeGroupOverlays(){
    const tl = document.getElementById('timeline'); if (!tl) return;
    const slots = Array.from(tl.querySelectorAll('.para-slot')); if (!slots.length) return;
    const container = slots[0].parentElement || tl;

    const oldWrap = container.querySelector('.vt-group-overlays'); if (oldWrap) oldWrap.remove();
    slots.forEach(s => s.classList.remove('vt-in-group'));

    const groups = getGroups(); if (!groups.length) return;

    const cs = getComputedStyle(container);
    if (cs.position === 'static') container.style.position = 'relative';

    const wrap = document.createElement('div'); wrap.className = 'vt-group-overlays'; container.appendChild(wrap);
    const cref = container.getBoundingClientRect();
    const labelText = g => (g.length===2 ? `${g[0]}&${g[1]}` : `${g[0]}–${g[g.length-1]}`);

    groups.forEach(g=>{
      const first=slots[g[0]-1], last=slots[g[g.length-1]-1]; if(!first||!last) return;
      g.forEach(p => { const el = slots[p-1]; if (el) el.classList.add('vt-in-group'); });

      const r1=first.getBoundingClientRect(), r2=last.getBoundingClientRect();
      const leftPx=r1.left - cref.left, widthPx=r2.right - r1.left;

      const ov = document.createElement('div');
      ov.className = 'vt-group-overlay';
      ov.style.left = leftPx+'px';
      ov.style.width = widthPx+'px';
      ov.textContent = labelText(g);
      wrap.appendChild(ov);
    });
  }

  /* ================= Pins with A/B/C stacking ================= */
  function layoutPins(){
    const tl = document.getElementById('timeline'); if(!tl) return;
    const slots = Array.from(tl.querySelectorAll('.para-slot')); if(!slots.length) return;

    const ord=getOrd(), frames=getFrameSet(), reads=getReadSet(), imgData=getImageData();

    slots.forEach((slot, idx)=>{
      const p=idx+1;
      Array.from(slot.querySelectorAll('.read-pin,.frame-pin,.image-pin')).forEach(n=>n.remove());

      const items=[];
      if (frames.has(p)) items.push({type:'frame', order:(ord.get(p)||{}).frame ?? 1}); // default frame A
      if (reads.has(p))  items.push({type:'read',  order:(ord.get(p)||{}).read  ?? 2}); // default read B
      if (imgData.set.has(p)) items.push({type:'image', order:(imgData.ord.get(p) ?? 3)}); // default image C

      if (!items.length) return;

      items.sort((a,b)=>(a.order??99)-(b.order??99)); // A < B < C

      const gap=6; const base=-((items.length-1)/2)*gap;
      items.forEach((it,i)=>{
        const el=document.createElement('i');
        el.className =
          it.type==='frame' ? 'frame-pin' :
          it.type==='read'  ? 'read-pin'  : 'image-pin';
        el.style.left   = `calc(50% + ${base + i*gap}px)`;
        el.style.zIndex = String(100 - (it.order ?? 99)); // A above B above C
        slot.appendChild(el);
      });
    });
  }

  /* ================= Info panel counts (now includes images) ================= */
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

    const imgData = getImageData();
    const imageCount = imgData.set.size;

    // Try update existing spans; else create a compact vt-stats line
    const setText = (sel, text)=>{
      const el = $(sel, panel);
      if (el) el.textContent = text;
      return !!el;
    };
    const updated =
      setText('#paraCount', String(paraCount)) |
      setText('#readCount', String(readCount)) |
      setText('#frameCount', String(frameCount)) |
      setText('#imageCount', String(imageCount));

    if (!updated){
      if (!$('#vt-stats', panel)){
        const div = document.createElement('div');
        div.className = 'vt-stats'; div.id = 'vt-stats';
        div.innerHTML = `
          <span><b>Avsnitt:</b> <span id="vt-paras">${paraCount}</span></span>
          <span>📖 <b>Les-skriftsteder:</b> <span id="vt-reads">${readCount}</span></span>
          <span><img class="ic" src="./img/box-icon.png" alt=""> <b>Rammer:</b> <span id="vt-frames">${frameCount}</span></span>
          <span><img class="ic" src="./img/image-icon.png" alt=""> <b>Bilder:</b> <span id="vt-images">${imageCount}</span></span>
        `;
        panel.appendChild(div);
      } else {
        $('#vt-paras', panel).textContent   = String(paraCount);
        $('#vt-reads', panel).textContent   = String(readCount);
        $('#vt-frames', panel).textContent  = String(frameCount);
        $('#vt-images', panel).textContent  = String(imageCount);
      }
    }
  }

  /* ================= Apply & observe ================= */
  function applyAll(){
    applyTwoToneWithGroups();
    placeGroupOverlays();
    layoutPins();
    keepMessageStable();
    updateStats();
  }
  function startObservers(){
    const tl = $('#timeline'); if (!tl) return;
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

  /* ================= Limit dropdown to prev + current + next 3 (robust) ================= */
  (function limitArticleDropdown(){
    function mondayLocal(d=new Date()){
      const day=d.getDay(); const diff=(day===0?-6:1-day);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()+diff);
    }
    function fmt(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}` }
    function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }

    const allowSet = (()=>{
      const curr=mondayLocal(new Date());
      const prev=addDays(curr,-7), n1=addDays(curr,7), n2=addDays(curr,14), n3=addDays(curr,21);
      return new Set([fmt(prev), fmt(curr), fmt(n1), fmt(n2), fmt(n3)]);
    })();

    function getWeekStartFromOption(opt){
      try{
        const v = JSON.parse(opt.value);
        if (v && typeof v.week_start === 'string') return v.week_start;
      }catch{}
      if (opt.dataset && typeof opt.dataset.week_start === 'string') return opt.dataset.week_start;
      const m = (opt.textContent||'').match(/\b\d{4}-\d{2}-\d{2}\b/);
      if (m) return m[0];
      return null;
    }

    function filterWeekSel(){
      const sel=document.getElementById('weekSel'); if (!sel) return;

      const opts=Array.from(sel.options);
      let firstKeptIndex = -1, currentWeekIndex = -1;

      opts.forEach((opt, idx)=>{
        const ws = getWeekStartFromOption(opt);
        const keep = !!(ws && allowSet.has(ws));
        opt.hidden = !keep;
        opt.disabled = !keep;
        if (keep && firstKeptIndex === -1) firstKeptIndex = idx;
        const arr = Array.from(allowSet); const current = arr[1];
        if (keep && ws === current) currentWeekIndex = idx;
      });

      const anyKept = opts.some(o=>!o.hidden && !o.disabled);
      if (!anyKept) return;

      let targetIndex = currentWeekIndex !== -1 ? currentWeekIndex : firstKeptIndex;
      if (targetIndex !== -1) {
        sel.selectedIndex = targetIndex;
        sel.dispatchEvent(new Event('change', {bubbles:true}));
      }
    }

    function run(){ filterWeekSel(); setTimeout(filterWeekSel,300); setTimeout(filterWeekSel,1200); }
    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', run); else run();

    const hook=()=>{ const sel=document.getElementById('weekSel'); if (sel) new MutationObserver(()=>filterWeekSel()).observe(sel,{childList:true, subtree:false}); };
    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', hook); else hook();
  })();

})();
