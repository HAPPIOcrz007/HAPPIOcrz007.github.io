/* blog/pdf-preview.js — first-page PDF previews via pdf.js (loaded on demand). */

/* ---------- PDFs: first-page preview via pdf.js (loaded on demand) ---------- */
const PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
let _pdfjsPromise = null;

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (_pdfjsPromise) return _pdfjsPromise;
  _pdfjsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PDFJS_BASE + 'pdf.min.js';
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    s.onerror = () => { _pdfjsPromise = null; reject(new Error('pdf.js failed to load')); };
    document.head.appendChild(s);
  });
  return _pdfjsPromise;
}

export async function renderPdfPreviews(root) {
  const figs = [...root.querySelectorAll('.blog-pdf[data-pdf]')];
  if (!figs.length) return;
  const fail = (fig) => fig.classList.add('blog-pdf--fallback');

  let lib;
  try { lib = await loadPdfJs(); } catch (e) { console.warn('[blog]', e.message); figs.forEach(fail); return; }

  for (const fig of figs) {
    try {
      const doc = await lib.getDocument(fig.dataset.pdf).promise;
      if (!fig.isConnected) continue;             // post was closed / swapped meanwhile
      const wanted = parseInt(fig.dataset.pdfPage, 10) || 1;
      const pageNum = Math.min(Math.max(wanted, 1), doc.numPages);   // clamp to a page that exists
      const page = await doc.getPage(pageNum);
      const canvas = fig.querySelector('canvas');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = fig.querySelector('.blog-pdf-link').clientWidth || 700;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (cssW * dpr) / base.width });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      fig.classList.add('blog-pdf--ready');
      const pages = fig.querySelector('.blog-pdf-pages');
      if (pages) pages.textContent = pageNum > 1
        ? `page ${pageNum} of ${doc.numPages} · `
        : `${doc.numPages} page${doc.numPages === 1 ? '' : 's'} · `;
    } catch (e) {
      console.warn('[blog] PDF preview failed:', fig.dataset.pdf, e && e.message);
      fail(fig);
    }
  }
}
