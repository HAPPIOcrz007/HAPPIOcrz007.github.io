/* exam_js/checker.js — Admin › Check paper.
   Open the paper .zip with BOTH keys (setter/private + answerer/public), add one or many batches of .ans files, then:
   Overview (statistics) · Submissions (table) · Review & mark one student · Questions (per-question analysis).
   Manual marks are kept in this browser (localStorage) and are included in the CSV export.

   REPEATS: submissions by the same student (identity fields marked "identifies", compared ignoring case, spaces,
   punctuation and accents — "Harsh Rathod" = "harshrathod") are grouped. The earliest is the ORIGINAL and is the only
   one counted; every later one is flagged "answered inside the cooldown" (or after it) and needs your review:
   dismiss it, or count it instead of the original. Decisions are saved in this browser. */

import { el, toast, dialog, confirmDialog, bulletList, dropZone, readText, readBytes, fmtDate, fmtDur, plural } from './ui.js';
import { CODE_LANGS, isMcq, downloadText, safeName, hydratePaper, fmtInZone, normKey, codeLangOptions } from './format.js';
import { renderMarkdown, renderCode, renderSamples, enhanceCodeBlocks, stripMarkdown } from './markdown.js';
import { createMarkdownEditor } from './md-editor.js';
import { openPaperAsSetter, openPaperAsAnswerer, openAnswerFile, CryptoError } from './crypto.js';
import { readPaperBytes } from './zip.js';
import { gradeSubmission, batchStats, toCsv, identityKey, submissionId, isBlank, activeSeconds, rowState } from './grade.js';
import { barList, columns, scatter, donut, chartCard } from './charts.js';

const OVKEY = (id) => 'exam.marks.' + id;
const RVKEY = (id) => 'exam.review.' + id;
const PASSKEY = (id) => 'exam.pass.' + id;
const NOTEKEY = (id) => 'exam.notes.' + id;
const pct = (n) => (n == null ? '—' : `${Math.round(n * 10) / 10}%`);
const STATUS = { correct: ['Correct', 'ok'], wrong: ['Wrong', 'bad'], blank: ['Blank', ''], manual: ['Needs marking', 'warn'], unmarked: ['Unmarked', ''] };

export function mountChecker(root) {
  const S = {
    paper: null, solutions: null, setterKey: '', subs: [], batches: [], ov: {}, rv: {}, onlyReview: false, dedupe: true, passMark: 40, notes: {}, updatedAt: null, stale: false, dir: null, seen: new Set(), refreshBtn: null,
    tab: 'overview', sort: { key: 'submitted', dir: -1 }, batchFilter: '', search: '', reviewId: null, reviewList: [], stats: null,
  };
  const fields = () => S.paper.settings.identityFields;
  const saveOv = () => { try { localStorage.setItem(OVKEY(S.paper.id), JSON.stringify(S.ov)); } catch { /* ignore */ } };
  const saveNotes = () => { try { localStorage.setItem(NOTEKEY(S.paper.id), JSON.stringify(S.notes)); } catch { /* ignore */ } };
  const saveRv = () => { try { localStorage.setItem(RVKEY(S.paper.id), JSON.stringify(S.rv)); } catch { /* ignore */ } };
  const active = () => S.subs.filter((s) => s.counted);
  const md = (t) => renderMarkdown(t, { images: true, assets: S.paper.assets });
  const closeMs = () => (S.paper.settings.endAt ? Date.parse(S.paper.settings.endAt) : null);
  const isLate = (s) => closeMs() != null && Date.parse(s.payload.submittedAt) > closeMs() + 5000;

  /* ---------- data ---------- */
  const refreshStats = () => { S.stats = batchStats(S.paper, S.solutions, active(), { passMark: S.passMark }); };
  const who = (x) => fields().map((f) => (x.payload.identity || {})[f.id]).filter(Boolean).join(' · ') || 'Anonymous';
  const where = (f) => (f.inside === true ? 'answered inside the cooldown' : f.inside === false ? 'answered after the cooldown' : 'repeat attempt');
  function statusText(x) {
    if (!x.flag) return x.repeats.length ? (x.replaced ? 'original — replaced by a later entry' : 'original') : '';
    if (x.decision === 'counted') return 'counted instead of the original';
    if (x.decision === 'dismissed') return `reviewed — not counted (${where(x.flag)})`;
    return S.dedupe ? `needs review — ${where(x.flag)}` : `repeat — counted (${where(x.flag)})`;
  }
  function recompute() {
    const st = S.paper.settings;
    const cool = Number(st.cooldownMin) > 0 ? Number(st.cooldownMin) * 60000 : null;
    const want = normKey(st.secretId);
    for (const x of S.subs) {
      x.grade = gradeSubmission(S.paper, S.solutions, x.payload, S.ov[x.id]);
      Object.assign(x, { notes: S.notes[x.id] || {}, flag: null, counted: true, repeats: [], replaced: false, decision: null, secretBad: !!want && (x.payload.meta?.secretId || '') !== want });
    }
    const groups = new Map();
    for (const x of S.subs) {
      const k = identityKey(x.payload, fields());
      if (k) (groups.get(k) || groups.set(k, []).get(k)).push(x);
    }
    const when = (x) => [Date.parse(x.payload.submittedAt) || 0, Date.parse(x.payload.meta?.startedAt) || 0];
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      g.sort((p, q) => when(p)[0] - when(q)[0] || when(p)[1] - when(q)[1]);
      const orig = g[0];
      for (const x of g.slice(1)) {
        const startedAt = Date.parse(x.payload.meta?.startedAt || x.payload.submittedAt);
        const inside = !st.blockRepeats ? null : cool == null ? true : startedAt < Date.parse(orig.payload.submittedAt) + cool;
        x.flag = { originalId: orig.id, originalFile: orig.fileName, inside };
        x.decision = S.rv[x.id] || null;
        orig.repeats.push(x);
      }
      if (!S.dedupe) continue;
      const chosen = g.slice(1).filter((x) => x.decision === 'counted').pop();
      for (const x of g) x.counted = chosen ? x === chosen : x === orig;
      if (chosen) orig.replaced = true;
    }
    for (const x of S.subs) { x.needsReview = !!x.flag && S.dedupe && !x.decision; x.reviewStatus = statusText(x); }
    refreshStats();
  }
  function decide(x, v) {
    if (v) S.rv[x.id] = v; else delete S.rv[x.id];
    saveRv(); recompute(); renderAll();
  }

  async function addFiles(files, label = `Batch ${S.batches.length + 1}`) {
    const batch = { label, at: new Date().toISOString(), files: files.length, ok: 0, errors: [] };
    for (const f of files) {
      try {
        const payload = await openAnswerFile(await readText(f), S.setterKey, S.paper.id);
        const id = submissionId(payload, fields());
        if (S.subs.some((s) => s.id === id)) { batch.errors.push({ name: f.name, msg: 'Already loaded (same file, same student, same submission time).' }); continue; }
        S.subs.push({ id, payload, fileName: f.name, batch: label });
        batch.ok++;
      } catch (e) {
        batch.errors.push({ name: f.name, msg: e instanceof CryptoError ? e.message : 'Could not read this file.' });
      }
    }
    S.batches.push(batch);
    recompute();
    renderAll();
    if (batch.errors.length) {
      dialog({ title: `${label}: ${batch.ok} loaded, ${batch.errors.length} skipped`, wide: true,
        body: bulletList(batch.errors.map((e) => `${e.name} — ${e.msg}`)) });
    } else toast(`${label}: ${plural(batch.ok, 'answer file')} loaded`, 'ok');
    return batch;
  }

  /* ---------- refresh + linked folder ---------- */
  async function syncFolder() {
    const fresh = [];
    for await (const [name, h] of S.dir.entries()) {
      if (h.kind !== 'file' || !/\.ans$/i.test(name)) continue;
      const f = await h.getFile();
      const k = `${name}|${f.size}|${f.lastModified}`;
      if (S.seen.has(k)) continue;
      S.seen.add(k); fresh.push(f);
    }
    if (!fresh.length) return 0;
    return (await addFiles(fresh, `Folder ${S.batches.length + 1}`)).ok;
  }
  async function linkFolder() {
    try { S.dir = await window.showDirectoryPicker({ mode: 'read' }); } catch { return; }      // cancelled
    S.seen = new Set();
    const n = await syncFolder();
    renderAll();
    toast(`Linked “${S.dir.name}” — ${plural(n, 'answer file')} loaded. Press Refresh later to pick up new ones.`, 'ok');
  }
  /** Re-read marks and review decisions saved by another window, pick up new files from the linked folder, rebuild the dashboard. */
  async function refresh() {
    if (!S.paper) return;
    if (S.refreshBtn) { S.refreshBtn.disabled = true; S.refreshBtn.textContent = 'Refreshing…'; }
    let added = 0;
    try { S.ov = JSON.parse(localStorage.getItem(OVKEY(S.paper.id))) || {}; } catch { /* keep what we have */ }
    try { S.rv = JSON.parse(localStorage.getItem(RVKEY(S.paper.id))) || {}; } catch { /* keep what we have */ }
    try { S.notes = JSON.parse(localStorage.getItem(NOTEKEY(S.paper.id))) || {}; } catch { /* keep what we have */ }
    if (S.dir) { try { added = await syncFolder(); } catch { toast('Could not read the linked folder — link it again.', 'err'); S.dir = null; } }
    recompute();
    S.updatedAt = Date.now(); S.stale = false;
    renderAll();
    toast(added ? `Refreshed — ${plural(added, 'new answer file')} loaded` : 'Refreshed — everything is up to date', 'ok');
  }
  window.addEventListener('storage', (e) => {      // marks or decisions changed in another tab/window of this browser
    if (!S.paper || (e.key !== OVKEY(S.paper.id) && e.key !== RVKEY(S.paper.id) && e.key !== NOTEKEY(S.paper.id))) return;
    S.stale = true;
    if (S.refreshBtn) { S.refreshBtn.className = 'ex-btn small primary'; S.refreshBtn.textContent = '↻ Refresh — new changes'; }
  });

  /* ---------- 1. open the paper ---------- */
  function openCard() {
    if (S.paper) {
      return el('section', { class: 'ex-card' }, el('div', { class: 'ex-row wrap spread' },
        el('div', {}, el('h2', { text: S.paper.title }),
          el('p', { class: 'ex-muted', text: `${S.paper.id} · ${plural(S.paper.questions.length, 'question')} · opened with the setter and answerer keys` +
            (closeMs() != null ? ` · closes ${fmtInZone(closeMs(), S.paper.settings.endTz)}` : '') })),
        el('button', { type: 'button', class: 'ex-btn ghost small', text: 'Close paper', onclick: async () => {
          if (S.subs.length && !(await confirmDialog('Close this paper and unload all answer files? Manual marks stay saved in this browser.', { ok: 'Close' }))) return;
          Object.assign(S, { paper: null, solutions: null, setterKey: '', subs: [], batches: [], ov: {}, rv: {}, notes: {}, onlyReview: false, dir: null, seen: new Set(), updatedAt: null, stale: false, reviewId: null, tab: 'overview' });
          renderAll();
        } })));
    }
    let file = null;
    const key = el('input', { class: 'ex-input mono', type: 'password', placeholder: 'SK1-…', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Setter key' });
    const akey = el('input', { class: 'ex-input mono', placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Answerer key' });
    const name = el('p', { class: 'ex-muted', text: 'No file chosen' });
    const err = el('p', { class: 'ex-err', role: 'alert' });
    const go = el('button', { type: 'button', class: 'ex-btn primary', text: 'Open paper' });
    go.addEventListener('click', async () => {
      err.textContent = '';
      if (!file) { err.textContent = 'Choose the paper .zip you gave students.'; return; }
      if (!key.value.trim() || !akey.value.trim()) { err.textContent = 'Enter both keys: the setter (private) key and the answerer (public) key.'; return; }
      go.disabled = true; go.textContent = 'Opening…';
      try {
        const text = await readPaperBytes(await readBytes(file));
        await openPaperAsAnswerer(text, akey.value);                       // proves the answerer key
        let r;
        try { r = await openPaperAsSetter(text, key.value.trim()); }       // proves the setter key
        catch (e) { throw e instanceof CryptoError && !/not a setter key|incomplete/.test(e.message) ? new CryptoError('Wrong setter key for this paper.') : e; }
        S.paper = hydratePaper(r.paper); S.solutions = r.solutions; S.setterKey = key.value.trim();
        Object.assign(S.paper.assets, S.solutions._assets || {});
        delete S.solutions._assets;
        try { S.ov = JSON.parse(localStorage.getItem(OVKEY(S.paper.id))) || {}; } catch { S.ov = {}; }
        try { S.rv = JSON.parse(localStorage.getItem(RVKEY(S.paper.id))) || {}; } catch { S.rv = {}; }
        try { S.notes = JSON.parse(localStorage.getItem(NOTEKEY(S.paper.id))) || {}; } catch { S.notes = {}; }
        S.passMark = Number(localStorage.getItem(PASSKEY(S.paper.id))) || 40;
        recompute(); S.updatedAt = Date.now();
        renderAll();
      } catch (e) {
        err.textContent = e instanceof CryptoError ? e.message : 'That file could not be opened.';
        go.disabled = false; go.textContent = 'Open paper';
      }
    });
    return el('section', { class: 'ex-card ex-stack narrow-card' },
      el('h2', { text: 'Open the paper' }),
      el('p', { class: 'ex-muted', text: 'Enter the question paper with both keys you got when you generated it.' }),
      dropZone({ accept: '.zip,.exam', label: 'Choose the paper .zip', hint: 'the same file you gave students', onFiles: ([f]) => { file = f; name.textContent = f.name; } }),
      name,
      el('label', { class: 'ex-field' }, el('span', { class: 'ex-label', text: 'Setter key (private)' }), key),
      el('label', { class: 'ex-field' }, el('span', { class: 'ex-label', text: 'Answerer key (public)' }), akey),
      err, go);
  }

  /* ---------- 2. add batches ---------- */
  function addCard() {
    return el('section', { class: 'ex-card ex-stack' },
      el('div', { class: 'ex-row wrap spread' }, el('h2', { text: 'Answer files' }),
        el('span', { class: 'ex-muted', text: S.batches.length ? `${plural(S.subs.length, 'submission')} in ${plural(S.batches.length, 'batch')}` : 'Add as many batches as you like — the same key opens them all.' })),
      dropZone({ accept: '.ans', multiple: true, label: S.batches.length ? 'Add another batch of .ans files' : 'Add .ans files', hint: 'select several at once, or drop them here', onFiles: (f) => addFiles(f) }),
      typeof window.showDirectoryPicker === 'function' ? el('div', { class: 'ex-row wrap' },
        S.dir ? el('span', { class: 'ex-muted', text: `Linked folder: ${S.dir.name} — Refresh loads new .ans files from it.` }) : el('span', { class: 'ex-muted', text: 'Chrome / Edge: link a folder of answer files so Refresh can pick up new ones automatically.' }),
        el('button', { type: 'button', class: 'ex-btn ghost small', text: S.dir ? 'Unlink' : 'Link a folder…', onclick: () => { if (S.dir) { S.dir = null; renderAll(); } else linkFolder(); } })) : null);
  }

  /* ---------- tabs ---------- */
  const panel = el('div', { class: 'ex-panel' });
  function tabsBar() {
    const t = (id, label) => el('button', {
      type: 'button', class: `ex-tab${S.tab === id && !S.reviewId ? ' active' : ''}`, text: label,
      onclick: () => { S.tab = id; S.reviewId = null; renderAll(); },
    });
    const rbtn = el('button', { type: 'button', class: `ex-btn small ${S.stale ? 'primary' : 'ghost'}`, text: S.stale ? '↻ Refresh — new changes' : '↻ Refresh', title: 'Re-read markings and review decisions, load new files from the linked folder, and rebuild the dashboard', onclick: refresh });
    S.refreshBtn = rbtn;
    return el('div', { class: 'ex-tabs', role: 'tablist' }, t('overview', 'Dashboard'), t('subs', `Submissions (${active().length})`), t('questions', 'Questions'),
      el('span', { class: 'ex-spacer' }), el('small', { class: 'ex-muted', text: S.updatedAt ? `Updated ${new Date(S.updatedAt).toLocaleTimeString()}` : '' }), rbtn);
  }

  /* ---------- ranking, language, backup helpers ---------- */
  /** Counted submissions, best first; equal scores share a rank (1, 2, 2, 4 …). */
  function ranked() {
    const list = active().slice().sort((a, b) => b.grade.total - a.grade.total || a.payload.submittedAt.localeCompare(b.payload.submittedAt));
    let rank = 0, prev = null;
    list.forEach((x, i) => { if (x.grade.total !== prev) { rank = i + 1; prev = x.grade.total; } x.rank = rank; });
    return list;
  }
  const openReview = (id) => { S.reviewList = ranked().map((x) => x.id); S.reviewId = id; renderAll(); window.scrollTo({ top: 0 }); };
  const langOf = (sub, q) => { const o = codeLangOptions(q); return o.find((l) => l.id === (sub.payload.langs || {})[q.id]) || o[0]; };
  const pickFile = (accept) => new Promise((res) => { const i = el('input', { type: 'file', accept }); i.addEventListener('change', () => res(i.files[0] || null)); i.click(); });
  function exportBackup() {
    downloadText(`${safeName(S.paper.title)}_marking-backup.json`, JSON.stringify({ v: 1, paperId: S.paper.id, marks: S.ov, reviews: S.rv, notes: S.notes, passMark: S.passMark, savedAt: new Date().toISOString() }, null, 2));
  }
  async function importBackup() {
    const f = await pickFile('.json');
    if (!f) return;
    try {
      const d = JSON.parse(await readText(f));
      if (!d || d.paperId !== S.paper.id) throw new Error('other paper');
      if (!(await confirmDialog('Replace the marks, review decisions and notes in this browser with the ones in the backup?', { ok: 'Replace', danger: true }))) return;
      S.ov = d.marks || {}; S.rv = d.reviews || {}; S.notes = d.notes || {}; S.passMark = Number(d.passMark) || S.passMark;
      saveOv(); saveRv(); saveNotes();
      try { localStorage.setItem(PASSKEY(S.paper.id), String(S.passMark)); } catch { /* ignore */ }
      recompute(); S.updatedAt = Date.now(); renderAll(); toast('Marking backup loaded', 'ok');
    } catch { toast('That is not a marking backup for this paper.', 'err'); }
  }

  /* ---------- ranklist: who got which question right / wrong / not answered ---------- */
  const LEGEND = [['ok', '✓', 'Correct'], ['bad', '✗', 'Wrong'], ['part', '½', 'Partial marks'], ['warn', '?', 'Awaiting marking / not scored'], ['none', '–', 'Not answered']];
  const legendNode = () => el('ul', { class: 'rk-legend' }, LEGEND.map(([c, sym, t]) => el('li', {}, el('i', { class: `rk-cell ${c}`, text: sym }), el('span', { text: t }))));
  function ranklistNode(forPrint) {
    const list = ranked(), qs = S.paper.questions;
    if (!list.length) return el('p', { class: 'ex-muted', text: 'No submissions yet.' });
    const groups = [];
    for (const q of qs) { const t = secOf(q) || ''; const g = groups[groups.length - 1]; if (g && g.t === t) g.n++; else groups.push({ t, n: 1 }); }
    const secRow = groups.some((g) => g.t) ? el('tr', { class: 'rk-secrow' }, el('th', { colspan: 4 }), groups.map((g) => el('th', { colspan: g.n, class: 'rk-sec', text: g.t }))) : null;
    const head = el('thead', {}, secRow, el('tr', {}, el('th', { class: 'rk-rank', text: '#' }), el('th', { class: 'rk-who', text: 'Student' }), el('th', { text: 'Score' }), el('th', { text: '%' }),
      qs.map((q, i) => el('th', { class: 'rk-q', title: `Q${i + 1} — ${stripMarkdown(q.prompt).slice(0, 80)}`, text: `Q${i + 1}` }))));
    const stateOf = (x, qi) => rowState(qs[qi], x.grade.rows[qi], (x.payload.answers || {})[qs[qi].id]);
    const body = el('tbody', {}, list.map((x) => el('tr', {},
      el('td', { class: 'rk-rank', text: x.rank }),
      el('td', { class: 'rk-who' }, el('button', { type: 'button', class: 'rk-link', text: who(x), onclick: forPrint ? null : () => openReview(x.id) }), x.grade.pending ? el('span', { class: 'ex-badge warn', text: `${x.grade.pending} to mark` }) : null),
      el('td', { class: 'num', text: `${x.grade.total}/${x.grade.max}` }), el('td', { class: 'num', text: pct(x.grade.pct) }),
      qs.map((q, qi) => {
        const st = stateOf(x, qi), row = x.grade.rows[qi];
        return el('td', { class: `rk-cell ${st.cls}`, title: `${who(x)} — Q${qi + 1}: ${st.label}${q.marked ? ` (${row.score}/${row.max})` : ''}`, text: st.sym, onclick: forPrint ? null : () => openReview(x.id) });
      }))));
    const foot = el('tfoot', {}, el('tr', {}, el('td', { colspan: 4, class: 'rk-who', text: 'Correct / answered' }),
      qs.map((q, qi) => { const ans = list.filter((x) => stateOf(x, qi).cls !== 'none'), ok = list.filter((x) => stateOf(x, qi).cls === 'ok'); return el('td', { class: 'rk-foot', text: q.marked ? `${ok.length}/${ans.length}` : `${ans.length}` }); })));
    return el('div', { class: 'rk' }, legendNode(), el('div', { class: 'ex-tablewrap rk-wrap' }, el('table', { class: 'ex-table rk-table' }, head, body, foot)));
  }
  const ranklistCard = () => el('section', { class: 'ex-card ex-stack' }, el('h3', { text: 'Ranklist — who got what' }),
    el('p', { class: 'ex-muted', text: 'One row per student, best first; click a name or a cell to open that paper. Green = right, red = wrong, yellow = not marked yet, grey = not answered.' }),
    ranklistNode(false));

  /* ---------- Dashboard ---------- */
  const secOf = (q) => (S.paper.sectionOf || {})[q.id];
  const qLabel = (i) => `Q${i + 1}` + (secOf(S.paper.questions[i]) ? ` · ${secOf(S.paper.questions[i])}` : '');
  const ratioCls = (r) => (r < 0.4 ? 'bad' : r < 0.7 ? 'warn' : 'ok');
  function timelineChart(ac) {
    const ts = ac.map((x) => Date.parse(x.payload.submittedAt)).filter(Number.isFinite);
    if (ts.length < 2) return null;
    const min = Math.min(...ts), span = Math.max(...ts) - min;
    let step = span <= 2 * 3600e3 ? 5 * 60e3 : span <= 12 * 3600e3 ? 30 * 60e3 : span <= 3 * 86400e3 ? 3 * 3600e3 : 86400e3;
    while (Math.floor(span / step) + 1 > 48) step *= 2;
    const n = Math.floor(span / step) + 1, counts = Array(n).fill(0);
    for (const t of ts) counts[Math.floor((t - min) / step)]++;
    const fmt = (t) => (step >= 86400e3 ? new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' }) : new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    const every = Math.ceil(n / 8);
    return columns(counts.map((c, i) => ({ label: i % every === 0 ? fmt(min + i * step) : '', value: c, title: `${fmt(min + i * step)}: ${plural(c, 'submission')}`, cls: 'info' })), { height: 150 });
  }
  function dashboardBody() {
    const st = S.stats, ac = active();
    const card = (label, value, sub) => el('div', { class: 'ex-stat' }, el('span', { class: 'ex-statv', text: value }), el('span', { class: 'ex-statl', text: label }), sub ? el('small', { class: 'ex-muted', text: sub }) : null);
    const superseded = S.subs.length - ac.length;
    const nr = S.subs.filter((x) => x.needsReview);
    const pq = st.perQuestion, marked = pq.map((p, i) => ({ p, i })).filter((x) => x.p.marked);

    /* 1. score distribution with mean / median / pass line */
    const dist = columns(st.hist.map((n, i) => ({ label: i === 9 ? '90+' : String(i * 10), value: n, title: `${i * 10}–${i === 9 ? 100 : i * 10 + 10}%: ${plural(n, 'student')}`, cls: i * 10 + 10 <= S.passMark ? 'bad' : '' })),
      { height: 160, markers: [{ at: st.mean, label: `mean ${Math.round(st.mean)}%`, cls: 'info' }, { at: st.median, label: `median ${Math.round(st.median)}%`, cls: 'cyan' }] });

    /* 2. results + marking progress */
    const awaiting = ac.filter((x) => x.grade.pending).length;
    const results = el('div', { class: 'ex-donuts' },
      donut([{ label: 'Passed', value: st.passed, cls: 'ok' }, { label: 'Below pass mark', value: st.n - st.passed, cls: 'bad' }], { center: pct(st.passRate * 100), sub: `pass ≥ ${S.passMark}%` }),
      donut([{ label: 'Fully marked', value: ac.length - awaiting, cls: 'ok' }, { label: 'Waiting for marks', value: awaiting, cls: 'warn' }, { label: 'Repeats to review', value: nr.length, cls: 'bad' }],
        { center: `${Math.round(((ac.length - awaiting) / ac.length) * 100)}%`, sub: 'marked' }));

    /* 3. score vs time taken */
    const pts = ac.filter((x) => Number.isFinite(x.payload.meta?.durationSec)).map((x) => ({
      x: x.payload.meta.durationSec / 60, y: x.grade.pct, cls: x.grade.pct >= S.passMark ? 'ok' : 'bad',
      title: `${who(x)} — ${Math.round(x.grade.pct)}% in ${fmtDur(x.payload.meta.durationSec)}${x.grade.pending ? ' (marks still pending)' : ''}`,
      onclick: () => { S.reviewList = ac.map((a) => a.id); S.reviewId = x.id; renderAll(); window.scrollTo({ top: 0 }); },
    }));
    const sc = pts.length >= 2 ? scatter(pts, { xLabel: 'Time taken (minutes)', yLabel: 'Score %', lines: [{ y: S.passMark, label: `pass ${S.passMark}%`, cls: 'warn' }] }) : el('p', { class: 'ex-muted', text: 'Needs at least two submissions with recorded times.' });

    /* 4. timeline */
    const tl = timelineChart(ac) || el('p', { class: 'ex-muted', text: 'Needs at least two submissions at different times.' });

    /* 5-6. difficulty and discrimination */
    const withRatio = marked.filter((x) => x.p.avgRatio != null);
    const diffRows = withRatio.map(({ p, i }) => ({ label: qLabel(i), value: p.avgRatio, text: pct(p.avgRatio * 100), cls: ratioCls(p.avgRatio), title: stripMarkdown(S.paper.questions[i].prompt).slice(0, 120) }));
    const hardest = withRatio.length ? withRatio.reduce((a, b) => (b.p.avgRatio < a.p.avgRatio ? b : a)) : null;
    const easiest = withRatio.length ? withRatio.reduce((a, b) => (b.p.avgRatio > a.p.avgRatio ? b : a)) : null;
    const disc = marked.filter((x) => x.p.discrimination != null);
    const discRows = disc.map(({ p, i }) => ({ label: qLabel(i), value: Math.max(0, p.discrimination), text: `D ${p.discrimination.toFixed(2)}`, cls: p.discrimination < 0 ? 'bad' : p.discrimination < 0.2 ? 'warn' : 'ok',
      title: p.discrimination < 0 ? 'Weaker students did better — check the answer key' : p.discrimination < 0.2 ? 'Barely separates strong from weak' : 'Separates strong from weak well' }));

    /* 7. time per question, 8. attempt rate, 9. sections, 10. marking workload */
    const timed = pq.map((p, i) => ({ p, i })).filter((x) => x.p.avgSec != null);
    const maxT = Math.max(1, ...timed.map((x) => x.p.avgSec));
    const timeRows = timed.map(({ p, i }) => ({ label: qLabel(i), value: p.avgSec / maxT, text: `${fmtDur(p.avgSec)} avg · ${fmtDur(p.medianSec)} median`, cls: 'accent',
      title: `${p.timeN} students` + (p.avgSecCorrect != null && p.avgSecWrong != null ? ` · correct ${fmtDur(p.avgSecCorrect)} vs wrong ${fmtDur(p.avgSecWrong)}` : '') }));
    const attemptRows = pq.map((p, i) => ({ label: qLabel(i), value: p.attemptRate, text: `${pct(p.attemptRate * 100)} · ${p.skipped} skipped`, cls: p.attemptRate < 0.5 ? 'warn' : 'accent' }));
    const secRows = st.sections.filter((x) => x.avgPct != null).map((x) => ({ label: x.title, value: x.avgPct / 100, text: pct(x.avgPct), cls: ratioCls(x.avgPct / 100) }));
    const workRows = pq.map((p, i) => ({ p, i })).filter((x) => x.p.pending).map(({ p, i }) => ({ label: qLabel(i), value: p.pending / ac.length, text: `${p.pending} to mark`, cls: 'warn' }));

    const avgActive = st.avgActive != null && st.avgDuration ? Math.round((st.avgActive / st.avgDuration) * 100) : null;
    const grid = el('div', { class: 'ex-chartgrid' },
      chartCard('Score distribution', `How many students scored in each 10% band. Red bands are below the pass mark.`, dist),
      chartCard('Results & marking progress', 'Pass rate on the left; how much of the marking is finished on the right.', results),
      chartCard('Score vs time taken', 'Each dot is a student (click to open). Fast and high, or slow and low?', sc, true),
      chartCard('When students submitted', 'Submissions over time — useful for spotting a rush at the deadline.', tl),
      chartCard('Question difficulty', `Average share of the marks earned. Red < 40%, amber < 70%.${hardest ? ` Hardest: ${qLabel(hardest.i).split(' · ')[0]} (${pct(hardest.p.avgRatio * 100)}); easiest: ${qLabel(easiest.i).split(' · ')[0]} (${pct(easiest.p.avgRatio * 100)}).` : ''}`, diffRows.length ? barList(diffRows) : el('p', { class: 'ex-muted', text: 'No marked questions have scores yet.' })),
      chartCard('Question quality (discrimination)', 'D = how much better the top 27% did on a question than the bottom 27%. Near 0 = tells you nothing; negative = check the answer key.', discRows.length ? barList(discRows) : el('p', { class: 'ex-muted', text: 'Needs at least 6 marked submissions.' })),
      chartCard('Time per question', `Average active time on each question${avgActive != null ? ` — about ${avgActive}% of the total time taken; the rest is reading, scrolling or being away` : ''}.`, timeRows.length ? barList(timeRows) : el('p', { class: 'ex-muted', text: 'No per-question times in these answer files (they were made before timing was added).' })),
      chartCard('Attempt rate', 'Share of students who answered each question. Low on a required question is a warning sign.', barList(attemptRows)),
      secRows.length ? chartCard('Section performance', 'Average share of the marks earned in each section.', barList(secRows)) : null,
      workRows.length ? chartCard('Marking still to do', 'Answers waiting for a mark, by question.', barList(workRows)) : null);

    const cards = el('div', { class: 'ex-stats' },
        card('Submissions', String(st.n), superseded ? `${superseded} repeat${superseded === 1 ? '' : 's'} not counted` : null),
        card('Mean', pct(st.mean)), card('Median', pct(st.median)), card('Highest', pct(st.max)), card('Lowest', pct(st.min)),
        card('Std. deviation', st.sd.toFixed(1)), card('Pass rate', pct(st.passRate * 100), `${st.passed} of ${st.n} ≥ ${S.passMark}%`),
        card('Avg. time', st.avgDuration == null ? '—' : fmtDur(st.avgDuration)),
        card('Active on questions', st.avgActive == null ? '—' : fmtDur(st.avgActive), 'average per student'),
        card('Still to mark', String(st.pending), st.pendingSubs ? `in ${plural(st.pendingSubs, 'submission')}` : 'all marked'));
    return { cards, grid };
  }
  function overview() {
    const st = S.stats, ac = active();
    const card = (label, value, sub) => el('div', { class: 'ex-stat' }, el('span', { class: 'ex-statv', text: value }), el('span', { class: 'ex-statl', text: label }), sub ? el('small', { class: 'ex-muted', text: sub }) : null);
    const superseded = S.subs.length - ac.length;
    const dup = el('label', { class: 'ex-check' }, Object.assign(el('input', { type: 'checkbox' }), { checked: S.dedupe }), el('span', { text: 'Count only the first (original) submission per student — later ones need your review' }));
    dup.querySelector('input').addEventListener('change', (e) => { S.dedupe = e.target.checked; recompute(); renderAll(); });
    const nr = S.subs.filter((x) => x.needsReview);
    const reviewNote = nr.length ? el('div', { class: 'ex-note bad ex-stack' },
      el('strong', { text: `${plural(nr.length, 'submission')} ${nr.length === 1 ? 'needs' : 'need'} your review` }),
      el('span', { text: 'The same student submitted more than once (names are matched ignoring case, spaces and punctuation). Only the first submission is counted; the later ones are flagged as answered inside (or after) the cooldown.' }),
      el('div', {}, el('button', { type: 'button', class: 'ex-btn ghost small', text: 'Review them', onclick: () => { S.tab = 'subs'; S.onlyReview = true; renderAll(); } }))) : null;

    const pass = el('input', { class: 'ex-input narrow', type: 'number', min: 0, max: 100, value: S.passMark, 'aria-label': 'Pass mark in percent' });
    pass.addEventListener('change', () => {
      S.passMark = Math.max(0, Math.min(100, Number(pass.value) || 0));
      try { localStorage.setItem(PASSKEY(S.paper.id), String(S.passMark)); } catch { /* ignore */ }
      refreshStats(); renderAll();
    });
    const head = el('div', { class: 'ex-row wrap spread' }, el('h2', { text: 'Dashboard' }),
      el('div', { class: 'ex-row wrap' }, el('span', { class: 'ex-label', text: 'Pass mark %' }), pass,
        ac.length ? el('button', { type: 'button', class: 'ex-btn primary small', text: '🖨 Print…', title: 'Print or save as PDF: the dashboard and/or every student’s paper', onclick: () => printDialog(null) }) : null,
        ac.length ? el('button', { type: 'button', class: 'ex-btn ghost small', text: 'Download results (CSV)', onclick: exportCsv }) : null,
        el('button', { type: 'button', class: 'ex-btn ghost small', text: 'Save marking backup', title: 'Marks, review decisions and notes as a JSON file', onclick: exportBackup }),
        el('button', { type: 'button', class: 'ex-btn ghost small', text: 'Load backup', onclick: importBackup })));

    if (!ac.length) {
      return el('div', { class: 'ex-stack' }, head, reviewNote, el('p', { class: 'ex-empty', text: 'Add some answer files to see the dashboard.' }),
        el('div', { class: 'ex-card ex-stack' }, el('h3', { text: 'Batches' }), batchesTable(), dup));
    }
    const parts = dashboardBody();
    return el('div', { class: 'ex-stack' }, head, reviewNote, parts.cards, parts.grid, ranklistCard(),
      el('div', { class: 'ex-card ex-stack' }, el('h3', { text: 'Batches' }), batchesTable(), dup));
  }
  function batchesTable() {
    return S.batches.length ? el('div', { class: 'ex-tablewrap' }, el('table', { class: 'ex-table' },
      el('thead', {}, el('tr', {}, ['Batch', 'Added', 'Files', 'Loaded', 'Skipped'].map((h) => el('th', { text: h })))),
      el('tbody', {}, S.batches.map((b) => el('tr', {}, el('td', { text: b.label }), el('td', { text: fmtDate(b.at) }), el('td', { text: b.files }), el('td', { text: b.ok }), el('td', { text: b.errors.length })))))) : el('p', { class: 'ex-muted', text: 'No batches yet.' });
  }
  function exportCsv() {
    downloadText(`${safeName(S.paper.title)}_results.csv`, toCsv(S.paper, S.subs.slice().sort((p, q) => p.payload.submittedAt.localeCompare(q.payload.submittedAt))), 'text/csv');
  }

  /* ---------- Submissions ---------- */
  const cmp = {
    name: (s) => fields().map((f) => (s.payload.identity || {})[f.id] || '').join(' ').toLowerCase(),
    score: (s) => s.grade.pct, time: (s) => s.payload.meta?.durationSec ?? 0, submitted: (s) => s.payload.submittedAt, batch: (s) => s.batch,
  };
  function visibleSubs() {
    const q = S.search.trim().toLowerCase();
    const list = S.subs.filter((s) => (!S.batchFilter || s.batch === S.batchFilter) && (!q || cmp.name(s).includes(q)) && (!S.onlyReview || s.needsReview));
    const { key, dir } = S.sort;
    return list.sort((a, b) => (cmp[key](a) > cmp[key](b) ? 1 : cmp[key](a) < cmp[key](b) ? -1 : 0) * dir);
  }
  function submissions() {
    const search = el('input', { class: 'ex-input', type: 'search', placeholder: 'Search by name…', value: S.search, 'aria-label': 'Search submissions' });
    const body = el('tbody');
    const paint = () => {
      const list = visibleSubs();
      S.reviewList = list.map((s) => s.id);
      body.replaceChildren(...(list.length ? list.map((s) => el('tr', { class: s.counted ? '' : 'muted' },
        fields().map((f) => el('td', { text: (s.payload.identity || {})[f.id] || '—' })),
        el('td', { text: s.batch }), el('td', { text: s.payload.meta?.startedAt ? fmtDate(s.payload.meta.startedAt) : '—' }), el('td', { text: fmtDate(s.payload.submittedAt) }),
        el('td', { text: s.payload.meta?.durationSec != null ? fmtDur(s.payload.meta.durationSec) : '—' }),
        el('td', { class: 'num', text: `${s.grade.total} / ${s.grade.max}  (${pct(s.grade.pct)})` }),
        el('td', {}, s.grade.pending ? el('span', { class: 'ex-badge warn', text: `${s.grade.pending} to mark` }) : el('span', { class: 'ex-badge ok', text: 'Marked' }),
          s.flag ? el('span', { class: `ex-badge ${s.decision ? '' : s.flag.inside === false ? 'warn' : 'bad'}`, text: s.reviewStatus }) : null,
          !s.flag && s.repeats.length ? el('span', { class: 'ex-badge', text: s.reviewStatus + ` · ${plural(s.repeats.length, 'repeat')}` }) : null,
          s.secretBad ? el('span', { class: 'ex-badge warn', text: 'secret id missing / different' }) : null,
          (s.payload.meta?.priorAttempts || []).length ? el('span', { class: 'ex-badge', text: `device had ${plural(s.payload.meta.priorAttempts.length, 'earlier attempt')}` }) : null,
          s.payload.meta?.timeUp ? el('span', { class: 'ex-badge bad', text: 'time up' }) : null,
          isLate(s) ? el('span', { class: 'ex-badge bad', text: 'after closing time' }) : null),
        el('td', {}, el('button', { type: 'button', class: 'ex-btn ghost small', text: 'Review', onclick: () => { S.reviewId = s.id; renderAll(); } }))))
        : [el('tr', {}, el('td', { colspan: fields().length + 7, class: 'ex-empty', text: 'Nothing to show.' }))]));
    };
    search.addEventListener('input', () => { S.search = search.value; paint(); });
    const batchSel = el('select', { class: 'ex-input', 'aria-label': 'Filter by batch' }, el('option', { value: '', text: 'All batches' }), S.batches.map((b) => el('option', { value: b.label, text: b.label })));
    batchSel.value = S.batchFilter;
    batchSel.addEventListener('change', () => { S.batchFilter = batchSel.value; paint(); });
    const revSel = el('select', { class: 'ex-input', 'aria-label': 'Review filter' }, el('option', { value: '', text: 'All submissions' }), el('option', { value: '1', text: 'Needs review only' }));
    revSel.value = S.onlyReview ? '1' : '';
    revSel.addEventListener('change', () => { S.onlyReview = revSel.value === '1'; paint(); });
    const th = (label, key) => el('th', {}, key ? el('button', {
      type: 'button', class: 'ex-sort', text: label + (S.sort.key === key ? (S.sort.dir > 0 ? ' ▲' : ' ▼') : ''),
      onclick: () => { S.sort = { key, dir: S.sort.key === key ? -S.sort.dir : 1 }; renderAll(); },
    }) : label);
    const head = el('thead', {}, el('tr', {}, ...fields().map((f, i) => th(f.label, i === 0 ? 'name' : null)),
      th('Batch', 'batch'), th('Started'), th('Submitted', 'submitted'), th('Time', 'time'), th('Score', 'score'), th('Status'), th('')));
    paint();
    return el('div', { class: 'ex-stack' }, el('div', { class: 'ex-row wrap' }, search, batchSel, revSel),
      el('div', { class: 'ex-tablewrap' }, el('table', { class: 'ex-table' }, head, body)));
  }

  /* ---------- Review & mark ---------- */
  function reviewBanner(sub) {
    const jump = (id) => { S.reviewId = id; renderAll(); window.scrollTo({ top: 0 }); };
    const btn = (text, on, cls = 'ghost') => el('button', { type: 'button', class: `ex-btn ${cls} small`, text, onclick: on });
    const boxes = [];
    const orig = sub.flag && S.subs.find((x) => x.id === sub.flag.originalId);
    if (sub.flag) {
      boxes.push(el('div', { class: `ex-note ex-stack${sub.decision ? '' : ' bad'}` },
        el('strong', { text: sub.reviewStatus.charAt(0).toUpperCase() + sub.reviewStatus.slice(1) }),
        el('span', { text: `The same student already submitted${orig ? ' on ' + fmtDate(orig.payload.submittedAt) : ''}. ` +
          (sub.flag.inside === true ? 'This attempt was started inside the cooldown, so it should not have been possible on that device — look for another device, cleared browser data, a private window or a shared account.'
            : sub.flag.inside === false ? 'This attempt was started after the cooldown had ended.' : 'Repeat-blocking was not switched on for this paper.') }),
        el('div', { class: 'ex-row wrap' },
          orig ? btn('Open the original', () => jump(orig.id)) : null,
          sub.decision ? btn('Undo my decision', () => decide(sub, null))
            : [btn('Keep excluded (dismiss)', () => decide(sub, 'dismissed')), btn('Count this one instead of the original', () => decide(sub, 'counted'), 'primary')])));
    }
    if (sub.repeats.length) {
      boxes.push(el('div', { class: 'ex-note ex-stack' }, el('strong', { text: `${plural(sub.repeats.length, 'later submission')} by the same student` }),
        sub.repeats.map((r) => el('div', { class: 'ex-row wrap' }, el('span', { text: `${fmtDate(r.payload.submittedAt)} — ${r.reviewStatus}` }), btn('Open', () => jump(r.id))))));
    }
    const prior = sub.payload.meta?.priorAttempts || [];
    if (prior.length) {
      boxes.push(el('div', { class: 'ex-note' }, `This device had ${plural(prior.length, 'earlier attempt')} of this exam recorded before this one (first started ${fmtDate(prior[0].startedAt)}` +
        `${prior[0].submittedAt ? ', submitted ' + fmtDate(prior[0].submittedAt) : ', never submitted'}).`));
    }
    if (sub.secretBad) boxes.push(el('div', { class: 'ex-note bad' }, 'The secret exam id inside this answer file is missing or different from the paper’s — the file may not come from the official page.'));
    return boxes.length ? el('div', { class: 'ex-stack' }, ...boxes) : null;
  }

  const timeBadge = (sub, q) => {
    const m = sub.payload.meta || {}, t = (m.qTimes || {})[q.id], st = (m.qStarts || {})[q.id];
    const out = [];
    if (st) out.push(el('span', { class: 'ex-badge info', title: `Pressed “Start question” at ${fmtDate(st.startedAt)}`, text: `▶ started ${fmtDur(st.sec)} in` }));
    if (t) out.push(el('span', { class: 'ex-badge info', title: t.answeredSec != null ? `First answered ${fmtDur(t.answeredSec)} into the paper` : 'Not answered', text: `⏱ ${fmtDur(t.sec)}` + (t.visits > 1 ? ` · ${t.visits} visits` : '') + (t.edits > 1 ? ` · ${t.edits} edits` : '') }));
    if (q.type === 'code' && !isBlank((sub.payload.answers || {})[q.id])) out.push(el('span', { class: 'ex-badge accent', text: `Language: ${langOf(sub, q).label}` }));
    return out;
  };
  /** The student's answer as a node. showCorrect marks the correct MCQ options (checker view / printed on request). */
  function answerNode(q, sol, sub, showCorrect = true) {
    const ans = (sub.payload.answers || {})[q.id];
    if (isBlank(ans)) return el('p', { class: 'ex-muted', text: '— no answer —' });
    if (isMcq(q)) {
      const sel = new Set([].concat(ans)), cor = new Set(showCorrect ? (sol.correct || []) : []);
      return el('ul', { class: 'ex-reviewopts' }, q.options.map((o) => el('li', { class: `${sel.has(o.id) ? 'picked' : ''} ${cor.has(o.id) ? 'correct' : ''}`.trim() },
        el('span', { class: 'ex-mark', text: sel.has(o.id) ? '●' : '○', 'aria-label': sel.has(o.id) ? 'chosen' : 'not chosen' }),
        el('div', { class: 'exam-md', html: md(o.text) }),
        cor.has(o.id) ? el('span', { class: 'ex-badge ok', text: 'correct' }) : null)));
    }
    if (q.type === 'code') return el('div', { class: 'exam-md', html: renderCode(ans, langOf(sub, q).key || '') });
    return el('div', { class: 'exam-md ex-answer', html: renderMarkdown(ans, { images: false }) });
  }
  function setNote(sub, key, v) {
    const o = (S.notes[sub.id] ||= {});
    if (v.trim()) o[key] = v; else delete o[key];
    if (!Object.keys(o).length) delete S.notes[sub.id];
    sub.notes = S.notes[sub.id] || {};
    saveNotes(); S.updatedAt = Date.now();
  }
  /** Markdown editor for a note (same editor as everywhere else: toolbar, slash menu, colours, tables, code, preview).
      The per-question notes use the compact one; the overall feedback gets the full one. No image upload here. */
  const noteBox = (sub, key, label, full = false) => createMarkdownEditor({
    value: (sub.notes || {})[key] || '', compact: !full, rows: full ? 4 : 2, allowImages: false,
    label, placeholder: `${label}  (markdown works)`, onChange: (v) => setNote(sub, key, v),
  }).el;
  function review() {
    const sub = S.subs.find((s) => s.id === S.reviewId);
    if (!sub) { S.reviewId = null; return submissions(); }
    ranked();
    const idx = S.reviewList.indexOf(sub.id);
    const nav = (d) => { const id = S.reviewList[idx + d]; if (id) { S.reviewId = id; renderAll(); window.scrollTo({ top: 0 }); } };
    const score = el('strong', { class: 'ex-score' });
    const pend = el('span', { class: 'ex-badge' });
    const paintHead = () => {
      score.textContent = `${sub.grade.total} / ${sub.grade.max}  (${pct(sub.grade.pct)})`;
      pend.textContent = sub.grade.pending ? `${sub.grade.pending} still to mark` : 'fully marked';
      pend.className = `ex-badge ${sub.grade.pending ? 'warn' : 'ok'}`;
    };
    paintHead();
    const who = fields().map((f) => `${f.label}: ${(sub.payload.identity || {})[f.id] || '—'}`).join('  ·  ');
    const head = el('div', { class: 'ex-card ex-stack' },
      el('div', { class: 'ex-row wrap spread' },
        el('button', { type: 'button', class: 'ex-btn ghost small', text: '← All submissions', onclick: () => { S.reviewId = null; S.tab = 'subs'; renderAll(); } }),
        el('div', { class: 'ex-row' },
          el('button', { type: 'button', class: 'ex-btn ghost small', text: '← Previous', disabled: idx <= 0, onclick: () => nav(-1) }),
          el('button', { type: 'button', class: 'ex-btn ghost small', text: 'Next →', disabled: idx < 0 || idx >= S.reviewList.length - 1, onclick: () => nav(1) }))),
      el('h2', { text: who }),
      el('div', { class: 'ex-row wrap' }, sub.counted ? el('span', { class: 'ex-badge accent', text: `Rank ${sub.rank} of ${ranked().length}` }) : null,
        el('button', { type: 'button', class: 'ex-btn ghost small', text: '🖨 Print this paper', onclick: () => printDialog(sub) })),
      el('div', { class: 'ex-row wrap' }, score, pend,
        el('span', { class: 'ex-muted', text: `${sub.batch}` + (sub.payload.meta?.startedAt ? ` · started ${fmtDate(sub.payload.meta.startedAt)}` : '') + ` · submitted ${fmtDate(sub.payload.submittedAt)}` + (sub.payload.meta?.durationSec != null ? ` · took ${fmtDur(sub.payload.meta.durationSec)}` : '') }),
        isLate(sub) ? el('span', { class: 'ex-badge bad', text: 'submitted after the closing time' }) : null,
        activeSeconds(sub) != null ? el('span', { class: 'ex-muted', text: `time on questions ${fmtDur(activeSeconds(sub))} of ${fmtDur(sub.payload.meta?.durationSec)}` }) : null,
        sub.payload.meta?.timeUp ? el('span', { class: 'ex-badge bad', text: 'auto-submitted when time ran out' }) : null,
        !sub.counted ? el('span', { class: 'ex-badge', text: 'not counted in statistics' }) : null),
      el('div', { class: 'ex-stack ex-overall' }, el('span', { class: 'ex-label', text: 'Overall feedback — printed at the top of this student’s paper' }), noteBox(sub, '_all', 'Overall feedback for the student…', true)));

    const setMark = (qid, v) => {
      const o = (S.ov[sub.id] ||= {});
      if (v === '' || v == null) delete o[qid]; else o[qid] = Number(v);
      if (!Object.keys(o).length) delete S.ov[sub.id];
      saveOv();
      sub.grade = gradeSubmission(S.paper, S.solutions, sub.payload, S.ov[sub.id]);
      refreshStats(); S.updatedAt = Date.now();      // the dashboard reflects this mark straight away
      paintHead();
    };

    const cardsEl = S.paper.questions.map((q, qi) => {
      const sol = S.solutions[q.id] || {};
      const ans = (sub.payload.answers || {})[q.id];
      const badge = el('span', { class: 'ex-badge' });
      const input = el('input', { class: 'ex-input narrow', type: 'number', min: 0, max: q.marks, step: 0.5, 'aria-label': `Marks for ${q.id}` });
      const paint = () => {
        const r = sub.grade.rows[qi];
        const [txt, cls] = STATUS[r.status];
        badge.textContent = txt + (r.override != null && r.status !== 'manual' ? ' · edited' : ''); badge.className = `ex-badge ${cls}`;
        input.placeholder = r.auto != null ? `auto ${r.auto}` : 'mark';
        input.value = r.override ?? '';
      };
      if (q.marked) {
        input.addEventListener('input', () => { setMark(q.id, input.value); const r = sub.grade.rows[qi]; const [t, c] = STATUS[r.status]; badge.textContent = t + (r.override != null && r.status !== 'manual' ? ' · edited' : ''); badge.className = `ex-badge ${c}`; });
        paint();
      }
      const view = answerNode(q, sol, sub, true);
      const marker = q.marked ? el('div', { class: 'ex-row wrap markrow' },
        el('span', { class: 'ex-label', text: `Marks (out of ${q.marks})` }), input,
        el('button', { type: 'button', class: 'ex-btn ghost small', text: 'Full', onclick: () => { input.value = q.marks; setMark(q.id, q.marks); paint(); } }),
        el('button', { type: 'button', class: 'ex-btn ghost small', text: 'Zero', onclick: () => { input.value = 0; setMark(q.id, 0); paint(); } }),
        el('button', { type: 'button', class: 'ex-btn ghost small', text: 'Reset', onclick: () => { input.value = ''; setMark(q.id, ''); paint(); } })) : null;
      const extra = [
        q.type === 'short' && (sol.accepted || []).length ? el('p', { class: 'ex-muted', text: 'Accepted: ' + sol.accepted.join(' · ') }) : null,
        sol.modelAnswer ? el('details', { class: 'ex-model' }, el('summary', { text: isMcq(q) ? 'Explanation' : 'Model answer' }), el('div', { class: 'exam-md', html: md(sol.modelAnswer) })) : null,
      ];
      return el('article', { class: 'ex-q' },
        el('div', { class: 'ex-qmeta' }, el('strong', { text: `Q${qi + 1}` }), el('span', { class: 'ex-tag', text: '#' + q.id }), S.paper.sectionOf[q.id] ? el('span', { class: 'ex-badge', text: '§ ' + S.paper.sectionOf[q.id] }) : null, q.marked ? badge : el('span', { class: 'ex-badge', text: 'Unmarked' }),
          timeBadge(sub, q),
          el('span', { class: 'ex-muted', text: stripMarkdown(q.prompt).slice(0, 70) })),
        el('details', { class: 'ex-model' }, el('summary', { text: 'Question' }), el('div', { class: 'exam-md', html: md(q.prompt) + (q.samples && q.samples.length ? renderSamples(q.samples, { images: true, assets: S.paper.assets }) : '') })),
        view, ...extra, marker,
        el('div', { class: 'ex-stack ex-notewrap' }, el('span', { class: 'ex-label', text: 'Note for the student (printed with the paper)' }), noteBox(sub, q.id, 'Explain the mark, point out the mistake, suggest what to revise…')));
    });
    const wrap = el('div', { class: 'ex-stack' }, head, reviewBanner(sub), ...cardsEl);
    enhanceCodeBlocks(wrap);
    return wrap;
  }

  /* ---------- printing ---------- */
  const STATE_WORD = { ok: 'Correct', bad: 'Wrong', part: 'Partial', warn: 'Not marked', none: 'Not answered' };
  function printNow(node) {
    document.getElementById('ex-print-root')?.remove();
    const holder = el('div', { id: 'ex-print-root' }, node);
    document.body.append(holder);
    const html = document.documentElement, prev = html.dataset.theme;
    html.classList.add('ex-printing');
    html.dataset.theme = 'light';                        // paper is always light, whatever the screen theme
    const done = () => {
      window.removeEventListener('afterprint', done);
      html.classList.remove('ex-printing'); html.dataset.theme = prev;
      holder.remove();
    };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 80);                // let images and fonts settle first
  }
  function paperPrintNode(sub, o) {
    const P = S.paper, g = sub.grade, ans = (q) => (sub.payload.answers || {})[q.id];
    const stateOf = (q, qi) => rowState(q, g.rows[qi], ans(q));
    const chips = el('div', { class: 'pp-strip' }, P.questions.map((q, qi) => {
      const st = stateOf(q, qi), row = g.rows[qi];
      return el('span', { class: `pp-chip ${st.cls}`, title: st.label }, el('b', { text: `Q${qi + 1}` }), el('small', { text: q.marked ? (row.pending || st.cls === 'none' ? (st.cls === 'none' ? '–' : '?') : `${row.score}/${row.max}`) : '·' }));
    }));
    const identity = fields().map((f) => (sub.payload.identity || {})[f.id]).filter(Boolean);
    const m = sub.payload.meta || {};
    const passed = g.pct >= S.passMark;
    const header = el('header', { class: 'pp-head' },
      el('div', {}, el('p', { class: 'pp-kicker', text: P.title }), el('h1', { text: identity.join(' · ') || 'Answer paper' }),
        el('p', { class: 'pp-meta', text: fields().map((f) => `${f.label}: ${(sub.payload.identity || {})[f.id] || '—'}`).join('   ') }),
        el('p', { class: 'pp-meta', text: `Submitted ${fmtDate(sub.payload.submittedAt)}` + (m.startedAt ? ` · started ${fmtDate(m.startedAt)}` : '') + (m.durationSec != null ? ` · took ${fmtDur(m.durationSec)}` : '') })),
      el('div', { class: 'pp-score' }, el('b', { text: `${g.total} / ${g.max}` }), el('span', { text: pct(g.pct) }),
        el('span', { class: `pp-pass ${passed ? 'ok' : 'bad'}`, text: passed ? `Pass (≥ ${S.passMark}%)` : `Below pass mark (${S.passMark}%)` }),
        sub.counted ? el('span', { text: `Rank ${sub.rank} of ${ranked().length}` }) : null));
    const banners = [
      !sub.counted ? el('p', { class: 'pp-banner', text: 'This is a repeat submission and is not counted in the results.' }) : null,
      g.pending ? el('p', { class: 'pp-banner', text: `${plural(g.pending, 'answer')} not marked yet — the score may still change.` }) : null,
    ];
    const overall = o.notes && (sub.notes || {})._all ? el('div', { class: 'pp-note' }, el('strong', { text: 'Overall feedback' }), el('div', { class: 'exam-md', html: renderMarkdown(sub.notes._all, { images: false }) })) : null;
    let n = 0;
    const blocksOut = P.items.map((it) => {
      if (it.kind === 'section') return el('section', { class: 'pp-section' }, el('h2', { text: it.title }), it.description ? el('div', { class: 'exam-md', html: md(it.description) }) : null);
      if (it.kind === 'text') return el('div', { class: 'exam-md pp-text', html: md(it.text) });
      const qi = n++, q = it, st = stateOf(q, qi), row = g.rows[qi], sol = S.solutions[q.id] || {}, t = (m.qTimes || {})[q.id];
      const note = o.notes ? (sub.notes || {})[q.id] : '';
      return el('article', { class: `pp-q ${st.cls}` },
        el('header', { class: 'pp-qhead' }, el('span', { class: `pp-qno ${st.cls}`, text: `Q${qi + 1}` }),
          el('span', { class: `pp-state ${st.cls}`, text: st.label + (q.marked && st.cls !== 'none' && !row.pending ? ` · ${row.score}/${row.max}` : q.marked ? ` · ${row.max} mark${row.max === 1 ? '' : 's'}` : '') }),
          q.type === 'code' && !isBlank(ans(q)) ? el('span', { class: 'pp-meta', text: `Language: ${langOf(sub, q).label}` }) : null,
          t ? el('span', { class: 'pp-meta', text: `⏱ ${fmtDur(t.sec)}` }) : null),
        el('div', { class: 'exam-md pp-prompt', html: md(q.prompt) + (q.samples && q.samples.length ? renderSamples(q.samples, { images: true, assets: S.paper.assets }) : '') }),
        el('div', { class: 'pp-label', text: 'Answer' }), answerNode(q, sol, sub, o.correct),
        o.correct && q.type === 'short' && (sol.accepted || []).length ? el('p', { class: 'pp-meta', text: 'Accepted answers: ' + sol.accepted.join(' · ') }) : null,
        o.model && sol.modelAnswer ? el('div', { class: 'pp-model' }, el('div', { class: 'pp-label', text: isMcq(q) ? 'Explanation' : 'Model answer' }), el('div', { class: 'exam-md', html: md(sol.modelAnswer) })) : null,
        note ? el('div', { class: 'pp-note' }, el('strong', { text: 'Note from the checker' }), el('div', { class: 'exam-md', html: renderMarkdown(note, { images: false }) })) : null);
    });
    return el('article', { class: 'pp pp-paper' }, header, el('div', { class: 'pp-legendrow' }, chips, legendNode()), banners, overall, ...blocksOut);
  }
  function dashboardPrintNode() {
    const head = el('header', { class: 'pp-head' }, el('div', {}, el('p', { class: 'pp-kicker', text: 'Results summary' }), el('h1', { text: S.paper.title }),
      el('p', { class: 'pp-meta', text: `${plural(S.stats.n, 'submission')} counted · pass mark ${S.passMark}% · printed ${new Date().toLocaleString()}` })));
    if (!active().length) return el('section', { class: 'pp pp-dash' }, head, el('p', { text: 'No submissions yet.' }));
    const parts = dashboardBody();
    return el('section', { class: 'pp pp-dash' }, head, parts.cards, parts.grid, el('h2', { class: 'pp-h2', text: 'Ranklist — who got what' }), ranklistNode(true));
  }
  async function printDialog(sub) {
    const scope = { v: 'dash+papers' };
    const o = { notes: true, correct: false, model: false, uncounted: false };
    const opt = (label, key, hint) => {
      const i = el('input', { type: 'checkbox' });
      i.checked = !!o[key];
      i.addEventListener('change', () => { o[key] = i.checked; });
      return el('label', { class: 'ex-check' }, i, el('span', { text: label }), hint ? el('small', { class: 'ex-muted', text: hint }) : null);
    };
    const radio = (v, label) => {
      const i = el('input', { type: 'radio', name: 'pscope', value: v });
      i.checked = scope.v === v;
      i.addEventListener('change', () => { scope.v = v; });
      return el('label', { class: 'ex-check' }, i, el('span', { text: label }));
    };
    const n = ranked().length;
    const body = el('div', { class: 'ex-stack' },
      sub ? el('p', { text: `Print ${who(sub)}’s paper: every question expanded, with their answer, the mark, a coloured summary strip at the top and your notes.` })
        : el('div', { class: 'ex-stack' }, el('span', { class: 'ex-label', text: 'What to print' }),
          radio('dash+papers', `The dashboard, then every student's paper (${n} papers, each on a new page)`), radio('dash', 'The dashboard only (stats, charts, ranklist)'), radio('papers', `Every student's paper only (${n})`)),
      el('div', { class: 'ex-stack' }, el('span', { class: 'ex-label', text: 'On each student’s paper' }),
        opt('Your notes against the answers', 'notes'), opt('Show the correct answers', 'correct', 'MCQ correct options and accepted short answers'),
        opt('Show model answers / explanations', 'model'), sub ? null : opt('Also include repeat submissions that are not counted', 'uncounted')),
      el('p', { class: 'ex-muted', text: 'It prints exactly as things are now — current marks, notes and scores. Choose “Save as PDF” in the print dialog to send papers to students. Printing always uses a light page, whatever theme you are using.' }));
    const go = await dialog({ title: sub ? 'Print this paper' : 'Print', body, wide: true, actions: [{ label: 'Cancel', value: false }, { label: 'Print / save as PDF', value: true, primary: true }] });
    if (!go) return;
    recompute();
    if (sub) return printNow(paperPrintNode(sub, o));
    const all = el('div', { class: 'pp-all' });
    if (scope.v !== 'papers') all.append(dashboardPrintNode());
    if (scope.v !== 'dash') {
      const list = ranked().slice();
      if (o.uncounted) list.push(...S.subs.filter((x) => !x.counted).sort((a, b) => who(a).localeCompare(who(b))));
      if (!list.length && scope.v === 'papers') return toast('There are no papers to print yet.', 'err');
      list.forEach((x) => all.append(paperPrintNode(x, o)));
    }
    printNow(all);
  }

  /* ---------- Questions ---------- */
  function questionInsight(p, q) {
    const bits = [];
    if (q && q.type === 'code') {
      const tally = {};
      for (const x of active()) if (!isBlank((x.payload.answers || {})[q.id])) { const l = langOf(x, q).label; tally[l] = (tally[l] || 0) + 1; }
      const parts = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ${n}`);
      if (parts.length) bits.push('Languages used: ' + parts.join(' · '));
    }
    if (p.avgRatio != null) bits.push(`Difficulty: students earned ${pct(p.avgRatio * 100)} of the marks on average`);
    if (p.discrimination != null) {
      bits.push(`Discrimination D ${p.discrimination.toFixed(2)} (${p.discrimination < 0 ? 'negative — weaker students did better; check the answer key' : p.discrimination < 0.2 ? 'weak — barely separates strong from weak' : p.discrimination < 0.4 ? 'fair' : 'good'})`);
    }
    if (p.avgSec != null) {
      bits.push(`Time: ${fmtDur(p.avgSec)} on average, ${fmtDur(p.medianSec)} median (${plural(p.timeN, 'student')})` +
        (p.avgSecCorrect != null && p.avgSecWrong != null ? `; correct answers took ${fmtDur(p.avgSecCorrect)}, wrong ones ${fmtDur(p.avgSecWrong)}` : ''));
    }
    return bits.length ? el('ul', { class: 'ex-insights' }, bits.map((b) => el('li', { text: b }))) : null;
  }

  function questionsTab() {
    if (!active().length) return el('p', { class: 'ex-empty', text: 'Add some answer files to see per-question analysis.' });
    const bar = (frac, cls = '') => el('div', { class: `ex-bar ${cls}` }, el('i', { style: `width:${Math.round((frac || 0) * 100)}%` }));
    return el('div', { class: 'ex-stack' }, S.stats.perQuestion.map((p, i) => {
      const q = S.paper.questions[i], sol = S.solutions[q.id] || {};
      return el('article', { class: 'ex-q' },
        el('div', { class: 'ex-qmeta' }, el('strong', { text: `Q${i + 1}` }), el('span', { class: 'ex-tag', text: '#' + q.id }), S.paper.sectionOf[q.id] ? el('span', { class: 'ex-badge', text: '§ ' + S.paper.sectionOf[q.id] }) : null,
          el('span', { class: 'ex-badge', text: q.type }), el('span', { class: 'ex-muted', text: stripMarkdown(q.prompt).slice(0, 90) })),
        el('div', { class: 'ex-metrics' },
          el('div', {}, el('span', { class: 'ex-label', text: `Attempted ${pct(p.attemptRate * 100)}  (${p.attempted}/${p.attempted + p.skipped})` }), bar(p.attemptRate)),
          p.marked ? el('div', {}, el('span', { class: 'ex-label', text: p.accuracy != null ? `Correct ${pct(p.accuracy * 100)} of auto-marked answers` : 'Not auto-marked' }), bar(p.accuracy || 0, 'ok')) : null,
          p.marked ? el('div', {}, el('span', { class: 'ex-label', text: p.avgRatio != null ? `Average score ${pct(p.avgRatio * 100)}` : 'No marks given yet' }), bar(p.avgRatio || 0, 'accent')) : null),
        questionInsight(p, q),
        p.pending ? el('p', { class: 'ex-note', text: `${plural(p.pending, 'answer')} still to mark.` }) : null,
        isMcq(q) ? el('div', { class: 'ex-optstats' }, q.options.map((o) => {
          const n = p.options[o.id] || 0, correct = (sol.correct || []).includes(o.id);
          return el('div', { class: 'ex-optstat' }, el('span', { class: `ex-optname${correct ? ' correct' : ''}`, text: (correct ? '✓ ' : '') + (stripMarkdown(o.text).slice(0, 60) || o.id) }),
            bar(n / S.stats.n, correct ? 'ok' : ''), el('span', { class: 'ex-muted', text: `${n}` }));
        }), p.options[''] ? el('p', { class: 'ex-muted', text: `${p.options['']} left blank` }) : null) : null);
    }));
  }

  /* ---------- assemble ---------- */
  function renderAll() {
    if (!S.paper) {
      root.replaceChildren(intro(), openCard());
      return;
    }
    panel.replaceChildren(S.reviewId ? review() : S.tab === 'subs' ? submissions() : S.tab === 'questions' ? questionsTab() : overview());
    root.replaceChildren(intro(), openCard(), addCard(), S.reviewId ? null : tabsBar(), panel);
  }
  const intro = () => el('div', { class: 'ex-intro' }, el('h1', { text: 'Check papers' }),
    el('p', { class: 'ex-muted', text: 'Open your paper with the setter key, load the answer files students sent back, mark, and get statistics. Everything stays in this browser.' }));
  enhanceCodeBlocks(root);
  renderAll();
}
