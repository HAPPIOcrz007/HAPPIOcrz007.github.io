# Portfolio site — design system & theming guide

Static site (HTML + CSS + ES modules), hosted on Vercel. No build step.
The look is a "terminal app" theme: warm off-white / near-black surfaces, an
indigo accent, monospace UI chrome, large rounded cards, floating nav bar.

**Everything visual is driven by design tokens in one folder.** Change a token
and the main site, blog, tools pages and JS-drawn charts all follow.

---

## 1. Where things live

```
assets/css/
  styles.css                  entry point — @imports the files below, in cascade order
  styles_css/
    02-variables.css          TOKENS ENTRY (imports tokens/*; also linked directly by tool pages)
    tokens/
      colors.css              ← all raw colors, shadows, heat/chart/code palettes
      shape.css               ← corner radii, border widths, blur
      type.css                ← fonts, size scale, weights
      motion.css              ← easing + durations
      layout.css              ← widths, nav size, section rhythm, spacing, breakpoint list
      layers.css              ← z-index stack
    01-reset … 31-blog-pdf    component/section styles (NO raw colors, radii or z-indexes)
assets/js/main_js/
  tokens.js                   reads tokens from CSS at runtime (token, tokenNum, heatLevels, chartColors)
  heatmap/config.js           heatmap levels  ← from --heat-0..4
  theme.js                    theme toggle; status-bar color ← from --bg
tools/…                       tool pages link ../assets/css/styles_css/02-variables.css
```

**Rule of thumb:** component CSS never contains a hex color, a pixel radius or a
z-index number. It uses `var(--…)`. If you need a new value, add a token first.

---

## 2. "I want to change…" cheat sheet

| Goal | Edit | Where |
|---|---|---|
| Accent color (buttons, links, labels, heatmap, scrollbar) | `--green-rgb` | `tokens/colors.css` — **both** `[data-theme]` blocks. Hover/dark/light/dim/glow shades derive automatically |
| Page / card / border colors | `--bg --bg2 --bg3 --card --border --border2` | `tokens/colors.css` |
| Text colors | `--text --text-dim --text-muted` | `tokens/colors.css` |
| Secondary colors (green/amber/blue/cyan/red) | `--ok --warn --info --cyan --danger` | `tokens/colors.css` |
| Heatmap cell colors | `--heat-0 … --heat-4` | `tokens/colors.css` (JS reads them) |
| Pie-chart colors | `--chart-1 … --chart-9` | `tokens/colors.css` |
| Blog code highlighting | `--hl-*` | `tokens/colors.css` |
| How round everything is | `--radius-xs/sm/` `--radius` `--radius-lg` | `tokens/shape.css` |
| Fonts | `--font-body`, `--font-mono`, `--font-ui` | `tokens/type.css` (set `--font-ui: var(--font-body)` to drop the monospace look) |
| Animation speed | `--dur-*` | `tokens/motion.css` (set to `0s` to disable) |
| Nav size / position | `--nav-*` | `tokens/layout.css` |
| Section spacing | `--section-pad*`, `--hero-pad*` | `tokens/layout.css` |
| Page width | `--container-max`, `--gutter` | `tokens/layout.css` |
| What sits above what | `--z-*` | `tokens/layers.css` |

---

## 3. Token reference (short)

* **Surfaces:** `--bg` page · `--bg2` subtle band · `--bg3` chips/inputs · `--card` cards · `--border`, `--border2` lines
* **Accent:** `--green` (name is historical — it is the accent) · `--green-hover` `--green-dark` `--green-light` · `--green-dim` (tinted fill) · `--green-glow` · `--accent-tint` · `--green-rgb` for `rgba(var(--green-rgb), .3)`
* **On-colors:** `--on-accent` text on accent fills · `--on-scrim` text on dark scrims
* **Overlays:** `--overlay` modal · `--overlay-strong` lightbox · `--scrim` carousel buttons · `--tint-hover`, `--hairline` subtle fills/lines
* **Brand (meaning-bearing, do not retheme):** `--brand-github --brand-codeforces --brand-leetcode --brand-atcoder`
* **Difficulty:** `--easy --medium --hard`
* **Print:** `--print-bg --print-fg --print-border` (print is always light)
* **Radii:** `--radius-xs 4px` · `-sm 8px` · `--radius 14px` · `-lg 22px` · `-full` pills · `-circle` 50%
* **Motion:** `--ease*`, `--dur-instant .15s` · `-fast .2s` · `-base .25s` · `-theme .3s` · `-slow .45s` · `-reveal-sm .5s` · `-reveal .7s`
* **Spacing scale:** `--space-1 … --space-8` (for new work; existing components keep their own paddings)

Micro font sizes inside single components (e.g. `0.68rem` on tags) intentionally
stay in their component file; the global scale is `--text-xs … --text-5xl`.

---

## 4. Breakpoints (cannot be variables)

CSS can't use variables inside `@media`, so these are fixed numbers. If you change one, search for it:

| px | Meaning | Files |
|---|---|---|
| 1200 | blog wide layout | `29-blog.css` |
| 1024 | hero gap | `23-responsive.css` |
| **860** | **mobile**: nav → bottom tab bar, hero stacks, toast lifts above the bar | `06-navigation`, `09-notification`, `23-responsive`, `28-activity-heatmap`, `scroll-effects.js` (`NAV_MOBILE_MAX`) |
| 720 | blog floats stack | `29-blog.css` |
| 640 | small phones | `23-responsive`, `09-notification`, heatmap/CSES injected styles |

---

## 5. JavaScript and tokens

JS never hardcodes a color. `assets/js/main_js/tokens.js` reads tokens from CSS:

```js
import { token, tokenNum, heatLevels, chartColors } from './tokens.js';
token('--green');            // 'rgb(124, 92, 255)' for the current theme
tokenNum('--nav-offset');    // 70
heatLevels();                // 5 colors  (--heat-0..4)
chartColors();               // 9 colors  (--chart-1..9)
```

Values are cached per theme and re-read after a theme toggle (the cache clears when
`<html data-theme>` changes), so redraw charts on the `themeChange` event.
The only hex values left in JS are last-resort fallbacks for when CSS has not loaded.

CSS injected from JS (`heatmap/styles.js`, `cses/styles.js`, `global-tip.js`) uses `var(--…)` only.

---

## 6. Things tokens cannot reach (edit by hand)

These cannot read CSS variables. Keep them equal to `--bg`
(dark **`#0B0C10`**, light **`#FAFAF7`**) whenever you change the background:

| File | What |
|---|---|
| `index.html`, `index_tools.html` | `<meta name="theme-color">` ×2 |
| `tools/cp-daily-log.html`, `tools/dsa_problem_set.html`, `tools/company_dsa_questions.html`, `tools/cf-problems.html` | `<meta name="theme-color">` ×2 |
| `site.webmanifest` | `background_color`, `theme_color` |

One-liner (run from repo root, after you change the two values):

```bash
sed -i 's/#0A0A0A" media/#0B0C10" media/; s/#F5F5F0" media/#FAFAF7" media/' \
  index.html index_tools.html tools/*.html
sed -i 's/#0A0A0A/#0B0C10/g' site.webmanifest
```

(At runtime `theme.js` also keeps a single theme-color tag in sync with `--bg`, so these static tags only matter for the first paint.)

---

## 7. Conventions when adding or editing CSS

1. Never write a hex/rgb color, a `px` radius or a `z-index` number in a component file — use a token.
2. Need a new color? Add it to **both** theme blocks in `tokens/colors.css`.
3. Hover effects: accent border + `--accent-tint` fill + 2px lift (see `16-theme-reversal.css`; the filename is historical).
4. Mobile rules go in `23-responsive.css` (page-level) or at the bottom of the component file, using the breakpoints above.
5. New page or tool: link `02-variables.css` (path relative to the page), then write only layout/component CSS.
6. After a deploy, if a browser shows stale styles, hard-refresh: `styles.css?v=…` busts only the entry file, not its `@import`s (Vercel revalidates by default, so this is rare).

---

## 8. Troubleshooting

* **A color didn't change** → it is probably still a raw value somewhere: `grep -rnP "#[0-9a-fA-F]{3,8}\b|rgba?\((?!var)" assets/css --include=*.css | grep -v tokens/` should return nothing.
* **Undefined token** (element loses its color/shape) → typo in a `var(--name)`; names are listed in `tokens/*.css`.
* **Nav links missing on mobile** → don't add `.nav-links { display: none }`; the nav is a bottom bar at ≤ 860px.
* **Chart didn't recolor after theme toggle** → redraw it in a `themeChange` listener (see `tokens.js`).
---

## 9. Colored text in markdown / data strings

Write `=(name)text=` anywhere markdown is rendered (projects, certificates, blogs, notifications).

| Name | Token | Name | Token |
|---|---|---|---|
| `accent` | `--green` | `danger` | `--danger` |
| `ok` | `--ok` | `muted` | `--text-muted` |
| `warn` | `--warn` | `dim` | `--text-dim` |
| `info` | `--info` | `cyan` | `--cyan` |

`=(#RRGGBB)text=` still works for one-off colors, but it won't follow the theme.
New names: add one to the regex and, if needed, the `map` in `tokenColor()` in
`assets/js/main_js/markdown.js` and `blog/markdown.js` (keep both in sync).

---

## 10. Tool pages

* Every page in `tools/` links `../assets/css/styles_css/02-variables.css` (cp-daily-log via an `@import` in its own `02-variables.css`), so they share the same tokens and theme.
* `index_tools.html` loads the main `styles.css` and `main_tools_js/`.
* `cf-problems` pie colors come from `--chart-1..9` via `chartColors()` and redraw on theme toggle.
* `cp-daily-log` editor themes (`themes.css`: github-light, dracula, monokai, vscode) keep their own palettes on purpose. Syntax colors use `--hl-*`.
* **Intentionally raw colors** (brand or meaning, do not tokenize): Codeforces rank colors and LeetCode/CF logo fills in `cp-daily-log_js/platforms.js` and `report.js`, brand colors under `--brand-*`, and multi-theme editor palettes.
* Print styles use `--print-bg --print-fg --print-border --print-muted` (always light).
