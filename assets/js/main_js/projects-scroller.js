/* projects-scroller.js — horizontal strip: arrows, drag-pan, wheel-to-horizontal. */

import { $ } from './utils.js';

/* ================================================================
   PROJECTS — horizontal scroller
   Turns #projectsGrid into a Netflix-row-style strip: arrow buttons,
   mouse-drag panning, and vertical-wheel-to-horizontal translation,
   on top of native touch/scrollbar scrolling. Section height stays
   fixed no matter how many entries data/projects.js grows to.
================================================================ */
let _projectsScrollerBound = false;

export function initProjectsScroller() {
  const grid = $('#projectsGrid');
  const prevBtn = $('#projectsPrev');
  const nextBtn = $('#projectsNext');
  if (!grid || !prevBtn || !nextBtn) return;

  const cardGap = 20; // matches --gap in .projects-grid (1.25rem)

  function step() {
    const card = grid.querySelector('.project-card');
    return card ? card.getBoundingClientRect().width + cardGap : grid.clientWidth * 0.8;
  }

  function updateButtons() {
    const maxScroll = grid.scrollWidth - grid.clientWidth - 1;
    prevBtn.disabled = grid.scrollLeft <= 0;
    nextBtn.disabled = grid.scrollLeft >= maxScroll || maxScroll <= 0;
  }

  function scrollByStep(dir) {
    grid.scrollBy({ left: dir * step(), behavior: 'smooth' });
  }

  if (!_projectsScrollerBound) {
    _projectsScrollerBound = true;

    prevBtn.addEventListener('click', () => scrollByStep(-1));
    nextBtn.addEventListener('click', () => scrollByStep(1));

    grid.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); scrollByStep(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); scrollByStep(-1); }
    });

    // Translate vertical wheel motion into horizontal scroll on desktop
    grid.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      grid.scrollLeft += e.deltaY;
    }, { passive: false });

    // Click-and-drag panning — mouse only (touch already scrolls natively;
    // handling it here too would fight the browser's own touch scrolling).
    // Scroll position only moves once the pointer has actually travelled
    // past DRAG_THRESHOLD, so ordinary clicks never get mistaken for a drag.
    const DRAG_THRESHOLD = 8;
    let isDown = false, startX = 0, startScroll = 0, moved = false;

    grid.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      isDown = true; moved = false;
      startX = e.clientX;
      startScroll = grid.scrollLeft;
    });
    window.addEventListener('pointermove', (e) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > DRAG_THRESHOLD) {
        moved = true;
        grid.classList.add('dragging');
      }
      if (moved) grid.scrollLeft = startScroll - dx;
    });
    window.addEventListener('pointerup', () => {
      isDown = false;
      grid.classList.remove('dragging');
    });
    // Suppress the click-to-open-modal only when a real drag happened
    grid.addEventListener('click', (e) => {
      if (moved) { e.stopPropagation(); moved = false; }
    }, true);

    grid.addEventListener('scroll', updateButtons, { passive: true });
    window.addEventListener('resize', updateButtons);
  }

  updateButtons();
}
