/* exam_js/timing.js — how long a student spent on each question.

   The answerer calls tick() about once a second with the question the student is "on" (the one holding keyboard
   focus, otherwise the one across the middle of the screen) and whether the tab is in front. Time is credited to
   that question only while the tab is visible AND the student did something (typed, clicked, scrolled, tapped)
   within the last `idleSec` seconds, so leaving the paper open while away doesn't inflate it.

   Snapshot per question (what goes into the answer file as meta.qTimes):
     { sec: active seconds, visits: how many times they moved onto it, firstSec: when they first reached it
       (seconds since the paper started), answeredSec: when they first gave a non-blank answer, edits: times they changed it }

   The sum of all question times is normally less than the total duration: reading the instructions, scrolling,
   being idle or away is not counted against any question. */

export function createTracker({ idleSec = 180, maxStepMs = 5000 } = {}) {
  let T = {};
  let last = null, lastAct = null, cur = null;
  const row = (id) => (T[id] ||= { ms: 0, visits: 0, firstSec: null, answeredSec: null, edits: 0 });

  return {
    /** Restore a snapshot (resuming a saved paper). */
    load(snapshot) {
      T = {};
      for (const [id, v] of Object.entries(snapshot || {})) {
        T[id] = { ms: (v.sec || 0) * 1000, visits: v.visits || 0, firstSec: v.firstSec ?? null, answeredSec: v.answeredSec ?? null, edits: v.edits || 0 };
      }
    },
    /** The student did something (key, click, scroll, touch). */
    activity(now) { lastAct = now; },
    /** now: ms · activeId: question id or null · present: tab visible and focused · elapsedSec: seconds since paper start */
    tick(now, activeId, present, elapsedSec) {
      const dt = last == null ? 0 : Math.min(Math.max(0, now - last), maxStepMs);
      last = now;
      /* the interval that just ended belongs to the question the student was on at its start */
      if (cur && present && lastAct != null && now - lastAct <= idleSec * 1000) row(cur).ms += dt;
      if (activeId !== cur) {
        cur = activeId;
        if (cur && present) {
          const r = row(cur);
          r.visits++;
          if (r.firstSec == null) r.firstSec = Math.round(elapsedSec);
        }
      }
    },
    /** The answer to a question changed. `blank` = it is now empty. */
    edit(id, elapsedSec, blank) {
      const r = row(id);
      r.edits++;
      if (!blank && r.answeredSec == null) r.answeredSec = Math.round(elapsedSec);
    },
    snapshot() {
      const out = {};
      for (const [id, r] of Object.entries(T)) {
        if (r.ms || r.visits || r.edits) out[id] = { sec: Math.round(r.ms / 1000), visits: r.visits, firstSec: r.firstSec, answeredSec: r.answeredSec, edits: r.edits };
      }
      return out;
    },
    totalSec() { return Math.round(Object.values(T).reduce((s, r) => s + r.ms, 0) / 1000); },
  };
}
