/* theme.js — follow the OS theme, then remember the toggle for this visit. */
const root = document.documentElement;
function setTheme(t) {
  root.dataset.theme = t; $("tb2").textContent = t === "dark" ? "☀" : "☾";
  /* chart colors are read from CSS tokens, so redraw the pie for the new theme */
  if (typeof renderPie === "function" && rows.length) renderPie();
}
setTheme(matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
$("tb2").onclick = () => setTheme(root.dataset.theme === "dark" ? "light" : "dark");
