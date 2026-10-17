/* parse.js — reads one tools/tools_<n>.md file into { title, desc, tags, link, date }. */

/* tools_<n>.md: "key: value" lines, then a blank line, then optional text */
export function parse(txt) {
  const [head, ...rest] = txt.replace(/\r/g, "").split(/\n\s*\n/);
  const meta = {};
  head.split("\n").forEach(l => { const m = l.match(/^(\w+):\s*(.*)$/); if (m) meta[m[1].toLowerCase()] = m[2].trim(); });
  const body = rest.join("\n\n").trim();
  return { title: meta.title || "Untitled tool", desc: meta.description || body.split(/\n\s*\n/)[0] || "",
    tags: (meta.tags || "").split(",").map(t => t.trim()).filter(Boolean), link: meta.link || "", date: meta.date || "" };
}
