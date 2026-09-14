/* ================================================================
   data/cses.js — CSES Problem Set progress
   ----------------------------------------------------------------
   This is the ONLY source of truth for the highlighted boxes in the
   CSES table (#csesHeatmap) below the activity heatmap. It's plain
   manual data — CSES has no public API for per-user solved status,
   so nothing here is fetched automatically.

   Just list every task ID you've solved, e.g.:
     window.DATA_CSES_SOLVED = [1068, 1083, 1069, 1094, ...];

   HOW TO GET YOUR IDs:
   Log into https://cses.fi, open your progress page
   (https://cses.fi/problemset/user/<your-id>), open devtools
   console, and run the export snippet (cses-export-snippet.js) —
   it prints and copies your solved task IDs, ready to paste below.
   If it comes back empty or wrong, right-click one solved row →
   Inspect, and adjust the snippet's selector to match.

   The order of IDs doesn't matter, and IDs not in the official
   400-problem set (main.js → CSES_PROBLEMSET) are just ignored.
   ================================================================ */

window.DATA_CSES_SOLVED = [
  // 1068, 1083, 1069, 1094, 1070,   <- example: paste your real IDs here
  1068, 1083, 1069, 1094, 1070, 1071, 1072, 1092, 1617, 1618, 1754, 1755, 2205, 2165, 1622, 1623, 1621, 1084, 1090, 1091, 1629, 1640, 1141, 1073, 1163, 1164, 1620, 1630, 1662, 2428, 1632, 2164, 1095, 1712, 1146, 3191, 2183
];
