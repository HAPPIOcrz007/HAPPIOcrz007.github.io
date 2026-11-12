/* exam_js/ui.js — tiny DOM helpers shared by the setter, answerer and checker. */

export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'value') n.value = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach((c) => c != null && c !== false && n.append(c));
  return n;
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function debounce(fn, ms = 300) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = () => { clearTimeout(t); fn(); };
  return d;
}

/* ---------- toasts ---------- */
let toastHost;
export function toast(msg, kind = '') {
  if (!toastHost) toastHost = document.body.appendChild(el('div', { class: 'ex-toasts', role: 'status', 'aria-live': 'polite' }));
  const t = el('div', { class: `ex-toast ${kind}`.trim(), text: msg });
  toastHost.append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3000);
}

/* ---------- dialogs ---------- */
/* dialog({ title, body: Node|string, actions: [{label, value, primary|danger}], wide, locked, ref })
   → Promise of the clicked action's value (null on Esc). ref.close(value) closes it from inside the body. */
export function dialog({ title, body, actions = [{ label: 'Close', value: true, primary: true }], wide = false, locked = false, ref = {} }) {
  return new Promise((resolve) => {
    const d = el('dialog', { class: `ex-dialog${wide ? ' wide' : ''}`, 'aria-label': title });
    const done = (v) => { try { d.close(); } catch { /* already closed */ } d.remove(); resolve(v); };
    ref.close = done;
    const content = typeof body === 'string' ? el('p', { text: body }) : body;
    d.append(
      el('h3', { text: title }),
      el('div', { class: 'ex-dialog-body' }, content),
      actions.length ? el('div', { class: 'ex-dialog-actions' }, actions.map((a) =>
        el('button', { type: 'button', class: `ex-btn ${a.primary ? 'primary' : a.danger ? 'danger' : 'ghost'}`, text: a.label, onclick: () => done(a.value) }))) : null);
    d.addEventListener('cancel', (e) => { e.preventDefault(); if (!locked) done(null); });
    document.body.append(d);
    d.showModal();
  });
}
export const confirmDialog = (message, { ok = 'OK', danger = false, title = 'Please confirm' } = {}) =>
  dialog({ title, body: message, actions: [{ label: 'Cancel', value: false }, { label: ok, value: true, primary: !danger, danger }] })
    .then((v) => v === true);

export const bulletList = (items) => el('ul', { class: 'ex-list' }, items.map((t) => el('li', { text: t })));

/* ---------- misc ---------- */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied', 'ok'); }
  catch {
    const ta = el('textarea', { value: text, class: 'ex-offscreen' });
    document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast('Copied', 'ok'); } catch { toast('Copy failed — select the text and copy it by hand', 'err'); }
    ta.remove();
  }
}

/* A click-or-drop file picker. onFiles(File[]). */
export function dropZone({ accept = '', multiple = false, label, hint = '', onFiles }) {
  const exts = accept.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const input = el('input', { type: 'file', accept, multiple, class: 'ex-offscreen', tabindex: '-1', 'aria-hidden': 'true' });
  const pick = (files) => {
    let list = [...files].filter((f) => !exts.length || exts.some((x) => f.name.toLowerCase().endsWith(x)));
    if (!multiple) list = list.slice(0, 1);
    if (list.length) onFiles(list); else toast(`Choose a ${exts.join(' / ') || 'matching'} file`, 'err');
  };
  const zone = el('button', {
    type: 'button', class: 'ex-drop', onclick: () => input.click(),
    ondragover: (e) => { e.preventDefault(); zone.classList.add('over'); },
    ondragleave: () => zone.classList.remove('over'),
    ondrop: (e) => { e.preventDefault(); zone.classList.remove('over'); pick(e.dataTransfer.files); },
  }, el('strong', { text: label }), el('span', { text: hint }));
  input.addEventListener('change', () => { if (input.files.length) pick(input.files); input.value = ''; });
  return el('div', { class: 'ex-dropwrap' }, zone, input);
}

export const readText = (file) => (file.text ? file.text() : new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file);
}));

export const fmtDate = (iso) => { try { return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch { return String(iso || ''); } };
export function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}
export const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'field';
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export const readBytes = async (file) => {
  if (file.arrayBuffer) return new Uint8Array(await file.arrayBuffer());
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result)); r.onerror = rej; r.readAsArrayBuffer(file); });
};
