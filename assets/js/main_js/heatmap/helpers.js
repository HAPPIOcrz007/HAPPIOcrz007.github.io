/* heatmap/helpers.js — date helpers. */

/* ── HELPERS ─────────────────────────────────────────────────── */
/** ISO date string YYYY-MM-DD for a Date object */
export const toISO = (d) => d.toISOString().slice(0, 10);

/** Date object for a YYYY-MM-DD string (local time) */
const fromISO = (s) => new Date(s + 'T00:00:00');

/** Number of days between two Date objects */
export const daysBetween = (a, b) => Math.round((b - a) / 86_400_000);

/** Add n days to Date d */
export const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);

/** Returns the Sunday that starts the week containing d */
export function weekStart(d) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}
