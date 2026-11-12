/* exam_js/format.js — data model shared by the setter, answerer and checker.

   PAPER (sent to answerers, encrypted):
   {
     id: 'P-7K2M9QXA', title,
     description: markdown,                   // the paper header: headings, colours, links, images…
     settings: {
       shuffleQuestions: bool,                // questions that are not inside a section
       shuffleSections: bool,                 // randomise the order of sections
       shuffleOptions: bool,                  // randomise MCQ option order
       showMarks: bool,
       timeLimitMin: number|null,             // x minutes after the student presses Start
       endLocal: '2026-11-12T17:30'|'',       // optional hard closing time, wall-clock in endTz …
       endTz: 'Asia/Kolkata',                 // … in this IANA timezone
       endAt: ISO|null,                       // … and the same instant in UTC (what the answerer uses)
       blockRepeats: bool,                    // one attempt per device (see lock.js) …
       secretId: 'EXAM - 001',                // … keyed by this secret id (shared by regenerated/alternate papers) …
       cooldownMin: number|null,              // … for this many minutes after the attempt (null = never expires)
       identityFields: [{ id, label, required, identifies }]   // identifies: used to recognise the same student
     },
     assets: { i1: 'data:image/jpeg;base64,…' },   // uploaded images, used as ![alt](img:i1)
     items: [                                 // ONE ordered list; what comes after a section belongs to it
       { kind: 'section', id: 'S1', title, description: markdown, shuffle: bool },
       { kind: 'text',    id: 'T1', text: markdown },                     // paragraph between questions
       { kind: 'question', id: 'Q1', type: 'mcq-single'|'mcq-multi'|'short'|'long'|'code',
         prompt, mandatory, marked, marks, options: [{id,text}], codeLang, codeLangLabel, starter }
     ]
   }
   After loading, hydratePaper() adds paper.questions (the question items) and paper.sectionOf { qid: title }.

   SHUFFLING: a paragraph belongs to the question that follows it and moves with it. Trailing paragraphs
   stay at the end of their section. Sections shuffle only if settings.shuffleSections; questions inside a
   section shuffle only if that section's `shuffle` is on (items before the first section use shuffleQuestions).

   SOLUTIONS (setter-only, encrypted separately):
   { Q1: { correct: ['b'], modelAnswer: markdown, accepted: ['42'], caseSensitive: false },
     _assets: { i9: 'data:…' } }              // images used only in model answers
     · MCQ with `correct` → auto-graded · short with `accepted` → auto-graded · long/code → setter marks

   ANSWER PAYLOAD (inside the .ans file):
   { paperId, submittedAt: ISO, identity: { fieldId: value }, answers: { Q1: 'b' | ['a','c'] | 'text' },
     meta: { seed, layout: [item ids as shown], order: [question ids as shown], optionOrder: {Q3: [...]},
             startedAt: ISO, deadlineAt: ISO|null, durationSec, timeUp: bool, skipped: [ids],
             secretId: normalised secret id|null, priorAttempts: [{startedAt, submittedAt}] } }   // device history from the lock */

export const QUESTION_TYPES = [
  { id: 'mcq-single', label: 'MCQ — single correct' },
  { id: 'mcq-multi',  label: 'MCQ — multiple correct' },
  { id: 'short',      label: 'Short answer' },
  { id: 'long',       label: 'Long answer' },
  { id: 'code',       label: 'Code answer' },
];

/* `key` is the highlighter language in blog/highlight.js (c and c++ share the `cpp` rules). */
export const CODE_LANGS = [
  { id: 'python', label: 'Python', key: 'python' },
  { id: 'rust',   label: 'Rust',   key: 'rust' },
  { id: 'java',   label: 'Java',   key: 'java' },
  { id: 'c',      label: 'C',      key: 'cpp' },
  { id: 'cpp',    label: 'C++',    key: 'cpp' },
  { id: 'other',  label: 'Other',  key: null },
];

/* Callout colours are theme tokens, so they follow light/dark and any retheme. */
export const CALLOUT_COLORS = [
  { id: 'accent', label: 'Accent', token: '--green' },
  { id: 'ok',     label: 'Green',  token: '--ok' },
  { id: 'warn',   label: 'Amber',  token: '--warn' },
  { id: 'info',   label: 'Blue',   token: '--info' },
  { id: 'danger', label: 'Red',    token: '--danger' },
  { id: 'cyan',   label: 'Cyan',   token: '--cyan' },
  { id: 'muted',  label: 'Grey',   token: '--text-muted' },
];

/* ---------- time zones for the closing time ---------- */
export const TIMEZONES = [
  { id: 'Asia/Kolkata',        label: 'India (IST)' },
  { id: 'UTC',                 label: 'UTC' },
  { id: 'Etc/GMT',             label: 'Greenwich Mean Time (GMT, no daylight saving)' },
  { id: 'Europe/London',       label: 'London (GMT / BST)' },
  { id: 'Europe/Paris',        label: 'Central Europe (CET / CEST)' },
  { id: 'Asia/Dubai',          label: 'Dubai (GST)' },
  { id: 'Asia/Singapore',      label: 'Singapore (SGT)' },
  { id: 'Asia/Tokyo',          label: 'Japan (JST)' },
  { id: 'Australia/Sydney',    label: 'Sydney (AEST / AEDT)' },
  { id: 'America/New_York',    label: 'New York (ET)' },
  { id: 'America/Chicago',     label: 'Chicago (CT)' },
  { id: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
];
/** "Harsh  Rathod", "harsh.rathod", "HARSHRATHOD" and "Hârsh Rathod" all become "harshrathod". */
export const normKey = (s) => String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
/** What a repeat-block lock is keyed on: the secret id if the setter set one, else this exact paper. */
export const lockSubject = (settings, paperId) => normKey(settings.secretId) || 'paper:' + paperId;

const tzLabel = (tz) => (TIMEZONES.find((t) => t.id === tz) || {}).label || tz;

function zoneOffsetMs(utcMs, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const o = {};
  for (const p of parts) o[p.type] = p.value;
  return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second) - utcMs;
}
/** '2026-11-12T17:30' wall-clock in `tz` → UTC milliseconds (NaN if the time or zone is invalid). */
export function zonedToUtcMs(local, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local || '');
  if (!m) return NaN;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  try {
    let utc = guess - zoneOffsetMs(guess, tz);
    utc = guess - zoneOffsetMs(utc, tz);               // second pass handles daylight-saving edges
    return utc;
  } catch { return NaN; }
}
/** Readable time in a zone, e.g. "12 Nov 2026, 17:30 GMT+5:30 — India (IST)". Omit tz for the viewer's own zone. */
export function fmtInZone(ms, tz) {
  try {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
    return f.format(new Date(ms)) + (tz ? ` — ${tzLabel(tz)}` : '');
  } catch { return new Date(ms).toISOString(); }
}
/** The moment the student must stop: the sooner of "x minutes after Start" and the fixed closing time. */
export function effectiveDeadline(settings, startedAtMs) {
  const c = [];
  if (Number(settings.timeLimitMin) > 0 && startedAtMs != null) c.push(startedAtMs + Number(settings.timeLimitMin) * 60000);
  if (settings.endAt) { const t = Date.parse(settings.endAt); if (Number.isFinite(t)) c.push(t); }
  return c.length ? Math.min(...c) : null;
}

/* ---------- ids ---------- */
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newPaperId() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return 'P-' + Array.from(b, (x) => ID_ALPHABET[x & 31]).join('');
}
/* Next free <prefix><n> among ALL items, so deleting/reordering never produces duplicate ids. */
export function nextItemId(items, prefix) {
  const used = new Set(items.map((i) => i.id));
  let n = items.filter((i) => String(i.id || '').startsWith(prefix)).length + 1;
  while (used.has(prefix + n)) n++;
  return prefix + n;
}
export const nextQuestionId = (items) => nextItemId(items, 'Q');

/* ---------- constructors ---------- */
export function blankPaper() {
  return {
    id: newPaperId(), title: '', description: '', assets: {}, items: [],
    settings: {
      shuffleQuestions: false, shuffleSections: false, shuffleOptions: false, showMarks: true, timeLimitMin: null,
      endLocal: '', endTz: 'Asia/Kolkata', endAt: null,
      blockRepeats: false, secretId: '', cooldownMin: null,
      identityFields: [{ id: 'name', label: 'Full name', required: true, identifies: true }],
    },
  };
}
export function blankQuestion(type, items = []) {
  const q = { kind: 'question', id: nextItemId(items, 'Q'), type, prompt: '', mandatory: true, marked: true, marks: 1 };
  if (type === 'mcq-single' || type === 'mcq-multi') {
    q.options = [{ id: 'a', text: '' }, { id: 'b', text: '' }, { id: 'c', text: '' }, { id: 'd', text: '' }];
  }
  if (type === 'code') { q.codeLang = 'python'; q.codeLangLabel = ''; q.starter = ''; }
  return q;
}
export const blankSection = (items = []) => ({ kind: 'section', id: nextItemId(items, 'S'), title: '', description: '', shuffle: false });
export const blankText = (items = []) => ({ kind: 'text', id: nextItemId(items, 'T'), text: '' });

export const isMcq = (q) => q.type === 'mcq-single' || q.type === 'mcq-multi';
export const isQuestion = (i) => (i.kind || 'question') === 'question';

/** Bring any paper (old files had a flat `questions` list) up to the items model. Keeps nothing derived. */
export function migrateItems(p) {
  if (!Array.isArray(p.items)) p.items = (p.questions || []).map((q) => ({ ...q }));
  delete p.questions;
  p.items.forEach((i) => { if (!i.kind) i.kind = 'question'; });
  p.assets ||= {};
  p.settings = { ...blankPaper().settings, ...(p.settings || {}) };
  return p;
}
/** migrateItems + the derived fields the answerer and checker read (paper.questions, paper.sectionOf). */
export function hydratePaper(p) {
  migrateItems(p);
  p.questions = p.items.filter(isQuestion);
  p.sectionOf = {};
  let cur = '';
  for (const i of p.items) {
    if (i.kind === 'section') cur = i.title || '';
    else if (isQuestion(i)) p.sectionOf[i.id] = cur;
  }
  return p;
}

/* ---------- validation ---------- */
/** { errors: [...], warnings: [...] } — errors block "Generate paper", warnings only inform. */
export function validatePaper(paper, solutions = {}) {
  const errors = [], warnings = [];
  const items = paper.items || paper.questions || [];
  const questions = items.filter(isQuestion);
  if (!paper.title.trim()) errors.push('Give the paper a title.');
  if (!questions.length) errors.push('Add at least one question.');

  const seen = new Set();
  for (const it of items) {
    if (!it.id || !it.id.trim()) errors.push('An item has no id.');
    else if (seen.has(it.id)) errors.push(`Id "${it.id}" is used more than once.`);
    seen.add(it.id);
    if (it.kind === 'section' && !(it.title || '').trim()) warnings.push(`Section ${it.id} has no title.`);
    if (it.kind === 'text' && !(it.text || '').trim()) warnings.push(`Paragraph ${it.id} is empty.`);
  }
  for (const q of questions) {
    const tag = `Question ${q.id || '(no id)'}`;
    if (!q.prompt.trim()) errors.push(`${tag}: the prompt is empty.`);
    if (q.marked && !(Number(q.marks) > 0)) errors.push(`${tag}: marked question needs marks above 0.`);

    const sol = solutions[q.id] || {};
    if (isMcq(q)) {
      const filled = (q.options || []).filter((o) => o.text.trim());
      if (filled.length < 2) errors.push(`${tag}: needs at least two options with text.`);
      const ids = new Set((q.options || []).map((o) => o.id));
      const correct = (sol.correct || []).filter((c) => ids.has(c));
      if (q.type === 'mcq-single' && correct.length > 1) errors.push(`${tag}: single-correct has several correct options.`);
      if (q.marked && !correct.length) warnings.push(`${tag}: no correct option set — you will have to mark it by hand.`);
    } else if (q.type === 'code') {
      if (q.codeLang === 'other' && !(q.codeLangLabel || '').trim()) warnings.push(`${tag}: language "Other" has no name.`);
      if (q.marked) warnings.push(`${tag}: code answers are marked by hand.`);
    } else if (q.type === 'short' && q.marked && !(sol.accepted || []).some((a) => a.trim())) {
      warnings.push(`${tag}: no accepted answer — you will have to mark it by hand.`);
    } else if (q.type === 'long' && q.marked) {
      warnings.push(`${tag}: long answers are marked by hand.`);
    }
  }

  const fieldIds = new Set();
  for (const f of paper.settings.identityFields) {
    if (!f.label.trim()) errors.push('An identity field has no label.');
    if (!f.id.trim() || fieldIds.has(f.id)) errors.push(`Identity field "${f.label}" needs a unique id.`);
    fieldIds.add(f.id);
  }
  if (!paper.settings.identityFields.length) warnings.push('No identity fields — you won’t know who submitted what.');

  const s = paper.settings;
  if (s.timeLimitMin != null && s.timeLimitMin !== '' && !(Number(s.timeLimitMin) > 0)) errors.push('Time limit must be a positive number of minutes (or empty).');
  if (s.blockRepeats) {
    if (s.cooldownMin != null && s.cooldownMin !== '' && !(Number(s.cooldownMin) > 0)) errors.push('The cooldown must be a positive number (or empty for "never expires").');
    if (!(s.secretId || '').trim()) warnings.push('Repeat-blocking has no secret id — it only applies to this exact paper file, so a regenerated paper could be attempted again.');
    if (!paper.settings.identityFields.some((f) => f.identifies !== false)) warnings.push('No identity field is marked "identifies the student" — repeat attempts can’t be recognised in Check paper.');
  }
  if (s.endLocal) {
    const ms = zonedToUtcMs(s.endLocal, s.endTz);
    if (!Number.isFinite(ms)) errors.push('The closing time or its timezone is not valid.');
    else if (ms < Date.now()) warnings.push('The closing time is already in the past — students would not be able to start.');
  }
  return { errors, warnings };
}

/* ---------- shuffling (deterministic per seed, so the order can be replayed) ---------- */
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}
function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffleSeeded(list, seed) {
  const rnd = mulberry32(hashSeed(String(seed))());
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function newSeed() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
}
/** → { layout: [item ids in the order shown], order: [question ids], optionOrder: { Q2: ['c','a','b'] } } */
export function buildOrder(paper, seed) {
  const items = paper.items || paper.questions;
  const groups = [{ section: null, items: [] }];
  for (const it of items) {
    if (it.kind === 'section') groups.push({ section: it, items: [] });
    else groups[groups.length - 1].items.push(it);
  }
  const [head, ...sections] = groups;
  const orderedSections = paper.settings.shuffleSections ? shuffleSeeded(sections, seed + '|s') : sections;
  const layout = [];
  const emit = (g, shuffle, key) => {
    if (g.section) layout.push(g.section.id);
    const units = [];
    let pending = [];
    for (const it of g.items) { pending.push(it); if (isQuestion(it)) { units.push(pending); pending = []; } }
    const arranged = shuffle ? shuffleSeeded(units, `${seed}|u|${key}`) : units;
    arranged.forEach((u) => u.forEach((i) => layout.push(i.id)));
    pending.forEach((i) => layout.push(i.id));          // trailing paragraphs stay last
  };
  emit(head, !!paper.settings.shuffleQuestions, 'head');
  orderedSections.forEach((g) => emit(g, !!g.section.shuffle, g.section.id));

  const qs = items.filter(isQuestion);
  const qIds = new Set(qs.map((q) => q.id));
  const optionOrder = {};
  for (const q of qs) {
    if (!isMcq(q)) continue;
    const oids = q.options.map((o) => o.id);
    optionOrder[q.id] = paper.settings.shuffleOptions ? shuffleSeeded(oids, `${seed}|o|${q.id}`) : oids;
  }
  return { layout, order: layout.filter((id) => qIds.has(id)), optionOrder };
}

/* ---------- file names ---------- */
export function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}
export function safeName(s, max = 40) {
  return String(s).normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, max) || 'x';
}
export const paperFileName = (paper) => `${safeName(paper.title)}_${paper.id}.zip`;
/** timestamp_identity — e.g. 20261110-142201_Asha-Rao_FY-B.ans */
export function answerFileName(payload, fields = []) {
  const order = fields.length ? fields.map((f) => f.id) : Object.keys(payload.identity || {});
  const who = order.map((id) => (payload.identity || {})[id]).filter(Boolean).map((v) => safeName(v, 24)).join('_');
  return `${stamp(new Date(payload.submittedAt))}_${who || 'anonymous'}.ans`;
}

/* ---------- download ---------- */
export function downloadText(filename, data, mime = 'application/json') {   // data: string or Uint8Array
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const readFileText = (file) => file.text();
