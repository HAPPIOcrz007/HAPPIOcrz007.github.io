/* cards.js — shared click + Enter/Space delegation for card grids. */

/* Shared helper: attach click + Enter/Space handling to a card grid (event delegation) */
export function attachCardEvents(root, selector, getHandler) {
  root.addEventListener('click', (e) => {
    const card = e.target.closest(selector);
    if (card) getHandler(card)();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest(selector);
    if (card) { e.preventDefault(); getHandler(card)(); }
  });
}
