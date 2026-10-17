/* modal.js — project / certificate modal with image carousel. */

import { renderInlineMarkdown } from './markdown.js';
import { $, escapeHtml } from './utils.js';

/* ===== Modal ===== */
export const modal = {
  root: null,
  title: null,
  carousel: null,
  body: null,
  closeBtn: null,
  images: [],
  index: 0,
  isOpen: false,
  _lastFocused: null,

  init() {
    this.root = $('#modal');
    if (!this.root) return;

    this.title = $('#modalTitle');
    this.carousel = $('#modalCarousel');
    this.body = $('#modalBody');
    this.closeBtn = $('#modalClose');

    if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.close());

    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') this.close();
      if (e.key === 'ArrowLeft') this.prev();
      if (e.key === 'ArrowRight') this.next();
    });

    this.root.addEventListener('focusin', (e) => {
      if (!this.isOpen) return;
      const focusable = this.root.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.target === last) first?.focus();
      else if (e.target === this.root) last?.focus();
    });
  },

  open(title, images, mdHtml) {
    if (!this.root) return;
    this._lastFocused = document.activeElement;

    this.title.innerHTML = renderInlineMarkdown(title || 'Untitled');
    this.images = (images || []).filter(Boolean);
    this.index = 0;
    this.isOpen = true;

    this.renderCarousel();
    this.body.innerHTML = mdHtml || '';
    this.root.classList.add('open');
    document.body.style.overflow = 'hidden';

    setTimeout(() => this.closeBtn?.focus(), 100);
  },

  close() {
    if (!this.root) return;
    this.root.classList.remove('open');
    document.body.style.overflow = '';
    this.isOpen = false;
    if (this._lastFocused) {
      this._lastFocused.focus();
      this._lastFocused = null;
    }
  },

  prev() {
    if (this.images.length <= 1) return;
    this.index = (this.index - 1 + this.images.length) % this.images.length;
    this.renderCarousel();
  },

  next() {
    if (this.images.length <= 1) return;
    this.index = (this.index + 1) % this.images.length;
    this.renderCarousel();
  },

  renderCarousel() {
    if (!this.carousel) return;
    if (!this.images.length) { this.carousel.innerHTML = ''; return; }

    const src = escapeHtml(this.images[this.index]);
    const hasMultiple = this.images.length > 1;

    this.carousel.innerHTML = `
      <img src="${src}" alt="Preview" loading="lazy"
           onerror="this.style.opacity='0.4';this.alt='Image not available';" />
      ${hasMultiple ? `
        <button class="carousel-btn prev" aria-label="Previous image">‹</button>
        <button class="carousel-btn next" aria-label="Next image">›</button>
        <div class="carousel-count">${this.index + 1} / ${this.images.length}</div>
      ` : ''}
    `;

    this.carousel.querySelector('.prev')
      ?.addEventListener('click', (e) => { e.stopPropagation(); this.prev(); });
    this.carousel.querySelector('.next')
      ?.addEventListener('click', (e) => { e.stopPropagation(); this.next(); });
  },
};
