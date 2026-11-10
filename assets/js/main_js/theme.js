/* theme.js — dark/light toggle + the theme-aware profile image. */

import { $ } from './utils.js';
import { token } from './tokens.js';

/* Keep the browser/status-bar color in step with the active theme.
   The color is read from the --bg token, so it can never drift from the CSS.
   (The static <meta name="theme-color"> tags in each HTML file are only the
   first-paint fallback — see README.md.) */
const THEME_FALLBACK = { dark: '#0B0C10', light: '#FAFAF7' };

function syncThemeColorMeta(theme) {
  // index.html ships two media-scoped tags; the toggle can differ from the
  // OS preference, so drop them and keep a single tag that follows the toggle.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m, i) => {
    if (i > 0) m.remove();
  });
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.removeAttribute('media');
  meta.content = token('--bg', THEME_FALLBACK[theme] || THEME_FALLBACK.dark);
}

/* ===== Theme ===== */
export function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.dataset.theme = saved;
  syncThemeColorMeta(saved);
  const btn = $('#themeBtn');
  if (!btn) return;
  btn.textContent = saved === 'dark' ? '☾' : '☀';
  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    btn.textContent = next === 'dark' ? '☾' : '☀';
    localStorage.setItem('theme', next);
    syncThemeColorMeta(next);
    document.dispatchEvent(new CustomEvent('themeChange', { detail: { theme: next } }));
    // Update profile image when theme changes
    updateProfileImage();
  });
}

/* ===== Profile Image Theme Switcher ===== */
export function updateProfileImage() {
  const profileImg = document.getElementById('profileImg');
  if (!profileImg) return;

  const theme = document.documentElement.dataset.theme || 'dark';
  // Use profile_dark.png for dark theme, profile_light.png for light theme
  const imagePath = theme === 'dark'
    ? 'assets/images/profile_dark.png'
    : 'assets/images/profile_light.png';

  profileImg.src = imagePath;
}
