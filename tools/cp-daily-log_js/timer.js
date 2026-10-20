/* Active card: idle -> running -> (stop) finishing modal. No pause. Cancel discards. */
CP.timer = {
  iv: null,
  render() {
    const a = CP.state.active, box = document.getElementById("active"); clearInterval(this.iv);
    if (!a) {
      box.innerHTML = `<div class="card"><h3>New problem</h3><div class="row"><textarea id="tTitle" rows="2" autofocus autocomplete="off" spellcheck="false" placeholder="Type anything, e.g. Problem 4 frog jump: https://leetcode.com/problems/frog-jump/  (Enter = start, Shift+Enter = new line)" style="flex:1;min-width:220px"></textarea><button id="tStart" class="btn primary">Start</button></div><p id="tHint" class="hint"></p><p id="tErr" class="err"></p></div>`;
      document.getElementById("tStart").onclick = () => {
        const t = document.getElementById("tTitle").value.trim();
        if (!t) return void (document.getElementById("tErr").textContent = "Type a name or paste a link first.");
        CP.state.active = { title: t, start: Date.now(), stop: null }; CP.save(); CP.timer.render();
      };
      const inp = document.getElementById("tTitle");
      const hint = () => { const l = CP.links(inp.value)[0]; document.getElementById("tHint").innerHTML = l ? "🔗 Problem link detected: <a href=\"" + CP.esc(l.url) + "\" target=\"_blank\" rel=\"noopener\">" + CP.esc(l.text) + "</a>" : ""; };
      inp.oninput = hint;
      inp.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); document.getElementById("tStart").click() } };
      inp.onpaste = () => setTimeout(() => { inp.value = inp.value.trim(); hint() });   /* clean stray spaces/newlines from copied links */
      if (document.getElementById("modal").classList.contains("hidden")) inp.focus();
    } else if (!a.stop) {
      box.innerHTML = `<div class="card"><h3 class="ptitle">${CP.linkify(a.title)}</h3><div class="timer" id="tClock"></div><div class="row"><button id="tStop" class="btn primary">Stop</button><button id="tCancel" class="btn danger">Cancel</button></div></div>`;
      const tick = () => document.getElementById("tClock").textContent = CP.hms(Date.now() - a.start); tick(); this.iv = setInterval(tick, 500);
      document.getElementById("tStop").onclick = () => { a.stop = Date.now(); CP.save(); CP.timer.render(); CP.entries.openModal() };
      document.getElementById("tCancel").onclick = () => { if (confirm("Cancel this timer? Nothing will be saved.")) { CP.state.active = null; CP.save(); CP.timer.render() } };
    } else {
      box.innerHTML = `<div class="card"><h3 class="ptitle">${CP.linkify(a.title)}</h3><p>Timer stopped at ${CP.hms(a.stop - a.start)}. Finish the entry to continue.</p><button class="btn primary" id="tReopen">Open entry form</button></div>`;
      document.getElementById("tReopen").onclick = () => CP.entries.openModal();
    }
  }
};

/* Paste fallback: Ctrl+V anywhere on the page (outside other fields) drops the link into the new-problem box */
document.addEventListener("paste", e => {
  const t = e.target;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || t.id === "mDrop") return;
  const box = document.getElementById("tTitle");
  if (!box || !document.getElementById("modal").classList.contains("hidden")) return;
  const txt = ((e.clipboardData && e.clipboardData.getData("text")) || "").trim();
  if (!txt) return;
  e.preventDefault(); box.value = txt; box.focus(); box.dispatchEvent(new Event("input"));
});