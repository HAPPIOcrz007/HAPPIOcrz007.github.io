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
