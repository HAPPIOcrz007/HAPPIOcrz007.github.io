/* exam_js/grade.js — marking and statistics. No DOM, so it is easy to test.

   Rules
   · Unmarked question          → shown, never scored.
   · Blank answer               → 0, nothing left to mark.
   · MCQ with a correct answer  → auto: single = exact match, multiple = exact set (all or nothing).
   · Short with accepted answers→ auto: trimmed, whitespace-collapsed match (case-insensitive unless the setter said otherwise).
   · Everything else            → manual: stays "pending" until the setter types a mark.
   · A setter's manual mark always wins over the auto mark (so a valid alternative short answer can be rescued). */

import { isMcq, normKey } from './format.js';

export const isBlank = (a) => a == null || (Array.isArray(a) ? a.length === 0 : String(a).trim() === '');
const norm = (s, caseSensitive) => {
  const t = String(s).trim().replace(/\s+/g, ' ');
  return caseSensitive ? t : t.toLowerCase();
};
const r2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Same student → same key. Only fields marked "identifies" count (all fields for papers made before that option),
    and case, spaces, punctuation and accents are ignored: "Harsh Rathod" = "harshrathod". */
export function identityKey(payload, fields = []) {
  let use = fields.filter((f) => f.identifies !== false);
  if (!use.length) use = fields;
  const ids = use.length ? use.map((f) => f.id) : Object.keys(payload.identity || {});
  const parts = ids.map((id) => normKey((payload.identity || {})[id] ?? ''));
  return parts.some(Boolean) ? parts.join('|') : '';
}
export const submissionId = (p, fields) => `${p.paperId}|${p.submittedAt}|${identityKey(p, fields)}`;

export function gradeQuestion(q, sol = {}, ans, override) {
  const max = q.marked ? Number(q.marks) || 0 : 0;
  const base = { qid: q.id, type: q.type, marked: !!q.marked, max };
  if (!q.marked) return { ...base, status: 'unmarked', auto: null, override: null, score: 0, pending: false };

  const blank = isBlank(ans);
  let status = 'manual', auto = null;
  if (blank) { status = 'blank'; auto = 0; }
  else if (isMcq(q) && (sol.correct || []).length) {
    const got = [].concat(ans);
    const ok = got.length === sol.correct.length && sol.correct.every((c) => got.includes(c));
    status = ok ? 'correct' : 'wrong'; auto = ok ? max : 0;
  } else if (q.type === 'short' && (sol.accepted || []).some((a) => String(a).trim())) {
    const cs = !!sol.caseSensitive, mine = norm(ans, cs);
    const ok = sol.accepted.some((a) => norm(a, cs) === mine);
    status = ok ? 'correct' : 'wrong'; auto = ok ? max : 0;
  }
  const has = override !== undefined && override !== null && override !== '' && Number.isFinite(Number(override));
  const ov = has ? clamp(Number(override), 0, max) : null;
  return { ...base, status, auto, override: ov, score: r2(ov ?? auto ?? 0), pending: status === 'manual' && ov === null };
}

/** → { rows, total, max, pct, pending, answered } for one submission. `ov` = { qid: mark }. */
export function gradeSubmission(paper, solutions, payload, ov = {}) {
  const rows = paper.questions.map((q) => gradeQuestion(q, solutions[q.id], (payload.answers || {})[q.id], (ov || {})[q.id]));
  const total = r2(rows.reduce((s, r) => s + r.score, 0));
  const max = r2(rows.reduce((s, r) => s + r.max, 0));
  return {
    rows, total, max, pct: max ? (total / max) * 100 : 0,
    pending: rows.filter((r) => r.pending).length,
    answered: paper.questions.filter((q) => !isBlank((payload.answers || {})[q.id])).length,
  };
}

/* ---------- statistics ---------- */
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
export const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sd = (a) => { const m = mean(a); return a.length ? Math.sqrt(mean(a.map((x) => (x - m) ** 2))) : 0; };

/** Discrimination index of one question: how much better the top 27% (by total score) did on it than the bottom 27%.
    +1 = perfectly separates strong from weak, ~0 = no information, negative = weak students did better (check the key). null under 6 students. */
function discrimination(qi, subs) {
  const usable = subs.filter((s) => { const r = s.grade.rows[qi]; return r.marked && r.max > 0 && !r.pending; });
  if (usable.length < 6) return null;
  const sorted = [...usable].sort((a, b) => b.grade.pct - a.grade.pct);
  const k = Math.max(1, Math.round(sorted.length * 0.27));
  const ratio = (s) => { const r = s.grade.rows[qi]; return r.score / r.max; };
  return mean(sorted.slice(0, k).map(ratio)) - mean(sorted.slice(-k).map(ratio));
}
export const questionSeconds = (s, qid) => { const t = (s.payload.meta?.qTimes || {})[qid]; return t && Number.isFinite(t.sec) ? t.sec : null; };
export const activeSeconds = (s) => {
  const t = s.payload.meta?.qTimes;
  return t ? Object.values(t).reduce((sum, x) => sum + (x.sec || 0), 0) : null;
};

/** subs = [{ payload, grade }] (already filtered to the ones that count). opts.passMark = percent (default 40). */
export function batchStats(paper, solutions, subs, opts = {}) {
  const passMark = Number.isFinite(opts.passMark) ? opts.passMark : 40;
  const pcts = subs.map((s) => s.grade.pct);
  const hist = Array(10).fill(0);
  for (const p of pcts) hist[Math.min(9, Math.floor(p / 10))]++;
  const durs = subs.map((s) => s.payload.meta?.durationSec).filter((d) => Number.isFinite(d));
  const actives = subs.map(activeSeconds).filter((d) => d != null);

  const perQuestion = paper.questions.map((q, qi) => {
    let attempted = 0, correct = 0, wrong = 0, pending = 0, scored = 0, ratioSum = 0;
    const options = {}, secs = [], secsC = [], secsW = [];
    for (const s of subs) {
      const ans = (s.payload.answers || {})[q.id], row = s.grade.rows[qi];
      if (!isBlank(ans)) attempted++;
      if (isMcq(q)) for (const id of isBlank(ans) ? [''] : [].concat(ans)) options[id] = (options[id] || 0) + 1;
      if (row.status === 'correct') correct++;
      if (row.status === 'wrong') wrong++;
      if (row.pending) pending++;
      else if (row.marked && row.max) { scored++; ratioSum += row.score / row.max; }
      const sec = questionSeconds(s, q.id);
      if (sec != null) { secs.push(sec); if (row.status === 'correct') secsC.push(sec); if (row.status === 'wrong') secsW.push(sec); }
    }
    return {
      qid: q.id, type: q.type, marked: !!q.marked, mandatory: !!q.mandatory, marks: q.marks,
      attempted, skipped: subs.length - attempted,
      attemptRate: subs.length ? attempted / subs.length : 0,
      correct, wrong, accuracy: correct + wrong ? correct / (correct + wrong) : null,
      pending, avgRatio: scored ? ratioSum / scored : null, options,
      discrimination: discrimination(qi, subs),
      timeN: secs.length, avgSec: secs.length ? mean(secs) : null, medianSec: secs.length ? median(secs) : null,
      avgSecCorrect: secsC.length ? mean(secsC) : null, avgSecWrong: secsW.length ? mean(secsW) : null,
    };
  });

  /* sections: average share of the marks earned in each section (only answered-and-marked rows) */
  const secMap = new Map();
  paper.questions.forEach((q, qi) => {
    const title = (paper.sectionOf || {})[q.id];
    if (!title) return;
    const e = secMap.get(title) || { title, got: 0, max: 0, qs: 0 };
    e.qs++;
    for (const s of subs) { const r = s.grade.rows[qi]; if (r.marked && r.max && !r.pending) { e.got += r.score; e.max += r.max; } }
    secMap.set(title, e);
  });

  return {
    n: subs.length, passMark,
    mean: mean(pcts), median: median(pcts), min: pcts.length ? Math.min(...pcts) : 0, max: pcts.length ? Math.max(...pcts) : 0, sd: sd(pcts),
    passed: pcts.filter((p) => p >= passMark).length, passRate: pcts.length ? pcts.filter((p) => p >= passMark).length / pcts.length : null,
    hist, avgDuration: durs.length ? mean(durs) : null, avgActive: actives.length ? mean(actives) : null,
    pending: subs.reduce((s, x) => s + x.grade.pending, 0),
    pendingSubs: subs.filter((s) => s.grade.pending).length,
    perQuestion,
    sections: [...secMap.values()].map((e) => ({ title: e.title, qs: e.qs, avgPct: e.max ? (e.got / e.max) * 100 : null })),
  };
}

/* ---------- CSV ---------- */
const csvCell = (v) => { v = String(v ?? ''); return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
/** subs = [{ payload, grade, batch, fileName }] */
export function toCsv(paper, subs) {
  const fields = paper.settings.identityFields;
  const head = ['batch', 'file', 'started', 'submitted', ...fields.map((f) => f.label), 'duration_sec', 'total', 'max', 'percent', 'pending_manual', 'counted', 'review_status', 'repeat_of', 'active_sec', ...paper.questions.map((q) => q.id), ...paper.questions.map((q) => 'sec_' + q.id)];
  const rows = subs.map((s) => [
    s.batch, s.fileName, s.payload.meta?.startedAt ?? '', s.payload.submittedAt, ...fields.map((f) => (s.payload.identity || {})[f.id] ?? ''),
    s.payload.meta?.durationSec ?? '', s.grade.total, s.grade.max, Math.round(s.grade.pct * 10) / 10, s.grade.pending,
    s.counted === false ? 'no' : 'yes', s.reviewStatus ?? '', s.flag ? s.flag.originalFile : '', activeSeconds(s) ?? '',
    ...s.grade.rows.map((r) => (r.marked ? (r.pending ? '' : r.score) : 'n/a')),
    ...paper.questions.map((q) => questionSeconds(s, q.id) ?? ''),
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}
