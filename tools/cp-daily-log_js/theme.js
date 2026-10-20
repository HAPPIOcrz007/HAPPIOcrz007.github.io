CP.theme = {
  LIST: [["auto", "Auto (system)"], ["light", "Light"], ["dark", "Dark"], ["github-light", "GitHub Light"], ["github-dark", "GitHub Dark"], ["dracula", "Dracula"], ["monokai", "Monokai"], ["vscode-dark", "VS Code Dark"], ["vscode-light", "VS Code Light"]],
  pref: "auto", printing: false,
  apply() {
    if (this.printing) return;
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = this.pref === "auto" ? (dark ? "dark" : "light") : this.pref;
  },
  init() {
    const sel = document.getElementById("theme");
    sel.innerHTML = this.LIST.map(([v, n]) => `<option value="${v}">${n}</option>`).join("");
    let v = localStorage.getItem("cp-theme") || "auto";
    this.pref = this.LIST.some(t => t[0] === v) ? v : "auto";
    sel.value = this.pref; this.apply();
    sel.onchange = () => { this.pref = sel.value; localStorage.setItem("cp-theme", this.pref); this.apply() };
    /* Browsers report "light" while printing; ignore that so the chosen theme is kept */
    addEventListener("beforeprint", () => { this.printing = true });
    addEventListener("afterprint", () => { this.printing = false; this.apply() });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (this.pref === "auto" && !this.printing && !matchMedia("print").matches) this.apply()
    });
  }
};