/* tokens.js — read design tokens from CSS at runtime, so JS never hardcodes
   a color. Tokens are defined in assets/css/styles_css/tokens/*.css.

   token('--green')            -> 'rgb(124, 92, 255)'  (current theme's value)
   tokenNum('--nav-offset')    -> 70                   (px / number tokens)
   heatLevels()                -> ['transparent', ..., '#a99bff']   (--heat-0..4)
   chartColors()               -> 9 colors for pie charts           (--chart-1..9)

   Values are cached per theme; the cache clears itself when
   <html data-theme> changes, so charts redraw correctly after a toggle. */

let cacheTheme = null;
const cache = new Map();

function themeNow() {
  return document.documentElement.dataset.theme || 'dark';
}

export function token(name, fallback = '') {
  const theme = themeNow();
  if (theme !== cacheTheme) { cache.clear(); cacheTheme = theme; }
  if (cache.has(name)) return cache.get(name);
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (v) cache.set(name, v);          // never cache an empty (not-yet-loaded) value
  return v || fallback;
}

export function tokenNum(name, fallback = 0) {
  const n = parseFloat(token(name));
  return Number.isFinite(n) ? n : fallback;
}

export function heatLevels() {
  return [0, 1, 2, 3, 4].map(i => token(`--heat-${i}`, i === 0 ? 'transparent' : '#7c5cff'));
}

export function chartColors() {
  return Array.from({ length: 9 }, (_, i) => token(`--chart-${i + 1}`, '#7c5cff'));
}
