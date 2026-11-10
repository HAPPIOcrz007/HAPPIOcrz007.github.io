/* state.js — constants, shared state and tiny helpers. LOADS FIRST. */
const API = "https://codeforces.com/api/";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let rows = [], subDay = new Map(), solvedDay = new Map(), sortKey = "time", sortDir = -1, ratingSel = null, curHandle = "";

/* pie-chart slice colors come from the CSS tokens --chart-1 … --chart-9
   (assets/css/styles_css/tokens/colors.css), read fresh for the active theme */
const chartColors = () => {
  const cs = getComputedStyle(document.documentElement);
  return Array.from({ length: 9 }, (_, i) => cs.getPropertyValue("--chart-" + (i + 1)).trim() || "#7c5cff");
};
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* problem-table columns: [row key, header label] */
const cols = [["status", "Status"], ["name", "Problem"], ["rating", "Rating"], ["tags", "Tags"], ["contestName", "Contest"], ["type", "Type"], ["div", "Division / stars"], ["tries", "Attempts"], ["solvedAt", "Solved on"], ["time", "Last activity"]];
