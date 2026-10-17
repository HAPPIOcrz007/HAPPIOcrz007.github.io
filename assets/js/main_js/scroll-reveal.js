/* scroll-reveal.js — IntersectionObserver that toggles .visible on .reveal elements. */

import { ANIM_ROOT_MARGIN, ANIM_STAGGER_MAX, ANIM_STAGGER_MS, ANIM_THRESHOLD } from './config.js';

/* ================================================================
   SCROLL REVEAL — visibility rules live in CSS; JS only drives state
================================================================ */
export function initScrollReveal() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reduced motion: skip the observer, show everything immediately
  if (reduced) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
    return;
  }

  /* Mark section headings */
  document.querySelectorAll('.sec-label, .sec-title').forEach(el => {
    el.classList.add('reveal');
  });

  /* Mark hero elements */
  document.querySelectorAll('#hero .stat, #hero .btn, .hero-eyebrow, .hero-name, .hero-tagline').forEach(el => {
    el.classList.add('reveal');
  });

  /* Stagger hero elements */
  document.querySelectorAll('#hero .reveal').forEach((el, i) => {
    el.style.setProperty('--stagger-delay', `${Math.min(i * 80, 400)}ms`);
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const parent = el.parentElement;
      const siblings = [...parent.querySelectorAll('.reveal:not(.visible)')];
      const sibIdx = siblings.indexOf(el);
      const custom = parseFloat(el.style.getPropertyValue('--stagger-delay')) || 0;
      const stagger = Math.min(sibIdx * ANIM_STAGGER_MS, ANIM_STAGGER_MAX);

      setTimeout(() => {
        el.classList.add('visible');
        el.dispatchEvent(new CustomEvent('revealed', { bubbles: true }));
      }, custom + stagger);

      observer.unobserve(el);
    });
  }, { threshold: ANIM_THRESHOLD, rootMargin: ANIM_ROOT_MARGIN });

  requestAnimationFrame(() => {
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  });
}
