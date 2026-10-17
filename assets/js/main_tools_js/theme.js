/* theme.js — dark/light toggle + footer year for the tools page. */

import { $ } from './dom.js';

export function initTheme() {
  /* theme: same toggle as the main page (assumes localStorage key "theme") */
  const root = document.documentElement, KEY = "theme";
  const setTheme = (t, save) => {
    root.dataset.theme = t;
    $("themeBtn").textContent = t === "dark" ? "☾" : "☀";
    if (save) try { localStorage.setItem(KEY, t); } catch (e) {}
  };
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  setTheme(saved || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
  $("themeBtn").addEventListener("click", () => setTheme(root.dataset.theme === "dark" ? "light" : "dark", true));
  $("footerYear").textContent = new Date().getFullYear();
}
