/* ============================================================
   main.js — Portfolio entry point (distributor)

   This file contains no feature logic. It imports the modules in
   main_js/ and runs the boot sequence. Load it ONCE from index.html:
     <script type="module" src="assets/js/main.js"></script>

   Layout:  main_js/            site features (theme, modal, cards, scroll fx …)
            main_js/blog/       blog markdown engine, list, reader
            main_js/heatmap/    multi-platform activity heatmap
            main_js/cses/       CSES problem-set grid
   Data files (data/*.js) stay plain scripts that set window.DATA_*.

   NOTE: the audit notes below were written against the old single-file
   main.js — their "~L123" line numbers refer to that file, not to the
   modules. Search by function name instead.

   ---------------------------------------------------------------
   AUDIT NOTES — optimization pass, referenced by line number below
   ---------------------------------------------------------------
   #1  One shared scroll listener (rAF-throttled) drives the progress
       bar, parallax, and heatmap fill, instead of three separate
       listeners. See initScrollEffects() ~L560, onScroll() ~L620,
       and its call site in the boot block near the end of the file.
   #2  Heatmap particle speed is set via a single CSS variable
       (--particle-speed) instead of writing inline styles to all
       30 particle nodes on every scroll frame. ~L650
       (matching rule lives in styles.css).
   #3  Modal's close button is queried once in init() and cached on
       modal.closeBtn, instead of re-querying on every open(). ~L108
   #4  Carousel prev()/next() share one modulo-wrap guard instead of
       duplicated bounds checks. ~L178
   #5  attachCardEvents() is one reusable click/keyboard handler
       used for both project and certificate cards (event
       delegation), replacing two near-identical listener pairs.
       Defined ~L216, used at the project grid and certificate grid
       renderers below it.
   #6  escapeHtml() only guards against null/undefined so falsy
       values like 0 or false aren't silently coerced to ''. ~L18
   #7  Scroll-reveal CSS now lives in styles.css; JS only toggles
       the .visible class via IntersectionObserver — no runtime
       <style> injection for this feature. ~L452
   #8  Reveal observer attaches inside a single requestAnimationFrame
       call rather than nested rAFs. ~L497
   #12 Progress bar skips JS updates entirely when the browser
       supports native CSS scroll-driven animation
       (animation-timeline: scroll()). ~L535
   #22 Blogs: renderBlogMarkdown() / renderBlogs() / blogReader (search
       "BLOGS" below). Posts live in content/blogs/<id>.md with cover
       <id>.png and images <id>_<n>.png; metadata in data/blogs.js.
   #15 Hero name markup is only rewritten if the data-driven name
       differs from the static HTML already in the page, avoiding
       an unnecessary reflow on load. ~L297
   #23 Blogs — richer markdown:
         · ordered lists typed a/A/i/I via the first marker
         · arbitrarily deep nested lists (recursive by indent)
         · wiki-style side-by-side blocks (:::float left|right … :::)
           and single-image {float=left|right}
         · {embed=true} now renders a clickable link card that opens
           the target in a new tab, NOT an iframe
         · wide posts via data/blogs.js: { wide: true }
         · headings render in --text (heavy) so they don't collide
           with link-green; see .blog-body styles in styles.css
   ============================================================ */

import { renderAchievements } from './main_js/achievements.js';
import { renderBlogs } from './main_js/blog/list.js';
import { blogReader } from './main_js/blog/reader.js';
import { renderCertificates } from './main_js/certificates.js';
import { initCses } from './main_js/cses/index.js';
import { handleError } from './main_js/errors.js';
import { initHeatmap } from './main_js/heatmap/index.js';
import { initLinkEffects } from './main_js/link-effects.js';
import { renderMarkdown } from './main_js/markdown.js';
import { modal } from './main_js/modal.js';
import { initNotification } from './main_js/notification.js';
import { renderProjects } from './main_js/projects.js';
import { initScrollEffects } from './main_js/scroll-effects.js';
import { initScrollReveal } from './main_js/scroll-reveal.js';
import { renderSite } from './main_js/site.js';
import { renderSkills } from './main_js/skills.js';
import { initTheme } from './main_js/theme.js';
import { escapeHtml, fetchText } from './main_js/utils.js';
import './main_js/global-tip.js';   // side effect: defines window.GlobalTip

/* ===== Boot ===== */
document.addEventListener('DOMContentLoaded', () => {
  // The heatmap and CSES widgets used to start themselves before this handler ran.
  // Kept first, and isolated, so a failure there can't stop the rest of the boot.
  for (const start of [initHeatmap, initCses]) {
    try { start(); } catch (err) { console.error('[Portfolio] Widget init failed:', err); }
  }

  try {
    initTheme();
    modal.init();

    if (typeof window.DATA_SITE === 'undefined') {
      handleError('Data not loaded. Check your data.js file.');
      return;
    }

    renderSite(window.DATA_SITE);
    renderSkills(window.DATA_SKILLS);
    renderAchievements(window.DATA_ACHIEVEMENTS);
    renderProjects(window.DATA_PROJECTS);
    renderCertificates(window.DATA_CERTIFICATES);
    renderBlogs(window.DATA_BLOGS);
    blogReader.init();

    initScrollReveal();
    initLinkEffects();
    initScrollEffects();
    initNotification();

    document.dispatchEvent(new CustomEvent('portfolio:ready'));
    console.log('🚀 Portfolio ready!');
  } catch (err) {
    console.error('[Portfolio] Boot error:', err);
    handleError('Failed to initialize portfolio. Check console for details.');
  }
});

window.addEventListener('error', (e) => {
  console.error('[Portfolio] Runtime error:', e.message);
});

window.__portfolio = { modal, renderMarkdown, escapeHtml, fetchText };

if (navigator.share) {
  document.querySelector('#shareBtn')?.addEventListener('click', () => {
    navigator.share({ title: document.title, text: 'Check out my portfolio!', url: location.href });
  });
}
