/* exam_js/code-editor.js — a code box with live syntax highlighting.
   A transparent <textarea> sits on top of a highlighted <pre>; both wrap identically, so no scroll sync.

   const ed = createCodeEditor({ value, lang: 'python', langLabel, onChange, minLines });
   Tab indents (4 spaces, whole selection if several lines), Shift+Tab outdents, Enter keeps the
   indentation (one level deeper after : { ( [). Press Esc, then Tab, to leave the box with the keyboard. */

import { highlightInner } from './markdown.js';
import { CODE_LANGS } from './format.js';
import { el } from './ui.js';

const INDENT = '    ';

export function createCodeEditor({ value = '', lang = 'python', langLabel = '', onChange = () => {}, minLines = 8, label } = {}) {
  const def = CODE_LANGS.find((l) => l.id === lang);
  const key = def ? def.key : null;                       // null → "other": no highlighting
  const name = lang === 'other' ? (langLabel || 'Code') : (def ? def.label : lang);

  const code = el('code');
  const pre = el('pre', { class: 'ced-hl', 'aria-hidden': 'true' }, code);
  const ta = el('textarea', {
    class: 'ced-input', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off',
    'aria-label': label || `${name} code answer`, rows: minLines,
  });
  ta.value = value;
  const stage = el('div', { class: 'ced-stage', style: `--ced-min:${minLines}` }, pre, ta);

  function paint() {
    if (key) code.innerHTML = highlightInner(ta.value, key) + '\n';
    else code.textContent = ta.value + '\n';
  }
  function edit(start, end, text, selStart = start + text.length, selEnd = selStart) {
    ta.focus();
    ta.setSelectionRange(start, end);
    let done = false;
    try { done = !!document.execCommand && document.execCommand(text === '' ? 'delete' : 'insertText', false, text); } catch { /* fall back */ }
    if (!done) ta.setRangeText(text, start, end, 'end');
    ta.setSelectionRange(selStart, selEnd);
    paint(); onChange(ta.value);
  }
  const lineStart = (v, i) => v.lastIndexOf('\n', i - 1) + 1;

  let escaped = false;
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { escaped = true; return; }
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (escaped) { escaped = false; return; }           // let focus move on
      e.preventDefault();
      const v = ta.value, s = ta.selectionStart, en = ta.selectionEnd;
      const multi = v.slice(s, en).includes('\n');
      if (!multi && !e.shiftKey) return edit(s, en, INDENT);
      const a = lineStart(v, s);
      const b = en;
      const block = v.slice(a, b).split('\n');
      const out = block.map((l) => (e.shiftKey ? l.replace(/^( {1,4}|\t)/, '') : INDENT + l)).join('\n');
      return edit(a, b, out, a, a + out.length);
    }
    escaped = false;
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && ta.selectionStart === ta.selectionEnd) {
      e.preventDefault();
      const v = ta.value, p = ta.selectionStart, line = v.slice(lineStart(v, p), p);
      const indent = line.match(/^[ \t]*/)[0] + (/[:{(\[]\s*$/.test(line) ? INDENT : '');
      edit(p, p, '\n' + indent);
    }
  });
  ta.addEventListener('input', () => { paint(); onChange(ta.value); });
  paint();

  const root = el('div', { class: 'ced' },
    el('div', { class: 'ced-head' }, el('span', { class: 'ced-lang', text: name }), el('span', { class: 'ced-hint', text: 'Tab indents · Esc then Tab leaves the box' })),
    stage);
  return {
    el: root, textarea: ta,
    getValue: () => ta.value,
    setValue(v) { ta.value = v ?? ''; paint(); },
    focus: () => ta.focus(),
  };
}
