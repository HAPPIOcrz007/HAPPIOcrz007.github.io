/* Completion modal + locked entry callouts */
CP.entries = {
  draft: null,
  openModal() {
    const a = CP.state.active, m = document.getElementById("modal");
    const d = this.draft = this.draft || { shot: null, diff: null, tags: [], notes: "", imgs: {}, n: 0 };
    m.classList.remove("hidden");
    m.innerHTML = `<div class="box"><h3 class="ptitle">${CP.linkify(a.title)} — ${CP.hms(a.stop - a.start)}</h3>
    <div class="drop" id="mDrop" tabindex="0">${d.shot ? `<img src="${d.shot}" alt="">` : "Click here, then paste your completion screenshot (Ctrl/Cmd+V)"}</div>
    <div class="diff"><b>Difficulty*</b> ${["easy", "medium", "hard"].map(k => `<label><input type="radio" name="df" value="${k}" ${d.diff === k ? "checked" : ""} style="width:auto"> <span class="badge ${k}">${k}</span></label>`).join("")}</div>
    <div><b>Tags*</b><br>${CP.TAGS.map(t => `<span class="tag ${d.tags.includes(t) ? "on" : ""}" data-t="${t}">${t}</span>`).join("")}
      <div class="row" style="margin-top:.3rem"><input id="mCustom" placeholder="Custom tag, press Enter" style="max-width:220px"></div></div>
    <div><b>Notes</b> <small>(markdown; paste images; code blocks highlight for C++, Python, JS, Java, Rust)</small>
      <div class="toolbar"><select id="mLang"><option value="cpp">C++</option><option value="python">Python</option><option value="js">JavaScript</option><option value="java">Java</option><option value="rust">Rust</option></select>
      <button type="button" class="btn" id="mCode">Insert code block</button><button type="button" class="btn ghost" id="mPreview">Preview</button></div>
      <textarea id="mNotes">${CP.esc(d.notes)}</textarea><div class="preview md hidden" id="mPrev"></div></div>
    <p class="err" id="mErr"></p>
    <div class="row"><button class="btn primary" id="mSubmit">Submit &amp; lock</button><button class="btn danger" id="mDiscard">Discard entry</button></div></div>`;
    const drop = document.getElementById("mDrop"), notes = document.getElementById("mNotes");
    drop.focus();
    drop.onpaste = e => { const f = CP.imageFrom(e); if (!f) return; e.preventDefault(); CP.readImage(f, u => { d.shot = u; drop.innerHTML = `<img src="${u}" alt="">` }) };
    notes.oninput = () => d.notes = notes.value;
    const prev = document.getElementById("mPrev");
    document.getElementById("mPreview").onclick = function () {
      const show = prev.classList.contains("hidden");
      prev.classList.toggle("hidden", !show); notes.classList.toggle("hidden", show);
      if (show) prev.innerHTML = CP.md(d.notes, d.imgs); this.textContent = show ? "Edit" : "Preview"
    };
    document.getElementById("mCode").onclick = () => {
      const l = document.getElementById("mLang").value, p = notes.selectionStart;
      notes.value = notes.value.slice(0, p) + "\n```" + l + "\n\n```\n" + notes.value.slice(notes.selectionEnd);
      notes.focus(); notes.selectionStart = notes.selectionEnd = p + l.length + 5; d.notes = notes.value
    };
    notes.onkeydown = e => {
      if (e.key !== "Tab") return; const p = notes.selectionStart;
      if ((notes.value.slice(0, p).match(/```/g) || []).length % 2 !== 1) return; /* Tab only indents inside a code block */
      e.preventDefault(); notes.value = notes.value.slice(0, p) + "    " + notes.value.slice(notes.selectionEnd);
      notes.selectionStart = notes.selectionEnd = p + 4; d.notes = notes.value
    };
    notes.onpaste = e => {
      const f = CP.imageFrom(e); if (!f) return; e.preventDefault(); CP.readImage(f, u => {
        const k = "img" + (++d.n); d.imgs[k] = u;
        const p = notes.selectionStart; notes.value = notes.value.slice(0, p) + `\n![shot](${k})\n` + notes.value.slice(p); d.notes = notes.value
      })
    };
    m.querySelectorAll("[name=df]").forEach(r => r.onchange = () => d.diff = r.value);
    const bindTags = () => m.querySelectorAll(".tag").forEach(el => el.onclick = () => { const t = el.dataset.t; d.tags = d.tags.includes(t) ? d.tags.filter(x => x !== t) : [...d.tags, t]; el.classList.toggle("on") }); bindTags();
    document.getElementById("mCustom").onkeydown = e => {
      if (e.key !== "Enter") return; const t = e.target.value.trim(); if (!t) return;
      if (!d.tags.includes(t)) d.tags.push(t); if (!CP.TAGS.includes(t)) CP.TAGS.push(t); this.openModal()
    };
    document.getElementById("mDiscard").onclick = () => { if (confirm("Discard this problem entry?")) { this.close(true) } };
    document.getElementById("mSubmit").onclick = () => {
      const err = []; if (!d.shot) err.push("completion screenshot"); if (!d.diff) err.push("difficulty"); if (!d.tags.length) err.push("at least one tag");
      if (err.length) return void (document.getElementById("mErr").textContent = "Required: " + err.join(", ") + ".");
      CP.state.entries.push({ id: Date.now(), title: a.title, start: a.start, end: a.stop, dur: a.stop - a.start, diff: d.diff, tags: d.tags, shot: d.shot, notes: d.notes, imgs: d.imgs });
      this.close(true);
    };
  },
  close(clear) {
    document.getElementById("modal").classList.add("hidden");
    if (clear) {
      this.draft = null; CP.state.active = null; CP.save(); CP.render(); CP.timer.render();
      const t = document.getElementById("tTitle"); if (t) t.focus()
    }
  },
  html(en, i) {
    const link = CP.linkify(en.title);
    return `<article class="card entry d-${en.diff}"><header><h3 class="ptitle">#${i + 1} ${link}</h3><span class="lock">🔒 locked</span></header>
    <div class="meta">${CP.clock(en.start)} – ${CP.clock(en.end)} · ${CP.hms(en.dur)}</div>
    <div><span class="badge ${en.diff}">${en.diff}</span>${en.tags.map(t => `<span class="tag">${CP.esc(t)}</span>`).join("")}</div>
    <img class="shot" src="${en.shot}" alt="Completion screenshot">
    ${en.notes ? `<div class="md">${CP.md(en.notes, en.imgs)}</div>` : ""}</article>`;
  }
};