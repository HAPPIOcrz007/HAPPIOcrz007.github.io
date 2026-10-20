/* Dependency-free highlighter: C++, Python, JavaScript, Java, Rust.
   Token classes: k keyword, s string, c comment, n number, f function, t type,
   p preprocessor/attribute/decorator/lifetime, l literal (true/None/null), b builtin/self/macro */
CP.hl = (function () {
  const W = s => new Set(s.split(" "));
  const slc = String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`, dq = String.raw`"(?:\\.|[^"\\\n])*"`, none = "(?!)";
  const L = {
    cpp: {
      kw: W("alignas alignof auto bool break case catch char class const constexpr continue default delete do double else enum explicit extern float for friend goto if inline int long mutable namespace new noexcept operator private protected public register return short signed sizeof static struct switch template throw try typedef typename union unsigned using virtual void volatile while override final"),
      lit: W("true false nullptr NULL"), bi: W("std cin cout cerr endl this"),
      ty: W("string vector map set multiset unordered_map unordered_set pair tuple queue stack deque priority_queue array bitset size_t int8_t int16_t int32_t int64_t uint32_t uint64_t ll ull"),
      c: slc, s: dq + String.raw`|'(?:\\.|[^'\\\n])+'`, pp: String.raw`^[ \t]*#[ \t]*(?:include[ \t]*<[^>\n]+>|\w+)`, at: none
    },
    python: {
      kw: W("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield"),
      lit: W("True False None"), bi: W("self cls print len range input map filter sorted sum min max abs enumerate zip open isinstance super"),
      ty: W("int str float bool list dict set tuple bytes object"),
      c: String.raw`#[^\n]*`, s: String.raw`[rbfRBF]{0,2}(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')`, pp: none, at: String.raw`@[A-Za-z_][\w.]*`
    },
    js: {
      kw: W("async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch throw try typeof var void while with yield"),
      lit: W("true false null undefined NaN Infinity"), bi: W("this console window document Math JSON Promise"),
      ty: W("Array Object Map Set Number String Boolean Date Symbol BigInt Error RegExp"),
      c: slc, s: dq + String.raw`|'(?:\\.|[^'\\\n])*'|` + "`(?:\\\\.|[^`\\\\])*`", pp: none, at: none
    },
    java: {
      kw: W("abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp switch synchronized throw throws transient try var void volatile while"),
      lit: W("true false null"), bi: W("this super System"),
      ty: W("String Integer Long Double Boolean Character Object List ArrayList LinkedList Map HashMap TreeMap Set HashSet TreeSet Deque ArrayDeque Queue PriorityQueue Arrays Collections Math Scanner BufferedReader"),
      c: slc, s: dq + String.raw`|'(?:\\.|[^'\\\n])+'`, pp: none, at: String.raw`@[A-Za-z_]\w*`
    },
    rust: {
      kw: W("as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return static struct super trait type unsafe use where while"),
      lit: W("true false None"), bi: W("self Some Ok Err"),
      ty: W("i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box Self HashMap HashSet BTreeMap VecDeque Rc Arc"),
      c: slc, s: String.raw`"(?:\\.|[^"\\])*"|'(?:\\.[^']*|[^'\\\n])'`, pp: none, at: String.raw`#!?\[[^\]]*\]|'[A-Za-z_]\w*(?!['\w])`
    }
  };
  const ALIAS = { "c++": "cpp", cc: "cpp", c: "cpp", h: "cpp", hpp: "cpp", py: "python", javascript: "js", ts: "js", typescript: "js", node: "js", rs: "rust" };
  const norm = l => { l = (l || "").toLowerCase(); return ALIAS[l] || l };
  const num = String.raw`\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)[uUlLfFiu0-9]*\b`;
  const cache = {};
  const re = k => cache[k] || (cache[k] = new RegExp(`(${L[k].c})|(${L[k].s})|(${L[k].pp})|(${L[k].at})|(${num})|([A-Za-z_]\\w*)`, "gm"));
  const sp = (c, t) => `<span class="tk-${c}">${CP.esc(t)}</span>`;
  function hl(src, lang) {
    const k = norm(lang); if (!L[k]) return CP.esc(src);
    const d = L[k], r = re(k); r.lastIndex = 0; let out = "", last = 0, m;
    while ((m = r.exec(src))) {
      out += CP.esc(src.slice(last, m.index)); last = r.lastIndex;
      if (m[1]) out += sp("c", m[1]); else if (m[2]) out += sp("s", m[2]);
      else if (m[3] || m[4]) out += sp("p", m[3] || m[4]); else if (m[5]) out += sp("n", m[5]);
      else {
        const w = m[6], nx = src[last];
        if (d.kw.has(w)) out += sp("k", w);
        else if (d.lit.has(w)) out += sp("l", w);
        else if (d.bi.has(w)) out += sp("b", w);
        else if (d.ty.has(w) || /^[A-Z][a-z]/.test(w)) out += sp("t", w);
        else if (k === "rust" && nx === "!" && src[last + 1] !== "=") out += sp("b", w);   /* macros */
        else if (nx === "(") out += sp("f", w);
        else out += CP.esc(w);
      }
    }
    return out + CP.esc(src.slice(last));
  }
  hl.norm = norm; return hl;
})();