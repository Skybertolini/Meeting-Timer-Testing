/*! index_addon_1.39.js — merged: grouped text/colors/pins + article window select */
(function(){
  'use strict';

  function $(sel, root){ return (root||document).querySelector(sel); }
  function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }
  function raf(fn){ return requestAnimationFrame(fn); }
  function containsX(r, x){ return x >= r.left && x <= r.right; }

  function cssVarOr(name, fallback){
    const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return val || fallback;
  }
  const GREEN_LIGHT = cssVarOr('--tl-green-1', cssVarOr('--green-2', '#e8f5ec'));
  const GREEN_MED   = cssVarOr('--tl-green-2', cssVarOr('--green',   '#bfe6cd'));

  let scheduled = false;
  function coalesced(fn){
    if (scheduled) return;
    scheduled = true;
    raf(()=>{ scheduled=false; try{ fn(); }catch(_){ } });
  }

  function getCursorX(){
    const ph = $('#playhead') || $('.playhead') || $('#elapsed') || $('.elapsed');
    if (ph){
      const r = ph.getBoundingClientRect();
      return r.right - 1;
    }
    const tl = $('#timeline'); if (!tl) return null;
    const tr = tl.getBoundingClientRect();
    return tr.left + tr.width/2;
  }

  function activeParaIndex(){
    const tl = $('#timeline'); if (!tl) return -1;
    const x = getCursorX(); if (x==null) return -1;
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

  function normalizeRanges(ranges, n){
    if (!Array.isArray(ranges)) return [];
    const arr = ranges.map(r => ({
      from: Math.max(1, Math.min(n, Number(r.from||0))),
      to:   Math.max(1, Math.min(n, Number(r.to||0)))
    })).filter(r => r.from <= r.to);
    arr.sort((a,b)=> a.from - b.from || a.to - b.to);
    const merged = [];
    for (const r of arr){
      const last = merged[merged.length-1];
      if (!last || r.from > last.to + 0){ merged.push({...r}); }
      else { last.to = Math.max(last.to, r.to); }
    }
    return merged;
  }

  function groupRangesFromData(n){
    const out = [];
    if (Array.isArray(window.__VT_GROUPS) && window.__VT_GROUPS.length){
      for (const g of window.__VT_GROUPS){
        if (Array.isArray(g) && g.length){
          const a = Math.min(...g), b = Math.max(...g);
          out.push({from:a, to:b});
        }
      }
      return normalizeRanges(out, n);
    }
    if (typeof window.getGroups === 'function'){
      try{
        const raw = window.getGroups() || [];
        for (const item of raw){
          if (Array.isArray(item) && item.length===2){
            const a = Math.min(item[0], item[1]);
            const b = Math.max(item[0], item[1]);
            out.push({from:a, to:b});
          } else if (item && typeof item==='object' && item.from!=null && item.to!=null){
            const a = Math.min(item.from, item.to);
            const b = Math.max(item.from, item.to);
            out.push({from:a, to:b});
          } else if (typeof item==='number'){
            out.push({from:item, to:item});
          }
        }
        return normalizeRanges(out, n);
      }catch(_){}
    }
    return null;
  }

  function inferGroupFromGeometry(n){
    const tl = $('#timeline'); if (!tl) return [];
    const overlays = $all('[class*="group"]', tl).filter(el => !el.classList.contains('para-slot'));
    const slots = $all('.para-slot', tl);
    const res = [];
    for (const el of overlays){
      const rr = el.getBoundingClientRect();
      if (!rr.width || !rr.height) continue;
      let first=-1, last=-1;
      for (let i=0;i<slots.length;i++){
        const sr = slots[i].getBoundingClientRect();
        const overlap = Math.max(0, Math.min(rr.right, sr.right) - Math.max(rr.left, sr.left));
        if (overlap>0){
          if (first===-1) first=i;
          last=i;
        }
      }
      if (first!==-1 && last!==-1) res.push({from:first+1, to:last+1});
    }
    return normalizeRanges(res, n);
  }

  function getNormalizedGroups(n){
    return groupRangesFromData(n) || inferGroupFromGeometry(n) || [];
  }

  function computeBlocks(n, groups){
    const blocks = [];
    let i = 1;
    while (i <= n){
      let matched = null;
      for (let k=0;k<groups.length;k++){
        const g = groups[k];
        if (g.from === i){ matched = g; break; }
      }
      if (matched){
        blocks.push({from: matched.from, to: matched.to, isGroup:true});
        i = matched.to + 1;
      } else {
        blocks.push({from: i, to: i, isGroup:false});
        i++;
      }
    }
    return blocks;
  }

  function applyGroupAwareColors(){
    const tl = $('#timeline'); if (!tl) return;
    const slots = $all('.para-slot', tl);
    const n = slots.length; if (!n) return;
    const groups = getNormalizedGroups(n);
    const blocks = computeBlocks(n, groups);

    let useLight = true;
    for (const b of blocks){
      for (let p=b.from; p<=b.to; p++){
        const slot = slots[p-1];
        slot.style.background = useLight ? GREEN_LIGHT : GREEN_MED;
      }
      useLight = !useLight;
    }
  }

  function formatGroupLabel(arr){
    if (!arr || !arr.length) return '';
    if (arr.length === 1) return `Avsnitt ${arr[0]}`;
    if (arr.length === 2) return `Avsnittene ${arr[0]} og ${arr[1]}`;
    return `Avsnittene ${arr[0]} - ${arr[arr.length-1]}`;
  }

  function atWhichFrame(){
    const x = getCursorX(); if (x==null) return null;
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

  function currentGroupForIndex(i0){
    const tl = $('#timeline'); if (!tl) return [i0+1];
    const n = $all('.para-slot', tl).length;
    const groups = getNormalizedGroups(n);
    const i1 = i0 + 1;
    for (const g of groups){
      if (i1 >= g.from && i1 <= g.to){
        const arr = [];
        for (let v=g.from; v<=g.to; v++) arr.push(v);
        return arr;
      }
    }
    return [i1];
  }

  function computeMessage(){
    const fr = atWhichFrame();
    if (fr==='intro')  return 'Introduksjon (maks 1,5 min)';
    if (fr==='review') return 'Repetisjonsspørsmål';
    if (fr==='outro')  return 'Avslutning (maks 1,5 min)';
    const idx0 = activeParaIndex(); if (idx0 < 0) return '';
    const grpArr = currentGroupForIndex(idx0);
    return formatGroupLabel(grpArr);
  }

  function findMessageHost(){
    const sel = [
      '#message', '#messageBox', '#message-field', '#msg', '#status',
      '[data-role="message"]', '.message', '.status-line', '.msg', '.hud-message'
    ].join(', ');
    return $(sel);
  }

  function updateMessageField(){
    const host = findMessageHost(); if (!host) return;
    const txt = computeMessage();

    let span = host.querySelector('.msg-group-only');
    if (!span){
      span = document.createElement('span');
      span.className = 'msg-group-only';
      span.style.opacity = '0.95';
      span.style.fontWeight = '800';
      span.style.whiteSpace = 'nowrap';
    }
    span.textContent = txt;

    // Replace entire content so duplicates can't occur:
    host.replaceChildren(span);
  }

  function stackPinsVerticallyOrdered(){
const tl = $('#timeline'); if (!tl) return;
const slots = $all('.para-slot', tl); if (!slots.length) return;
const BASE = 24, GAP = 20; // a bit more space to avoid overlap
for (const slot of slots){
  const pins = $all('.read-pin, .image-pin, .frame-pin', slot);
  if (!pins.length) continue;
  const withMeta = pins.map((el, i) => {
    let pr = 99;
    const c = el.classList;
    if (c.contains('read-pin'))       pr = 0; // read first (closest to bar)
    else if (c.contains('image-pin')) pr = 1; // then image
    else if (c.contains('frame-pin')) pr = 2; // then frame (lowest)
    return { el, pr, i };
  }).sort((a,b)=> (a.pr - b.pr) || (a.i - b.i));

  withMeta.forEach((item, idx) => {
    const el = item.el;
    // unified size
    el.style.width  = '18px';
    el.style.height = '18px';
    // center horizontally
    el.style.left      = '50%';
    el.style.transform = 'translateX(-50%)';
    // vertical stack: closer (smaller negative) for first
    el.style.bottom    = (-(BASE + idx*GAP)) + 'px';
    // ensure visibility ordering: read on top if any overlap, then image, then frame
    el.style.zIndex    = String(9 - item.pr);
    el.style.transition = 'none';
  });
}
};
      }).sort((a,b)=> (a.pr - b.pr) || (a.i - b.i));
      withMeta.forEach((item, idx) => {
        const el = item.el;
        el.style.position  = 'absolute';
        el.style.left      = '50%';
        el.style.transform = 'translateX(-50%)';
        el.style.bottom    = (-(BASE + idx*GAP)) + 'px';
        if (!el.style.zIndex) el.style.zIndex = '5';
        el.style.transition = 'none';
      });
    }
  }

  
// Build our own vertical pin stacks per paragraph, ensuring order: read -> image -> frame
function applyVerticalPinStacks(){
  const tl = $('#timeline'); if (!tl) return;
  const slots = $all('.para-slot', tl); if (!slots.length) return;

  // Try to get sets from window, else infer by scanning existing elements
  const frameSet = (window.__VT_FRAME_SET instanceof Set) ? window.__VT_FRAME_SET : new Set();
  const readSet  = (window.__VT_READ_SET2 instanceof Set) ? window.__VT_READ_SET2 :
                   (window.readSet instanceof Set ? window.readSet : new Set());
  const imageSet = (function(){
    if (window.__VT_IMAGE_SET instanceof Set) return window.__VT_IMAGE_SET;
    // fallback: infer from currentItem.images
    const it = window.currentItem || window.ITEM || null;
    if (it && Array.isArray(it.images)){
      const s = new Set();
      for (const v of it.images){
        if (typeof v === 'number') s.add(v);
        else {
          const m = String(v).match(/^(\d+)/);
          if (m) s.add(parseInt(m[1],10));
        }
      }
      return s;
    }
    return new Set();
  })();

  slots.forEach((slot, idx)=>{
    const p = idx+1;
    // If we can't trust sets, also detect presence from existing pins inside this slot (if any)
    const hadRead  = !!slot.querySelector('.read-pin');
    const hadImage = !!slot.querySelector('.image-pin');
    const hadFrame = !!slot.querySelector('.frame-pin');

    const hasRead  = hadRead  || readSet.has(p);
    const hasImage = hadImage || imageSet.has(p);
    const hasFrame = hadFrame || frameSet.has(p);

    // Remove any previous stacks and hide legacy pins
    slot.querySelectorAll('.pin-stack').forEach(n=>n.remove());
    slot.querySelectorAll('.read-pin, .image-pin, .frame-pin').forEach(n=>{ n.style.display='none'; });

    if (!hasRead && !hasImage && !hasFrame) return;

    const stack = document.createElement('div');
    stack.className = 'pin-stack';
    if (hasRead){  const el=document.createElement('i'); el.className='pin read';  stack.appendChild(el); }
    if (hasImage){ const el=document.createElement('i'); el.className='pin image'; stack.appendChild(el); }
    if (hasFrame){ const el=document.createElement('i'); el.className='pin frame'; stack.appendChild(el); }

    slot.appendChild(stack);
  });
}


  function refreshAll(){
    applyGroupAwareColors();
    applyVerticalPinStacks();
    updateMessageField();
  }

  function startObservers(){
    const tl = $('#timeline'); if (!tl) return;
    const mo = new MutationObserver(muts => {
      for (const m of muts){
        if (m.type === 'childList'){ coalesced(refreshAll); break; }
      }
    });
    mo.observe(tl, { childList:true, subtree:true });
    if ('ResizeObserver' in window){
      const ro = new ResizeObserver(()=> coalesced(refreshAll));
      ro.observe(tl);
    }
    coalesced(refreshAll);
  }

  (function waitForTL(){
    if ($('#timeline')){ startObservers(); return; }
    const t0 = Date.now();
    (function poll(){
      if ($('#timeline')){ startObservers(); return; }
      if (Date.now() - t0 > 10000) return;
      raf(poll);
    })();
  })();

})();


/* === merged: index_article_window_1.0.js === */
/*! index_article_window_1.0.js
    Populates the article <select> with:
      - This week's article
      - Previous week's article
      - Next 4 weeks
    (Up to 6 items total, depending on availability)
    Data sources (in priority order):
      1) window.__VT_ITEMS (array of {week_start:'YYYY-MM-DD', title:'...'})
      2) window.getItems() -> same shape
      3) Optional fetch from <select data-src="./data/no-2025.json">
    Select detection (first match wins):
      #articleSelect, #article, [data-role="article-select"], select.articles
*/
(function(){
  'use strict';

  function $(sel, root){ return (root||document).querySelector(sel); }
  function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }
  function whenReady(cb){
    if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', cb); }
    else cb();
  }

  const SELS = ['#articleSelect', '#article', '[data-role="article-select"]', 'select.articles'];

  function findSelect(){
    for (const s of SELS){
    const el = $(s);
      if (el && el.tagName && el.tagName.toLowerCase()==='select') return el;
    }
    return null;
  }

  function parseISODate(s){
    // expects YYYY-MM-DD
    const [y,m,d] = (s||'').split('-').map(Number);
    if (!y||!m||!d) return null;
    return new Date(Date.UTC(y, m-1, d));
  }

  function fmtDate(d){
    // YYYY-MM-DD in UTC
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth()+1).padStart(2,'0');
    const day = String(d.getUTCDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function mondayOfToday(){
    const now = new Date();
    // Normalize to UTC date for week_start comparison
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    // JS: 0=Sunday..6=Saturday. We want Monday as first day (1).
    const dow = (d.getUTCDay()+6)%7; // Mon=0, Tue=1, ... Sun=6
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - dow);
    monday.setUTCHours(0,0,0,0);
    return monday;
  }

  function normalizeItems(raw){
    const arr = (raw||[]).map(it => {
      const ds = parseISODate(it.week_start);
      return ds ? { week_start: fmtDate(ds), ts: ds.getTime(), title: String(it.title||'Uten tittel') } : null;
    }).filter(Boolean);
    arr.sort((a,b)=> a.ts - b.ts);
    return arr;
  }

  function pickWindow(items){
    if (!items.length) return [];

    const mon = mondayOfToday().getTime();
    // Find index of exact current Monday; if not found, choose greatest week_start <= today Monday
    let idx = items.findIndex(x => x.ts === mon);
    if (idx === -1){
      let best = -1, bestTs = -Infinity;
      for (let i=0;i<items.length;i++){
        if (items[i].ts <= mon && items[i].ts > bestTs){ bestTs = items[i].ts; best = i; }
      }
      if (best !== -1) idx = best;
      else idx = 0; // fallback: earliest
    }

    const picked = [];
    // previous week (if any)
    if (idx-1 >= 0) picked.push(items[idx-1]);
    // current
    picked.push(items[idx]);
    // next up to 4
    for (let k=1; k<=4; k++){
      const j = idx + k;
      if (j < items.length) picked.push(items[j]);
    }

    // Ensure uniqueness and keep order as assembled
    const seen = new Set();
    return picked.filter(it => {
      if (seen.has(it.ts)) return false;
      seen.add(it.ts);
      return true;
    });
  }

  function renderOptions(sel, items, currentTs){
    // Keep a placeholder if present
    const placeholder = Array.from(sel.options).find(o => !o.value);
    sel.innerHTML = '';
    if (placeholder){
      sel.appendChild(placeholder);
    }

    items.forEach(it => {
      const opt = document.createElement('option');
      opt.value = it.week_start;
      opt.textContent = it.title;
      if (it.ts === currentTs) opt.selected = true;
      sel.appendChild(opt);
    });

    // Trigger change for host app if it listens
    const ev = new Event('change', {bubbles:true});
    sel.dispatchEvent(ev);
  }

  async function getItemsFromAnywhere(sel){
    if (Array.isArray(window.__VT_ITEMS) && window.__VT_ITEMS.length){
      return normalizeItems(window.__VT_ITEMS);
    }
    if (typeof window.getItems === 'function'){
      try{
        const raw = window.getItems() || [];
        const norm = normalizeItems(raw);
        if (norm.length) return norm;
      }catch(_){}
    }
    // Fallback: fetch from data-src on the select
    const src = sel && sel.getAttribute('data-src');
    if (src){
      try{
        const r = await fetch(src, {cache:'no-store'});
        if (!r.ok) throw new Error('HTTP '+r.status);
        const j = await r.json();
        if (j && Array.isArray(j.items)) return normalizeItems(j.items);
        if (Array.isArray(j)) return normalizeItems(j);
      }catch(_){}
    }
    return [];
  }

  async function init(){
    const sel = findSelect();
    if (!sel) return;

    const items = await getItemsFromAnywhere(sel);
    if (!items.length) return;

    const mon = mondayOfToday();
    const windowItems = pickWindow(items);
    renderOptions(sel, windowItems, mon.getTime());
  }

  whenReady(init);
  // Optional manual refresh for host app after it loads items asynchronously
  window.__vtRefreshArticleWindow = init;
})();
