/* exam_js/lock.js — "one attempt per device" lock for papers with repeat-blocking on.

   The lock is keyed by a hash of the setter's SECRET EXAM ID (e.g. "EXAM - 001" → "exam001"), so a regenerated
   or alternate version of the same exam shares it. Without a secret id it is keyed by the paper id.

   It is written to THREE places — localStorage, IndexedDB and a cookie — and every read re-writes any copy that
   went missing. A student therefore has to wipe all site data to get rid of it (the "Close this paper" button
   never touches it). This stops accidents and casual retries. It cannot stop a student who clears all site data,
   uses another device or a private window: the repeat detection in Check paper is the real safeguard. */

import { normKey } from './format.js';

const te = new TextEncoder();
const DB = 'exam-lock', STORE = 'locks';
const LS = (k) => 'exam.lock.' + k;
const CK = (k) => 'exam_lock_' + k;

/** Stable, non-guessable storage key for a lock subject (secret id or paper id). */
export async function lockKeyFor(subject) {
  const d = await crypto.subtle.digest('SHA-256', te.encode('exam-lock|' + normKey(subject)));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- the three stores ---------- */
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(LS(k))); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(LS(k), JSON.stringify(v)); } catch { /* blocked */ } };
const ckGet = (k) => {
  try {
    const m = document.cookie.split('; ').find((c) => c.startsWith(CK(k) + '='));
    return m ? JSON.parse(atob(decodeURIComponent(m.slice(CK(k).length + 1)))) : null;
  } catch { return null; }
};
const ckSet = (k, v) => {
  try { document.cookie = `${CK(k)}=${encodeURIComponent(btoa(JSON.stringify(v)))}; max-age=${400 * 86400}; path=/; SameSite=Lax`; } catch { /* blocked */ }
};
const openDb = () => new Promise((res, rej) => {
  if (!globalThis.indexedDB) return rej(new Error('no idb'));
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function idbGet(k) {
  try {
    const db = await openDb();
    return await new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); });
  } catch { return null; }
}
async function idbSet(k, v) {
  try {
    const db = await openDb();
    await new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); });
  } catch { /* blocked */ }
}

/* ---------- records: { v:1, attempts: [{ paperId, startedAt, submittedAt|null }] } ---------- */
function merge(a, b) {
  const map = new Map();
  for (const r of [a, b]) {
    for (const t of (r && r.attempts) || []) {
      const key = t.paperId + '|' + t.startedAt;
      const old = map.get(key);
      map.set(key, { paperId: t.paperId, startedAt: t.startedAt, submittedAt: Math.max(old?.submittedAt || 0, t.submittedAt || 0) || null });
    }
  }
  return { v: 1, attempts: [...map.values()].sort((x, y) => x.startedAt - y.startedAt) };
}
async function writeAll(k, rec) { lsSet(k, rec); ckSet(k, rec); await idbSet(k, rec); }

/** Read the lock (union of all copies) and silently restore any copy that was deleted. */
export async function readLock(key) {
  let rec = null;
  for (const r of [lsGet(key), ckGet(key), await idbGet(key)]) if (r) rec = merge(rec, r);
  if (rec) await writeAll(key, rec);
  return rec;
}
/** Add or update an attempt (same paperId + startedAt = same attempt). Returns the merged record. */
export async function recordAttempt(key, attempt) {
  const rec = merge(await readLock(key), { attempts: [attempt] });
  await writeAll(key, rec);
  return rec;
}

export const lastAttempt = (rec) => (rec && rec.attempts.length ? rec.attempts[rec.attempts.length - 1] : null);

/** Can this paper be started now?  cooldownMin: minutes, or null/0 for "never expires".
    → { blocked, until (ms, Infinity = never), last, resume (an unfinished attempt of this same paper) } */
export function lockStatus(rec, paperId, cooldownMin, now = Date.now()) {
  const last = lastAttempt(rec);
  if (!last) return { blocked: false };
  const base = last.submittedAt ?? last.startedAt;
  const until = Number(cooldownMin) > 0 ? base + Number(cooldownMin) * 60000 : Infinity;
  if (now >= until) return { blocked: false, expired: true, last };
  if (last.paperId === paperId && !last.submittedAt) return { blocked: false, resume: last, last };
  return { blocked: true, until, last };
}
