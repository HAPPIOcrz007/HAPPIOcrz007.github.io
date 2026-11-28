# Portfolio site — design system & theming guide

Static site (HTML + CSS + ES modules) plus a few Vercel serverless functions in `api/` (heatmap data, request logging, status line). Hosted on Vercel. No build step.
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
api/                          serverless functions: cf lc atc cc gh (heatmap data) · hit (page-view/event logger) · status (terminal line) · _lib/log.js (shared logger)
assets/js/site-core.js        page-view + event beacon (window.track), loaded by every HTML page (was beacon.js; renamed so ad-block lists skip it)
```

**Rule of thumb:** component CSS never contains a hex color, a pixel radius or a
z-index number. It uses `var(--…)`. If you need a new value, add a token first.

---

## 2. "I want to change…" cheat sheet

| Goal                                                      | Edit                                         | Where                                                                                                       |
| --------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Accent color (buttons, links, labels, heatmap, scrollbar) | `--green-rgb`                                | `tokens/colors.css` — **both** `[data-theme]` blocks. Hover/dark/light/dim/glow shades derive automatically |
| Page / card / border colors                               | `--bg --bg2 --bg3 --card --border --border2` | `tokens/colors.css`                                                                                         |
| Text colors                                               | `--text --text-dim --text-muted`             | `tokens/colors.css`                                                                                         |
| Secondary colors (green/amber/blue/cyan/red)              | `--ok --warn --info --cyan --danger`         | `tokens/colors.css`                                                                                         |
| Heatmap cell colors                                       | `--heat-0 … --heat-4`                        | `tokens/colors.css` (JS reads them)                                                                         |
| Pie-chart colors                                          | `--chart-1 … --chart-9`                      | `tokens/colors.css`                                                                                         |
| Blog code highlighting                                    | `--hl-*`                                     | `tokens/colors.css`                                                                                         |
| Google Drive video frame color / video background          | `--drive-blue`, `--video-bg`                 | `tokens/colors.css` (both themes)                                                                           |
| How round everything is                                   | `--radius-xs/sm/` `--radius` `--radius-lg`   | `tokens/shape.css`                                                                                          |
| Fonts                                                     | `--font-body`, `--font-mono`, `--font-ui`    | `tokens/type.css` (set `--font-ui: var(--font-body)` to drop the monospace look)                            |
| Animation speed                                           | `--dur-*`                                    | `tokens/motion.css` (set to `0s` to disable)                                                                |
| Nav size / position                                       | `--nav-*`                                    | `tokens/layout.css`                                                                                         |
| Section spacing                                           | `--section-pad*`, `--hero-pad*`              | `tokens/layout.css`                                                                                         |
| Page width                                                | `--container-max`, `--gutter`                | `tokens/layout.css`                                                                                         |
| What sits above what                                      | `--z-*`                                      | `tokens/layers.css`                                                                                         |

---

## 3. Token reference (short)

* **Surfaces:** `--bg` page · `--bg2` subtle band · `--bg3` chips/inputs · `--card` cards · `--border`, `--border2` lines
* **Accent:** `--green` (name is historical — it is the accent) · `--green-hover` `--green-dark` `--green-light` · `--green-dim` (tinted fill) · `--green-glow` · `--accent-tint` · `--green-rgb` for `rgba(var(--green-rgb), .3)`
* **On-colors:** `--on-accent` text on accent fills · `--on-scrim` text on dark scrims
* **Overlays:** `--overlay` modal · `--overlay-strong` lightbox · `--scrim` carousel buttons · `--tint-hover`, `--hairline` subtle fills/lines
* **Brand (meaning-bearing, do not retheme):** `--brand-github --brand-codeforces --brand-leetcode --brand-atcoder`
* **Difficulty:** `--easy --medium --hard`
* **Blog video:** `--drive-blue` light-blue hint around Google-Drive-hosted videos (so readers can tell they are hosted elsewhere) · `--video-bg` letterbox behind local `<video>`
* **Print:** `--print-bg --print-fg --print-border` (print is always light)
* **Radii:** `--radius-xs 4px` · `-sm 8px` · `--radius 14px` · `-lg 22px` · `-full` pills · `-circle` 50%
* **Motion:** `--ease*`, `--dur-instant .15s` · `-fast .2s` · `-base .25s` · `-theme .3s` · `-slow .45s` · `-reveal-sm .5s` · `-reveal .7s`
* **Spacing scale:** `--space-1 … --space-8` (for new work; existing components keep their own paddings)

Micro font sizes inside single components (e.g. `0.68rem` on tags) intentionally
stay in their component file; the global scale is `--text-xs … --text-5xl`.

---

## 4. Breakpoints (cannot be variables)

CSS can't use variables inside `@media`, so these are fixed numbers. If you change one, search for it:

| px      | Meaning                                                                  | Files                                                                                                              |
| ------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 1200    | blog wide layout                                                         | `29-blog.css`                                                                                                      |
| 1024    | hero gap                                                                 | `23-responsive.css`                                                                                                |
| **860** | **mobile**: nav → bottom tab bar, hero stacks, toast lifts above the bar | `06-navigation`, `09-notification`, `23-responsive`, `28-activity-heatmap`, `scroll-effects.js` (`NAV_MOBILE_MAX`) |
| 720     | blog floats stack                                                        | `29-blog.css`                                                                                                      |
| 640     | small phones                                                             | `23-responsive`, `09-notification`, heatmap/CSES injected styles                                                   |

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

| File                                                                                                                  | What                              |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `index.html`, `index_tools.html`                                                                                      | `<meta name="theme-color">` ×2    |
| `tools/cp-daily-log.html`, `tools/dsa_problem_set.html`, `tools/company_dsa_questions.html`, `tools/cf-problems.html` | `<meta name="theme-color">` ×2    |
| `site.webmanifest`                                                                                                    | `background_color`, `theme_color` |

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

Write [=(name)text=] anywhere markdown is rendered (projects, certificates, blogs, notifications).

| Name     | Token     | Name     | Token          |
| -------- | --------- | -------- | -------------- |
| `accent` | `--green` | `danger` | `--danger`     |
| `ok`     | `--ok`    | `muted`  | `--text-muted` |
| `warn`   | `--warn`  | `dim`    | `--text-dim`   |
| `info`   | `--info`  | `cyan`   | `--cyan`       |

[=(#RRGGBB)text=] still works for one-off colors, but it won't follow the theme.
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


---

## 11. Blog videos

Written on their own line, like images (parser: `assets/js/main_js/blog/markdown.js`).

| Kind         | Syntax                                         | Notes                                                                                                                                                         |
| ------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local file   | `![alt](2_1V.mp4)` or `![alt](vid:1)`          | File lives in `content/blogs/` as `<id>_<n>V.mp4` (or `.webm`; `vid:1.webm` picks webm). Native `<video>` player. **Keep each file ≤ 4.5 MB.**                 |
| Google Drive | `![alt][V](drive link)`                        | `drive.google.com` share link (`/file/d/ID/view`, `open?id=ID`) or a bare file id. Sharing must be *Anyone with the link → Viewer*. Not recognised → inline error. |

* Options use the same `{…}` block as images: `{poster=img:3,width=70%,float=right}` for local videos; Drive embeds only honour `float`.
* Drive embeds render in a 16:9 box with a **light-blue frame and a "Google Drive ↗" badge** so readers can tell the video is hosted elsewhere. Only the extracted file id ever reaches the iframe `src`.
* Formats: `.mp4` (H.264) and `.webm`. `.mov` / `.ogv` are deliberately not supported. `#t=0.1` is added to the source so iPhones show a still frame.
* Closing the reader pauses local videos and unloads Drive players (`blogReader.hide()` in `blog/reader.js`).
* Never add a `[V]: …` reference line to a post — `![alt][V]` is matched as the Drive syntax before normal markdown.
* If the site ever gets a Content-Security-Policy, `frame-src` must allow `https://drive.google.com`.
* Tracking: first play of each local video logs `video_play` (see section 12). Drive iframes are cross-origin, so only the post open is logged.
* Compress before committing, and check the size cap:

```bash
ffmpeg -i in.mp4 -vf scale=-2:720 -c:v libx264 -crf 28 -preset slow -movflags +faststart out.mp4
find content/blogs -name '*V.*' -size +4500k      # lists files over the cap
```

---

## 12. Serverless API, logging and analytics

**Functions** (`api/*.js`, plain Node, no build). Each handler is wrapped as `withLog('<name>', async (req, res) => { … })` from `api/_lib/log.js`.

| Route         | Does                                                                              | Env vars                                     |
| ------------- | --------------------------------------------------------------------------------- | -------------------------------------------- |
| `/api/cf`     | Codeforces rating, rank and submission timestamps                                 | `CF_HANDLE`                                  |
| `/api/lc`     | LeetCode submission calendar (GraphQL, falls back to the alfa-leetcode proxy)      | `LC_USERNAME`                                |
| `/api/atc`    | AtCoder accepted-submission timestamps (kenkoooo)                                 | `ATC_USERNAME`                               |
| `/api/cc`     | CodeChef daily counts, **scraped from the profile page** (may break if CodeChef changes it) | `CC_USERNAME`                      |
| `/api/gh`     | GitHub contribution days (GraphQL with token, falls back to a public proxy)       | `GH_USERNAME`, `GH_TOKEN` (optional)         |
| `/api/hit`    | Logs a page view or custom event, returns 204                                     | `LOG_SALT` (optional, hashes the IP)         |
| `/api/status` | One plain-text line for the terminal: `?s=cf\|cc\|gh\|lc\|atc`, no param = combined | `STATUS_TZ` (optional, default `Asia/Kolkata`) |

* Set env vars in the Vercel dashboard (Project → Settings → Environment Variables) and **redeploy**; they are not read from the repo. For `vercel dev`, use `.env.local` — `.env*` is git-ignored. Never commit tokens.
* The platform handle is fixed server-side, so the endpoints cannot be used as an open proxy.
* Every data route sends `Cache-Control: s-maxage=3600, stale-while-revalidate=86400`: a judge is contacted at most about once an hour per Vercel region, and redeploys clear the cache. `x-vercel-cache: HIT/STALE` in `curl -i` confirms it.
* Recommended: `vercel.json` with `{"regions": ["bom1"]}` so functions run in Mumbai instead of the US default.
* Terminal line: `curl -s https://<site>/api/status?s=cf` (`.bashrc` caches the last value and refreshes in the background).

**Heatmap** (`assets/js/main_js/heatmap/`): platform keys `gh cf lc ac cc`. Cells use the visitor's **local** date (`toISO`); LeetCode's calendar is UTC-midnight based, so it is read with `toUTCISO`. Colour levels scale to the 95th percentile of active days (`scaleMax` in `stats.js`) so a few huge days (contests, bulk problem sets) do not flatten the colours; counts and tooltips stay exact. To add a platform: fetcher in `fetchers.js`, key in `stats.js` `merge`/`computeStats`, badge + `data-xx` attribute in `render.js`, badge colour in `styles.js`, `data-<name>` on `#activityHeatmap`.

**Logging.** Every API call prints one JSON line to Vercel Runtime Logs: `evt, route, method, status, ms, ip, country, city, page, ev, name, ref, ua`. Search the Logs page for `hit`, `blog_open`, etc. (Cached responses never reach the function, so page views are counted by the beacon, not by heatmap calls.)

**Beacon** (`assets/js/site-core.js`, one `<script defer>` in every HTML page): sends a `view` on load and defines `window.track(event, name)`. Built-in events:

| Event          | Fired from                                   | `name`                  |
| -------------- | -------------------------------------------- | ----------------------- |
| `view`         | every page load (exam page: path only)       | page path + hash        |
| `blog_open`    | `blog/reader.js` → `show()`                  | `<id>: <title>`         |
| `project_open` | `projects.js` card handler                   | project title           |
| `cert_open`    | `certificates.js` card handler               | certificate title       |
| `video_play`   | `blog/reader.js` (first play per video)      | `<id>: <file>`          |
| `outbound`     | any external link click (automatic)          | host + path, no query   |

Notes: use `window.track?.(…)` so nothing breaks if an ad blocker removes the script (such visits go uncounted — treat numbers as a minimum). Opening `/#post-3` directly logs both a `view` and a `blog_open`; count `blog_open`. Logs are short-lived; for history, store events in a database (not done yet).

**Privacy.** IP addresses are personal data. Set `LOG_SALT` to log a hashed visitor id instead of the raw IP. Do not add the beacon to pages where the URL carries secrets; `exam` is logged by path only.
