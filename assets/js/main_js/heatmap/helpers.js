/* heatmap/helpers.js — date helpers. */

/* ── HELPERS ─────────────────────────────────────────────────── */
/** ISO date string YYYY-MM-DD for a Date object */
/** Local calendar date YYYY-MM-DD (what the grid cells use) */
export const toISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Date object for a YYYY-MM-DD string (local time) */
const fromISO = (s) => new Date(s + 'T00:00:00');
export const toUTCISO = (d) => d.toISOString().slice(0, 10);

/** Number of days between two Date objects */
export const daysBetween = (a, b) => Math.round((b - a) / 86_400_000);

/** Add n days to Date d */
export const addDays = (d, n) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
};

/** Returns the Sunday that starts the week containing d */
export function weekStart(d) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}
