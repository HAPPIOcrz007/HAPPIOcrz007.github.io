/* ================================================================
   data/blogs.js — list of blog posts shown in the "Blogs" section.

   For each entry, add these files under content/blogs/:
     <id>.md          the post (markdown)
     <id>.png         cover image (card + top of post)
     <id>_1.png, <id>_2.png, …   images used inside the post

   Fields:
     id         the blog number (matches the file names)
     title      shown on the card and as the post heading
     date       any text, e.g. "Sep 2026"
     shortDesc  one-line teaser shown on the card
     tags       optional small pills

   Every text field accepts the same inline markdown as the rest of
   the site (**bold**, *italic*, `code`, [link](url), =(#e8510f)color=).
   Order here = order on the page, so put the newest post first.
   ================================================================ */
window.DATA_BLOGS = [
  {
    id: 1,
    title: "Hello, World — Notes on Building This Site",
    date: "Sep 2026",
    shortDesc: "A first post, and a quick tour of everything the blog engine supports.",
    tags: ["meta", "markdown"],
  },
];