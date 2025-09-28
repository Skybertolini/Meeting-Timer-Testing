
// === VT Addon 1.58: two-tone (group-aware) + spaced pins (frame↑ / read↓) + per-selection message only ===
(function(){
  (function ensureCSS(){
    if (document.querySelector('style[data-vt-addon-1_58]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-vt-addon-1_58','');
    style.textContent = `
      .frame-pin{position:absolute; left:50%; transform:translateX(-50%); top:-24px; bottom:auto; width:16px; height:16px; background:url('./img/box-icon.png') center/contain no-repeat; pointer-events:none}
      .read-pin{position:absolute; left:50%; transform:translateX(-50%); bottom:-24px; top:auto; width:16px; height:16px; background:url('./img/read-icon.png') center/contain no-repeat; pointer-events:none}
    `;
    document.head.appendChild(style);
  })();

  const parseGroupsString = (str)=>{
    if (!str || typeof str !== 'string') return [];
    return str.split(',').map(s=>s.trim()).flatMap(token=>{
      const m = token.match(/^(\d+)(?:-(\d+))?$/);
      if (!m) return [];
      const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
      const group=[]; for(let x=a;x<=b;x++) group.push(x);
      return [group];
    });
  };
  const parseAnnoFlexible = (entry)=>{
    if (typeof entry === 'number') return { para: entry, order: null };
    const m = String(entry).toLowerCase().trim().match(/^(\d+)([a-z])?$/);
    if (!m) return null;
    return { para: Number(m[1]), order: m[2] ?? null };
  };
  const buildAnnotations = (frames=[], reads=[], legacyReadParas=null)=>{
    const ordIdx = o => (o ? (o.charCodeAt(0) - 96) : null);
    const ann = new Map();
    const upsert = (p, key, o) => {
      if (!ann.has(p)) ann.set(p, { frame: null, read: null });
      ann.get(p)[key] = { present: true, ordIdx: ordIdx(o) };
    };
    if (Array.isArray(frames)) frames.map(parseAnnoFlexible).filter(Boolean).forEach(x => upsert(x.para, 'frame', x.order));
    if (Array.isArray(reads) && reads.length) reads.map(parseAnnoFlexible).filter(Boolean).forEach(x => upsert(x.para, 'read', x.order));
    else if (Array.isArray(legacyReadParas)) legacyReadParas.forEach(p => upsert(Number(p), 'read', null));
    return ann;
  };
  const rangeLabel = (nums)=>{
    const sorted = [...new Set(nums)].sort((a,b)=>a-b);
    const contiguous = sorted.every((v,i)=> i===0 || v === sorted[i-1] + 1);
    if (sorted.length === 1) return `Avsnitt ${sorted[0]}`;
    if (sorted.length === 2 && sorted[1] === sorted[0] + 1) return `Avsnittene ${sorted[0]} og ${sorted[1]}`;
    return contiguous ? `Avsnittene ${sorted[0]}–${sorted[sorted.length-1]}` : `Avsnittene ${sorted.join('+')}`;
  };
  const orderExtrasForParas = (paras, ann)=>{
    let hasF=false, hasR=false, minF=null, minR=null;
    for (const p of paras) {
      const a = ann.get(p); if (!a) continue;
      if (a.frame?.present){ hasF=true; if(a.frame.ordIdx!=null) minF = (minF==null? a.frame.ordIdx : Math.min(minF,a.frame.ordIdx)); }
      if (a.read?.present) { hasR=true; if(a.read.ordIdx!=null)  minR = (minR==null? a.read.ordIdx  : Math.min(minR, a.read.ordIdx)); }
    }
    if (!hasF && !hasR) return [];
    if (hasF && hasR) {
      if (minF!=null || minR!=null) return ((minF ?? 1e9) <= (minR ?? 1e9)) ? ['Ramme','Les-skriftsted'] : ['Les-skriftsted','Ramme'];
      return ['Ramme','Les-skriftsted'];
    }
    return hasF ? ['Ramme'] : ['Les-skriftsted'];
  };

  function getGroups(){
    if (Array.isArray(window.__VT_GROUPS)) return window.__VT_GROUPS;
    const it = window.currentItem || window.ITEM || null;
    if (it && typeof it.groups === 'string') return parseGroupsString(it.groups);
    return [];
  }
  function getAnnotations(){
    if (window.__VT_ANN instanceof Map) return window.__VT_ANN;
    const it = window.currentItem || window.ITEM || null;
    if (!it) return new Map();
    const frames = Array.isArray(it.frames) ? it.frames : [];
    const reads = Array.isArray(it.reads) ? it.reads : [];
    const legacy = Array.isArray(it.readParas) ? it.readParas : (Array.isArray(it.read_paras) ? it.read_paras : null);
    return buildAnnotations(frames, reads, legacy);
  }

  function applyTwoToneAlternation(){
    const tl = document.getElementById('timeline'); if(!tl) return;
    const slots = Array.from(tl.querySelectorAll('.para-slot'));
    if (!slots.length) return;
    const groups = getGroups();
    const starts = new Map();
    groups.forEach(g => { if (g && g.length) starts.set(g[0], g); });

    const tones = new Map();
    let tone = false;
    let i = 1;
    while (i <= slots.length){
      if (starts.has(i)){
        const g = starts.get(i);
        g.forEach(p => tones.set(p, tone));
        tone = !tone;
        i = g[g.length - 1] + 1;
      } else {
        tones.set(i, tone);
        tone = !tone;
        i += 1;
      }
    }
    slots.forEach((slot, idx) => {
      const p = idx+1;
      slot.classList.remove('alt');
      if (tones.get(p)) slot.classList.add('alt');
    });
  }

  function layoutPinsWithSpacing(){
    const tl = document.getElementById('timeline'); if(!tl) return;
    const slots = Array.from(tl.querySelectorAll('.para-slot'));
    if (!slots.length) return;
    const ann = getAnnotations();
    const PIN_SPACING = 18;
    slots.forEach((slot, idx) => {
      slot.querySelectorAll('.read-pin,.frame-pin').forEach(n => n.remove());
      const p = idx+1;
      const a = ann.get(p);
      if (!a) return;
      const items = [];
      if (a.frame?.present) items.push({type:'frame', order: a.frame.ordIdx ?? 1});
      if (a.read?.present)  items.push({type:'read',  order: a.read.ordIdx  ?? 2});
      if (!items.length) return;
      items.sort((x,y)=>x.order-y.order);
      const base = -((items.length-1)/2)*PIN_SPACING;
      items.forEach((it, i) => {
        const pin = document.createElement('i');
        pin.className = it.type === 'frame' ? 'frame-pin' : 'read-pin';
        pin.style.left = `calc(50% + ${base + i*PIN_SPACING}px)`;
        slot.appendChild(pin);
      });
    });
  }

  function bindSelectionMessage(){
    const tl = document.getElementById('timeline'); if(!tl) return;
    const slots = Array.from(tl.querySelectorAll('.para-slot'));
    if (!slots.length) return;
    const msg = document.getElementById('message');
    const groups = getGroups();
    const starts = new Map();
    groups.forEach(g => { if (g && g.length) starts.set(g[0], g); });
    const ann = getAnnotations();

    // helper available in closure
    window.rangeLabel = window.rangeLabel || function(nums){
      const sorted = [...new Set(nums)].sort((a,b)=>a-b);
      const contiguous = sorted.every((v,i)=> i===0 || v === sorted[i-1] + 1);
      if (sorted.length === 1) return `Avsnitt ${sorted[0]}`;
      if (sorted.length === 2 && sorted[1] === sorted[0] + 1) return `Avsnittene ${sorted[0]} og ${sorted[1]}`;
      return contiguous ? `Avsnittene ${sorted[0]}–${sorted[sorted.length-1]}` : `Avsnittene ${sorted.join('+')}`;
    };

    slots.forEach((slot, idx) => {
      slot.removeEventListener('click', slot.__vtMsgHandler || (()=>{}));
      const handler = ()=>{
        const p = idx+1;
        const grp = starts.get(p) || [p];
        const extras = orderExtrasForParas(grp, ann);
        if (msg){
          msg.textContent = extras.length ? `${rangeLabel(grp)} + ${extras.join(' og ')}` : rangeLabel(grp);
        }
      };
      slot.__vtMsgHandler = handler;
      slot.addEventListener('click', handler);
    });
  }

  function applyAll(){ applyTwoToneAlternation(); layoutPinsWithSpacing(); bindSelectionMessage(); }

  const _orig = window.drawTimeline;
  if (typeof _orig === 'function'){
    window.drawTimeline = function(){
      const r = _orig.apply(this, arguments);
      try { applyAll(); } catch(e){}
      return r;
    };
  }

  const observer = new MutationObserver(()=>{ try{ applyAll(); }catch(e){} });
  const startObserver = ()=>{
    const tl = document.getElementById('timeline');
    if (!tl) return;
    observer.observe(tl, {childList:true, subtree:true, attributes:true, attributeFilter:['class','style']});
  };

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ applyAll(); startObserver(); });
  } else {
    applyAll(); startObserver();
  }
})();
