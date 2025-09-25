
// === VT Addon 1.54: two-tone (group-aware) + spaced pins + message list + frame pins above ===
(function(){
  // ---- CSS overrides (frame pins above, read pins below) ----
  (function ensureCSS(){
    const id = "vt-addon-1_54-style";
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      .frame-pin{position:absolute; left:50%; transform:translateX(-50%); top:-24px; bottom:auto; width:16px; height:16px; background:url('./img/box-icon.png') center/contain no-repeat; pointer-events:none; opacity:.98}
      .read-pin{position:absolute; left:50%; transform:translateX(-50%); bottom:-24px; top:auto; width:16px; height:16px; background:url('./img/read-icon.png') center/contain no-repeat; pointer-events:none; opacity:.98}
    `;
    document.head.appendChild(style);
  })();

  // ---- Helpers (reuse app state) ----
  function rangeLabel(nums) {
    const sorted = [...new Set(nums)].sort((a,b)=>a-b);
    const contiguous = sorted.every((v,i)=> i===0 || v === sorted[i-1] + 1);
    if (sorted.length === 1) return `Avsnitt ${sorted[0]}`;
    if (sorted.length === 2 && sorted[1] === sorted[0] + 1) return `Avsnittene ${sorted[0]} og ${sorted[1]}`;
    return contiguous ? `Avsnittene ${sorted[0]}–${sorted[sorted.length-1]}` : `Avsnittene ${sorted.join('+')}`;
  }
  function orderExtrasForParas(paras, annotations) {
    let hasF=false, hasR=false, minF=null, minR=null;
    for (const p of paras) {
      const a = annotations.get(p); if (!a) continue;
      if (a.frame?.present){ hasF=true; if(a.frame.ordIdx!=null) minF = (minF==null? a.frame.ordIdx : Math.min(minF,a.frame.ordIdx)); }
      if (a.read?.present) { hasR=true; if(a.read.ordIdx!=null)  minR = (minR==null? a.read.ordIdx  : Math.min(minR, a.read.ordIdx)); }
    }
    if (!hasF && !hasR) return [];
    if (hasF && hasR) {
      if (minF!=null || minR!=null) return ((minF ?? 1e9) <= (minR ?? 1e9)) ? ['Ramme','Les-skriftsted'] : ['Les-skriftsted','Ramme'];
      return ['Ramme','Les-skriftsted'];
    }
    return hasF ? ['Ramme'] : ['Les-skriftsted'];
  }

  // ---- Two-tone alternation (groups = one block) ----
  function applyTwoToneAlternation(){
    const t = document.getElementById('timeline'); if(!t) return;
    const slots = Array.from(t.querySelectorAll('.para-slot'));
    if (!slots.length) return;
    const groups = Array.isArray(window.__VT_GROUPS) ? window.__VT_GROUPS : [];
    const starts = new Map();
    groups.forEach(g => { if (g && g.length) starts.set(g[0], g); });

    const tones = new Map();
    let tone = false; // false=light, true=dark
    let i = 1;
    while (i <= slots.length){
      if (starts.has(i)){
        const g = starts.get(i);
        g.forEach(p => tones.set(p, tone));
        tone = !tone;              // flip once per group
        i = g[g.length - 1] + 1;   // skip group
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

  // ---- Pin layout with spacing (no overlap) ----
  function layoutPinsWithSpacing(){
    const t = document.getElementById('timeline'); if(!t) return;
    const slots = Array.from(t.querySelectorAll('.para-slot'));
    const ann = window.__VT_ANN || new Map();
    const PIN_SPACING = 18; // px between icons
    slots.forEach((slot, idx) => {
      // remove existing pins to avoid duplicates/overlap
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

  // ---- Message list builder ----
  function buildMessageList(){
    const msg = document.getElementById('message'); if (!msg) return;
    const ann = window.__VT_ANN || new Map();
    const groups = Array.isArray(window.__VT_GROUPS) ? window.__VT_GROUPS : [];
    // Determine total paragraphs by counting slots
    const slotEls = document.querySelectorAll('#timeline .para-slot');
    const total = slotEls.length || 0;
    if (!total){ msg.textContent = '—'; return; }

    const starts = new Map();
    groups.forEach(g => { if (g && g.length){ starts.set(g[0], g); }});

    const lines = [];
    let p = 1;
    while (p <= total){
      if (starts.has(p)){
        const g = starts.get(p);
        lines.push(rangeLabel(g));
        p = g[g.length-1] + 1;
      } else {
        const extras = orderExtrasForParas([p], ann);
        if (extras.length){
          lines.push(`${rangeLabel([p])} + ${extras.join(' og ')}`);
        } else {
          lines.push(rangeLabel([p]));
        }
        p++;
      }
    }
    msg.innerHTML = lines.join('<br>');
  }

  function applyAll(){ applyTwoToneAlternation(); layoutPinsWithSpacing(); buildMessageList(); }

  // Hook drawTimeline if present
  const _origDrawTimeline = window.drawTimeline;
  if (typeof _origDrawTimeline === 'function'){
    window.drawTimeline = function(){
      const r = _origDrawTimeline.apply(this, arguments);
      try { applyAll(); } catch(e){}
      return r;
    };
  }

  // Mutation observer fallback: re-apply on changes (robust)
  const observer = new MutationObserver((mutations)=>{
    for (const m of mutations){
      if (m.type === 'childList' || (m.type === 'attributes' && m.target && m.target.classList && m.target.classList.contains('para-slot'))){
        applyAll();
        break;
      }
    }
  });
  const startObserver = ()=>{
    const t = document.getElementById('timeline');
    if (!t) return;
    observer.observe(t, {childList:true, subtree:true, attributes:true, attributeFilter:['class','style']});
  };

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ applyAll(); startObserver(); });
  } else {
    applyAll(); startObserver();
  }
})();
