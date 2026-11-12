/* exam_js/theme.js — light/dark toggle for the exam page.
   Reads/writes localStorage "theme" ('dark' | 'light') and sets <html data-theme>.
   If your site's own theme.js uses a different storage key, change KEY (or swap this file for yours). */

const KEY = 'theme';

function syncMeta() {
  let m = document.querySelector('meta[name="theme-color"][data-live]');
  if (!m) {
    document.querySelectorAll('meta[name="theme-color"]').forEach((x) => x.remove());
    m = Object.assign(document.createElement('meta'), { name: 'theme-color' });
    m.dataset.live = '1';
    document.head.append(m);
  }
  m.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0B0C10';
}

export function initTheme(button) {
  const apply = (t, save) => {
    document.documentElement.dataset.theme = t;
    if (save) { try { localStorage.setItem(KEY, t); } catch { /* private mode */ } }
    syncMeta();
    if (button) {
      button.textContent = t === 'dark' ? '☀ Light' : '☾ Dark';
      button.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }
    window.dispatchEvent(new Event('themeChange'));
  };
  apply(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', false);
  button?.addEventListener('click', () => apply(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true));
}
