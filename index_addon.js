
/*! index_addon_1.30.js — VT-timer smooth + Norwegian message phrasing
    Implements message text exactly like user's examples:
    - Intro/Review/Outro -> "Introduksjon (maks 1,5 min)", "Repetisjonsspørsmål", "Avslutning (maks 1,5 min)"
    - Paragraphs:
        "Avsnitt N"
        "Avsnitt A og B" (exactly two consecutive)
        "Avsnitt A-B"    (range of >=3 consecutive)
      + optional modifiers joined with ' + ' and ' og ':
        "Les-skriftsted", "Ramme", "Bilde"
    Keeps all existing UI. Coalesces updates and avoids attribute-triggered reflows.
*/
(function(){
  'use strict';

  // ---------- utils ----------
  function $(sel, root){ return (root||document).querySelector(sel); }
  function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }
  function whenTimelineReady(cb){
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', check);
    } else check();
    function check(){
      const t0 = Date.now();
      (function wait(){
        const tl = $('#timeline');
        if (tl){ cb(tl); return; }
        if (Date.now()-t0 > 10000) return;
        requestAnimationFrame(wait);
      })();
    }
  }
  function rectCenterX(r){ return r.left + r.width/2; }
  function containsX(r, x){ return x >= r.left && x <= r.right; }

  // ---------- coalesced apply ----------
  let applyScheduled = false;
  function coalescedApply(){
    if (applyScheduled) return;
    applyScheduled = true;
    requestAnimationFrame(() => { applyScheduled = false; safeApply(); });
  }

  // optional hooks from host app
  const originalApplyAll = (typeof window.applyAll === 'function') ? window.applyAll.bind(window) : null;
  const keepMessageStable      = (typeof window.keepMessageStable === 'function') ? window.keepMessageStable.bind(window) : null;
  const updateStats            = (typeof window.updateStats === 'function') ? window.updateStats.bind(window) : null;
  const placeGroupOverlays     = (typeof window.placeGroupOverlays === 'function') ? window.placeGroupOverlays.bind(window) : null;
  const applyTwoToneWithGroups = (typeof window.applyTwoToneWithGroups === 'function') ? window.applyTwoToneWithGroups.bind(window) : null;
  const layoutPins             = (typeof window.layoutPins === 'function') ? window.layoutPins.bind(window) : null;
  const getGroupsFn            = (typeof window.getGroups === 'function') ? window.getGroups.bind(window) : null;
  const getReadsFn             = (typeof window.getReads === 'function') ? window.getReads.bind(window) : null;
  const getFramesFn            = (typeof window.getFrames === 'function') ? window.getFrames.bind(window) : null;
  const getImagesFn            = (typeof window.getImages === 'function') ? window.getImages.bind(window) : null;

  // ---------- active context ----------
  function getCursorX(){
    const cur = $('#cursor') || $('.cursor') || $('#elapsed') || $('.elapsed');
    if (cur){
      const r = cur.getBoundingClientRect();
      return r.right - 1;
    }
    const tl = $('#timeline');
    if (!tl) return null;
    return rectCenterX(tl.getBoundingClientRect());
    }

  function getActiveParaIndex(){
    const tl = $('#timeline');
    if (!tl) return -1;
    const x = getCursorX();
    if (x == null) return -1;
    const slots = $all('.para-slot', tl);
    for (let i=0;i<slots.length;i++){
      const r = slots[i].getBoundingClientRect();
      if (containsX(r, x)) return i;
    }
    if (slots.length){
      const last = slots[slots.length-1].getBoundingClientRect();
      if (x > last.right) return slots.length-1;
    }
    return -1;
  }

  function atWhichFrame(){
    // Return one of: 'intro','review','outro', or null
    const x = getCursorX();
    if (x == null) return null;
    const frames = [
      { el: $('#introSlot'),  key:'intro'  },
      { el: $('#reviewSlot'), key:'review' },
      { el: $('#outroSlot'),  key:'outro'  }
    ];
    for (const f of frames){
      if (!f.el) continue;
      const r = f.el.getBoundingClientRect();
      if (containsX(r, x)) return f.key;
    }
    return null;
  }

  // ---------- flags (reads/frame/image) ----------
  function isReadPara(idx){
    try{
      if (getReadsFn){
        const reads = getReadsFn() || [];
        const zeroBased = reads.some(n => n === 0);
        return zeroBased ? reads.includes(idx) : reads.includes(idx+1);
      }
    }catch(_){}
    const tl = $('#timeline'); if (!tl) return false;
    const slot = $all('.para-slot', tl)[idx]; if (!slot) return false;
    const c = slot.classList;
    if (c.contains('read') || c.contains('is-read') || c.contains('scripture') || c.contains('les')) return true;
    if (slot.dataset && (slot.dataset.read === '1' || slot.dataset.type === 'read')) return true;
    return false;
  }

  function hasFrameFlag(idx){
    // Prefer data from getFrames() if provided (array of 1-based indices or ranges)
    try{
      if (getFramesFn){
        const arr = getFramesFn() || [];
        const oneIdx = idx+1;
        for (const it of arr){
          if (Array.isArray(it) && it.length===2){
            if (oneIdx>=it[0] && oneIdx<=it[1]) return true;
          } else if (typeof it === 'number'){
            if (it===oneIdx) return true;
          } else if (it && typeof it==='object' && it.from!=null && it.to!=null){
            if (oneIdx>=it.from && oneIdx<=it.to) return true;
          }
        }
      }
    }catch(_){}
    const tl = $('#timeline'); if (!tl) return false;
    const slot = $all('.para-slot', tl)[idx]; if (!slot) return false;
    const c = slot.classList;
    if (c.contains('frame') || c.contains('has-frame') || c.contains('ramme')) return true;
    if (slot.dataset && (slot.dataset.frame==='1' || slot.dataset.ramme==='1')) return true;
    return false;
  }

  function hasImageFlag(idx){
    try{
      if (getImagesFn){
        const imgs = getImagesFn() || [];
        const oneIdx = idx+1;
        for (const it of imgs){
          if (Array.isArray(it) && it.length===2){
            if (oneIdx>=it[0] && oneIdx<=it[1]) return true;
          } else if (typeof it === 'number'){
            if (it===oneIdx) return true;
          } else if (it && typeof it==='object' && it.from!=null && it.to!=null){
            if (oneIdx>=it.from && oneIdx<=it.to) return true;
          }
        }
      }
    }catch(_){}
    const tl = $('#timeline'); if (!tl) return false;
    const slot = $all('.para-slot', tl)[idx]; if (!slot) return false;
    const c = slot.classList;
    if (c.contains('has-image') || c.contains('image') || c.contains('bilde')) return true;
    if (slot.dataset && (slot.dataset.image==='1' || slot.dataset.bilde==='1')) return true;
    return false;
  }

  function groupForIndex(idx){
    try{
      if (getGroupsFn){
        const g = getGroupsFn() || [];
        // normalize to objects with 1-based indices
        const norm = g.map(item => {
          if (Array.isArray(item)) return {from:item[0], to:item[1]};
          if (typeof item==='object' && item) return {from:item.from, to:item.to};
          if (typeof item==='number') return {from:item, to:item};
          return null;
        }).filter(Boolean);
        const one = idx+1;
        for (const r of norm){
          if (one>=r.from && one<=r.to) return r;
        }
      }
    }catch(_){}
    return null;
  }

  // ---------- message formatting ----------
  function joinModifiers(mods){
    if (mods.length===0) return '';
    if (mods.length===1) return ' + ' + mods[0];
    if (mods.length===2) return ' + ' + mods[0] + ' og ' + mods[1];
    // 3+
    const last = mods.pop();
    return ' + ' + mods.join(', ') + ' og ' + last;
  }

  function currentMessage(){
    const frameKey = atWhichFrame();
    if (frameKey){
      if (frameKey==='intro')  return 'Introduksjon (maks 1,5 min)';
      if (frameKey==='review') return 'Repetisjonsspørsmål';
      if (frameKey==='outro')  return 'Avslutning (maks 1,5 min)';
    }

    const i = getActiveParaIndex();
    if (i<0) return '';

    // Base label from group or single paragraph
    let label = '';
    const grp = groupForIndex(i);
    if (grp){
      const len = grp.to - grp.from + 1;
      if (len===1){
        label = `Avsnitt ${grp.from}`;
      } else if (len===2){
        label = `Avsnitt ${grp.from} og ${grp.to}`;
      } else {
        label = `Avsnitt ${grp.from}-${grp.to}`;
      }
    } else {
      label = `Avsnitt ${i+1}`;
    }

    // Modifiers
    const mods = [];
    if (isReadPara(i)) mods.push('Les-skriftsted');
    if (hasFrameFlag(i)) mods.push('Ramme');
    if (hasImageFlag(i)) mods.push('Bilde');

    return label + joinModifiers(mods);
  }

  function updateMessage(){
    const host = $('#message') || $('#messageBox') || $('[data-role="message"]') || $('.message');
    if (!host) return;
    let span = host.querySelector('.msg-meta-addon');
    if (!span){
      span = document.createElement('span');
      span.className = 'msg-meta-addon';
      host.appendChild(document.createTextNode(' '));
      host.appendChild(span);
      span.style.opacity = '0.95';
      span.style.fontWeight = '800';
      span.style.whiteSpace = 'nowrap';
    }
    span.textContent = currentMessage();
  }

  // ---------- structure signature to avoid heavy work ----------
  let __lastSig = { count: -1, groupsKey: '' };
  function computeSignature(){
    const tl = $('#timeline');
    if (!tl) return { count:-1, groupsKey:'' };
    const slots = $all('.para-slot', tl);
    let groupsKey='';
    try{ if (getGroupsFn) groupsKey = JSON.stringify(getGroupsFn()); }catch(_){}
    return { count: slots.length, groupsKey };
  }

  function safeApply(){
    const sig = computeSignature();
    const same = (sig.count===__lastSig.count) && (sig.groupsKey===__lastSig.groupsKey);
    if (!same){
      __lastSig = sig;
      if (applyTwoToneWithGroups || placeGroupOverlays || layoutPins){
        try{ applyTwoToneWithGroups && applyTwoToneWithGroups(); }catch(_){}
        try{ placeGroupOverlays && placeGroupOverlays(); }catch(_){}
        try{ layoutPins && layoutPins(); }catch(_){}
      } else if (originalApplyAll){
        try{ originalApplyAll(); }catch(_){}
      }
    }
    try{ keepMessageStable && keepMessageStable(); }catch(_){}
    try{ updateStats && updateStats(); }catch(_){}
    try{ updateMessage(); }catch(_){}
  }

  // ---------- observers ----------
  function startObservers(tl){
    const mo = new MutationObserver(muts => {
      for (const m of muts){
        if (m.type==='childList'){ coalescedApply(); break; }
      }
    });
    mo.observe(tl, { childList:true, subtree:true });
    if ('ResizeObserver' in window){
      const ro = new ResizeObserver(() => coalescedApply());
      ro.observe(tl);
    }
    coalescedApply();
  }

  // ---------- wire hooks ----------
  (function wireHooks(){
    const wrap = (name)=>{
      const orig = window[name];
      if (typeof orig!=='function') return;
      if (orig.__wrapped_by_addon_130) return;
      function wrapped(){
        const out = orig.apply(this, arguments);
        coalescedApply();
        return out;
      }
      wrapped.__wrapped_by_addon_130 = true;
      window[name] = wrapped;
    };
    wrap('drawTimeline');
    wrap('renderTimeline');
    wrap('rebuildTimeline');
  })();

  // ---------- init ----------
  whenTimelineReady(tl => startObservers(tl));

})();
