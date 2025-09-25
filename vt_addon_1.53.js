
// === VT Addon 1.53: two-tone (group-aware) + spaced pins (no overlap) ===
(function(){
  // Ensure minimal CSS for frame-pin if not present
  (function ensureCSS(){
    const id = "vt-addon-1_53-style";
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      .frame-pin{position:absolute; left:50%; transform:translateX(-50%); bottom:-24px; width:16px; height:16px; background:url('./img/box-icon.png') center/contain no-repeat; pointer-events:none; opacity:.98}
    `;
    document.head.appendChild(style);
  })();

  function applyTwoToneAlternation(){
    const t = document.getElementById('timeline'); if(!t) return;
    const slots = Array.from(t.querySelectorAll('.para-slot'));
    if (!slots.length) return;
    const groups = Array.isArray(window.__VT_GROUPS) ? window.__VT_GROUPS : [];
    const starts = new Map();
    groups.forEach(g => { if (g && g.length) starts.set(g[0], g); });

    // false=light, true=dark; start light
    const tones = new Map();
    let tone = false;
    let i = 1;
    while (i <= slots.length){
      if (starts.has(i)){
        const g = starts.get(i);
        g.forEach(p => tones.set(p, tone));
        tone = !tone;              // flip once for the whole group
        i = g[g.length - 1] + 1;   // jump past group
      } else {
        tones.set(i, tone);
        tone = !tone;
        i += 1;
      }
    }
    // Apply by toggling a single 'alt' class (base CSS should already define two tones)
    slots.forEach((slot, idx) => {
      const p = idx+1;
      slot.classList.remove('alt');
      if (tones.get(p)) slot.classList.add('alt');
    });
  }

  function layoutPinsWithSpacing(){
    const t = document.getElementById('timeline'); if(!t) return;
    const slots = Array.from(t.querySelectorAll('.para-slot'));
    const ann = window.__VT_ANN || new Map();
    const PIN_SPACING = 18; // px between icons
    slots.forEach((slot, idx) => {
      // remove any existing pins to avoid overlap/duplicates
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

  // Hook after the app draws the timeline
  const _origDrawTimeline = window.drawTimeline;
  if (typeof _origDrawTimeline === 'function'){
    window.drawTimeline = function(){
      const r = _origDrawTimeline.apply(this, arguments);
      try { applyTwoToneAlternation(); layoutPinsWithSpacing(); } catch(e){}
      return r;
    };
  } else {
    // Fallback: try at load
    window.addEventListener('load', () => { try { applyTwoToneAlternation(); layoutPinsWithSpacing(); } catch(e){} });
  }
})();
