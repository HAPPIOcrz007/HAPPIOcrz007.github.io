/* notification.js — floating "mini player" toast (data/notification.js). */

import { renderInlineMarkdown } from './markdown.js';
import { $ } from './utils.js';

/* ================================================================
   FLOATING NOTIFICATION — Spotify-mini-player style toast
   Reads window.DATA_NOTIFICATION from data/notification.js:
   { enabled, id, emoji, header, context, link }. Dismissal is
   remembered per "id" in localStorage — bump the id to make an
   updated notice reappear even if an older one was closed.
================================================================ */
export function initNotification() {
  const box = $('#notifyBox');
  if (!box) return;

  const data = window.DATA_NOTIFICATION;
  if (!data || data.enabled === false) return;

  const dismissKey = 'notify-dismissed';
  const dismissedId = localStorage.getItem(dismissKey);
  if (data.id && dismissedId === data.id) return;

  const emojiEl = $('#notifyEmoji');
  const headerEl = $('#notifyHeader');
  const contextEl = $('#notifyContext');
  const closeBtn = $('#notifyClose');

  if (emojiEl) emojiEl.textContent = data.emoji || '🔔';
  if (headerEl) headerEl.innerHTML = renderInlineMarkdown(data.header || 'Update');
  if (contextEl) contextEl.innerHTML = renderInlineMarkdown(data.context || '');

  if (data.link) {
    box.classList.add('notify-link');
    box.addEventListener('click', (e) => {
      if (e.target.closest('.notify-close')) return;
      if (String(data.link).startsWith('#')) {
        document.querySelector(data.link)?.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.open(data.link, '_blank', 'noopener,noreferrer');
      }
    });
  }

  const dismiss = () => {
    box.classList.remove('notify-visible');
    box.setAttribute('aria-hidden', 'true');
    if (data.id) localStorage.setItem(dismissKey, data.id);
  };
  closeBtn?.addEventListener('click', (e) => { e.stopPropagation(); dismiss(); });

  // Small delay so it "pops in" after the hero has settled, mini-player style
  box.removeAttribute('hidden');
  box.setAttribute('aria-hidden', 'false');
  setTimeout(() => box.classList.add('notify-visible'), 900);
}
