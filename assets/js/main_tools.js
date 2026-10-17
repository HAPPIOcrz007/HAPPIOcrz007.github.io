/* main_tools.js — tools page (index_tools.html), distributor only. Lives next to main.js.
   Cards come from tools/tools_<n>.md (n = 1, 2, 3 …, no gaps) with the
   image at assets/images/tools_<n>.png. Loading stops at the first missing
   tools_<n>.md, so just add the next number to add a tool.

   Load from index_tools.html as:
     <script type="module" src="assets/js/main_tools.js"></script>
   Pieces live in main_tools_js/: dom, theme, parse, card, loader. */
import { initTheme } from './main_tools_js/theme.js';
import { loadTools } from './main_tools_js/loader.js';

initTheme();
loadTools();
