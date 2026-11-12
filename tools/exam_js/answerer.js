/* exam_js/answerer.js — Answerer.
   paper .zip + answerer key → identity form → answer the paper (progress autosaves in this browser)
   → Submit → encrypted .ans file to send back to the setter.
   The start time and submit time are recorded in the answer file; the setter may also have set a fixed
   closing time and/or a time limit — whichever comes first ends the paper (auto-submit).
   With "block repeat attempts" on, a device lock (lock.js) stops the same exam being answered again on this
   device — also by another paper file with the same secret id — until the cooldown ends. */

import { el, debounce, toast, dialog, confirmDialog, bulletList, dropZone, readBytes, fmtDur, plural } from './ui.js';
import { isMcq, isQuestion, buildOrder, newSeed, answerFileName, downloadText, hydratePaper, effectiveDeadline, fmtInZone, lockSubject, normKey } from './format.js';
import { lockKeyFor, readLock, recordAttempt, lockStatus } from './lock.js';
import { createMarkdownEditor } from './md-editor.js';
import { createCodeEditor } from './code-editor.js';
import { renderMarkdown } from './markdown.js';
import { openPaperAsAnswerer, createAnswerFile, CryptoError } from './crypto.js';
import { readPaperBytes } from './zip.js';
import { isBlank } from './grade.js';
import { createTracker } from './timing.js';

const PROGRESS = (id) => 'exam.progress.' + id;
const TYPE_HINT = {
  'mcq-single': 'Choose one answer', 'mcq-multi': 'Choose all that apply',
  short: 'Short answer', long: 'Long answer', code: 'Code answer',
};

export function mountAnswerer(root) {
  let S = null;            // { paper, pub, paperId, identity, answers, seed, order, layout, optionOrder, startedAt, submitted }
  let timerId = 0, leaveGuard = null, trackId = 0, trackOff = null;
  const elapsed = () => (S && S.startedAt != null ? (Date.now() - S.startedAt) / 1000 : 0);
  const md = (t) => renderMarkdown(t, { images: true, assets: S.paper.assets });

  const load = (id) => { try { return JSON.parse(localStorage.getItem(PROGRESS(id))); } catch { return null; } };
  const save = debounce(() => {
    if (!S) return;
    try {
      localStorage.setItem(PROGRESS(S.paperId), JSON.stringify({
        identity: S.identity, answers: S.answers, seed: S.seed, startedAt: S.startedAt, submitted: S.submitted || null,
        timing: S.tracker ? S.tracker.snapshot() : (S.timing || null),
      }));
    } catch { /* storage full or blocked — answers still live in memory */ }
  }, 400);

  /* ================= 1. unlock ================= */
  function showUnlock() {
    stopTimer();
    let file = null;
    const key = el('input', { class: 'ex-input mono', placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Answerer key' });
    const fname = el('p', { class: 'ex-muted', text: 'No file chosen' });
    const err = el('p', { class: 'ex-err', role: 'alert' });
    const go = el('button', { type: 'button', class: 'ex-btn primary', text: 'Open paper' });
    const submit = async () => {
      err.textContent = '';
      if (!file) { err.textContent = 'Choose the paper .zip your teacher sent.'; return; }
      if (!key.value.trim()) { err.textContent = 'Enter the answerer key.'; return; }
      go.disabled = true; go.textContent = 'Opening…';
      try {
        const r = await openPaperAsAnswerer(await readPaperBytes(await readBytes(file)), key.value);
        S = { paper: hydratePaper(r.paper), pub: r.pub, paperId: r.paperId, identity: {}, answers: {}, seed: null, order: [], layout: [], optionOrder: {}, startedAt: null, submitted: null };
        const st = S.paper.settings;
        S.lockKey = st.blockRepeats ? await lockKeyFor(lockSubject(st, S.paperId)) : null;
        S.lock = S.lockKey ? await readLock(S.lockKey) : null;
        const prev = load(S.paperId);
        if (prev) Object.assign(S, { identity: prev.identity || {}, answers: prev.answers || {}, seed: prev.seed, startedAt: prev.startedAt, submitted: prev.submitted, timing: prev.timing || null });
        S.submitted ? showDone() : showIntro();
      } catch (e) {
        err.textContent = e instanceof CryptoError ? e.message : 'That file could not be opened.';
        go.disabled = false; go.textContent = 'Open paper';
      }
    };
    go.addEventListener('click', submit);
    key.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    root.replaceChildren(
      el('div', { class: 'ex-intro' }, el('h1', { text: 'Answer a paper' }),
        el('p', { class: 'ex-muted', text: 'Open the paper file your teacher gave you. It stays on your device — nothing is uploaded.' })),
      el('section', { class: 'ex-card narrow-card ex-stack' },
        dropZone({ accept: '.zip,.exam', label: 'Choose the paper .zip', hint: 'or drop it here', onFiles: ([f]) => { file = f; fname.textContent = f.name; } }),
        fname,
        el('label', { class: 'ex-field' }, el('span', { class: 'ex-label', text: 'Answerer key' }), key),
        err, go));
  }

  /* ================= 2. intro ================= */
  function showIntro() {
    const { paper } = S;
    const total = paper.questions.filter((q) => q.marked).reduce((s, q) => s + (Number(q.marks) || 0), 0);
    const resumed = S.startedAt != null;
    const endMs = paper.settings.endAt ? Date.parse(paper.settings.endAt) : null;
    const closed = !resumed && endMs != null && Date.now() >= endMs;
    const lk = paper.settings.blockRepeats ? lockStatus(S.lock, S.paperId, paper.settings.cooldownMin) : { blocked: false };
    const blocked = lk.blocked && !resumed;
    const inputs = {};
    const form = el('div', { class: 'ex-stack' }, paper.settings.identityFields.map((f) => {
      const i = el('input', { class: 'ex-input', value: S.identity[f.id] ?? '', autocomplete: 'off', 'aria-required': String(!!f.required) });
      i.addEventListener('input', () => { S.identity[f.id] = i.value; save(); });
      inputs[f.id] = i;
      return el('label', { class: 'ex-field' }, el('span', { class: 'ex-label', text: f.label + (f.required ? ' *' : '') }), i);
    }));
    const err = el('p', { class: 'ex-err', role: 'alert' });
    const start = el('button', { type: 'button', class: 'ex-btn primary', text: resumed ? 'Resume paper' : 'Start paper', disabled: closed || blocked, onclick: () => {
      for (const f of paper.settings.identityFields) {
        if (f.required && !(S.identity[f.id] || '').trim()) { err.textContent = `Please fill in “${f.label}”.`; inputs[f.id].focus(); return; }
      }
      beginExam();
    } });
    root.replaceChildren(el('section', { class: 'ex-card ex-stack' },
      el('h1', { text: paper.title }),
      el('div', { class: 'exam-md', html: md(paper.description) }),
      el('ul', { class: 'ex-facts' },
        el('li', { text: plural(paper.questions.length, 'question') }),
        el('li', { text: `${paper.questions.filter((q) => q.mandatory).length} required` }),
        paper.settings.showMarks && total ? el('li', { text: `${total} marks in total` }) : null,
        paper.settings.timeLimitMin ? el('li', { text: `Time limit: ${paper.settings.timeLimitMin} minutes — the clock starts when you press Start` }) : null,
        endMs ? el('li', { text: `Closes: ${fmtInZone(endMs)} (your time) · ${fmtInZone(endMs, paper.settings.endTz)}` }) : null,
        !paper.settings.timeLimitMin && !endMs ? el('li', { text: 'No time limit' }) : null,
        el('li', { text: 'Your start time and submit time are recorded' }),
        paper.settings.blockRepeats ? el('li', { text: 'This exam can only be attempted once on this device' }) : null),
      closed ? el('p', { class: 'ex-note bad', text: 'This paper has closed — it can no longer be started.' }) : null,
      blocked ? el('p', { class: 'ex-note bad', text: `This exam was already attempted on this device (started ${fmtInZone(lk.last.startedAt)}). It cannot be answered again ` +
        (lk.until === Infinity ? 'on this device.' : `until ${fmtInZone(lk.until)}.`) }) : null,
      resumed ? el('p', { class: 'ex-note', text: 'You have saved progress on this device. Resume to carry on where you stopped.' }) : null,
      form, err, start));
  }

  /* ================= 3. exam ================= */
  async function beginExam() {
    const st = S.paper.settings;
    if (st.blockRepeats) {
      S.lock = await readLock(S.lockKey);
      const lk = lockStatus(S.lock, S.paperId, st.cooldownMin);
      if (lk.blocked && S.startedAt == null) return showIntro();
      if (lk.resume && S.startedAt == null) S.startedAt = lk.resume.startedAt;   // restarting can't reset the clock
    }
    if (S.startedAt == null) S.startedAt = Date.now();
    if (st.blockRepeats) S.lock = await recordAttempt(S.lockKey, { paperId: S.paperId, startedAt: S.startedAt, submittedAt: null });
    if (!S.seed) S.seed = newSeed();
    const o = buildOrder(S.paper, S.seed);
    S.order = o.order; S.layout = o.layout; S.optionOrder = o.optionOrder;
    S.tracker = createTracker();
    S.tracker.load(S.timing);
    save.flush();
    showExam();
  }
  const answered = (q) => {
    const a = S.answers[q.id];
    if (q.type === 'code' && (q.starter || '').trim() && String(a ?? '').trim() === q.starter.trim()) return false;
    return !isBlank(a);
  };
  const itemById = (id) => S.paper.items.find((i) => i.id === id);
  const stopTracking = () => { clearInterval(trackId); trackId = 0; if (trackOff) { trackOff(); trackOff = null; } };
  const stopTimer = () => { stopTracking(); clearInterval(timerId); timerId = 0; if (leaveGuard) { window.removeEventListener('beforeunload', leaveGuard); leaveGuard = null; } };

  function showExam() {
    const { paper } = S;
    const qs = S.order.map(itemById).filter(Boolean);
    const cardEls = new Map();
    const navBtns = new Map();

    const progress = el('span', { class: 'ex-progress' });
    const deadline = effectiveDeadline(paper.settings, S.startedAt);
    const timer = el('span', { class: 'ex-timer', hidden: deadline == null, title: deadline ? `Ends ${fmtInZone(deadline)}` : '' });
    const refresh = () => {
      const done = qs.filter(answered).length;
      const reqLeft = qs.filter((q) => q.mandatory && !answered(q)).length;
      progress.textContent = `${done}/${qs.length} answered` + (reqLeft ? ` · ${reqLeft} required left` : ' · all required done');
      for (const q of qs) {
        const b = navBtns.get(q.id), a = answered(q);
        b.classList.toggle('done', a); b.classList.toggle('need', !a && q.mandatory);
      }
    };
    const onAnswer = (q, v) => { S.answers[q.id] = v; S.tracker.edit(q.id, elapsed(), !answered(q)); save(); refresh(); };

    const flow = [];
    let n = 0;
    for (const id of S.layout) {
      const it = itemById(id);
      if (!it) continue;
      if (it.kind === 'section') {
        flow.push(el('section', { class: 'ex-sectionhead' }, el('h2', { text: it.title }), it.description ? el('div', { class: 'exam-md', html: md(it.description) }) : null));
      } else if (it.kind === 'text') {
        flow.push(el('div', { class: 'ex-card exam-md ex-textblock', html: md(it.text) }));
      } else {
        const i = n++;
        const card = answerCard(it, i, onAnswer);
        cardEls.set(it.id, card);
        navBtns.set(it.id, el('button', {
          type: 'button', class: 'ex-navbtn', text: i + 1, title: `Question ${i + 1}${it.mandatory ? ' (required)' : ''}`,
          onclick: () => { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); card.focus({ preventScroll: true }); },
        }));
        flow.push(card);
      }
    }

    const submitBtn = el('button', { type: 'button', class: 'ex-btn primary', text: 'Submit', onclick: () => attemptSubmit(false) });
    const top = el('div', { class: 'ex-examtop' }, el('strong', { class: 'ex-examtitle', text: paper.title }), progress, timer, submitBtn);
    const side = el('nav', { class: 'ex-navgrid', 'aria-label': 'Question navigator' }, [...navBtns.values()]);
    const header = paper.description && paper.description.trim() ? el('div', { class: 'ex-card exam-md ex-header', html: md(paper.description) }) : null;
    root.replaceChildren(top, el('div', { class: 'ex-examlayout' }, side, el('div', { class: 'ex-qs' }, header, flow,
      el('div', { class: 'ex-card ex-stack' }, el('p', { class: 'ex-muted', text: 'Finished? Check the navigator, then submit. You cannot change answers after submitting.' }),
        el('button', { type: 'button', class: 'ex-btn primary', text: 'Submit paper', onclick: () => attemptSubmit(false) })))));
    refresh();

    leaveGuard = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', leaveGuard);

    if (deadline != null) {
      const tick = () => {
        const left = Math.round((deadline - Date.now()) / 1000);
        timer.textContent = '⏱ ' + fmtDur(left);
        timer.classList.toggle('low', left <= 300);
        if (left <= 0) { clearInterval(timerId); timerId = 0; toast('Time is up — submitting your answers', 'err'); finalize(true); }
      };
      tick();
      if (timerId === 0 && !S.submitted) timerId = setInterval(tick, 1000);
    }

    /* per-question timing: the question holding focus, else the one across the middle of the screen */
    const pickActive = () => {
      const f = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.ex-q') : null;
      if (f && f.id) return f.id.slice(2);
      const mid = window.innerHeight / 2;
      for (const [id, c] of cardEls) { const r = c.getBoundingClientRect(); if (r.top <= mid && r.bottom >= mid && r.height > 0) return id; }
      return null;
    };
    const present = () => !document.hidden && (document.hasFocus ? document.hasFocus() : true);
    const poke = () => S.tracker.activity(Date.now());
    const evs = ['keydown', 'pointerdown', 'touchstart', 'wheel', 'input', 'scroll'];
    stopTracking();
    evs.forEach((e) => document.addEventListener(e, poke, { capture: true, passive: true }));
    trackOff = () => evs.forEach((e) => document.removeEventListener(e, poke, { capture: true }));
    poke();
    let beats = 0;
    trackId = setInterval(() => { S.tracker.tick(Date.now(), pickActive(), present(), elapsed()); if (++beats % 15 === 0) save(); }, 1000);

    S._missing = () => qs.filter((q) => q.mandatory && !answered(q));
    S._cards = cardEls;
    S._qs = qs;
  }

  function answerCard(q, i, onAnswer) {
    const { paper } = S;
    const meta = el('div', { class: 'ex-qmeta' },
      el('strong', { text: `Question ${i + 1}` }),
      el('span', { class: 'ex-tag', text: '#' + q.id }),
      el('span', { class: `ex-badge ${q.mandatory ? 'warn' : ''}`, text: q.mandatory ? 'Required' : 'Optional' }),
      paper.settings.showMarks ? el('span', { class: `ex-badge ${q.marked ? 'accent' : ''}`, text: q.marked ? `${q.marks} mark${Number(q.marks) === 1 ? '' : 's'}` : 'Unmarked' }) : null,
      el('span', { class: 'ex-muted', text: TYPE_HINT[q.type] }));
    const card = el('article', { class: 'ex-q', tabindex: '-1', id: 'q-' + q.id }, meta,
      el('div', { class: 'exam-md ex-prompt', html: md(q.prompt) }));

    if (isMcq(q)) {
      const single = q.type === 'mcq-single', name = 'a-' + q.id;
      const byOpt = new Map(q.options.map((o) => [o.id, o]));
      const cur = () => new Set([].concat(S.answers[q.id] ?? []));
      const opts = el('div', { class: 'ex-choices', role: single ? 'radiogroup' : 'group' });
      for (const oid of S.optionOrder[q.id] || q.options.map((o) => o.id)) {
        const o = byOpt.get(oid);
        if (!o) continue;
        const input = el('input', { type: single ? 'radio' : 'checkbox', name, value: o.id });
        input.checked = cur().has(o.id);
        input.addEventListener('change', () => {
          if (single) onAnswer(q, o.id);
          else { const c = cur(); input.checked ? c.add(o.id) : c.delete(o.id); onAnswer(q, [...c]); }
          opts.querySelectorAll('.ex-choice').forEach((r) => r.classList.toggle('picked', r.querySelector('input').checked));
        });
        opts.append(el('label', { class: `ex-choice${input.checked ? ' picked' : ''}` }, input, el('div', { class: 'exam-md', html: md(o.text) })));
      }
      card.append(opts, el('button', {
        type: 'button', class: 'ex-btn ghost small', text: 'Clear answer', onclick: () => {
          opts.querySelectorAll('input').forEach((x) => { x.checked = false; });
          opts.querySelectorAll('.ex-choice').forEach((r) => r.classList.remove('picked'));
          onAnswer(q, single ? '' : []);
        },
      }));
    } else if (q.type === 'code') {
      const ed = createCodeEditor({
        value: S.answers[q.id] ?? q.starter ?? '', lang: q.codeLang, langLabel: q.codeLangLabel,
        minLines: 10, onChange: (v) => onAnswer(q, v),
      });
      card.append(ed.el);
    } else {
      const ed = createMarkdownEditor({
        value: S.answers[q.id] ?? '', compact: q.type === 'short', rows: q.type === 'short' ? 2 : 8, allowImages: false,
        label: `Answer to question ${i + 1}`, placeholder: 'Type your answer — markdown works (bold, lists, tables, code).',
        onChange: (v) => onAnswer(q, v),
      });
      card.append(ed.el);
    }
    return card;
  }

  /* ================= 4. submit ================= */
  async function attemptSubmit(timeUp) {
    const missing = S._missing();
    if (missing.length) {
      const n = S._qs.indexOf(missing[0]) + 1;
      S._cards.get(missing[0].id).scrollIntoView({ behavior: 'smooth', block: 'center' });
      return dialog({
        title: 'Some required questions are empty',
        body: el('div', { class: 'ex-stack' }, el('p', { text: 'Please answer these before submitting:' }),
          bulletList(missing.map((q) => `Question ${S._qs.indexOf(q) + 1} (#${q.id})`)), el('p', { class: 'ex-muted', text: `Scrolled to question ${n}.` })),
      });
    }
    const optionalEmpty = S._qs.filter((q) => !q.mandatory && !answered(q)).length;
    const ok = await confirmDialog(
      optionalEmpty ? `Submit now? ${plural(optionalEmpty, 'optional question')} will be left blank. You cannot change anything afterwards.` : 'Submit now? You cannot change anything afterwards.',
      { ok: 'Submit', title: 'Submit your paper?' });
    if (ok) finalize(timeUp);
  }

  async function finalize(timeUp) {
    stopTimer();
    const { paper } = S;
    const ans = {};
    for (const q of paper.questions) if (answered(q)) ans[q.id] = S.answers[q.id];
    const now = new Date();
    const deadline = effectiveDeadline(paper.settings, S.startedAt);
    const payload = {
      paperId: S.paperId, submittedAt: now.toISOString(), identity: S.identity, answers: ans,
      meta: {
        seed: S.seed, layout: S.layout, order: S.order, optionOrder: S.optionOrder,
        startedAt: new Date(S.startedAt).toISOString(), deadlineAt: deadline != null ? new Date(deadline).toISOString() : null,
        durationSec: Math.round((now.getTime() - S.startedAt) / 1000), timeUp: !!timeUp,
        skipped: paper.questions.filter((q) => !answered(q)).map((q) => q.id),
        qTimes: S.tracker ? S.tracker.snapshot() : {}, activeSec: S.tracker ? S.tracker.totalSec() : 0,
        secretId: normKey(paper.settings.secretId) || null,
        priorAttempts: ((S.lock && S.lock.attempts) || []).filter((a) => a.startedAt !== S.startedAt)
          .map((a) => ({ startedAt: new Date(a.startedAt).toISOString(), submittedAt: a.submittedAt ? new Date(a.submittedAt).toISOString() : null })),
      },
    };
    try {
      const file = await createAnswerFile(S.pub, payload);
      S.submitted = { name: answerFileName(payload, paper.settings.identityFields), text: JSON.stringify(file), at: payload.submittedAt, timeUp: !!timeUp };
      if (paper.settings.blockRepeats) S.lock = await recordAttempt(S.lockKey, { paperId: S.paperId, startedAt: S.startedAt, submittedAt: now.getTime() });
      save.flush();
      downloadText(S.submitted.name, S.submitted.text);
      showDone();
    } catch (e) {
      toast('Could not create the answer file: ' + (e.message || e), 'err');
    }
  }

  /* ================= 5. done ================= */
  function showDone() {
    stopTimer();
    const sub = S.submitted;
    root.replaceChildren(el('section', { class: 'ex-card ex-stack narrow-card' },
      el('h1', { text: sub.timeUp ? 'Time is up — answers submitted' : 'Answers submitted' }),
      el('p', { text: 'Your encrypted answer file was downloaded. Send it back to your teacher — only they can open it.' }),
      el('code', { class: 'ex-key', text: sub.name }),
      el('div', { class: 'ex-row wrap' },
        el('button', { type: 'button', class: 'ex-btn primary', text: 'Download again', onclick: () => downloadText(sub.name, sub.text) }),
        el('button', {
          type: 'button', class: 'ex-btn ghost', text: 'Close this paper', onclick: async () => {
            if (!(await confirmDialog('Remove the saved copy of your answers from this device? Make sure you have sent the file. (The record that this exam was attempted stays.)', { ok: 'Remove', danger: true }))) return;
            try { localStorage.removeItem(PROGRESS(S.paperId)); } catch { /* ignore */ }
            S = null; showUnlock();
          },
        }))));
  }

  showUnlock();
}
