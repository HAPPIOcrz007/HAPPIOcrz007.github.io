/* Shared state + helpers (global CP namespace) */
const CP = {
  KEY: "cp-log-v1",
  TAGS: ["Array", "String", "Math", "Greedy", "DP", "Graphs", "Trees", "Binary Search", "Sorting", "Two Pointers", "Implementation", "Bit Manipulation", "Hashing", "DSU", "Number Theory", "Stack/Queue"],
  DIFF: { easy: 1, medium: 2, hard: 3 },
  state: { profile: { name: "", cf: "", lc: "" }, entries: [], active: null, stats: {} },
  load() { try { Object.assign(this.state, JSON.parse(localStorage.getItem(this.KEY) || "{}")) } catch (e) { } },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.state)) } catch (e) { alert("Browser storage is full. Print your report, then start a new day.") } },
  esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])) },
  hms(ms) { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return [h, m, s % 60].map(n => String(n).padStart(2, "0")).join(":") },
  clock(t) { return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
  /* downscale pasted images so localStorage stays usable */
  readImage(file, cb) {
    const r = new FileReader();
    r.onload = () => {
      const im = new Image(); im.onload = () => {
        const k = Math.min(1, 1100 / im.width), c = document.createElement("canvas");
        c.width = im.width * k; c.height = im.height * k; c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        cb(c.toDataURL("image/jpeg", .8));
      }; im.src = r.result;
    };
    r.readAsDataURL(file);
  },
  imageFrom(e) { const it = [...(e.clipboardData || { items: [] }).items].find(i => i.type.startsWith("image/")); return it && it.getAsFile() }
};
/* Finds problem links anywhere inside free text (full URLs, www., or common judge domains without https) */
CP.LINK = /(?:https?:\/\/|www\.|\b(?:leetcode|codeforces|atcoder|codechef|hackerrank|geeksforgeeks|spoj|hackerearth|kattis)\.(?:com|jp|org|io)\b|\bcses\.fi\b)[^\s<>"]*/gi;
CP.links = t => { const out = []; String(t).replace(CP.LINK, (m, i) => { const u = m.replace(/[.,;:!?)\]'"]+$/, ""); out.push({ text: u, index: i, url: /^https?:/i.test(u) ? u : "https://" + u }) }); return out };
CP.linkify = t => {
  t = String(t); let out = "", last = 0;
  for (const l of CP.links(t)) { out += CP.esc(t.slice(last, l.index)) + `<a class="plink" href="${CP.esc(l.url)}" target="_blank" rel="noopener">${CP.esc(l.text)}</a>`; last = l.index + l.text.length }
  return out + CP.esc(t.slice(last))
};
CP.load(); CP.state.stats = CP.state.stats || {};