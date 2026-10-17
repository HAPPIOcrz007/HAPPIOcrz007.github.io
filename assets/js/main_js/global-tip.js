/* global-tip.js — side-effect module: defines window.GlobalTip (shared hover tooltip).
   Imported once by main.js. Heatmap and CSES call window.GlobalTip.bind(...). */

/* ================================================================
   GLOBAL HOVER TOOLTIP
   ----------------------------------------------------------------
   One shared tooltip for the whole site, positioned just above
   whatever element is being hovered, instead of each component
   managing its own tooltip node/positioning logic.

   Exposed as window.GlobalTip:
     GlobalTip.show(html, target) — show/replace contents, anchored
                                     above `target`
     GlobalTip.hide()             — hide it
     GlobalTip.bind(el, getHtml)
            — wires mouseenter/mouseleave + focus/blur on `el`;
              getHtml(el) returns the markup to display.

   Any component that wants a hover tooltip should call this rather
   than positioning its own — keeps one element in the DOM and one
   consistent look/behaviour for every hover on the page.
   ================================================================ */
window.GlobalTip = (function () {
  'use strict';

  let el = null;
  let hideTimer = null;
  let currentTarget = null;

  function ensure() {
    if (el && document.body.contains(el)) return el;
    el = document.createElement('div');
    el.className = 'global-tip';
    el.id = 'globalTip';
    el.setAttribute('role', 'tooltip');
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    injectStyles();
    return el;
  }

  // Anchors the tooltip directly above `target`, horizontally
  // centred on it, clamped so it never runs off-screen. Falls back
  // to below the target if there isn't room above (e.g. near the
  // very top of the viewport).
  function positionAboveTarget(tip, target) {
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const gap = 8;
    const margin = 8;

    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));

    let top = rect.top - tipRect.height - gap;
    const flipped = top < margin;
    if (flipped) top = rect.bottom + gap;   // not enough room above

    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.classList.toggle('global-tip--below', flipped);
  }

  function show(html, target) {
    if (!html) return;
    const tip = ensure();
    clearTimeout(hideTimer);
    currentTarget = target || null;
    tip.innerHTML = html;
    tip.setAttribute('aria-hidden', 'false');
    positionAboveTarget(tip, currentTarget);   // size/position first…
    void tip.offsetWidth;                       // …force reflow…
    tip.classList.add('global-tip--visible');    // …then fade in
  }

  function hide() {
    if (!el) return;
    currentTarget = null;
    el.classList.remove('global-tip--visible');
    el.setAttribute('aria-hidden', 'true');
    // clear contents after the fade so stale text isn't read by AT
    hideTimer = setTimeout(() => { if (el) el.innerHTML = ''; }, 200);
  }

  function bind(target, getHtml) {
    if (!target) return;
    const run = () => show(typeof getHtml === 'function' ? getHtml(target) : getHtml, target);
    target.addEventListener('mouseenter', run);
    target.addEventListener('focus', run);
    target.addEventListener('mouseleave', hide);
    target.addEventListener('blur', hide);
  }

  function injectStyles() {
    if (document.getElementById('global-tip-styles')) return;
    const style = document.createElement('style');
    style.id = 'global-tip-styles';
    style.textContent = `
      .global-tip {
        position: fixed;
        top: -9999px;   /* real position set inline by JS before it's shown */
        left: -9999px;
        z-index: 190;
        pointer-events: none;
        max-width: min(90vw, 320px);
        width: max-content;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
        justify-content: center;
        background: var(--bg2, #111);
        border: 1px solid var(--border2, #2a2a2a);
        border-radius: 10px;
        padding: 0.4rem 0.7rem;
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.7rem;
        line-height: 1.4;
        color: var(--text, #ededed);
        text-align: center;
        box-shadow: 0 10px 30px rgba(0,0,0,0.45);
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      .global-tip--visible {
        opacity: 1;
      }
      /* pointer arrow — points down at the target by default (tip
         sits above it); flipped to point up when there wasn't room
         above and the tip had to render below the target instead. */
      .global-tip::after {
        content: '';
        position: absolute;
        left: 50%;
        bottom: -5px;
        transform: translateX(-50%);
        border: 5px solid transparent;
        border-top-color: var(--bg2, #111);
        border-bottom: none;
      }
      .global-tip--below::after {
        bottom: auto;
        top: -5px;
        border-top-color: transparent;
        border-bottom-color: var(--bg2, #111);
        border-top: none;
        border-bottom: 5px solid var(--bg2, #111);
      }
      .global-tip strong {
        color: var(--green, #e8510f);
        font-weight: 700;
      }
      .global-tip span {
        color: var(--text-dim, #a0a0a0);
        padding-left: 0.5rem;
        border-left: 1px solid var(--border2, #2a2a2a);
      }
      .global-tip span:first-child { border-left: none; padding-left: 0; }

      [data-theme="light"] .global-tip {
        background: #ffffff;
        border-color: var(--border2);
        color: var(--text);
        box-shadow: 0 10px 30px rgba(0,0,0,0.10);
      }
      [data-theme="light"] .global-tip::after { border-top-color: #ffffff; }
      [data-theme="light"] .global-tip--below::after { border-top-color: transparent; border-bottom-color: #ffffff; }
      [data-theme="light"] .global-tip strong { color: var(--green-dark); }
      [data-theme="light"] .global-tip span   { color: var(--text-dim); border-left-color: var(--border2); }

      @media (prefers-reduced-motion: reduce) {
        .global-tip { transition: none; }
      }
      @media (max-width: 640px) {
        .global-tip { font-size: 0.66rem; max-width: 85vw; }
      }
    `;
    document.head.appendChild(style);
  }

  // Recompute position on resize while a tooltip is visible (target
  // may have moved).
  window.addEventListener('resize', () => {
    if (el && currentTarget && el.classList.contains('global-tip--visible')) {
      positionAboveTarget(el, currentTarget);
    }
  }, { passive: true });

  // Hide on scroll so it never strands at a stale position relative
  // to its (now-moved) target.
  window.addEventListener('scroll', hide, { passive: true });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

  return { show, hide, bind };
})();
