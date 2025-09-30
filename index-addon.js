// index-addon.js — v1.75 + robust currentItem + images (pins/count/message) + group labels + A/B/C stacking + dropdown limit
// - To grønntoner, flip etter hele grupper (grupper arver første tone)
// - Én overlaylabel per gruppe ("4&5" / "10–12"), piksel-presist midtstilt
// - Les/Ramme/Bilde-ikoner på samme linje under tidslinjen; A > B > C (z-index og rekkefølge)
// - Infofelt viser Avsnitt, Les-skriftsteder, Rammer og Bilder
// - Meldingstekst inkluderer + Ramme / + Les-skriftsted / + Bilde i A/B/C-rekkefølge
// - Robust henting av "current item" (fungerer uansett om siden bruker currentItem/ITEM/DATA.items + weekSel)
// - Dropdown viser bare forrige uke + denne + neste 3 uker (robust mot ulike option-formater)

(function(){
  /* ================= CSS ================= */
  (function ensureCSS(){
    if (document.querySelector('style[data-index-addon]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-index-addon','');
    style.textContent = `
      /* Pins: alle på samme linje under tidslinjen */
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
        width:12px; height:12px;
        background:url('./img/box-icon.png') center/contain no-repeat;
      }
      #timeline .para-slot i.image-pin{
        width:14px; height:14px;
        background:url('./img/image-icon.png') center/contain no-repeat;
      }

      /* Ryddige tall i slottene */
      #timeline .para-slot{ text-shadow:none !important; }

      :root{
        --vt-tone-light:#EAF4EE;
        --vt-tone-dark:#CFE7D6;
      }
      #timeline{ position:relative; } /* for overlayene */
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

      /* Gruppe-overlays (bold, samme str som tall) */
      #timeline .vt-group-overlays{
        position:absolute; left:0; top:0; right:0; bottom:0; pointer-events:none;
      }
      #timeline .vt-group-overlay{
        position:absolute; top:0; height:100%;
        display:flex; align-items:center; justify-content:center;
        font-weight:900; font-size:12px; line-height:1.2;
        color:#2b3432; opacity:.96;
      }

      /* Skjul kun tall-innholdet i gruppeslots (ikke bakgrunn/pins) */
      #timeline .para-slot.vt-in-group > div{ visibility:hidden; }

      /* Fallback infolinje hvis siden ikke har sin egen */
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
    const it = getCurrentItemSafe();
    if (it && typeof it.groups === 'string') return parseGroupsString(it.groups);
    return window.__VT_GROUPS || [];
  }
  function rangeLabel(nums){
    const s=[...new Set(nums)].sort((a,b)=>a-b);
    if (s.length===1) return `Avsnitt ${s[0]}`;
    if (s.length===2 && s[1]===s[0]+1) return `Avsnittene ${s[0]} og ${s[1]}`;
    return `Avsnittene ${s[0]}–${s[s.length-1]}`;
  }

  /* ================= Robust "current item" ================= */
  function getItemsArray(){
    if (window.DATA && Array.isArray(window.DATA.items)) return window.DATA.items;
    if (Array.isArray(window.items)) return window.items;
    if (Array.isArray(window.ARTICLES)) return window.ARTICLES;
    return [];
  }
  function getCurrentItemSafe(){
    // direkte
    if (window.currentItem && typeof window.currentItem === 'object') return window.currentItem;
    if (window.ITEM && typeof window.ITEM === 'object') return window.ITEM;

    // via weekSel
    const items = getItemsArray();
    const sel = document.getElementById('weekSel');
    if (sel && sel.selectedIndex >= 0){
      const opt = sel.options[sel.selectedIndex];
      // a) JSON i value
      try {
        const v = JSON.parse(opt.value);
        if (v && v.week_start) {
          const found = items.find(it => it.week_start === v.week_start);
          if (found) return found;
        }
      } catch {}
      // b) data-week_start
      if (opt.dataset && opt.dataset.week_start){
        const found = items.find(it => it.week_start === opt.dataset.week_start);
        if (found) return found;
      }
      // c) dato i tekst
      const m = (opt.textContent||'').match(/\b\d{4}-\d{2}-\d{2}\b/);
      if (m){
        const found = items.find(it => it.week_start === m[0]);
        if (found) return found;
      }
    }

    // fallback
    if (items.length === 1) return items[0];
    return null;
  }

  /* ================= Expand refs med a/b/c ================= */
  // Støtter: 5a, "4-5b", "10–12c", "7&8a", 15
  function expandRefsWithOrder(refs){
    const set = new Set();
    const ord = new Map(); // p -> 1|2|3 (a|b|c)
    if (!Array.isArray(refs)) return {set, ord};

    const of = ch => ch ? ({a:1,b:2,c:3}[ch.toLowerCase()]||undefined) : undefined;
    const apply = (a,b,o)=>{ const lo=Math.min(a,b), hi=Math.max(a,b); for(let i=lo;i<=hi;i++){ set.add(i); if(o) ord.set(i,o);} };

    refs.forEach(v=>{
      if (typeof v === 'number' && Number.isFinite(v)) { set.add(v); return; }
      if (typeof v !== 'string') return;
      const s = v.trim();

      let m = s.match(/^(\d+)[\-–](\d+)([abc])?$/i);
      if (m){ apply(+m[1], +m[2], of(m[3])); return; }

      m = s.match(/^(\d+)&(\d+)([abc])?$/i);
      if (m){ const o=of(m[3]); set.add(+m[1]); set.add(+m[2]); if(o){ord.set(+m[1],o); ord.set(+m[2],o);} return; }

      m = s.match(/^(\d+)([abc])?$/i);
      if (m){ const p=+m[1], o=of(m[2]); set.add(p); if(o) ord.set(p,o); }
    });
    return {set, ord};
  }

  /* ================= Two tones med grupper ================= */
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

  /* ================= Data-aksess til pins ================= */
  const getReadSet  = ()=> window.__VT_READ_SET2 instanceof Set ? window.__VT_READ_SET2 : (window.readSet || new Set());
  const getFrameSet = ()=> window.__VT_FRAME_SET   instanceof Set ? window.__VT_FRAME_SET   : new Set();
  const getOrd      = ()=> window.__VT_ORD         instanceof Map ? window.__VT_ORD         : new Map();

  function getImageData(){
    const it = getCurrentItemSafe();
    if (!it || !Array.isArray(it.images)) return { set:new Set(), ord:new Map() };
    return expandRefsWithOrder(it.images);
  }

  function getParaCount(){
    const it = getCurrentItemSafe();
    if (it && Array.isArray(it.words)) return it.words.length;
    if (it && Array.isArray(it.para_lengths)) return it.para_lengths.length;
    const tl = $('#timeline'); if (tl) return $$('.para-slot', tl).length;
    return 0;
  }

  /* ================= Meldinger (A/B/C) ================= */
  function joinParts(arr){
    if (arr.length===1) return arr[0];
    if (arr.length===2) return `${arr[0]} og ${arr[1]}`;
    return `${arr.slice(0,-1).join(', ')} og ${arr[arr.length-1]}`;
  }
  function buildSingleMsg(p){
    const frames=getFrameSet(), reads=getReadSet(), imgData=getImageData();
    const hasF=frames.has(p), hasR=reads.has(p), hasI=imgData.set.has(p);
    if (!hasF && !hasR && !hasI) return rangeLabel([p]);

    const ord=getOrd(), o = ord.get(p)||{};
    const oF = hasF ? (o.frame ?? 1) : null;  // frame default A
    const oR = hasR ? (o.read  ?? 2) : null;  // read  default B
    const oI = hasI ? (imgData.ord.get(p) ?? 3) : null; // image default C

    const parts=[];
    if (hasF) parts.push({label:'Ramme',         order:oF??99});
    if (hasR) parts.push({label:'Les-skriftsted',order:oR??99});
    if (hasI) parts.push({label:'Bilde',         order:oI??99});
    parts.sort((a,b)=>a.order-b.order);

    return `${rangeLabel([p])} + ${joinParts(parts.map(x=>x.label))}`;
  }
  function buildGroupMsg(g){
    const frames=getFrameSet(), reads=getReadSet(), imgData=getImageData();
    const ord=getOrd();

    let hasF=false, hasR=false, hasI=false;
    let oF=Infinity, oR=Infinity, oI=Infinity;

    for (const p of g){
      if (frames.has(p)){ hasF=true; oF=Math.min(oF, (ord.get(p)||{}).frame ?? 1); }
      if (reads.has(p)){  hasR=true; oR=Math.min(oR, (ord.get(p)||{}).read  ?? 2); }
      if (imgData.set.has(p)){ hasI=true; oI=Math.min(oI, imgData.ord.get(p) ?? 3); }
    }

    if (!hasF && !hasR && !hasI) return rangeLabel(g);

    const parts=[];
    if (hasF) parts.push({label:'Ramme',         order:oF});
    if (hasR) parts.push({label:'Les-skriftsted',order:oR});
    if (hasI) parts.push({label:'Bilde',         order:oI});
    parts.sort((a,b)=>a.order-b.order);

    return `${rangeLabel(g)} + ${joinParts(parts.map(x=>x.label))}`;
  }
  function buildMsgFor(p){
    const groups=getGroups();
    for (const g of groups){ if (g.includes(p)) return buildGroupMsg(g); }
    return buildSingleMsg(p);
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

  /* ================= Group overlays ================= */
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

  /* ================= Pins (A/B/C-stabling) ================= */
  function layoutPins(){
    const tl = document.getElementById('timeline'); if(!tl) return;
    const slots = Array.from(tl.querySelectorAll('.para-slot')); if(!slots.length) return;

    const ord=getOrd(), frames=getFrameSet(), reads=getReadSet(), imgData=getImageData();

    slots.forEach((slot, idx)=>{
      const p=idx+1;
      Array.from(slot.querySelectorAll('.read-pin,.frame-pin,.image-pin')).forEach(n=>n.remove());

      const items=[];
      if (frames.has(p)) items.push({type:'frame', order:(ord.get(p)||{}).frame ?? 1}); // A
      if (reads.has(p))  items.push({type:'read',  order:(ord.get(p)||{}).read  ?? 2}); // B
      if (imgData.set.has(p)) items.push({type:'image', order:(imgData.ord.get(p) ?? 3)}); // C

      if (!items.length) return;

      items.sort((a,b)=>(a.order??99)-(b.order??99)); // A < B < C

      const gap=6; const base=-((items.length-1)/2)*gap;
      items.forEach((it,i)=>{
        const el=document.createElement('i');
        el.className =
          it.type==='frame' ? 'frame-pin' :
          it.type==='read'  ? 'read-pin'  : 'image-pin';
        el.style.left   = `calc(50% + ${base + i*gap}px)`;
        el.style.zIndex = String(100 - (it.order ?? 99)); // A over B over C
        slot.appendChild(el);
      });
    });
  }

  /* ================= Info panel (inkl. Bilder) ================= */
  function findInfoPanel(){
    const candidates = [
      '#article-info','#articleInfo','#article-panel','#articlePanel',
      '.article-info','.article-meta','.article-details','#info'
    ];
    for (const sel of candidates){ const el = document.querySelector(sel); if (el) return el; }

    // Fallback: legg en bar øverst i artikkelområdet
    let host = document.querySelector('#article') || document.querySelector('#content') || document.body;
    let bar = document.getElementById('vt-stats-host');
    if (!bar){
      bar = document.createElement('div');
      bar.id = 'vt-stats-host';
      bar.style.margin = '8px 0';
      host.prepend(bar);
    }
    return bar;
  }
  function updateStats(){
    const panel = findInfoPanel(); if (!panel) return;

    const it = getCurrentItemSafe();
    const paraCount =
      it && Array.isArray(it.words) ? it.words.length :
      it && Array.isArray(it.para_lengths) ? it.para_lengths.length :
      ($$('#timeline .para-slot').length || 0);

    const readCount  = (getReadSet && getReadSet().size) || 0;
    const frameCount = (getFrameSet && getFrameSet().size) || 0;
    const imageCount = (getImageData && getImageData().set.size) || 0;

    const setText = (sel, text)=>{
      const el = panel.querySelector(sel);
      if (el) el.textContent = text;
      return !!el;
    };
    const updated =
      setText('#paraCount',  String(paraCount)) |
      setText('#readCount',  String(readCount)) |
      setText('#frameCount', String(frameCount)) |
      setText('#imageCount', String(imageCount));

    if (!updated){
      panel.innerHTML = `
        <div class="vt-stats" id="vt-stats">
          <span><b>Avsnitt:</b> <span id="vt-paras">${paraCount}</span></span>
          <span>📖 <b>Les-skriftsteder:</b> <span id="vt-reads">${readCount}</span></span>
          <span><img class="ic" src="./img/box-icon.png" alt=""> <b>Rammer:</b> <span id="vt-frames">${frameCount}</span></span>
          <span><img class="ic" src="./img/image-icon.png" alt=""> <b>Bilder:</b> <span id="vt-images">${imageCount}</span></span>
        </div>
      `;
    } else {
      const vp = panel.querySelector('#vt-paras');  if (vp) vp.textContent = String(paraCount);
      const vr = panel.querySelector('#vt-reads');  if (vr) vr.textContent = String(readCount);
      const vf = panel.querySelector('#vt-frames'); if (vf) vf.textContent = String(frameCount);
      const vi = panel.querySelector('#vt-images'); if (vi) vi.textContent = String(imageCount);
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

  /* ================= Begrens dropdown: forrige + denne + 3 neste (robust) ================= */
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

  /* ====== liten engangssjekk i konsoll (kan fjernes) ====== */
  setTimeout(()=>{
    const it = getCurrentItemSafe();
    const img = getImageData();
    console.log('[VT] currentItem:', it?.title, it?.week_start);
    console.log('[VT] images count:', img.set.size, 'sample:', Array.from(img.set).slice(0,10));
  }, 600);

})();
