# Harshvardhan Rathod — Portfolio

A clean, content-driven static portfolio. Designed for **GitHub Pages**.
No build step. No framework. Just HTML + CSS + vanilla JS that reads JSON & Markdown.

## ✨ What's dynamic

Edit content **without touching code**:

| To change… | Edit this file |
|---|---|
| Name, tagline, profile photo, stats, hero buttons, contact info | `data/site.json` |
| Skills grid | `data/skills.json` |
| Achievements list | `data/achievements.json` |
| Project cards (title, date, tech, order) | `data/projects.json` |
| Project detail page (long description, headings, lists) | `content/projects/<id>/index.md` |
| Project images (used in modal carousel) | `content/projects/<id>/images/01.png`, `02.png`, … |
| Certificate cards | `data/certificates.json` |
| Certificate detail | `content/certificates/<id>/index.md` |
| Certificate image | `content/certificates/<id>/image.png` |
| Profile photo | `assets/images/profile.png` |
| Colors, fonts, spacing | `assets/css/styles.css` (CSS variables at the top) |

The Markdown renderer supports: headings (`#`, `##`, `###`), **bold**, *italic*, `inline code`, code fences, lists, and links.

## 📁 Folder structure

```
portfolio/
├── index.html
├── README.md
├── assets/
│   ├── css/styles.css
│   ├── js/main.js
│   └── images/profile.png
├── data/                          ← all "list" content
│   ├── site.json
│   ├── skills.json
│   ├── achievements.json
│   ├── projects.json
│   └── certificates.json
└── content/                       ← long-form content + images
    ├── projects/
    │   ├── stock-market-simulator/
    │   │   ├── index.md
    │   │   └── images/01.png
    │   └── register-controller/
    │       ├── index.md
    │       └── images/01.png
    └── certificates/
        └── algozenith-cp/
            ├── index.md
            └── image.png
```

## ➕ Add a new project

1. Add a new object to `data/projects.json`:
   ```json
   {
     "id": "my-new-project",
     "title": "My New Project",
     "date": "2026 · Active",
     "shortDesc": "Short one-line summary shown on the card.",
     "tech": ["C++", "Linux"]
   }
   ```
2. Create the folder `content/projects/my-new-project/`.
3. Add `index.md` with the long description.
4. Drop images into `content/projects/my-new-project/images/` named `01.png`, `02.png`, … (up to 6 auto-detected).

That's it — refresh the page.

## ➕ Add a new certificate

1. Add to `data/certificates.json`.
2. Create `content/certificates/<id>/image.png` and optional `index.md`.

## 🚀 Run locally

You must serve over HTTP (not `file://`) so `fetch()` works:

```bash
# Python
python3 -m http.server 8000

# Node
npx serve .
```

Then open <http://localhost:8000>.

## 🌐 Deploy to GitHub Pages

1. Push this folder to a GitHub repo (e.g. `username.github.io` or any repo).
2. Settings → Pages → Source: `Deploy from a branch` → `main` → `/ (root)`.
3. Visit `https://<username>.github.io/<repo>/`.

## 🎨 Customise colors

All theme tokens live at the top of `assets/css/styles.css`:

```css
:root { --y: #F5C518; }            /* accent color */
[data-theme="dark"]  { --bg: #0A0A0A; ... }
[data-theme="light"] { --bg: #FAFAF7; ... }
```

Change `--y` to rebrand the whole site.
