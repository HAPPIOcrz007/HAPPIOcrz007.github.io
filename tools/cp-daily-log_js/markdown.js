/* Tiny markdown renderer with highlighted code fences.
   Image tokens like ![](img1) map to the entry's pasted images. */
CP.md = function (src, imgs) {
  imgs = imgs || {}; const e = CP.esc;
  const inline = t => e(t)
    .replace(/!\[[^\]]*\]\((img\d+)\)/g, (m, k) => imgs[k] ? `<img class="shot" src="${imgs[k]}" alt="">` : "")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\*([^*]+)\*/g, "<i>$1</i>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const block = (buf, lang) => `<pre class="code" data-lang="${CP.hl.norm(lang)}"><code>${CP.hl(buf.join("\n"), lang)}</code></pre>`;
  let out = "", code = null, lang = "", list = false;
  for (const line of src.split("\n")) {
    if (line.startsWith("```")) {
      if (code) { out += block(code, lang); code = null } else { code = []; lang = line.slice(3).trim() }
      continue;
    }
    if (code) { code.push(line); continue }
    const li = line.match(/^\s*[-*]\s+(.*)/);
    if (li) { out += (list ? "" : "<ul>") + `<li>${inline(li[1])}</li>`; list = true; continue }
    if (list) { out += "</ul>"; list = false }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    out += h ? `<h4>${inline(h[2])}</h4>` : line.trim() ? `<p>${inline(line)}</p>` : "";
  }
  if (code) out += block(code, lang);
  return out + (list ? "</ul>" : "");
};