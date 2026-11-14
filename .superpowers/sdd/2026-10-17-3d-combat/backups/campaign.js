/* MONSTER TRAIL campaign contract. No DOM work occurs until createHost(). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MonsterCampaign = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const NS = 'monsterTrail.chapter';
  const validStage = n => Number.isInteger(n) && n >= 1 && n <= 3;
  function normalizeChapter(raw, gymWon) {
    const base = { v: 1, unlocked: gymWon === true, completed: false, active: false, stage: 1 };
    if (!raw || Array.isArray(raw) || typeof raw !== 'object' || raw.v !== 1 || !validStage(raw.stage)) return base;
    if (!base.unlocked) return base;
    return { ...base, completed: raw.completed === true, active: raw.active === true, stage: raw.stage };
  }
  function validateChapterMessage(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d) || d.namespace !== NS || d.v !== 1 ||
        typeof d.session !== 'string' || !d.session || d.session.length > 128 ||
        !['ready', 'start', 'checkpoint', 'return', 'completed'].includes(d.type)) return null;
    if ((d.type === 'checkpoint' || d.type === 'start') && !validStage(d.stage)) return null;
    return { namespace: NS, v: 1, session: d.session, type: d.type, ...(validStage(d.stage) ? { stage: d.stage } : {}) };
  }
  function acceptMessage(event, source, origin, session) {
    if (!source || event.source !== source || (/^https?:/.test(origin) && event.origin !== origin)) return null;
    const d = validateChapterMessage(event.data);
    return d && d.session === session ? d : null;
  }
  function reduceChapter(state, action) {
    const s = { ...state };
    if (!s.unlocked) return s;
    if (action.type === 'enter' && validStage(action.stage)) { s.active = true; s.stage = action.stage; }
    if (action.type === 'checkpoint' && s.active && validStage(action.stage) &&
        action.stage <= s.stage + 1) s.stage = action.stage;
    if (action.type === 'completed' && s.active && s.stage === 3) { s.active = false; s.completed = true; s.stage = 1; }
    return s;
  }

  function createHost(options) {
    const win = options.window || window, doc = win.document;
    let frame = null, shell = null, dialog = null, timer = null, busy = false, token = '', started = false;
    let memoryOnly = false;
    const style = doc.createElement('style');
    style.textContent = `
      .campaign-layer{position:fixed;inset:0;z-index:10000;background:#080e18;color:#e4efff;font:16px/1.6 'Courier New',monospace;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
      .campaign-card{width:min(560px,100%);max-height:90vh;overflow:auto;border:1px solid #547a8b;border-radius:12px;background:#101d2b;padding:28px;box-shadow:0 24px 80px #0008}
      .campaign-card h1{font-size:24px;line-height:1.3;margin:0 0 18px;color:#ffe09a}.campaign-card p{color:#bacfdd}
      .campaign-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}.campaign-actions button,.campaign-return{font:700 14px/1.4 monospace;min-height:48px;padding:12px 18px;border:1px solid #819caa;border-radius:6px;color:#e9f4ff;background:#203649;cursor:pointer}
      .campaign-actions button:first-child{background:#e4cb8d;color:#101923;border-color:#ffe2a0}.campaign-actions button:focus-visible,.campaign-return:focus-visible{outline:3px solid #80eaff;outline-offset:4px}
      .campaign-chapter{padding:0;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start}.campaign-chapter iframe{width:100%;height:0;flex:1;min-height:0;border:0;display:block}
      .campaign-bar{height:48px;flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 12px;border-bottom:1px solid #28404e;background:#0c1723;box-sizing:border-box}
      .campaign-brand{font-size:11px;line-height:1.3;letter-spacing:.5px;color:#b9d9e2}.campaign-return{font-size:11px;min-height:36px;padding:8px 12px;background:#142b3b;flex:none}
      .campaign-status{position:absolute;left:16px;top:56px;pointer-events:none;font-size:12px;color:#ffe09a}
      @media(prefers-reduced-motion:no-preference){.campaign-card,.campaign-chapter{animation:campaign-arrive .3s ease-out}body.campaign-returning #wrap{animation:campaign-arrive .3s ease-out}@keyframes campaign-arrive{from{opacity:0}to{opacity:1}}}
    `;
    doc.head.appendChild(style);
    const state = () => normalizeChapter(options.getChapter(), options.gymWon());
    function write(action) { const next = reduceChapter(state(), action); options.setChapter(next); return next; }
    function resetInput() { options.resetInput(); }
    function setBusy(value) { busy = value; options.suspend(value); }
    function closeDialog() { if (dialog) dialog.remove(); dialog = null; }
    function showDialog(title, message, actions) {
      closeDialog(); resetInput(); setBusy(true);
      dialog = doc.createElement('section'); dialog.className = 'campaign-layer'; dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', title);
      const card = doc.createElement('div'); card.className = 'campaign-card';
      const h = doc.createElement('h1'); h.textContent = title; card.appendChild(h);
      const p = doc.createElement('p'); p.textContent = message; card.appendChild(p);
      const buttons = doc.createElement('div'); buttons.className = 'campaign-actions';
      actions.forEach(([label, fn]) => { const b = doc.createElement('button'); b.textContent = label; b.onclick = () => { closeDialog(); fn(); }; buttons.appendChild(b); });
      card.appendChild(buttons); dialog.appendChild(card); doc.body.appendChild(dialog);
      dialog.onkeydown = e => {
        if (e.key === 'Escape') { e.preventDefault(); const last = buttons.lastElementChild; if (last) last.click(); }
        if (e.key === 'Tab') {
          const all = [...buttons.children], i = all.indexOf(doc.activeElement);
          e.preventDefault(); all[(i + (e.shiftKey ? -1 : 1) + all.length) % all.length].focus();
        }
      };
      buttons.firstElementChild.focus();
    }
    function resumeTrail() {
      closeDialog(); setBusy(false); resetInput(); options.focus();
      doc.body.classList.remove('campaign-returning'); void doc.body.offsetWidth;
      doc.body.classList.add('campaign-returning');
    }
    function persist() {
      const saved = options.save();
      memoryOnly = !saved;
      if (shell) shell.querySelector('.campaign-status').textContent = memoryOnly ? 'Progress in memory — browser storage unavailable' : '';
      return saved;
    }
    function returnToTrail() {
      if (!frame) { resumeTrail(); return; }
      win.clearTimeout(timer); timer = null;
      try { if (doc.pointerLockElement) doc.exitPointerLock(); } catch (_) { /* already released */ }
      const completed = state().completed && !state().active;
      frame.remove(); shell.remove(); frame = shell = null; started = false; token = '';
      persist(); resumeTrail();
      options.onReturn(completed, memoryOnly);
    }
    function failure(message) {
      win.clearTimeout(timer);
      showDialog('The signal is interrupted', message, [
        ['RETRY', () => { const stage = state().stage; if (frame) { frame.remove(); shell.remove(); frame = shell = null; } launch(stage); }],
        ['RETURN TO TRAIL', returnToTrail]
      ]);
    }
    function launch(stage) {
      if (frame) return;
      setBusy(true); resetInput(); started = false;
      token = win.crypto && win.crypto.randomUUID ? win.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
      shell = doc.createElement('section'); shell.className = 'campaign-layer campaign-chapter';
      const bar = doc.createElement('header'); bar.className = 'campaign-bar';
      const brand = doc.createElement('span'); brand.className = 'campaign-brand'; brand.textContent = 'MONSTER TRAIL / THE STATIC BELOW';
      frame = doc.createElement('iframe'); frame.title = 'MONSTER TRAIL — THE STATIC BELOW';
      frame.allow = 'fullscreen; autoplay';
      const back = doc.createElement('button'); back.className = 'campaign-return'; back.textContent = '↑ RETURN TO TRAIL'; back.onclick = returnToTrail;
      const notice = doc.createElement('span'); notice.className = 'campaign-status'; notice.textContent = memoryOnly ? 'Progress in memory — browser storage unavailable' : 'Following the signal…';
      frame.src = "gemini's%20code.html?embedded=1&from=trail&session=" + encodeURIComponent(token);
      bar.append(brand, back); shell.append(bar, frame, notice); doc.body.appendChild(shell);
      frame.onerror = () => failure('The underground chapter could not load. Your monsters and trail progress are safe.');
      timer = win.setTimeout(() => { if (!started) failure('Loading took too long. Retry the signal or return to your monsters.'); }, 25000);
    }
    function enterChapter(stage) {
      if (frame || !state().unlocked) return false;
      const previous = state();
      write({ type: 'enter', stage: validStage(stage) ? stage : previous.stage });
      resetInput();
      if (!persist()) {
        showDialog('Progress could not be saved', 'Browser storage is unavailable. You can keep playing in this window, but closing or refreshing it will lose unsaved progress.', [
          ['CONTINUE WITHOUT SAVING', () => launch(state().stage)],
          ['STAY ON THE TRAIL', () => { options.setChapter(previous); resumeTrail(); }]
        ]);
      } else launch(state().stage);
      return true;
    }
    function showChapterMenu() {
      const s = state();
      if (!s.unlocked) return;
      showDialog(s.completed ? 'The trail and the signal' : 'A signal beneath the trail',
        s.active ? 'Your monsters are waiting above. Resume your descent at floor ' + s.stage + ', or keep exploring the trail.' :
        'A strange signal leads to a hatch beneath the gym. Your monsters will wait here while you explore below. You can return at any time.', [
          [s.active ? 'RESUME DESCENT · FLOOR ' + s.stage : s.completed ? 'REPLAY THE STATIC BELOW' : 'DESCEND', () => enterChapter(s.active ? s.stage : 1)],
          ['RETURN TO TRAIL', resumeTrail]
        ]);
    }
    function onMessage(event) {
      if (!frame) return;
      const d = acceptMessage(event, frame.contentWindow, win.location.origin, token);
      if (!d) return;
      if (d.type === 'ready') {
        if (started) return;
        started = true; win.clearTimeout(timer);
        shell.querySelector('.campaign-status').textContent = memoryOnly ? 'Progress in memory — browser storage unavailable' : '';
        const lead = options.lead() || {};
        frame.contentWindow.postMessage({namespace:NS,v:1,session:token,type:'start',stage:state().stage,
          lead:{name:String(lead.name || 'Your partner').replace(/[<>\x00-\x1f]/g,'').slice(0,40),species:String(lead.id || '').slice(0,40),level:Math.max(1,Math.min(100,Number(lead.level)||1))}},/^https?:/.test(win.location.protocol) ? win.location.origin : '*');
      } else if (started && d.type === 'checkpoint') { write(d); persist(); }
      else if (started && d.type === 'completed') { write(d); persist(); }
      else if (d.type === 'return') returnToTrail();
    }
    win.addEventListener('message', onMessage);
    return { enterChapter, returnToTrail, showChapterMenu, isChapterActive: () => !!frame, isBusy: () => busy,
      resumeIfNeeded: () => { if (state().active) showChapterMenu(); },
      destroy: () => { returnToTrail(); closeDialog(); win.removeEventListener('message', onMessage); style.remove(); }
    };
  }
  return { normalizeChapter, validateChapterMessage, acceptMessage, reduceChapter, createHost };
});
