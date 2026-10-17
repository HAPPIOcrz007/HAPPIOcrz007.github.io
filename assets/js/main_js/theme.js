/* theme.js — dark/light toggle + the theme-aware profile image. */

import { $ } from './utils.js';

/* ===== Theme ===== */
export function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.dataset.theme = saved;
  const btn = $('#themeBtn');
  if (!btn) return;
  btn.textContent = saved === 'dark' ? '☾' : '☀';
  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    btn.textContent = next === 'dark' ? '☾' : '☀';
    localStorage.setItem('theme', next);
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
