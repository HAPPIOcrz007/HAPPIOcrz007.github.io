/* loader.js — fetches tools/tools_1.md, tools_2.md … until the first missing number, appending a card for each. */

import { $ } from './dom.js';
import { parse } from './parse.js';
import { card } from './card.js';

export async function loadTools() {
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
