/* blog/reader.js — full-screen blog reader (deep links, progress bar, lightbox, code copy). */

import { BLOG_DIR } from './config.js';
import { renderBlogMarkdown } from './markdown.js';
import { renderPdfPreviews } from './pdf-preview.js';
import { renderInlineMarkdown, stripMarkdown } from '../markdown.js';
import { $, copyText, escapeHtml, fetchText } from '../utils.js';

export const blogReader = {
  root: null, body: null, cover: null, meta: null, title: null, tags: null,
  progress: null, currentId: null, _lastFocused: null, _token: 0,

  init() {
    this.root = $('#blogReader');
    if (!this.root) return;
    this.body = $('#blogBody');
    this.cover = $('#blogCover');
    this.meta = $('#blogMeta');
    this.title = $('#blogTitle');
    this.tags = $('#blogTags');
    this.progress = $('#blogProgress');

    $('#blogBack')?.addEventListener('click', () => this.close());
    $('#blogClose')?.addEventListener('click', () => this.close());

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || this.root.hidden) return;
      const lb = $('#blogLightbox');
      if (lb && !lb.hidden) { lb.hidden = true; return; }
      this.close();
    });

    this.root.addEventListener('scroll', () => {
      const max = this.root.scrollHeight - this.root.clientHeight;
      this.progress.style.transform = `scaleX(${max > 0 ? Math.min(this.root.scrollTop / max, 1) : 0})`;
    }, { passive: true });

    // Copy button on code blocks (delegated — blocks are re-rendered per post)
    this.body.addEventListener('click', async (e) => {
      const btn = e.target.closest('.blog-code-copy');
      if (!btn) return;
      const code = btn.closest('.blog-code')?.querySelector('code');
      if (!code) return;
      const ok = await copyText(code.textContent);
      btn.textContent = ok ? 'Copied!' : 'Failed';
      btn.classList.toggle('is-copied', ok);
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('is-copied'); }, 1600);
    });

    // Click any image in a post to view it full size
    const lb = $('#blogLightbox');
    this.body.addEventListener('click', (e) => {
      const img = e.target.closest('img');
      if (!img || !lb) return;
      lb.querySelector('img').src = img.src;
      lb.querySelector('img').alt = img.alt;
      lb.hidden = false;
    });
    lb?.addEventListener('click', () => { lb.hidden = true; });

    window.addEventListener('popstate', () => this.sync());
    window.addEventListener('hashchange', () => this.sync());
    this.sync();   // deep link: site/#post-3 opens straight into the post
  },

  sync() {
    const m = /^#post-([\w-]+)$/.exec(location.hash);
    if (m) this.show(m[1]); else this.hide();
  },

  async show(id) {
    if (this.currentId === id && !this.root.hidden) return;
    const blog = (window.DATA_BLOGS || []).find(b => String(b.id) === String(id));
    const token = ++this._token;
    const md = await fetchText(`${BLOG_DIR}${encodeURIComponent(id)}.md`);
    if (token !== this._token) return;            // user navigated away while loading

    if (!blog && md == null) { this.close(); return; }

    const post = blog || { id, title: `Post ${id}` };
    this.currentId = String(id);

    this.title.innerHTML = renderInlineMarkdown(post.title);
    document.title = `${stripMarkdown(post.title)} | ${window.DATA_SITE?.name || 'Blog'}`;

    const words = (md || '').trim().split(/\s+/).filter(Boolean).length;
    const mins = Math.max(1, Math.round(words / 220));
    this.meta.innerHTML = [post.date ? renderInlineMarkdown(post.date) : '', `${mins} min read`]
      .filter(Boolean).map(x => `<span>${x}</span>`).join('<span class="blog-meta-dot">·</span>');
    this.tags.innerHTML = (post.tags || []).map(t => `<span class="tech-tag">${renderInlineMarkdown(t)}</span>`).join('');

    this.cover.innerHTML = `<img src="${BLOG_DIR}${escapeHtml(id)}.png" alt="${escapeHtml(stripMarkdown(post.title))}" />`;
    this.cover.querySelector('img').addEventListener('error', () => { this.cover.innerHTML = ''; });

    // Opt-in wide layout (data/blogs.js: { wide: true }) — lets the article
    // break out of the default 760px reading column for chart-heavy posts.
    this.body.classList.toggle('md-content--wide', !!post.wide);
    const article = this.body.closest('.blog-article');
    if (article) article.classList.toggle('blog-article--wide', !!post.wide);

    this.body.innerHTML = md == null
      ? '<p>This post could not be loaded.</p>'
      : renderBlogMarkdown(md, id);
    this.body.querySelectorAll('img').forEach(img =>
      img.addEventListener('error', () => { img.style.opacity = '0.35'; img.alt = img.alt || 'Image not available'; }));

    if (this.root.hidden) {
      this._lastFocused = document.activeElement;
      this.root.hidden = false;
      document.body.style.overflow = 'hidden';
    }
    this.root.scrollTop = 0;
    this.progress.style.transform = 'scaleX(0)';
    renderPdfPreviews(this.body);       // after unhide so widths can be measured
    setTimeout(() => $('#blogBack')?.focus(), 50);
  },

  hide() {
    this._token++;
    if (!this.root || this.root.hidden) return;
    this.root.hidden = true;
    this.currentId = null;
    document.body.style.overflow = '';
    if (window.DATA_SITE) renderSiteTitle();
    this._lastFocused?.focus?.();
    this._lastFocused = null;
  },

  close() {
    if (history.state && history.state.blogNav) history.back();   // we pushed this entry
    else {
      history.replaceState(null, '', location.pathname + location.search);
      this.hide();
    }
  },
};

function renderSiteTitle() {
  const s = window.DATA_SITE;
  if (s) document.title = `${s.name || 'Portfolio'} | ${s.title || 'Developer'}`;
}
