/* ================================================================
   data/blogs.js — list of blog posts shown in the "Blogs" section.

   For each entry, add these files under content/blogs/:
     <id>.md          the post (markdown)
     <id>.png         cover image (card + top of post)
     <id>_1.png, <id>_2.png, …   images used inside the post
     <id>_1.pdf, <id>_2.pdf, …   PDF attachments used inside the post

   Fields:
     id         the blog number (matches the file names)
     title      shown on the card and as the post heading
     date       any text, e.g. "Sep 2026"
     shortDesc  one-line teaser shown on the card
     tags       optional small pills
     hidden     true = removed from the Blogs grid (default false, so leave it
                out entirely for a normal published post). A hidden post's
                #post-<id> link still opens the full post — so you can share
                a draft with yourself/others directly before flipping this to
                false (or deleting the line) to publish it on the grid.
     wide       true = render this post in the wider reading column
                (max-width 1080–1160px instead of the default 760px). Use it
                for posts with big diagrams, wide screenshots, side-by-side
                image+text blocks, or dense tables. Omit for normal text posts.

   Every text field accepts the same inline markdown as the rest of the site
   (**bold**, *italic*, `code`, [link](url), =(#e8510f)color=).
   Order here = order on the page, so put the newest post first.
   ================================================================ */
window.DATA_BLOGS = [
  {
    id: 2,
    title: "A C++ and Competitive Programming Roadmap for ICPC Prep",
    date: "Sep 2026",
    shortDesc: "One ordered path from learning C++ to ICPC-ready — no guesswork on what to do next.",
    tags: ["cpp", "icpc", "roadmap"],
    wide: true,
  },
  {
    id: 1,
    title: "Hello, World — Notes on Building This Site",
    date: "Sep 2026",
    shortDesc: "A first post, and a quick tour of everything the blog engine supports.",
    tags: ["meta", "markdown"],
    hidden: true
  },
];