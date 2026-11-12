/* exam_js/setter.js — Admin › Set paper.
   Build a paper from ONE ordered list of items — questions, paragraphs (with headings, colours, links, images)
   and sections — set the options (shuffling, time limit, fixed closing time), autosave a draft in this browser,
   then "Generate paper" → encrypted paper.zip + the two keys (shown once). */

import { el, debounce, toast, dialog, confirmDialog, bulletList, copyText, dropZone, readBytes, readText, plural } from './ui.js';
import {
  blankPaper, blankQuestion, blankSection, blankText, nextItemId, migrateItems, isQuestion, QUESTION_TYPES, CODE_LANGS, TIMEZONES,
  isMcq, validatePaper, paperFileName, downloadText, safeName, zonedToUtcMs, fmtInZone,
} from './format.js';
import { createMarkdownEditor } from './md-editor.js';
import { collectBlockIds, collectImageIds, stripMarkdown, renderMarkdown } from './markdown.js';
import { totalAssetBytes } from './images.js';
import { createPaperFile, openPaperAsSetter, CryptoError } from './crypto.js';
import { packPaperZip, readPaperBytes } from './zip.js';

const KEY = 'exam.draft.v1';
const TYPE_LABEL = Object.fromEntries(QUESTION_TYPES.map((t) => [t.id, t.label]));

function normalize(d) {
  migrateItems(d.paper);
  const base = blankPaper();
  d.paper.id ||= base.id;
  d.solutions ||= {};
  for (const q of d.paper.items) {
    if (!isQuestion(q)) continue;
    if (isMcq(q) && !q.options) q.options = blankQuestion(q.type, []).options;
    if (q.type === 'code') { q.codeLang ||= 'python'; q.starter ||= ''; }
  }
  return d;
}
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.paper && (Array.isArray(d.paper.items) || Array.isArray(d.paper.questions))) return normalize(d);
  } catch { /* no draft */ }
  return null;
}
const pickFile = (accept) => new Promise((res) => {
  const i = el('input', { type: 'file', accept });
  i.addEventListener('change', () => res(i.files[0] || null));
  i.click();
});

export function mountSetter(root) {
  let state = loadDraft() || { paper: blankPaper(), solutions: {} };
  let uid = 0;
  const keys = new WeakMap();
  const keyOf = (o) => keys.get(o) || (keys.set(o, 'k' + (++uid)), keys.get(o));
  const items = () => state.paper.items;
  const qs = () => items().filter(isQuestion);

  /* ---------- autosave + validation chip ---------- */
  const saveEl = el('span', { class: 'ex-saved' });
  const imgInfo = el('small', { class: 'ex-muted' });
  const chip = el('button', { type: 'button', class: 'ex-chip', onclick: () => showIssues() });
  const persist = debounce(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); saveEl.textContent = 'Draft autosaved on this device'; saveEl.classList.remove('err'); }
    catch { saveEl.textContent = 'Autosave failed (storage full? many images?) — export the draft'; saveEl.classList.add('err'); }
  }, 500);
  const refresh = debounce(() => {
    const r = validateAll();
    chip.className = `ex-chip ${r.errors.length ? 'bad' : r.warnings.length ? 'warn' : 'ok'}`;
    chip.textContent = r.errors.length
      ? plural(r.errors.length, 'problem') + (r.warnings.length ? ` · ${plural(r.warnings.length, 'warning')}` : '')
      : r.warnings.length ? plural(r.warnings.length, 'warning') : '✓ Ready to generate';
    const n = Object.keys(state.paper.assets).length;
    imgInfo.textContent = n ? `${plural(n, 'image')} · ${(totalAssetBytes(state.paper.assets) / 1048576).toFixed(1)} MB` : '';
  }, 250);
  const touch = () => { saveEl.textContent = 'Editing…'; persist(); refresh(); };

  /* ---------- text fields (for unique table/callout ids and image checks) ---------- */
  function* mdFields() {
    yield ['desc', state.paper.description];
    for (const it of items()) {
      if (it.kind === 'text') yield [keyOf(it) + 't', it.text];
      else if (it.kind === 'section') yield [keyOf(it) + 'd', it.description || ''];
      else {
        yield [keyOf(it) + 'p', it.prompt];
        for (const o of it.options || []) yield [keyOf(o), o.text];
        const s = state.solutions[it.id];
        if (s) yield [keyOf(s) + 'm', s.modelAnswer || ''];
      }
    }
  }
  const paperBlockIds = (skip) => [...mdFields()].filter(([k]) => k !== skip)
    .flatMap(([, t]) => collectBlockIds(t).map((b) => b.id)).filter(Boolean);

  function validateAll() {
    const r = validatePaper(state.paper, state.solutions);
    const seen = new Map();
    const missing = new Set();
    for (const [, text] of mdFields()) {
      for (const b of collectBlockIds(text)) {
        if (!b.id) { r.errors.push(`A ${b.kind} has no id.`); continue; }
        seen.set(b.id, (seen.get(b.id) || 0) + 1);
      }
      for (const id of collectImageIds(text)) if (!(id in state.paper.assets)) missing.add(id);
    }
    for (const [id, n] of seen) if (n > 1) r.errors.push(`Table/callout id "${id}" is used ${n} times — ids must be unique across the paper.`);
    for (const id of missing) r.errors.push(`An image (${id}) is referenced but missing — upload it again.`);
    return r;
  }
  async function showIssues() {
    const { errors, warnings } = validateAll();
    if (!errors.length && !warnings.length) return toast('No problems found', 'ok');
    const body = el('div', { class: 'ex-stack' },
      errors.length ? el('div', {}, el('h4', { text: 'Must fix' }), bulletList(errors)) : null,
      warnings.length ? el('div', {}, el('h4', { text: 'Worth a look' }), bulletList(warnings)) : null);
    await dialog({ title: 'Paper check', body });
  }

  /* ---------- small builders ---------- */
  const mde = (key, get, set, o = {}) => createMarkdownEditor({
    value: get(), onChange: (v) => { set(v); touch(); }, usedIds: () => paperBlockIds(key),
    assets: state.paper.assets, onAssets: touch, ...o,
  });
  const field = (label, control, hint) => el('label', { class: 'ex-field' }, el('span', { class: 'ex-label', text: label }), control, hint ? el('small', { class: 'ex-muted', text: hint }) : null);
  const check = (label, checked, on) => {
    const i = el('input', { type: 'checkbox' });
    i.checked = !!checked;
    i.addEventListener('change', () => on(i.checked));
    return el('label', { class: 'ex-check' }, i, el('span', { text: label }));
  };
  const iconBtn = (text, title, on, disabled = false) => el('button', { type: 'button', class: 'ex-icon', title, 'aria-label': title, text, disabled, onclick: on });

  /* ---------- repeat protection: secret id + cooldown ---------- */
  function repeatBlock() {
    const s = state.paper.settings;
    const secret = el('input', { class: 'ex-input mono', value: s.secretId || '', placeholder: 'e.g. EXAM - 001', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Secret exam id' });
    const unitFor = (m) => (m && m % 1440 === 0 ? 1440 : m && m % 60 === 0 ? 60 : m ? 1 : 60);
    const unit = el('select', { class: 'ex-input narrow', 'aria-label': 'Cooldown unit' },
      el('option', { value: 1, text: 'minutes' }), el('option', { value: 60, text: 'hours' }), el('option', { value: 1440, text: 'days' }));
    unit.value = String(unitFor(s.cooldownMin));
    const amount = el('input', { class: 'ex-input narrow', type: 'number', min: 1, value: s.cooldownMin ? s.cooldownMin / unitFor(s.cooldownMin) : '', placeholder: 'never', 'aria-label': 'Cooldown length' });
    const box = el('div', { class: 'ex-stack' },
      field('Secret exam id', secret, 'Never shown to students. Papers with the same secret id block each other — e.g. a regenerated or alternate version of this exam. Spaces, dashes and case are ignored.'),
      el('div', { class: 'ex-row wrap' }, el('span', { class: 'ex-label', text: 'Cooldown' }), amount, unit, el('small', { class: 'ex-muted', text: 'after the first attempt. Empty = never expires.' })),
      el('small', { class: 'ex-muted', text: 'The block lives in the student’s browser (three stores that restore each other; the “Close this paper” button doesn’t remove it). Clearing all site data, another device or a private window gets around it — Check paper flags every later submission by the same student as a repeat that needs your review.' }));
    const on = check('Block repeat attempts on the same device', s.blockRepeats, (v) => { s.blockRepeats = v; box.hidden = !v; touch(); });
    box.hidden = !s.blockRepeats;
    const upd = () => {
      s.secretId = secret.value.trim();
      const n = Number(amount.value);
      s.cooldownMin = amount.value !== '' && n > 0 ? Math.round(n * Number(unit.value)) : (amount.value === '' ? null : 0);
      touch();
    };
    for (const c of [secret, amount, unit]) c.addEventListener('input', upd);
    return el('div', { class: 'ex-stack' }, el('span', { class: 'ex-label', text: 'Repeat attempts' }), on, box);
  }

  /* ---------- header card ---------- */
  function buildHeader() {
    const p = state.paper, s = p.settings;
    const title = el('input', { class: 'ex-input', value: p.title, placeholder: 'e.g. Data Structures — Unit Test 1' });
    title.addEventListener('input', () => { p.title = title.value; touch(); });
    const desc = mde('desc', () => p.description, (v) => { p.description = v; }, {
      rows: 4, label: 'Paper header', placeholder: 'Header paragraph: instructions, rules, a heading… (headings, colours, links and images all work)',
    });
    const limit = el('input', { class: 'ex-input narrow', type: 'number', min: 1, value: s.timeLimitMin ?? '', placeholder: 'none' });
    limit.addEventListener('input', () => { s.timeLimitMin = limit.value === '' ? null : Number(limit.value); touch(); });

    /* fixed closing time + timezone */
    const known = TIMEZONES.some((t) => t.id === s.endTz);
    const endLocal = el('input', { class: 'ex-input', type: 'datetime-local', value: s.endLocal || '', 'aria-label': 'Closing date and time' });
    const endTz = el('select', { class: 'ex-input', 'aria-label': 'Timezone' },
      TIMEZONES.map((t) => el('option', { value: t.id, text: t.label })), el('option', { value: '__other', text: 'Other (type an IANA zone)…' }));
    endTz.value = known ? s.endTz : '__other';
    const endOther = el('input', { class: 'ex-input mono', value: known ? '' : s.endTz, placeholder: 'e.g. Africa/Lagos', 'aria-label': 'IANA timezone name' });
    const endPrev = el('small', { class: 'ex-muted' });
    const endRow = el('div', { class: 'ex-stack' }, el('div', { class: 'ex-row wrap' }, endLocal, endTz, endOther), endPrev);
    const endOn = check('Close the paper at a fixed time', !!s.endLocal, (v) => { if (!v) { s.endLocal = ''; s.endAt = null; } updateEnd(); touch(); });
    const enabled = () => endOn.querySelector('input').checked;
    function updateEnd() {
      endRow.hidden = !enabled();
      endOther.hidden = endTz.value !== '__other';
      if (!enabled()) return;
      const tz = endTz.value === '__other' ? endOther.value.trim() : endTz.value;
      s.endLocal = endLocal.value; s.endTz = tz || 'UTC';
      const ms = zonedToUtcMs(endLocal.value, tz);
      s.endAt = Number.isFinite(ms) ? new Date(ms).toISOString() : null;
      endPrev.textContent = Number.isFinite(ms)
        ? `Closes ${fmtInZone(ms, tz)}  ·  ${fmtInZone(ms, 'UTC')}  ·  your time: ${fmtInZone(ms)}`
        : 'Pick a date and time (and a valid timezone).';
    }
    for (const c of [endLocal, endTz, endOther]) c.addEventListener('input', () => { updateEnd(); touch(); });
    updateEnd();

    const fieldsEl = el('div', { class: 'ex-fields' });
    const paintFields = () => {
      fieldsEl.replaceChildren(...s.identityFields.map((f, i) => {
        const lab = el('input', { class: 'ex-input', value: f.label, placeholder: 'e.g. Full name, Class, Roll no.', 'aria-label': 'Field label' });
        lab.addEventListener('input', () => { f.label = lab.value; touch(); });
        return el('div', { class: 'ex-frow' }, lab, check('Required', f.required, (v) => { f.required = v; touch(); }),
          check('Identifies student', f.identifies !== false, (v) => { f.identifies = v; touch(); }),
          iconBtn('✕', 'Remove field', () => { s.identityFields.splice(i, 1); paintFields(); touch(); }));
      }), el('button', {
        type: 'button', class: 'ex-btn ghost small', text: '+ Add field', onclick: () => {
          s.identityFields.push({ id: 'f' + Date.now().toString(36), label: '', required: true, identifies: false });
          paintFields(); touch(); fieldsEl.querySelectorAll('input.ex-input')[s.identityFields.length - 1]?.focus();
        },
      }));
    };
    paintFields();

    const draftBar = el('div', { class: 'ex-row wrap' },
      el('button', { type: 'button', class: 'ex-btn ghost small', text: 'Open generated paper…', onclick: openExisting }),
      el('button', { type: 'button', class: 'ex-btn ghost small', text: 'Export draft', onclick: exportDraft }),
      el('button', { type: 'button', class: 'ex-btn ghost small', text: 'Import draft', onclick: importDraft }),
      el('button', { type: 'button', class: 'ex-btn ghost small', text: 'New paper', onclick: newPaper }));

    return el('section', { class: 'ex-card' },
      el('div', { class: 'ex-cardhead' }, el('h2', { text: 'Paper' }), el('span', { class: 'ex-tag', text: state.paper.id })),
      field('Title', title),
      field('Header paragraph (markdown)', desc.el, 'Shown on the start screen and at the top of the paper.'),
      el('div', { class: 'ex-grid2' },
        el('div', { class: 'ex-stack' },
          el('span', { class: 'ex-label', text: 'Shuffling & marks' }),
          check('Shuffle questions that are not in a section', s.shuffleQuestions, (v) => { s.shuffleQuestions = v; touch(); }),
          check('Shuffle the order of sections', s.shuffleSections, (v) => { s.shuffleSections = v; touch(); }),
          check('Shuffle MCQ options', s.shuffleOptions, (v) => { s.shuffleOptions = v; touch(); }),
          check('Show marks next to marked questions', s.showMarks, (v) => { s.showMarks = v; touch(); }),
          el('small', { class: 'ex-muted', text: 'Shuffling inside a section is set on the section itself. A paragraph moves together with the question after it.' })),
        el('div', { class: 'ex-stack' }, el('span', { class: 'ex-label', text: 'Ask each student for' }), fieldsEl,
          el('small', { class: 'ex-muted', text: 'Goes into the answer file’s name and the check panel. “Identifies student” fields are how Check paper recognises the same person submitting twice (case, spaces and punctuation are ignored: “Harsh Rathod” = “harshrathod”).' }))),
      el('hr', { class: 'ex-hr' }),
      el('div', { class: 'ex-stack' },
        el('span', { class: 'ex-label', text: 'Timing — each student’s start time and submit time are always recorded' }),
        field('Time limit after pressing Start (minutes)', limit, 'Optional. Counted in the student’s browser.'),
        endOn, endRow),
      el('hr', { class: 'ex-hr' }),
      repeatBlock(),
      el('hr', { class: 'ex-hr' }),
      el('div', { class: 'ex-row wrap spread' }, draftBar, imgInfo),
      el('small', { class: 'ex-muted', text: 'Drafts include your correct answers and images and are not encrypted — keep them private.' }));
  }

  /* ---------- item cards ---------- */
  const list = el('div', { class: 'ex-qlist' });
  const cards = new Map();                       // item object → card element
  const nextOptId = (q) => {
    const used = new Set(q.options.map((o) => o.id));
    for (const c of 'abcdefghijklmnopqrstuvwxyz') if (!used.has(c)) return c;
    let n = 1; while (used.has('o' + n)) n++; return 'o' + n;
  };
  const sol = (q) => (state.solutions[q.id] ||= {});
  function renumber() {
    let n = 0, secCard = null, cnt = 0;
    const flush = () => { if (secCard) secCard._count.textContent = plural(cnt, 'question'); };
    for (const c of list.children) {
      const it = c._item;
      if (it.kind === 'question') { c._num.textContent = ++n; cnt++; }
      else if (it.kind === 'section') { flush(); secCard = c; cnt = 0; }
    }
    flush();
  }
  const controls = (it) => [
    iconBtn('↑', 'Move up', () => move(it, -1)), iconBtn('↓', 'Move down', () => move(it, 1)),
    iconBtn('⧉', 'Duplicate', () => duplicate(it)), iconBtn('✕', 'Delete', () => remove(it)),
  ];
  const renameId = (it, input) => input.addEventListener('change', () => {
    const old = it.id, nw = input.value.trim();
    if (nw === old) return;
    if (it.kind === 'question' && state.solutions[old] && !state.solutions[nw]) { state.solutions[nw] = state.solutions[old]; delete state.solutions[old]; }
    it.id = nw; touch();
  });

  function questionCard(q) {
    const card = el('section', { class: 'ex-qcard' });
    const num = el('span', { class: 'ex-qnum' });
    card._num = num; card._item = q;
    const snippet = el('span', { class: 'ex-snippet' });
    const setSnippet = () => { snippet.textContent = stripMarkdown(q.prompt).slice(0, 80); };
    const body = el('div', { class: 'ex-qbody' });

    const idIn = el('input', { class: 'ex-input idin', value: q.id, 'aria-label': 'Question id', spellcheck: 'false' });
    renameId(q, idIn);
    const typeSel = el('select', { class: 'ex-input', 'aria-label': 'Question type' }, QUESTION_TYPES.map((t) => el('option', { value: t.id, text: t.label })));
    typeSel.value = q.type;
    typeSel.addEventListener('change', () => {
      q.type = typeSel.value;
      if (isMcq(q) && !q.options) q.options = blankQuestion('mcq-single', []).options;
      if (q.type === 'mcq-single' && (sol(q).correct || []).length > 1) sol(q).correct = [sol(q).correct[0]];
      if (q.type === 'code') { q.codeLang ||= 'python'; q.starter ||= ''; }
      renderBody(); touch();
    });
    const marks = el('input', { class: 'ex-input narrow', type: 'number', min: 0, step: 0.5, value: q.marks, 'aria-label': 'Marks', disabled: !q.marked });
    marks.addEventListener('input', () => { q.marks = Number(marks.value); touch(); });
    const collapse = iconBtn('▾', 'Collapse / expand', () => {
      const closed = card.classList.toggle('collapsed');
      body.hidden = closed; collapse.textContent = closed ? '▸' : '▾'; setSnippet();
    });

    card.append(
      el('header', { class: 'ex-qhead' },
        collapse, num, idIn, typeSel,
        check('Required', q.mandatory, (v) => { q.mandatory = v; touch(); }),
        check('Marked', q.marked, (v) => { q.marked = v; marks.disabled = !v; touch(); }), marks,
        snippet, el('span', { class: 'ex-spacer' }), controls(q)),
      body);

    function renderBody() {
      body.replaceChildren();
      const prompt = mde(keyOf(q) + 'p', () => q.prompt, (v) => { q.prompt = v; setSnippet(); },
        { rows: 4, label: 'Question text', placeholder: 'Write the question…  (type / for tables, callouts, images)' });
      body.append(field('Question', prompt.el));
      if (isMcq(q)) body.append(optionsEditor());
      if (q.type === 'short') body.append(shortExtras());
      if (q.type === 'code') body.append(codeExtras());
      const s = sol(q);
      body.append(field(isMcq(q) ? 'Explanation (optional, for you while checking)' : 'Model answer (optional, for you while checking)',
        mde(keyOf(s) + 'm', () => s.modelAnswer || '', (v) => { s.modelAnswer = v; }, { compact: true, rows: 2, label: 'Model answer' }).el));
    }

    function optionsEditor() {
      const single = q.type === 'mcq-single', group = 'c' + keyOf(q);
      const wrap = el('div', { class: 'ex-opts' });
      const mark = () => wrap.querySelectorAll('.ex-orow').forEach((r, j) => r.classList.toggle('is-correct', (sol(q).correct || []).includes(q.options[j]?.id)));
      const paint = () => {
        wrap.replaceChildren(
          el('span', { class: 'ex-label', text: single ? 'Options — pick the one correct answer' : 'Options — tick every correct answer' }),
          ...q.options.map((o, i) => {
            const input = el('input', { type: single ? 'radio' : 'checkbox', name: group, 'aria-label': `Option ${i + 1} is correct` });
            input.checked = (sol(q).correct || []).includes(o.id);
            input.addEventListener('change', () => {
              const c = new Set(sol(q).correct || []);
              if (single) { c.clear(); c.add(o.id); } else if (input.checked) c.add(o.id); else c.delete(o.id);
              sol(q).correct = [...c]; mark(); touch();
            });
            const ed = mde(keyOf(o), () => o.text, (v) => { o.text = v; }, { compact: true, rows: 1, label: `Option ${i + 1}`, placeholder: `Option ${i + 1}` });
            return el('div', { class: 'ex-orow' }, el('label', { class: 'ex-correct', title: 'Correct answer' }, input, el('span', { text: '✓' })), ed.el,
              iconBtn('✕', 'Remove option', () => {
                q.options.splice(i, 1); sol(q).correct = (sol(q).correct || []).filter((x) => x !== o.id); paint(); touch();
              }, q.options.length <= 2));
          }),
          el('button', { type: 'button', class: 'ex-btn ghost small', text: '+ Add option', onclick: () => { q.options.push({ id: nextOptId(q), text: '' }); paint(); touch(); } }));
        mark();
      };
      paint();
      return wrap;
    }
    function shortExtras() {
      const s = sol(q);
      const acc = el('textarea', { class: 'ex-input mono', rows: 2, placeholder: 'One accepted answer per line — leave empty to mark by hand' });
      acc.value = (s.accepted || []).join('\n');
      acc.addEventListener('input', () => { s.accepted = acc.value.split('\n'); touch(); });
      return el('div', { class: 'ex-stack' }, field('Accepted answers (auto-marked)', acc, 'Matched after trimming spaces. Anything else is left for you to mark.'),
        check('Case-sensitive match', s.caseSensitive, (v) => { s.caseSensitive = v; touch(); }));
    }
    function codeExtras() {
      const lang = el('select', { class: 'ex-input', 'aria-label': 'Language' }, CODE_LANGS.map((l) => el('option', { value: l.id, text: l.label })));
      lang.value = q.codeLang;
      const other = el('input', { class: 'ex-input', value: q.codeLangLabel || '', placeholder: 'Language name, e.g. Haskell', 'aria-label': 'Language name' });
      other.hidden = q.codeLang !== 'other';
      lang.addEventListener('change', () => { q.codeLang = lang.value; other.hidden = lang.value !== 'other'; touch(); });
      other.addEventListener('input', () => { q.codeLangLabel = other.value; touch(); });
      const starter = el('textarea', { class: 'ex-input mono', rows: 3, placeholder: 'Starter code shown in the answer box (optional)', spellcheck: 'false' });
      starter.value = q.starter || '';
      starter.addEventListener('input', () => { q.starter = starter.value; touch(); });
      return el('div', { class: 'ex-stack' }, el('div', { class: 'ex-row wrap' }, field('Answer language', lang), other), field('Starter code', starter));
    }

    renderBody(); setSnippet();
    return card;
  }

  function textCard(t) {
    const card = el('section', { class: 'ex-qcard is-text' });
    card._item = t;
    const idIn = el('input', { class: 'ex-input idin', value: t.id, 'aria-label': 'Paragraph id', spellcheck: 'false' });
    renameId(t, idIn);
    card.append(
      el('header', { class: 'ex-qhead' }, el('span', { class: 'ex-kind', text: '¶ Paragraph' }), idIn,
        el('small', { class: 'ex-muted', text: 'shown between questions' }), el('span', { class: 'ex-spacer' }), controls(t)),
      el('div', { class: 'ex-qbody' }, mde(keyOf(t) + 't', () => t.text, (v) => { t.text = v; },
        { rows: 4, label: 'Paragraph', placeholder: '# Heading\n\nText, links, =(ok)colours=, images… (type / for blocks)' }).el));
    return card;
  }

  function sectionCard(sec) {
    const card = el('section', { class: 'ex-qcard is-section' });
    const count = el('small', { class: 'ex-muted' });
    card._item = sec; card._count = count;
    const idIn = el('input', { class: 'ex-input idin', value: sec.id, 'aria-label': 'Section id', spellcheck: 'false' });
    renameId(sec, idIn);
    const title = el('input', { class: 'ex-input ex-sectitle', value: sec.title || '', placeholder: 'Section title, e.g. Part A — Theory', 'aria-label': 'Section title' });
    title.addEventListener('input', () => { sec.title = title.value; touch(); });
    card.append(
      el('header', { class: 'ex-qhead' }, el('span', { class: 'ex-kind', text: '§ Section' }), idIn, title, count,
        check('Shuffle questions in this section', sec.shuffle, (v) => { sec.shuffle = v; touch(); }), el('span', { class: 'ex-spacer' }), controls(sec)),
      el('div', { class: 'ex-qbody' }, field('Section introduction (optional)', mde(keyOf(sec) + 'd', () => sec.description || '', (v) => { sec.description = v; },
        { compact: true, rows: 2, label: 'Section introduction' }).el,
      'Everything below this card, until the next section, belongs to it.')));
    return card;
  }
  const makeCard = (it) => (it.kind === 'section' ? sectionCard(it) : it.kind === 'text' ? textCard(it) : questionCard(it));

  function addItem(it) {
    items().push(it);
    const c = makeCard(it);
    cards.set(it, c); list.append(c); renumber(); touch();
    c.scrollIntoView({ behavior: 'smooth', block: 'center' });
    c.querySelector('.mde-input, .ex-sectitle')?.focus();
  }
  function move(it, dir) {
    const arr = items(), i = arr.indexOf(it), j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const c = cards.get(it);
    if (dir < 0) list.insertBefore(c, c.previousElementSibling); else list.insertBefore(c.nextElementSibling, c);
    renumber(); touch();
    c.scrollIntoView({ block: 'nearest' });
  }
  async function remove(it) {
    if (!(await confirmDialog(`Delete ${it.kind} ${it.id}?`, { ok: 'Delete', danger: true }))) return;
    items().splice(items().indexOf(it), 1);
    if (it.kind === 'question') delete state.solutions[it.id];
    cards.get(it).remove(); cards.delete(it); renumber(); touch();
  }
  function duplicate(it) {
    const copy = JSON.parse(JSON.stringify(it));
    copy.id = nextItemId(items(), it.kind === 'section' ? 'S' : it.kind === 'text' ? 'T' : 'Q');
    const arr = items();
    arr.splice(arr.indexOf(it) + 1, 0, copy);
    if (it.kind === 'question' && state.solutions[it.id]) state.solutions[copy.id] = JSON.parse(JSON.stringify(state.solutions[it.id]));
    const c = makeCard(copy);
    cards.set(copy, c);
    list.insertBefore(c, cards.get(it).nextSibling); renumber(); touch();
    toast('Duplicated — any table/callout ids inside it now clash; rename them', 'err');
  }

  /* ---------- output ---------- */
  function buildOutput() {
    const p = state.paper, s = p.settings;
    const t = Number(s.timeLimitMin);
    const endMs = s.endLocal ? zonedToUtcMs(s.endLocal, s.endTz) : NaN;
    const outItems = p.items.map((it) => {
      if (it.kind === 'section') return { kind: 'section', id: it.id.trim(), title: it.title.trim(), description: it.description || '', shuffle: !!it.shuffle };
      if (it.kind === 'text') return { kind: 'text', id: it.id.trim(), text: it.text || '' };
      const o = { kind: 'question', id: it.id.trim(), type: it.type, prompt: it.prompt, mandatory: !!it.mandatory, marked: !!it.marked, marks: it.marked ? Number(it.marks) : 0 };
      if (isMcq(it)) o.options = it.options.filter((x) => x.text.trim()).map((x) => ({ id: x.id, text: x.text }));
      if (it.type === 'code') {
        o.codeLang = it.codeLang;
        o.codeLangLabel = it.codeLang === 'other' ? (it.codeLangLabel || '').trim() : '';
        if ((it.starter || '').trim()) o.starter = it.starter;
      }
      return o;
    });
    const solutions = {};
    for (const q of outItems.filter(isQuestion)) {
      const s0 = state.solutions[q.id];
      if (!s0) continue;
      const o = {};
      if (isMcq(q)) {
        const ids = new Set(q.options.map((x) => x.id));
        const c = (s0.correct || []).filter((x) => ids.has(x));
        if (c.length) o.correct = c;
      }
      if (q.type === 'short') {
        const a = (s0.accepted || []).map((x) => x.trim()).filter(Boolean);
        if (a.length) { o.accepted = a; o.caseSensitive = !!s0.caseSensitive; }
      }
      if ((s0.modelAnswer || '').trim()) o.modelAnswer = s0.modelAnswer;
      if (Object.keys(o).length) solutions[q.id] = o;
    }
    /* images: those used in the paper travel with the paper; images used ONLY in model answers go in the
       setter-only block, so students can't pull them out of the file. */
    const paperTexts = [p.description, ...outItems.flatMap((i) => (i.kind === 'text' ? [i.text] : i.kind === 'section' ? [i.description]
      : [i.prompt, ...(i.options || []).map((o) => o.text)]))];
    const paperIds = new Set(paperTexts.flatMap(collectImageIds));
    const modelIds = new Set(Object.values(solutions).flatMap((x) => collectImageIds(x.modelAnswer || '')));
    const pick = (ids) => Object.fromEntries([...ids].filter((id) => id in p.assets).map((id) => [id, p.assets[id]]));
    const modelOnly = pick([...modelIds].filter((id) => !paperIds.has(id)));
    if (Object.keys(modelOnly).length) solutions._assets = modelOnly;

    const paper = {
      id: p.id, title: p.title.trim(), description: p.description, assets: pick(paperIds),
      settings: {
        shuffleQuestions: !!s.shuffleQuestions, shuffleSections: !!s.shuffleSections, shuffleOptions: !!s.shuffleOptions, showMarks: !!s.showMarks,
        timeLimitMin: t > 0 ? t : null,
        endLocal: s.endLocal || '', endTz: s.endTz, endAt: Number.isFinite(endMs) ? new Date(endMs).toISOString() : null,
        blockRepeats: !!s.blockRepeats, secretId: (s.secretId || '').trim(), cooldownMin: Number(s.cooldownMin) > 0 ? Number(s.cooldownMin) : null,
        identityFields: s.identityFields.map((f) => ({ id: f.id, label: f.label.trim(), required: !!f.required, identifies: f.identifies !== false })),
      },
      items: outItems,
    };
    return { paper, solutions };
  }

  /* ---------- preview ---------- */
  function previewNode() {
    const { paper } = buildOutput();
    const md = (t) => renderMarkdown(t, { images: true, assets: paper.assets });
    const badge = (t, c = '') => el('span', { class: `ex-badge ${c}`.trim(), text: t });
    let n = 0;
    return el('div', { class: 'ex-preview' },
      el('h2', { text: paper.title || '(untitled paper)' }),
      el('div', { class: 'exam-md', html: md(paper.description) }),
      paper.settings.endAt ? el('p', { class: 'ex-note', text: `Closes ${fmtInZone(Date.parse(paper.settings.endAt), paper.settings.endTz)}` }) : null,
      ...paper.items.map((it) => {
        if (it.kind === 'section') return el('section', { class: 'ex-sectionhead' }, el('h2', { text: it.title || '(untitled section)' }), el('div', { class: 'exam-md', html: md(it.description) }));
        if (it.kind === 'text') return el('div', { class: 'exam-md ex-textblock', html: md(it.text) });
        n++;
        return el('article', { class: 'ex-q' },
          el('div', { class: 'ex-qmeta' }, el('strong', { text: `Q${n}` }), badge('#' + it.id), badge(TYPE_LABEL[it.type]),
            badge(it.mandatory ? 'Required' : 'Optional', it.mandatory ? 'warn' : ''),
            badge(it.marked ? `${it.marks} mark${it.marks === 1 ? '' : 's'}` : 'Unmarked', it.marked ? 'accent' : '')),
          el('div', { class: 'exam-md', html: md(it.prompt) }),
          it.options ? el('ol', { class: 'ex-previewopts', type: 'a' }, it.options.map((o) => el('li', { class: 'exam-md', html: md(o.text) }))) : null);
      }));
  }

  /* ---------- generate ---------- */
  async function generate() {
    persist.flush();
    const { errors, warnings } = validateAll();
    if (errors.length) return dialog({ title: 'Fix these before generating', body: bulletList(errors) });
    if (warnings.length && !(await confirmDialog(bulletList(warnings), { ok: 'Generate anyway', title: 'Generate with warnings?' }))) return;
    let out, info;
    try {
      const { paper, solutions } = buildOutput();
      info = paper;
      out = await createPaperFile(paper, solutions);
      downloadText(paperFileName(paper), packPaperZip(out.file), 'application/zip');
    } catch (e) { return toast('Could not generate: ' + (e.message || e), 'err'); }

    const block = (label, value, note) => el('div', { class: 'ex-keyblock' },
      el('h4', { text: label }), el('code', { class: 'ex-key', text: value }),
      el('div', { class: 'ex-row' }, el('button', { type: 'button', class: 'ex-btn ghost small', text: 'Copy', onclick: () => copyText(value) })),
      el('p', { class: 'ex-muted', text: note }));
    const keyFile = `Exam keys — ${info.title}\nPaper id: ${info.id}\nGenerated: ${new Date().toLocaleString()}\n\n` +
      `ANSWERER KEY (give to students with the .zip file; also needed in Check paper):\n${out.answererKey}\n\n` +
      `SETTER KEY (private — opens answer files and the correct answers; never share):\n${out.setterKey}\n`;
    await dialog({
      title: 'Paper generated — save both keys now', wide: true, locked: true,
      body: el('div', { class: 'ex-stack' },
        el('p', { text: `${paperFileName(info)} was downloaded. Send it to students together with the answerer key. To read their answers later you need that zip plus BOTH keys. The keys cannot be recovered.` }),
        block('Answerer (public) key — share with students', out.answererKey, 'Students enter this to open the paper.'),
        block('Setter (private) key — keep secret', out.setterKey, 'Opens answer files and the correct answers. Anyone with it can read every answer.'),
        el('button', { type: 'button', class: 'ex-btn ghost', text: 'Download keys as a text file', onclick: () => downloadText(`${safeName(info.title)}_keys.txt`, keyFile, 'text/plain') })),
      actions: [{ label: 'I have saved both keys', value: true, primary: true }],
    });
  }

  /* ---------- drafts ---------- */
  function exportDraft() {
    downloadText(`draft_${safeName(state.paper.title || 'paper')}.json`, JSON.stringify(state, null, 2));
  }
  async function importDraft() {
    const f = await pickFile('.json');
    if (!f) return;
    try {
      const d = JSON.parse(await readText(f));
      if (!d || !d.paper || !(Array.isArray(d.paper.items) || Array.isArray(d.paper.questions))) throw new Error('not a draft');
      state = normalize(d); persist.flush(); build(); toast('Draft imported', 'ok');
    } catch { toast('That file is not a paper draft.', 'err'); }
  }
  async function newPaper() {
    if (items().length && !(await confirmDialog('Start a new paper? The current draft will be discarded (export it first if you need it).', { ok: 'Start new', danger: true }))) return;
    state = { paper: blankPaper(), solutions: {} };
    persist.flush(); build();
  }
  async function openExisting() {
    if (items().length && !(await confirmDialog('Opening a generated paper replaces your current draft. Continue?', { ok: 'Continue' }))) return;
    let file = null;
    const key = el('input', { class: 'ex-input mono', type: 'password', placeholder: 'SK1-…', autocomplete: 'off', spellcheck: 'false' });
    const name = el('p', { class: 'ex-muted', text: 'No file chosen' });
    const err = el('p', { class: 'ex-err' });
    const ref = {};
    const go = el('button', {
      type: 'button', class: 'ex-btn primary', text: 'Open', onclick: async () => {
        err.textContent = '';
        if (!file || !key.value.trim()) { err.textContent = 'Choose the paper .zip and paste the setter key.'; return; }
        try {
          const r = await openPaperAsSetter(await readPaperBytes(await readBytes(file)), key.value.trim());
          const d = { paper: r.paper, solutions: r.solutions };
          Object.assign(d.paper.assets ||= {}, d.solutions._assets || {});
          delete d.solutions._assets;
          state = normalize(d);
          persist.flush(); build(); ref.close(true); toast('Paper opened for editing — generating again makes new keys', 'ok');
        } catch (e) { err.textContent = e instanceof CryptoError ? e.message : 'Could not open that file.'; }
      },
    });
    dialog({
      title: 'Open a generated paper', ref, actions: [{ label: 'Cancel', value: false }],
      body: el('div', { class: 'ex-stack' },
        dropZone({ accept: '.zip,.exam', label: 'Choose the paper .zip', hint: 'or drop it here', onFiles: ([f]) => { file = f; name.textContent = f.name; } }),
        name, field('Setter key', key), err, go),
    });
  }

  /* ---------- assemble ---------- */
  function build() {
    list.replaceChildren(); cards.clear();
    for (const it of items()) { const c = makeCard(it); cards.set(it, c); list.append(c); }
    renumber();
    const adds = el('div', { class: 'ex-stack addbar' },
      el('div', { class: 'ex-row wrap' }, el('span', { class: 'ex-label', text: 'Add question' }),
        QUESTION_TYPES.map((t) => el('button', { type: 'button', class: 'ex-btn ghost small', text: '+ ' + t.label, onclick: () => addItem(blankQuestion(t.id, items())) }))),
      el('div', { class: 'ex-row wrap' }, el('span', { class: 'ex-label', text: 'Add content' }),
        el('button', { type: 'button', class: 'ex-btn ghost small', text: '+ Paragraph', onclick: () => addItem(blankText(items())) }),
        el('button', { type: 'button', class: 'ex-btn ghost small', text: '+ Section', onclick: () => addItem(blankSection(items())) })));
    const bar = el('div', { class: 'ex-actionbar' }, saveEl, el('span', { class: 'ex-spacer' }), chip,
      el('button', { type: 'button', class: 'ex-btn ghost', text: 'Preview', onclick: () => dialog({ title: 'Preview (content as students see it, unshuffled)', wide: true, body: previewNode() }) }),
      el('button', { type: 'button', class: 'ex-btn primary', text: 'Generate paper', onclick: generate }));
    root.replaceChildren(
      el('div', { class: 'ex-intro' }, el('h1', { text: 'Set a paper' }),
        el('p', { class: 'ex-muted', text: 'Build the paper, then generate one encrypted .zip for your students. Everything happens in this browser — nothing is uploaded.' })),
      buildHeader(), el('h2', { class: 'ex-h2', text: 'Paper content' }), list,
      items().length ? null : el('p', { class: 'ex-empty', text: 'Nothing yet — add a question, paragraph or section below.' }),
      adds, bar);
    refresh(); saveEl.textContent = items().length ? 'Draft loaded from this device' : '';
  }
  build();
}
