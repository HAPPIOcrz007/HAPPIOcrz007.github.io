/* exam_js/md-editor.js — markdown editor used for questions, options and answers.

   const ed = createMarkdownEditor({ value, onChange, usedIds, allowImages, compact, rows, label });
   container.append(ed.el);   ed.getValue();   ed.setValue(text);   ed.focus();

   · Toolbar: bold, italic, underline, colour, code, link, list, table, callout, code block
   · Slash menu: type "/" at the start of a line → /table /callout /code /h1 … (↑ ↓ Enter / Tab, Esc)
       /table   asks for an id, a name and the size, then inserts a :::table{…} block
       /callout asks for an id, a name and a colour, then inserts a ::::callout{…} block
   · Images: toolbar "Image", /image, paste or drag-drop — only when `assets` (the paper's image store) is passed.
       Uploaded images are shrunk, stored in `assets` and inserted as ![alt|60%](img:i1).
   · "H" cycles the line's heading level (none → # → ## → ###); colour headings with the "A" button.
   · Write / Preview / Split views (Split only in the full editor)
   · Ctrl/Cmd + B, I, U, K · Enter continues a list · edits go through the browser's undo stack
   · usedIds(): optional, returns ids already taken elsewhere in the paper so table/callout ids
     stay unique across questions. */

import { renderMarkdown, collectBlockIds, enhanceCodeBlocks, COLOR_NAMES } from './markdown.js';
import { CALLOUT_COLORS, CODE_LANGS } from './format.js';
import { compressImage, nextAssetId, totalAssetBytes } from './images.js';

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach((c) => c != null && n.append(c));
  return n;
};
const tokenOf = (name) => ({ accent: '--green', muted: '--text-muted', dim: '--text-dim' }[name] || `--${name}`);

/* Pixel position of the caret inside a textarea (mirror-div technique) — places the slash menu. */
function caretXY(ta) {
  const cs = getComputedStyle(ta);
  const mirror = el('div');
  for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'padding', 'borderWidth',
    'boxSizing', 'width', 'tabSize']) mirror.style[p] = cs[p];
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', wordWrap: 'break-word', top: '0', left: '0' });
  mirror.textContent = ta.value.slice(0, ta.selectionStart);
  const mark = el('span', { text: '\u200b' });
  mirror.append(mark);
  document.body.append(mirror);
  const xy = { x: mark.offsetLeft, y: mark.offsetTop, lh: parseFloat(cs.lineHeight) || 20 };
  mirror.remove();
  return xy;
}

export function createMarkdownEditor(opts = {}) {
  const {
    value = '', rows = 4, onChange = () => {}, usedIds = () => [], allowImages = true,
    compact = false, assets = null, onAssets = () => {}, label = 'Markdown editor', placeholder = 'Write in markdown…  type / for tables, callouts, code',
  } = opts;

  const ta = el('textarea', { class: 'mde-input', rows, placeholder, spellcheck: 'true', 'aria-label': label });
  ta.value = value;
  const slash = el('ul', { class: 'mde-slash', role: 'listbox', hidden: true });
  const writePane = el('div', { class: 'mde-write' }, ta, slash);
  const preview = el('div', { class: 'mde-preview exam-md', hidden: true });
  const panes = el('div', { class: 'mde-panes' }, writePane, preview);
  const pop = el('div', { class: 'mde-pop', hidden: true, role: 'dialog' });
  enhanceCodeBlocks(preview);

  /* ---------- editing primitives ---------- */
  function autosize() {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight + 2, Math.round(window.innerHeight * 0.6)) + 'px';
  }
  function changed() { autosize(); onChange(ta.value); schedulePreview(); }
  function replaceRange(start, end, text, selStart = start + text.length, selEnd = selStart) {
    ta.focus();
    ta.setSelectionRange(start, end);
    let done = false;
    try { done = !!document.execCommand && document.execCommand(text === '' ? 'delete' : 'insertText', false, text); } catch { /* fall back */ }
    if (!done) ta.setRangeText(text, start, end, 'end');
    ta.setSelectionRange(selStart, selEnd);
    changed();
  }
  function wrap(before, after, placeholderText = 'text') {
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = ta.value.slice(s, e) || placeholderText;
    replaceRange(s, e, before + sel + after, s + before.length, s + before.length + sel.length);
  }
  function prefixLines(fn) {
    const v = ta.value;
    const s = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    let e = v.indexOf('\n', ta.selectionEnd);
    if (e < 0) e = v.length;
    const block = v.slice(s, e).split('\n').map(fn).join('\n');
    replaceRange(s, e, block, s, s + block.length);
  }
  /* Insert a block on its own lines, then select `sel` inside it so the setter can type over it. */
  function insertBlock(text, sel) {
    const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    const before = v.slice(0, s), after = v.slice(e);
    const pre = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const post = !after ? '' : after.startsWith('\n') ? '\n' : '\n\n';
    const at = s + pre.length + (sel ? text.indexOf(sel) : text.length);
    replaceRange(s, e, pre + text + post, at, at + (sel ? sel.length : 0));
  }
  const nextId = (prefix) => {
    const used = new Set([...collectBlockIds(ta.value).map((b) => b.id), ...usedIds()]);
    let n = 1;
    while (used.has(prefix + n)) n++;
    return prefix + n;
  };
  const idProblem = (id) => {
    if (!/^[A-Za-z][\w-]*$/.test(id)) return 'Id must start with a letter and use only letters, digits, - or _.';
    const used = new Set([...collectBlockIds(ta.value).map((b) => b.id), ...usedIds()]);
    return used.has(id) ? `The id "${id}" is already used.` : '';
  };
  const cleanName = (s) => s.replace(/["\n]/g, '').trim();

  /* ---------- popover forms ---------- */
  function closePop() { pop.hidden = true; pop.replaceChildren(); ta.focus(); }
  function openForm({ title, fields, onSubmit }) {
    closeSlash();
    const vals = {}, controls = {};
    const err = el('p', { class: 'mde-pop-err', role: 'alert' });
    const rowsEls = fields.map((f) => {
      vals[f.key] = f.value;
      let control;
      if (f.type === 'swatches') {
        control = el('div', { class: 'mde-swatches', role: 'radiogroup', 'aria-label': f.label });
        for (const o of f.options) {
          const b = el('button', {
            type: 'button', role: 'radio', class: 'mde-swatch', title: o.label, 'aria-label': o.label,
            style: `--sw:var(${o.token})`, 'aria-checked': String(o.id === vals[f.key]),
            onclick: () => {
              vals[f.key] = o.id;
              control.querySelectorAll('.mde-swatch').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
            },
          });
          control.append(b);
        }
      } else if (f.type === 'select') {
        control = el('select', { class: 'mde-field' }, f.options.map((o) => el('option', { value: o.id, text: o.label })));
        control.value = f.value;
        control.addEventListener('change', () => { vals[f.key] = control.value; });
      } else {
        control = el('input', { class: 'mde-field', type: f.type || 'text', value: f.value ?? '', min: f.min, max: f.max, autocomplete: 'off', spellcheck: 'false' });
        control.addEventListener('input', () => { vals[f.key] = control.value; });
      }
      controls[f.key] = control;
      return el('label', { class: 'mde-row' }, el('span', { text: f.label }), control);
    });
    const form = el('form', { class: 'mde-form' },
      el('h4', { text: title }), rowsEls, err,
      el('div', { class: 'mde-form-actions' },
        el('button', { type: 'button', class: 'mde-ghost', text: 'Cancel', onclick: closePop }),
        el('button', { type: 'submit', class: 'mde-primary', text: 'Insert' })));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = onSubmit(vals);
      if (msg) { err.textContent = msg; return; }
      closePop();
    });
    form.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePop(); } });
    pop.replaceChildren(form);
    pop.hidden = false;
    const first = form.querySelector('input,select');
    if (first) { first.focus(); if (first.select) first.select(); }
  }

  function openTableForm() {
    openForm({
      title: 'Insert table',
      fields: [
        { key: 'id', label: 'Table id', value: nextId('t') },
        { key: 'name', label: 'Table name', value: '' },
        { key: 'cols', label: 'Columns', type: 'number', value: 3, min: 1, max: 8 },
        { key: 'rows', label: 'Rows (without header)', type: 'number', value: 3, min: 1, max: 20 },
      ],
      onSubmit: (v) => {
        const id = v.id.trim(), p = idProblem(id);
        if (p) return p;
        const cols = Math.min(8, Math.max(1, parseInt(v.cols, 10) || 3));
        const nrows = Math.min(20, Math.max(1, parseInt(v.rows, 10) || 3));
        const row = (f) => '| ' + Array.from({ length: cols }, (_, c) => f(c)).join(' | ') + ' |';
        const header = row((c) => `Col ${c + 1}`);
        const body = Array.from({ length: nrows }, () => row(() => ' ')).join('\n');
        insertBlock(`:::table{id=${id} name="${cleanName(v.name)}"}\n${header}\n${row(() => '---')}\n${body}\n:::`, 'Col 1');
        return '';
      },
    });
  }
  function openCalloutForm() {
    openForm({
      title: 'Insert callout',
      fields: [
        { key: 'id', label: 'Callout id', value: nextId('c') },
        { key: 'name', label: 'Callout name', value: 'Note' },
        { key: 'color', label: 'Colour', type: 'swatches', value: 'info', options: CALLOUT_COLORS },
      ],
      onSubmit: (v) => {
        const id = v.id.trim(), p = idProblem(id);
        if (p) return p;
        insertBlock(`::::callout{id=${id} name="${cleanName(v.name) || 'Note'}" color=${v.color}}\nWrite here…\n::::`, 'Write here…');
        return '';
      },
    });
  }
  function openCodeForm() {
    openForm({
      title: 'Insert code block',
      fields: [{ key: 'lang', label: 'Language', type: 'select', value: 'python',
        options: [...CODE_LANGS.filter((l) => l.id !== 'other'), { id: '', label: 'Plain text' }] }],
      onSubmit: (v) => { insertBlock('```' + v.lang + '\n\n```', null); ta.setSelectionRange(ta.selectionStart - 4, ta.selectionStart - 4); return ''; },
    });
  }
  function openColorPop() {
    closeSlash();
    const apply = (c) => { closePop(); wrap(`=(${c})`, '=', 'coloured text'); };
    const hex = el('input', { type: 'color', class: 'mde-hex', value: '#7c5cff', 'aria-label': 'Custom colour' });
    hex.addEventListener('change', () => apply(hex.value));
    pop.replaceChildren(el('div', { class: 'mde-form' },
      el('h4', { text: 'Text colour' }),
      el('div', { class: 'mde-swatches' }, COLOR_NAMES.map((n) =>
        el('button', { type: 'button', class: 'mde-swatch', title: n, 'aria-label': n, style: `--sw:var(${tokenOf(n)})`, onclick: () => apply(n) }))),
      el('label', { class: 'mde-row' }, el('span', { text: 'Custom (won’t follow the theme)' }), hex)));
    pop.hidden = false;
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); }, { once: true });
  }
  function insertLink() {
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = ta.value.slice(s, e) || 'link text';
    const url = 'https://';
    const at = s + sel.length + 3;
    replaceRange(s, e, `[${sel}](${url})`, at, at + url.length);
  }

  /* ---------- images ---------- */
  async function uploadImages(files) {
    if (!assets) return;
    for (const f of files) {
      try {
        const uri = await compressImage(f);
        const id = nextAssetId(assets);
        assets[id] = uri;
        const alt = f.name.replace(/\.[^.]+$/, '').replace(/[\[\]|]/g, ' ').trim() || 'image';
        const s0 = ta.selectionStart, e0 = ta.selectionEnd;
        replaceRange(s0, e0, `![${alt}](img:${id})`);
        onAssets(id);
        const mb = totalAssetBytes(assets) / 1048576;
        if (mb > 6) toast_(`Images in this paper now total ${mb.toFixed(1)} MB — consider fewer or smaller images.`);
      } catch (e) { toast_(e.message || 'Could not add that image.'); }
    }
  }
  const toast_ = (m) => { const n = el('p', { class: 'mde-pop-err', role: 'alert', text: m }); pop.replaceChildren(el('div', { class: 'mde-form' }, n, el('button', { type: 'button', class: 'mde-ghost', text: 'OK', onclick: closePop }))); pop.hidden = false; };
  function pickImage() {
    const i = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: true });
    i.addEventListener('change', () => uploadImages([...i.files]));
    i.click();
  }
  const imgFiles = (dt) => [...(dt?.files || [])].filter((f) => f.type.startsWith('image/'));
  ta.addEventListener('paste', (e) => { const f = assets && imgFiles(e.clipboardData); if (f && f.length) { e.preventDefault(); uploadImages(f); } });
  ta.addEventListener('dragover', (e) => { if (assets && [...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  ta.addEventListener('drop', (e) => { const f = assets && imgFiles(e.dataTransfer); if (f && f.length) { e.preventDefault(); uploadImages(f); } });
  function cycleHeading() {
    prefixLines((l) => {
      const m = l.match(/^(#{1,3}) (.*)$/);
      if (!m) return '# ' + l;
      return m[1].length === 3 ? m[2] : '#'.repeat(m[1].length + 1) + ' ' + m[2];
    });
  }

  /* ---------- slash menu ---------- */
  const COMMANDS = [
    { key: 'table', label: 'Table', hint: 'with id and name', run: openTableForm },
    { key: 'callout', label: 'Callout', hint: 'coloured box with id and name', run: openCalloutForm },
    { key: 'code', label: 'Code block', hint: 'syntax highlighted', run: openCodeForm },
    { key: 'h1', label: 'Heading 1', run: () => prefixLines((l) => '# ' + l) },
    { key: 'h2', label: 'Heading 2', run: () => prefixLines((l) => '## ' + l) },
    { key: 'h3', label: 'Heading 3', run: () => prefixLines((l) => '### ' + l) },
    { key: 'bullet', label: 'Bullet list', run: () => prefixLines((l) => '- ' + l) },
    { key: 'numbered', label: 'Numbered list', run: () => prefixLines((l, i) => `${i + 1}. ${l}`) },
    { key: 'quote', label: 'Quote', run: () => prefixLines((l) => '> ' + l) },
    ...(assets ? [{ key: 'image', label: 'Image', hint: 'upload from your device', run: pickImage }] : []),
    { key: 'divider', label: 'Divider', run: () => insertBlock('---', null) },
    { key: 'color', label: 'Colour text', hint: '=(ok)text=', run: openColorPop },
    { key: 'underline', label: 'Underline', hint: '<u>text</u>', run: () => wrap('<u>', '</u>') },
    { key: 'link', label: 'Link', run: insertLink },
  ];
  let sItems = [], sIndex = 0, sStart = 0;
  const slashOpen = () => !slash.hidden;
  function closeSlash() { slash.hidden = true; sItems = []; }
  function paintSlash() {
    slash.replaceChildren(...sItems.map((c, i) => el('li', {
      role: 'option', class: 'mde-slash-item', 'aria-selected': String(i === sIndex),
      onmousedown: (e) => { e.preventDefault(); pickSlash(i); },
    }, el('b', { text: '/' + c.key }), el('span', { text: c.label }), c.hint ? el('small', { text: c.hint }) : null)));
    slash.children[sIndex]?.scrollIntoView({ block: 'nearest' });
  }
  function updateSlash() {
    const pos = ta.selectionStart;
    if (pos !== ta.selectionEnd) return closeSlash();
    const ls = ta.value.lastIndexOf('\n', pos - 1) + 1;
    const m = ta.value.slice(ls, pos).match(/^(\s*)\/(\w*)$/);
    if (!m) return closeSlash();
    const qs = m[2].toLowerCase();
    sItems = COMMANDS.filter((c) => c.key.startsWith(qs) || c.label.toLowerCase().includes(qs));
    if (!sItems.length) return closeSlash();
    sStart = ls + m[1].length;
    sIndex = Math.min(sIndex, sItems.length - 1);
    paintSlash();
    slash.hidden = false;
    const { x, y, lh } = caretXY(ta);
    slash.style.left = Math.max(0, Math.min(x, ta.clientWidth - slash.offsetWidth)) + 'px';
    slash.style.top = (y - ta.scrollTop + lh + 4) + 'px';
  }
  function pickSlash(i) {
    const cmd = sItems[i];
    if (!cmd) return;
    const pos = ta.selectionStart;
    closeSlash();
    replaceRange(sStart, pos, '');
    cmd.run();
  }

  /* ---------- keyboard ---------- */
  ta.addEventListener('keydown', (e) => {
    if (slashOpen()) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sIndex = (sIndex + (e.key === 'ArrowDown' ? 1 : -1) + sItems.length) % sItems.length;
        return paintSlash();
      }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return pickSlash(sIndex); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return closeSlash(); }
    }
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); return wrap('**', '**'); }
      if (k === 'i') { e.preventDefault(); return wrap('*', '*'); }
      if (k === 'u') { e.preventDefault(); return wrap('<u>', '</u>'); }
      if (k === 'k') { e.preventDefault(); return insertLink(); }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && ta.selectionStart === ta.selectionEnd) {
      const pos = ta.selectionStart, v = ta.value, ls = v.lastIndexOf('\n', pos - 1) + 1;
      const line = v.slice(ls, pos);
      const ul = line.match(/^(\s*)([-*+])\s+(.*)$/), ol = line.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
      const hit = ul || ol;
      if (hit) {
        e.preventDefault();
        const text = ul ? ul[3] : ol[4];
        if (!text.trim()) return replaceRange(ls, pos, '');
        const marker = ul ? `${ul[1]}${ul[2]} ` : `${ol[1]}${+ol[2] + 1}${ol[3]} `;
        replaceRange(pos, pos, '\n' + marker);
      }
    }
  });
  ta.addEventListener('input', () => { changed(); updateSlash(); });
  ta.addEventListener('click', updateSlash);
  ta.addEventListener('blur', () => setTimeout(closeSlash, 120));

  /* ---------- toolbar + modes ---------- */
  const tb = (text, title, run, cls = '') => el('button', {
    type: 'button', class: `mde-btn ${cls}`.trim(), title, 'aria-label': title, text,
    onmousedown: (e) => e.preventDefault(), onclick: run,
  });
  const sep = () => el('span', { class: 'mde-sep', 'aria-hidden': 'true' });
  const tools = [
    tb('B', 'Bold (Ctrl+B)', () => wrap('**', '**'), 'mde-b'),
    tb('I', 'Italic (Ctrl+I)', () => wrap('*', '*'), 'mde-i'),
    tb('U', 'Underline (Ctrl+U)', () => wrap('<u>', '</u>'), 'mde-u'),
    tb('A', 'Text colour', openColorPop, 'mde-c'),
    tb('</>', 'Inline code', () => wrap('`', '`', 'code')),
    tb('H', 'Heading level (click to cycle)', cycleHeading, 'mde-h'),
  ];
  if (!compact) {
    tools.push(tb('Link', 'Link (Ctrl+K)', insertLink), sep(),
      tb('• List', 'Bullet list', () => prefixLines((l) => '- ' + l)),
      tb('Table', 'Insert table', openTableForm),
      tb('Callout', 'Insert callout', openCalloutForm),
      tb('{ } Code', 'Insert code block', openCodeForm));
  }
  if (assets) tools.push(tb('Image', 'Upload an image', pickImage));
  let mode = 'write', timer = 0;
  const modeBtns = {};
  const setMode = (m) => {
    mode = m;
    writePane.hidden = m === 'preview';
    preview.hidden = m === 'write';
    panes.dataset.mode = m;
    for (const [k, b] of Object.entries(modeBtns)) b.setAttribute('aria-pressed', String(k === m));
    if (m !== 'write') renderPreview();
    else ta.focus();
  };
  const modes = compact ? ['write', 'preview'] : ['write', 'split', 'preview'];
  const modeBar = el('div', { class: 'mde-modes', role: 'group', 'aria-label': 'View' },
    modes.map((m) => (modeBtns[m] = el('button', {
      type: 'button', class: 'mde-mode', text: m[0].toUpperCase() + m.slice(1), onclick: () => setMode(m),
    }))));
  function renderPreview() {
    preview.innerHTML = ta.value.trim()
      ? renderMarkdown(ta.value, { images: allowImages, assets: assets || {} })
      : '<p class="mde-empty">Nothing to preview yet.</p>';
  }
  function schedulePreview() {
    if (mode === 'write') return;
    clearTimeout(timer);
    timer = setTimeout(renderPreview, 120);
  }

  const bar = el('div', { class: 'mde-bar', role: 'toolbar', 'aria-label': 'Formatting' }, tools, el('span', { class: 'mde-spacer' }), modeBar);
  const hint = el('p', { class: 'mde-hint', text: 'Markdown · / for blocks · <u>underline</u> · =(ok)colour=' });
  const root = el('div', { class: `mde${compact ? ' mde-compact' : ''}` }, bar, pop, panes, compact ? null : hint);
  setMode('write');
  queueMicrotask(autosize);

  return {
    el: root,
    textarea: ta,
    getValue: () => ta.value,
    setValue(v) { ta.value = v ?? ''; autosize(); schedulePreview(); },
    focus: () => ta.focus(),
    destroy() { clearTimeout(timer); root.remove(); },
  };
}
