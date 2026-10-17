/* utils.js — tiny DOM / network helpers shared by every module:
   $ (querySelector), escapeHtml, fetchText, copyText. */

/* ===== Tiny DOM helpers ===== */
export const $ = (sel) => document.querySelector(sel);

export const escapeHtml = (s) => {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
};

export async function fetchText(url) {
  try {
    const r = await fetch(url);
    return r.ok ? r.text() : null;
  } catch (err) {
    console.warn(`[fetchText] Failed to load ${url}:`, err);
    return null;
  }
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}
