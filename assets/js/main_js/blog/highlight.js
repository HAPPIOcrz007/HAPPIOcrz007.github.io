/* blog/highlight.js — regex syntax highlighter + code-block HTML (language label, Copy button). */

import { escapeHtml } from '../utils.js';

/* ---------- Code blocks: syntax highlighting + language label + copy ---------- */
const HL_STR_DQ = String.raw`"(?:\\.|[^"\\\n])*"`;
const HL_STR_SQ = String.raw`'(?:\\.|[^'\\\n])*'`;
const HL_NUM = String.raw`\b0[xX][0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[a-zA-Z]{0,3}\b`;
const HL_CLIKE_COMMENT = String.raw`//[^\n]*|/\*[\s\S]*?\*/`;
const HL_FN = String.raw`\b[A-Za-z_]\w*(?=\s*\()`;
const reEsc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = (s) => s.trim().split(/\s+/);

const HL_LANGS = {
  cpp: {
    comment: HL_CLIKE_COMMENT, string: `${HL_STR_DQ}|${HL_STR_SQ}`,
    pre: true,
    kw: words('alignas alignof auto break case catch class const constexpr continue default delete do else enum explicit extern false final for friend goto if inline namespace new noexcept nullptr operator override private protected public register return sizeof static static_assert struct switch template this throw true try typedef typename union using virtual volatile while'),
    types: words('int long short char bool float double void unsigned signed size_t string vector map set multiset unordered_map unordered_set pair array deque queue stack priority_queue bitset int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t ll ull std cin cout cerr endl FILE NULL'),
  },
  js: {
    comment: HL_CLIKE_COMMENT, string: String.raw`${HL_STR_DQ}|${HL_STR_SQ}|` + '`(?:\\\\.|[^`\\\\])*`',
    kw: words('async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield true false null undefined'),
    types: words('Promise Array Object String Number Boolean Map Set Symbol console document window JSON Math Date Error RegExp'),
  },
  ts: {
    comment: HL_CLIKE_COMMENT, string: String.raw`${HL_STR_DQ}|${HL_STR_SQ}|` + '`(?:\\\\.|[^`\\\\])*`',
    kw: words('async await break case catch class const continue default delete do else enum export extends finally for from function if implements import in instanceof interface keyof let namespace new of private protected public readonly return static super switch this throw try type typeof var void while yield as abstract declare true false null undefined'),
    types: words('string number boolean any unknown never void object Promise Array Record Partial Map Set console JSON Math Date Error'),
  },
  python: {
    comment: String.raw`#[^\n]*`,
    string: String.raw`"""[\s\S]*?"""|'''[\s\S]*?'''|${HL_STR_DQ}|${HL_STR_SQ}`,
    extra: [['p', String.raw`^[ \t]*@[\w.]+`]],
    kw: words('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None'),
    types: words('print len range int str float list dict set tuple bool bytes input open sum min max abs enumerate zip map filter sorted reversed isinstance self cls'),
  },
  bash: {
    comment: String.raw`(?:^|[ \t])#[^\n]*`, string: `${HL_STR_DQ}|${HL_STR_SQ}`,
    extra: [['t', String.raw`\$\{?[A-Za-z_@#?$*0-9][\w]*\}?`]],
    kw: words('if then else elif fi for while until do done case esac in function select return exit break continue local export readonly declare unset source alias'),
    types: words('echo cd ls cat grep sed awk chmod chown mkdir rm cp mv sudo apt git make gcc g++ python python3 pip npm node curl wget tar ssh touch head tail find sort uniq wc xargs kill ps'),
  },
  json: {
    string: HL_STR_DQ, extra: [['t', String.raw`"(?:\\.|[^"\\\n])*"(?=\s*:)`, true]],
    kw: words('true false null'), noFn: true,
  },
  html: {
    comment: String.raw`<!--[\s\S]*?-->`, string: `${HL_STR_DQ}|${HL_STR_SQ}`,
    extra: [['k', String.raw`</?[A-Za-z][\w:-]*|/?>`], ['t', String.raw`\b[a-zA-Z-]+(?==)`]],
    noNum: true, noFn: true,
  },
  css: {
    comment: String.raw`/\*[\s\S]*?\*/`, string: `${HL_STR_DQ}|${HL_STR_SQ}`,
    extra: [['k', String.raw`@[\w-]+`], ['t', String.raw`[a-zA-Z-]+(?=\s*:)`]],
    number: String.raw`#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|r?em|%|vh|vw|ms|s|deg|fr)?`, noFn: false,
  },
  sql: {
    comment: String.raw`--[^\n]*|/\*[\s\S]*?\*/`, string: HL_STR_SQ, i: true,
    kw: words('select from where and or not in is null like between join inner left right outer full on group by order having limit offset insert into values update set delete create table alter drop index primary key foreign references distinct as union all case when then else end asc desc'),
    types: words('int integer bigint varchar char text date datetime timestamp boolean float double decimal count sum avg min max'),
  },
  java: {
    comment: HL_CLIKE_COMMENT, string: `${HL_STR_DQ}|${HL_STR_SQ}`, extra: [['p', String.raw`@\w+`]],
    kw: words('abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try volatile while true false null var'),
    types: words('int long short byte char boolean float double void String Integer Long List Map Set ArrayList HashMap Object System Math Optional'),
  },
  rust: {
    comment: HL_CLIKE_COMMENT, string: String.raw`${HL_STR_DQ}|'(?:\\.[^']*|[^'\\\n])'`, extra: [['p', String.raw`#!?\[[^\]]*\]`]],
    kw: words('as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while'),
    types: words('i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box Some None Ok Err println'),
  },
  go: {
    comment: HL_CLIKE_COMMENT, string: String.raw`${HL_STR_DQ}|${HL_STR_SQ}|` + '`[^`]*`',
    kw: words('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil'),
    types: words('int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 float32 float64 string bool byte rune error any fmt'),
  },
};
const HL_ALIASES = {
  'c': 'cpp', 'c++': 'cpp', 'cc': 'cpp', 'cxx': 'cpp', 'h': 'cpp', 'hpp': 'cpp',
  'javascript': 'js', 'jsx': 'js', 'mjs': 'js', 'typescript': 'ts', 'tsx': 'ts',
  'py': 'python', 'python3': 'python', 'sh': 'bash', 'shell': 'bash', 'zsh': 'bash', 'console': 'bash',
  'rs': 'rust', 'golang': 'go', 'htm': 'html', 'xml': 'html', 'svg': 'html', 'jsonc': 'json',
};
const HL_LABELS = {
  c: 'C', cpp: 'C++', 'c++': 'C++', cc: 'C++', cxx: 'C++', h: 'C', hpp: 'C++', js: 'JavaScript', javascript: 'JavaScript',
  jsx: 'JSX', ts: 'TypeScript', typescript: 'TypeScript', tsx: 'TSX', py: 'Python', python: 'Python', python3: 'Python',
  bash: 'Bash', sh: 'Shell', shell: 'Shell', zsh: 'Zsh', console: 'Console', json: 'JSON', html: 'HTML', xml: 'XML',
  css: 'CSS', sql: 'SQL', java: 'Java', rs: 'Rust', rust: 'Rust', go: 'Go', golang: 'Go', svg: 'SVG',
};

const _hlCache = {};
function hlRegex(key) {
  if (_hlCache[key]) return _hlCache[key];
  const d = HL_LANGS[key];
  const parts = [];
  if (d.comment) parts.push(['c', d.comment]);
  (d.extra || []).filter(e => e[2]).forEach(e => parts.push(e));     // extras flagged "first" beat strings (JSON keys)
  if (d.string) parts.push(['s', d.string]);
  if (d.pre) parts.push(['p', String.raw`^[ \t]*#[ \t]*\w+`]);
  (d.extra || []).filter(e => !e[2]).forEach(e => parts.push(e));
  if (!d.noNum) parts.push(['n', d.number || HL_NUM]);
  if (d.kw) parts.push(['k', String.raw`\b(?:${d.kw.map(reEsc).join('|')})\b`]);
  if (d.types) parts.push(['t', String.raw`\b(?:${d.types.map(reEsc).join('|')})\b`]);
  if (!d.noFn) parts.push(['f', HL_FN]);
  const re = new RegExp(parts.map(([, s]) => `(${s})`).join('|'), 'gm' + (d.i ? 'i' : ''));
  return (_hlCache[key] = { re, classes: parts.map(([c]) => c) });
}

function highlightCode(code, lang) {
  const key = HL_LANGS[lang] ? lang : HL_ALIASES[lang];
  if (!key || !HL_LANGS[key]) return escapeHtml(code);
  const { re, classes } = hlRegex(key);
  let out = '', last = 0, m;
  re.lastIndex = 0;
  while ((m = re.exec(code)) !== null) {
    if (m[0] === '') { re.lastIndex++; continue; }
    const gi = m.findIndex((g, i) => i > 0 && g !== undefined) - 1;
    out += escapeHtml(code.slice(last, m.index)) + `<span class="hl-${classes[gi]}">${escapeHtml(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + escapeHtml(code.slice(last));
}

export function codeBlockHtml(info, code) {
  const lang = (info || '').trim().split(/\s+/)[0].toLowerCase();
  const label = lang ? (HL_LABELS[lang] || lang.toUpperCase()) : '';
  return `<div class="blog-code"><div class="blog-code-head">` +
    `<span class="blog-code-lang">${escapeHtml(label || 'code')}</span>` +
    `<button class="blog-code-copy" type="button" aria-label="Copy code to clipboard">Copy</button></div>` +
    `<pre><code${lang ? ` class="lang-${escapeHtml(lang)}"` : ''}>${highlightCode(code, lang)}</code></pre></div>`;
}
