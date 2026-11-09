/* state.js — constants, shared state and tiny helpers. LOADS FIRST. */
const API = "https://codeforces.com/api/";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let rows = [], subDay = new Map(), solvedDay = new Map(), sortKey = "time", sortDir = -1, ratingSel = null, curHandle = "";

/* pie-chart slice colors: accent first, then the theme's secondary colors */
const PIE = ["#7c5cff", "#22d3ee", "#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#fb923c", "#a3e635", "#8a8a94"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* problem-table columns: [row key, header label] */
const cols = [["status", "Status"], ["name", "Problem"], ["rating", "Rating"], ["tags", "Tags"], ["contestName", "Contest"], ["type", "Type"], ["div", "Division / stars"], ["tries", "Attempts"], ["solvedAt", "Solved on"], ["time", "Last activity"]];
