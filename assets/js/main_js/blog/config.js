/* blog/config.js — where blog files live (see layout notes below). */

/* ================================================================
   BLOGS
   ----------------------------------------------------------------
   File layout (all under content/blogs/):
     <id>.md          the post body (markdown)
     <id>.png         cover image (card thumbnail + reader header)
     <id>_<n>.png     images used inside the post
     <id>_<n>.pdf     PDF attachments used inside the post
   Post metadata (title, date, blurb, tags, wide) lives in
   data/blogs.js.

   renderBlogMarkdown() is a fuller renderer than renderMarkdown()
   (which stays untouched for projects/certificates). Adds images,
   typed + arbitrarily-nested lists, blockquotes, tables, hr,
   ~~strike~~, h4-h6, wiki-style floating blocks and more on top of
   the usual **bold**, *italic*, `code`, [links](url) and
   =(#RRGGBB)colored text=.

   List types (a/A/i/I/1) and nesting depth are both inferred from
   the markdown itself; no extra syntax needed.

   Side-by-side text/image (Wikipedia-style) can be written two ways:
     · Single floated image: ![alt](img:1){float=left}
       — the paragraph right after it wraps around the image.
     · Explicit container (recommended when you want a caption block
       or several paragraphs wrapped at once):
         :::float left
         ![alt](img:1)
         :::
         Paragraph(s) that should wrap …
       (use `right` instead of `left` to float the other way)
================================================================ */
export const BLOG_DIR = 'content/blogs/';

/* ================================================================
   MERMAID DIAGRAMS — rendered by Pele (https://pele.run, MIT)
   ----------------------------------------------------------------
   Write a fenced block in a post:
       ```mermaid
       flowchart LR
         A[Mermaid text] --> B[SVG]
       ```
   blog/diagram.js turns it into an SVG that follows the site theme
   (light/dark switches without re-rendering). Pele is only loaded
   when a post actually contains a diagram. Sources are tried in order:
     1. the copy in this repo      (self-hosted: fast, no third party)
     2. jsDelivr, pinned to an exact version (fallback)
   To update Pele:  npm pack pele@1  →  copy package/dist/pele.js over
   assets/vendor/pele/pele.js  →  bump the pinned version below.
   PELE_OPTIONS apply to every diagram — post authors cannot change
   them. Reference: https://pele.run/api#renderoptions
   (e.g. { links: false, images: false } to block links / remote images)
================================================================ */
export const PELE_SOURCES = [
  'assets/vendor/pele/pele.js',
  'https://cdn.jsdelivr.net/npm/pele@1.13.0/dist/pele.js',
];
export const PELE_OPTIONS = {};
