/* blog/diagram.js — Mermaid diagrams via Pele (https://pele.run), loaded on demand.
   blog/markdown.js turns every ```mermaid block into
     <figure class="blog-diagram"> <div class="blog-diagram-canvas"> + <details> with the source </figure>
   and the reader calls renderDiagrams(body) once the post is on screen. Posts without diagrams never download Pele.

   · Colours and fonts come from CSS variables (see 32-blog-diagram.css), so the theme toggle recolours
     diagrams instantly — no re-render.
   · mount() also keeps each diagram fitted to the column width (wide diagrams can be zoomed/panned).
   · If Pele can't load or a diagram has a mistake, the source stays visible with the error message above it. */

import { PELE_SOURCES, PELE_OPTIONS } from './config.js';

let _pele = null;
async function loadPele() {
  if (window.pele && typeof window.pele.mount === 'function') return window.pele;   // e.g. pele.global.js already on the page
  if (_pele) return _pele;
  _pele = (async () => {
    for (const src of PELE_SOURCES) {
      try {
        const mod = await import(new URL(src, document.baseURI).href);                // page-relative, like BLOG_DIR
        if (typeof mod.mount === 'function') return mod;
      } catch (e) { console.warn('[blog] Pele failed to load from', src, e && e.message); }
    }
    throw new Error('Pele could not be loaded');
  })();
  _pele.catch(() => { _pele = null; });                                               // allow a retry on the next post
  return _pele;
}

function showError(fig, err) {
  fig.classList.add('blog-diagram--failed');
  const msg = typeof err === 'string' ? err : (err && err.message) || String(err);
  let box = fig.querySelector('.blog-diagram-error');
  if (!box) {
    box = document.createElement('pre');
    box.className = 'blog-diagram-error';
    box.setAttribute('role', 'alert');
    fig.insertBefore(box, fig.querySelector('details'));
  }
  box.textContent = msg;                      // textContent, never innerHTML: Pele errors quote the diagram source
}

export async function renderDiagrams(root) {
  const figs = [...root.querySelectorAll('.blog-diagram[data-diagram]')]
    .filter((f) => !f._pele && !f.classList.contains('blog-diagram--ready'));
  if (!figs.length) return;

  let pele;
  try { pele = await loadPele(); }
  catch (e) { figs.forEach((f) => showError(f, 'The diagram renderer could not be loaded — showing the source instead.')); return; }

  for (const fig of figs) {
    if (!fig.isConnected) continue;           // the post was closed / swapped while Pele was loading
    const canvas = fig.querySelector('.blog-diagram-canvas');
    const source = fig.querySelector('.blog-diagram-src code')?.textContent || '';
    try {
      const m = pele.mount(canvas, source, { ...PELE_OPTIONS });
      if (m.error) { m.destroy(); canvas.replaceChildren(); showError(fig, m.error); continue; }
      fig._pele = m;
      fig.classList.add('blog-diagram--ready');
      fig.querySelector('.blog-diagram-src')?.removeAttribute('open');   // tuck the source away; still one click to copy
    } catch (e) { showError(fig, e); }
  }
}

/** Stop observing the containers before the post body is replaced. */
export function destroyDiagrams(root) {
  root.querySelectorAll('.blog-diagram').forEach((f) => {
    try { f._pele && f._pele.destroy(); } catch { /* already gone */ }
    f._pele = null;
  });
}
