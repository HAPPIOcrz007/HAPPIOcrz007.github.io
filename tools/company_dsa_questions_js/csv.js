/* Minimal CSV parser: handles quoted fields with commas/newlines. Returns objects keyed by header. */
window.CSV = {
  parse(text) {
    text = text.replace(/^\uFEFF/, '');
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); f = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    const h = (rows.shift() || []).map(s => s.trim());
    return rows.map(r => Object.fromEntries(h.map((k, i) => [k, r[i] || ''])));
  }
};
