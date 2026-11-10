/* report.js — print report: always printed in the light theme, whatever the screen theme is. */
let prevTheme = null;

function renderRep() {
  $("rep").innerHTML = `<div class="eyebrow">// codeforces report</div><h1>${esc(curHandle)}</h1><p class="sub">Generated ${new Date().toLocaleString()} · ${rows.length} problems · ${rows.filter(r => r.solved).length} solved</p>`;
}

window.addEventListener("beforeprint", () => { prevTheme = root.dataset.theme; setTheme("light"); renderRep() });
window.addEventListener("afterprint", () => { if (prevTheme) setTheme(prevTheme); prevTheme = null });
$("pr").onclick = () => window.print();
