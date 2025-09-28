// index-addon.js — v1.69
// Safe overlay: no global click swallowing, no pointer-events: none.
// Keeps full message persistent, two-tone w/ groups-as-block, centered pins, and ignores
// paragraph clicks only while playing. Optional external hook: window.__VT_SET_PLAYING(boolean)

(function(){
  /* ========== Minimal CSS (scoped) ========== */
  (function ensureCSS(){
    if (document.querySelector('style[data-index-addon]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-index-addon','');
    style.textContent = `
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
      /* hvis du vil ha ekstra luft til beskjed-feltet, kan du avkommentere:
      #message{ margin-top:22px; }
      */
    `;
    document.head.appendChild(style);
  })();

  /* ========== Utils ========== */
  function parseGroupsString(str){
    if (!str || typeof str !== 'string') return [];
    return str.split(',').map(s=>s.trim()).flatMap(tok=>{
      const m = tok.match(/^(\d+)(?:-(\d+))?$/);
      if (!m) return [];
      const a = +m[1], b = m[2] ? +m[2] : a;
      const arr=[]; for(let i=a;i<=b;i++) arr.push(i);
      return [arr];
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

  /* ========== Two-tone med grupper som én blokk ========== */
  function applyGroupAwareTwoTone(){
    const tl = document.getElementById('timeline'); if(!tl) return;
    const slots = [...tl.querySelectorAll('.para-slot')]; if(!slots.length) return;
    // fjern stray-klasser / inline-farger
    slots.forEach(el=>{
      el.classList.remove('alt-alt','group-alt','grp','group','galt','alt');
      el.style.background=''; el.style.backgroundImage=''; el.style.backgroundColor='';
    });
    const groups=getGroups(); const starts=new Map();
    groups.forEach(g=>{ if(g&&g.length) starts.set(g[0], g); });

    let tone=false; // false=lys (ingen 'alt'), true=mørk ('alt')
    let i=1;
    while(i<=slots.length){
      if (starts.has(i)){
        const g = starts.get(i);
        g.forEach(p=>{ const el=slots[p-1]; if(el && tone) el.classList.add('alt'); });
        tone = !tone;          // flip én gang for hele gruppa
        i = g[g.length-1] + 1; // hopp til etter gruppa
      } else {
        const el=slots[i-1]; if (el && tone) el.classList.add('alt');
        tone = !tone;
        i++;
      }
    }
  }

  /* ========== Pins + meldinger (klikk) ========== */
  // Spesifikke datastrukturer forventes definert av basiskoden:
  // window.__VT_ORD: Map(para => {frame: 1|2, read: 1|2})
  // window.__VT_FRAME_SET: Set(para)  for rammer
  // window.__VT_READ_SET2 eller window.readSet: Set(para) for les-skriftsteder

  let isPlaying = false;               // lokal til add-on
  let lastMsgText = '';

  // Valgfri ekstern hook fra din app:
  window.__VT_SET_PLAYING = (on)=>{ isPlaying = !!on; };

  function layoutPinsAndBind(){
    const tl = document.getElementById('timeline'); if(!tl) return;
    const slots = [...tl.querySelectorAll('.para-slot')]; if(!slots.length) return;

    const ord = window.__VT_ORD || new Map();
    const frameSet = window.__VT_FRAME_SET || new Set();
    const readSet  = (window.__VT_READ_SET2 instanceof Set) ? window.__VT_READ_SET2 : (window.readSet || new Set());

    const groups=getGroups(); const starts=new Map();
    groups.forEach(g=>{ if(g&&g.length) starts.set(g[0], g); });
    const findGroupFor = (p)=>{ for(const g of groups){ if(g.includes(p)) return g.slice(); } return [p]; };

    const buildSingleMsg = (p)=>{
      const o = ord.get(p) || {};
      const hasF = frameSet.has(p);
      const hasR = readSet.has(p);
      if (!hasF && !hasR) return rangeLabel([p]);
      if (hasF && hasR){
        const f=o.frame ?? 1, r=o.read ?? 2;
        return ( (f ?? 99) <= (r ?? 99) )
          ? `${rangeLabel([p])} + Ramme og Les-skriftsted`
          : `${rangeLabel([p])} + Les-skriftsted og Ramme`;
      }
      return hasF ? `${rangeLabel([p])} + Ramme` : `${rangeLabel([p])} + Les-skriftsted`;
    };
    const buildMsgFor = (p)=>{
      const g = starts.get(p) || findGroupFor(p);
      if (g.length > 1) return rangeLabel(g);
      return buildSingleMsg(p);
    };
    // eksponer for normalisering
    window.__VT_BUILD_MSG_FOR = buildMsgFor;

    slots.forEach((slot, idx)=>{
      const p = idx + 1;
      const hasF = frameSet.has(p), hasR = readSet.has(p);

      // pins
      slot.querySelectorAll('.read-pin,.frame-pin').forEach(n=>n.remove());
      if (hasF || hasR){
        const items=[];
        if (hasF) items.push({type:'frame', order:(ord.get(p)||{}).frame ?? 1});
        if (hasR) items.push({type:'read',  order:(ord.get(p)||{}).read  ?? 2});
        items.sort((a,b)=>(a.order??99)-(b.order??99));
        const gap=14, base=-((items.length-1)/2)*gap;
        items.forEach((it,i)=>{
          const el=document.createElement('i');
          el.className = it.type==='frame' ? 'frame-pin' : 'read-pin';
          el.style.left = `calc(50% + ${base + i*gap}px)`;
          slot.appendChild(el);
        });
      }

      // klikk — men hopp over hvis vi spiller av (ikke stopp eventet globalt)
      slot.removeEventListener('click', slot.__addonClick || (()=>{}));
      const handler = ()=>{
        if (isPlaying) return; // gjør ingenting mens det spiller
        const msg = document.getElementById('message'); if (!msg) return;
        msg.textContent = buildMsgFor(p);
      };
      slot.__addonClick = handler;
      slot.addEventListener('click', handler);
    });
  }

  /* ========== Hold meldingen stabil & detekter “spilling” uten å fange knapper ========== */
  function observeMessageAndNormalize(){
    const msg = document.getElementById('message'); if(!msg) return;
    const buildMsgFor = window.__VT_BUILD_MSG_FOR || (p => `Avsnitt ${p}`);

    let lastChange = 0;
    const BURST_MS = 450;   // oppdateringer tettere enn dette → sannsynligvis avspilling
    const IDLE_MS  = 1200;  // ingen oppdateringer så lenge → sannsynligvis ikke avspilling
    let idleTimer = null;

    const normalize = ()=>{
      const text = (msg.textContent || '').trim();
      if (text !== lastMsgText){
        const now = Date.now();
        // enkel “burst”-deteksjon
        if (now - lastChange < BURST_MS) isPlaying = true;
        lastChange = now;
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(()=>{ isPlaying = false; }, IDLE_MS);
        lastMsgText = text;
      }

      // Bytt «Avsnitt N …» til vår full-format tekst
      const m = text.match(/^Avsnitt\s+(\d+)(?:\b|$)/);
      if (m){
        const p = Number(m[1]);
        const desired = buildMsgFor(p);
        if (desired && text !== desired) msg.textContent = desired;
      }
    };

    const mo = new MutationObserver(()=> normalize());
    mo.observe(msg, {childList:true, characterData:true, subtree:true});
    normalize();
  }

  /* ========== Kjør ========== */
  function applyAll(){ applyGroupAwareTwoTone(); layoutPinsAndBind(); observeMessageAndNormalize(); }

  const orig = window.drawTimeline;
  if (typeof orig === 'function'){
    window.drawTimeline = function(){
      const r = orig.apply(this, arguments);
      requestAnimationFrame(applyAll);
      return r;
    };
  }
  const obs = new MutationObserver(()=> requestAnimationFrame(applyAll));
  function startObs(){
    const tl = document.getElementById('timeline');
    if (tl) obs.observe(tl, {childList:true, subtree:true, attributes:true, attributeFilter:['class','style']});
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ applyAll(); startObs(); });
  } else {
    applyAll(); startObs();
  }
})();
