/* main_tools.js — tools page (index_tools.html). Lives next to main.js.
   Cards come from tools/tools_<n>.md (n = 1, 2, 3 …, no gaps) with the
   image at assets/images/tools_<n>.png. Loading stops at the first missing
   tools_<n>.md, so just add the next number to add a tool. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const md = s => esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

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

  /* tools_<n>.md: "key: value" lines, then a blank line, then optional text */
  function parse(txt) {
    const [head, ...rest] = txt.replace(/\r/g, "").split(/\n\s*\n/);
    const meta = {};
    head.split("\n").forEach(l => { const m = l.match(/^(\w+):\s*(.*)$/); if (m) meta[m[1].toLowerCase()] = m[2].trim(); });
    const body = rest.join("\n\n").trim();
    return { title: meta.title || "Untitled tool", desc: meta.description || body.split(/\n\s*\n/)[0] || "",
      tags: (meta.tags || "").split(",").map(t => t.trim()).filter(Boolean), link: meta.link || "", date: meta.date || "" };
  }

  function card(n, t) {
    const el = document.createElement(t.link ? "a" : "div");
    el.className = "project-card blog-card";
    if (t.link) { el.href = t.link; el.target = "_blank"; el.rel = "noopener noreferrer"; }
    el.innerHTML = `<div class="project-thumb"><img src="assets/images/tools_${n}.png" alt="${esc(t.title)} preview" loading="lazy" /></div>
<div class="project-body">
  <div class="project-date">${esc(t.date || "tool")}</div>
  <h3 class="project-title">${esc(t.title)}</h3>
  <p class="project-desc">${md(t.desc)}</p>
  <div class="tech-tags">${t.tags.map(x => `<span class="tech-tag">${esc(x)}</span>`).join("")}</div>
</div>`;
    el.querySelector("img").addEventListener("error", e => {
      e.target.parentNode.innerHTML = '<div class="project-thumb-empty">no preview</div>';
    });
    return el;
  }

  async function load() {
    const grid = $("toolsGrid");
    let n = 1, found = 0;
    for (; n <= 100; n++) {
      let r;
      try { r = await fetch(`tools/tools_${n}.md`, { cache: "no-cache" }); } catch (e) { break; }
      if (!r.ok) break;
      if (!found) grid.innerHTML = "";
      grid.appendChild(card(n, parse(await r.text())));
      found++;
    }
    if (!found) grid.innerHTML = '<div class="loading">No tools yet. Add tools/tools_1.md to create the first card.</div>';
  }
  load();
})();
