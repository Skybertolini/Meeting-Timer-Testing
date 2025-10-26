
/*! index_addon_1.28.js — jank fix for VT-timer
   Goals:
   - Stop clock stutter caused by excessive MutationObserver-triggered layout work
   - Keep *all* existing UI/features intact (no removals)
   - Coalesce updates to max once per animation frame
   - Only run heavy work when the timeline structure actually changes
   Integration:
   - Use this as a drop-in replacement for your current index_addon.js
   - Or include it AFTER your existing scripts; it will auto-wire safely.
*/
(function () {
  'use strict';

  // ---- small utilities ------------------------------------------------------
  function $(sel, root){ return (root||document).querySelector(sel); }
  function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }

  function whenTimelineReady(cb){
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', check);
    } else {
      check();
    }
    function check(){
      // Wait until #timeline exists in DOM
      const t0 = Date.now();
      (function wait(){
        const tl = $('#timeline');
        if (tl) { cb(tl); return; }
        if (Date.now() - t0 > 10000) return; // give up after 10s silently
        requestAnimationFrame(wait);
      })();
    }
  }

  // ---- coalesced apply ------------------------------------------------------
  let applyScheduled = false;
  function coalescedApply(){
    if (applyScheduled) return;
    applyScheduled = true;
    requestAnimationFrame(() => {
      applyScheduled = false;
      safeApply();
    });
  }

  // Keep a *reference* to the original applyAll (if present)
  const originalApplyAll = (typeof window.applyAll === 'function')
    ? window.applyAll.bind(window)
    : null;

  // Some projects expose lighter-weight helpers; call if available
  const keepMessageStable     = (typeof window.keepMessageStable === 'function') ? window.keepMessageStable.bind(window) : null;
  const updateStats           = (typeof window.updateStats === 'function') ? window.updateStats.bind(window) : null;
  const placeGroupOverlays    = (typeof window.placeGroupOverlays === 'function') ? window.placeGroupOverlays.bind(window) : null;
  const applyTwoToneWithGroups= (typeof window.applyTwoToneWithGroups === 'function') ? window.applyTwoToneWithGroups.bind(window) : null;
  const layoutPins            = (typeof window.layoutPins === 'function') ? window.layoutPins.bind(window) : null;
  const getGroupsFn           = (typeof window.getGroups === 'function') ? window.getGroups.bind(window) : null;

  // Structure signature: number of para slots + groups signature (if available)
  let __lastSig = { count: -1, groupsKey: '' };

  function computeSignature(){
    const tl = $('#timeline');
    if (!tl) return { count: -1, groupsKey: '' };
    const slots = $all('.para-slot', tl);
    let groupsKey = '';
    try {
      if (getGroupsFn) {
        const g = getGroupsFn();
        // stringify in a stable way
        groupsKey = JSON.stringify(g);
      }
    } catch(_) { /* ignore */ }
    return { count: slots.length, groupsKey };
  }

  // Run heavy updates only when structure changed
  function safeApply(){
    const sig = computeSignature();
    const same = (sig.count === __lastSig.count) && (sig.groupsKey === __lastSig.groupsKey);

    if (!same){
      __lastSig = sig;

      // If the project provides a dedicated heavy layout function, prefer calling it;
      // otherwise call original applyAll.
      if (applyTwoToneWithGroups || placeGroupOverlays || layoutPins){
        try { applyTwoToneWithGroups && applyTwoToneWithGroups(); } catch(_){}
        try { placeGroupOverlays && placeGroupOverlays(); } catch(_){}
        try { layoutPins && layoutPins(); } catch(_){}
      } else if (originalApplyAll){
        try { originalApplyAll(); } catch(_){}
      } else {
        // nothing to do
      }
    }

    // Lightweight updates can still run every frame if available
    try { keepMessageStable && keepMessageStable(); } catch(_){}
    try { updateStats && updateStats(); } catch(_){}
  }

  // ---- observers (Mutation + Resize) ----------------------------------------
  function startObservers(tl){
    // IMPORTANT: We ignore attribute changes to avoid reflow storms while the clock ticks
    const mo = new MutationObserver((mutations) => {
      // Only react to structural changes (childList)
      for (const m of mutations){
        if (m.type === 'childList'){
          coalescedApply();
          break;
        }
      }
    });
    mo.observe(tl, { childList: true, subtree: true });

    // Also watch for size changes that could affect layout
    if ('ResizeObserver' in window){
      const ro = new ResizeObserver(() => coalescedApply());
      ro.observe(tl);
    }

    // Initial pass
    coalescedApply();
  }

  // ---- hook into existing render/draw timeline functions --------------------
  (function wireHooks(){
    const wrap = (fnName) => {
      const orig = window[fnName];
      if (typeof orig !== 'function') return;
      if (orig.__wrapped_by_addon_128) return; // avoid double wrapping
      function wrapped(){
        // run original
        const out = orig.apply(this, arguments);
        // then cause one coalesced apply
        coalescedApply();
        return out;
      }
      wrapped.__wrapped_by_addon_128 = true;
      window[fnName] = wrapped;
    };

    wrap('drawTimeline');
    wrap('renderTimeline');
    wrap('rebuildTimeline'); // just in case such a hook exists
  })();

  // ---- init -----------------------------------------------------------------
  whenTimelineReady((tl) => {
    startObservers(tl);
  });

  // ---- optional: smoother ticking helper (not auto-enabled) -----------------
  // If you want a super-stable countdown without setInterval drift,
  // you may call window.__vt_startMonotonicTick(el, durationMs)
  // and control it with the returned controller.
  window.__vt_startMonotonicTick = function(el, durationMs){
    let rafId, startT, pausedAt = 0, running=false;
    function fmt(ms){
      const t = Math.max(0, Math.floor(ms/1000));
      const mm = String(Math.floor(t/60)).padStart(2,'0');
      const ss = String(t%60).padStart(2,'0');
      return mm+':'+ss;
    }
    function paint(remain){
      if (el) el.textContent = fmt(remain);
    }
    function tick(){
      const now = performance.now();
      const elapsed = now - startT + pausedAt;
      const remain = Math.max(0, durationMs - elapsed);
      const s = Math.floor(remain/1000);
      if (s !== tick.prevS){
        tick.prevS = s;
        paint(remain);
      }
      if (remain > 0 && running) rafId = requestAnimationFrame(tick);
    }
    function start(){
      if (running) return;
      running = true;
      startT = performance.now();
      tick.prevS = undefined;
      rafId = requestAnimationFrame(tick);
    }
    function pause(){
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
      pausedAt += performance.now() - startT;
    }
    function stop(){
      running = false;
      cancelAnimationFrame(rafId);
      pausedAt = 0;
    }
    return { start, pause, stop };
  };

})();
