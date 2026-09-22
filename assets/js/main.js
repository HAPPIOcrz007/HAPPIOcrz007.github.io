/* ============================================================
   main.js — Portfolio runtime with Apple-style animations

   Contains two modules:
     1. Site runtime (theme, modal, renderers, scroll/reveal fx)
     2. Multi-platform activity heatmap (IIFE, line ~675+)

   ---------------------------------------------------------------
   AUDIT NOTES — optimization pass, referenced by line number below
   ---------------------------------------------------------------
   #1  One shared scroll listener (rAF-throttled) drives the progress
       bar, parallax, and heatmap fill, instead of three separate
       listeners. See initScrollEffects() ~L529, onScroll() ~L586,
       and its call site in the boot block near the end of the file.
   #2  Heatmap particle speed is set via a single CSS variable
       (--particle-speed) instead of writing inline styles to all
       30 particle nodes on every scroll frame. ~L620
       (matching rule lives in styles.css).
   #3  Modal's close button is queried once in init() and cached on
       modal.closeBtn, instead of re-querying on every open(). ~L108
   #4  Carousel prev()/next() share one modulo-wrap guard instead of
       duplicated bounds checks. ~L178
   #5  attachCardEvents() is one reusable click/keyboard handler
       used for both project and certificate cards (event
       delegation), replacing two near-identical listener pairs.
       Defined ~L216, used at the project grid and certificate grid
       renderers below it.
   #6  escapeHtml() only guards against null/undefined so falsy
       values like 0 or false aren't silently coerced to ''. ~L18
   #7  Scroll-reveal CSS now lives in styles.css; JS only toggles
       the .visible class via IntersectionObserver — no runtime
       <style> injection for this feature. ~L452
   #8  Reveal observer attaches inside a single requestAnimationFrame
       call rather than nested rAFs. ~L497
   #12 Progress bar skips JS updates entirely when the browser
       supports native CSS scroll-driven animation
       (animation-timeline: scroll()). ~L535
   #22 Blogs: renderBlogMarkdown() / renderBlogs() / blogReader (search
       "BLOGS" below). Posts live in content/blogs/<id>.md with cover
       <id>.png and images <id>_<n>.png; metadata in data/blogs.js.
   #15 Hero name markup is only rewritten if the data-driven name
       differs from the static HTML already in the page, avoiding
       an unnecessary reflow on load. ~L297
   ============================================================ */

/* ================================================================
   SCROLL ANIMATION CONFIG
================================================================ */
const ANIM_DURATION_MS = 700;
const ANIM_STAGGER_MS = 60;
const ANIM_STAGGER_MAX = 350;
const ANIM_THRESHOLD = 0.1;
const ANIM_ROOT_MARGIN = '0px 0px -80px 0px';

/* ===== Tiny DOM helpers ===== */
const $ = (sel) => document.querySelector(sel);

const escapeHtml = (s) => {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
};

async function fetchText(url) {
  try {
    const r = await fetch(url);
    return r.ok ? r.text() : null;
  } catch (err) {
    console.warn(`[fetchText] Failed to load ${url}:`, err);
    return null;
  }
}

/* ===== Markdown renderer ===== */
function applyColorCodes(html) {
  return html.replace(/=\(#([A-Fa-f0-9]{6})\)(.*?)=/gs,
    (_, hex, content) => `<span style="color:#${hex}">${content}</span>`);
}

function renderMarkdown(md) {
  if (!md) return '';

  let h = escapeHtml(md);
  h = applyColorCodes(h);
  h = h.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
  h = h.replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  h = h.replace(/(^|\n)((?:[-*] .+\n?)+)/g, (_, pre, block) => {
    const items = block.trim().split('\n')
      .map(l => `<li>${l.replace(/^[-*] /, '').trim()}</li>`).join('');
    return `${pre}<ul>${items}</ul>`;
  });
  h = h.split(/\n{2,}/).map(chunk => {
    const t = chunk.trim();
    if (!t) return '';
    if (/^\s*<(h\d|ul|ol|pre|blockquote|table)/.test(t)) return t;
    return `<p>${t.replace(/\n/g, '<br>')}</p>`;
  }).filter(Boolean).join('\n');

  return h;
}

/* ===== Inline markdown renderer =====
   For single-line / short data-driven text (titles, labels, pills, tags,
   contact rows, notifications, hero copy, etc). Supports the same
   **bold**, *italic*, `code`, [text](url) links and =(#hex)...= color-code
   syntax as renderMarkdown() above, but never emits block-level tags
   (no <p>, <h#>, <ul>, code fences) so it's safe to drop into any inline
   container (a span, a pill, a title) without breaking its layout. */
function renderInlineMarkdown(md) {
  if (md == null || md === '') return '';

  let h = escapeHtml(String(md));
  h = applyColorCodes(h);
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="md-link" target="_blank" rel="noopener noreferrer">$1</a>');

  return `<span class="md-inline">${h}</span>`;
}

/* Strip markdown syntax down to plain text — for places that can't hold
   HTML (e.g. an alt attribute) so formatting characters don't show up
   literally when the underlying field uses markdown. */
function stripMarkdown(md) {
  if (md == null) return '';
  return String(md)
    .replace(/=\(#[A-Fa-f0-9]{6}\)(.*?)=/gs, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .trim();
}

/* ===== Theme ===== */
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.dataset.theme = saved;
  const btn = $('#themeBtn');
  if (!btn) return;
  btn.textContent = saved === 'dark' ? '☾' : '☀';
  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    btn.textContent = next === 'dark' ? '☾' : '☀';
    localStorage.setItem('theme', next);
    document.dispatchEvent(new CustomEvent('themeChange', { detail: { theme: next } }));
    // Update profile image when theme changes
    updateProfileImage();
  });
}

/* ===== Profile Image Theme Switcher ===== */
function updateProfileImage() {
  const profileImg = document.getElementById('profileImg');
  if (!profileImg) return;

  const theme = document.documentElement.dataset.theme || 'dark';
  // Use profile_dark.png for dark theme, profile_light.png for light theme
  const imagePath = theme === 'dark'
    ? 'assets/images/profile_dark.png'
    : 'assets/images/profile_light.png';

  profileImg.src = imagePath;
}

/* ================================================================
   FLOATING NOTIFICATION — Spotify-mini-player style toast
   Reads window.DATA_NOTIFICATION from data/notification.js:
   { enabled, id, emoji, header, context, link }. Dismissal is
   remembered per "id" in localStorage — bump the id to make an
   updated notice reappear even if an older one was closed.
================================================================ */
function initNotification() {
  const box = $('#notifyBox');
  if (!box) return;

  const data = window.DATA_NOTIFICATION;
  if (!data || data.enabled === false) return;

  const dismissKey = 'notify-dismissed';
  const dismissedId = localStorage.getItem(dismissKey);
  if (data.id && dismissedId === data.id) return;

  const emojiEl = $('#notifyEmoji');
  const headerEl = $('#notifyHeader');
  const contextEl = $('#notifyContext');
  const closeBtn = $('#notifyClose');

  if (emojiEl) emojiEl.textContent = data.emoji || '🔔';
  if (headerEl) headerEl.innerHTML = renderInlineMarkdown(data.header || 'Update');
  if (contextEl) contextEl.innerHTML = renderInlineMarkdown(data.context || '');

  if (data.link) {
    box.classList.add('notify-link');
    box.addEventListener('click', (e) => {
      if (e.target.closest('.notify-close')) return;
      if (String(data.link).startsWith('#')) {
        document.querySelector(data.link)?.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.open(data.link, '_blank', 'noopener,noreferrer');
      }
    });
  }

  const dismiss = () => {
    box.classList.remove('notify-visible');
    box.setAttribute('aria-hidden', 'true');
    if (data.id) localStorage.setItem(dismissKey, data.id);
  };
  closeBtn?.addEventListener('click', (e) => { e.stopPropagation(); dismiss(); });

  // Small delay so it "pops in" after the hero has settled, mini-player style
  box.removeAttribute('hidden');
  box.setAttribute('aria-hidden', 'false');
  setTimeout(() => box.classList.add('notify-visible'), 900);
}

/* ===== Modal ===== */
const modal = {
  root: null,
  title: null,
  carousel: null,
  body: null,
  closeBtn: null,
  images: [],
  index: 0,
  isOpen: false,
  _lastFocused: null,

  init() {
    this.root = $('#modal');
    if (!this.root) return;

    this.title = $('#modalTitle');
    this.carousel = $('#modalCarousel');
    this.body = $('#modalBody');
    this.closeBtn = $('#modalClose');

    if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.close());

    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') this.close();
      if (e.key === 'ArrowLeft') this.prev();
      if (e.key === 'ArrowRight') this.next();
    });

    this.root.addEventListener('focusin', (e) => {
      if (!this.isOpen) return;
      const focusable = this.root.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.target === last) first?.focus();
      else if (e.target === this.root) last?.focus();
    });
  },

  open(title, images, mdHtml) {
    if (!this.root) return;
    this._lastFocused = document.activeElement;

    this.title.innerHTML = renderInlineMarkdown(title || 'Untitled');
    this.images = (images || []).filter(Boolean);
    this.index = 0;
    this.isOpen = true;

    this.renderCarousel();
    this.body.innerHTML = mdHtml || '';
    this.root.classList.add('open');
    document.body.style.overflow = 'hidden';

    setTimeout(() => this.closeBtn?.focus(), 100);
  },

  close() {
    if (!this.root) return;
    this.root.classList.remove('open');
    document.body.style.overflow = '';
    this.isOpen = false;
    if (this._lastFocused) {
      this._lastFocused.focus();
      this._lastFocused = null;
    }
  },

  prev() {
    if (this.images.length <= 1) return;
    this.index = (this.index - 1 + this.images.length) % this.images.length;
    this.renderCarousel();
  },

  next() {
    if (this.images.length <= 1) return;
    this.index = (this.index + 1) % this.images.length;
    this.renderCarousel();
  },

  renderCarousel() {
    if (!this.carousel) return;
    if (!this.images.length) { this.carousel.innerHTML = ''; return; }

    const src = escapeHtml(this.images[this.index]);
    const hasMultiple = this.images.length > 1;

    this.carousel.innerHTML = `
      <img src="${src}" alt="Preview" loading="lazy"
           onerror="this.style.opacity='0.4';this.alt='Image not available';" />
      ${hasMultiple ? `
        <button class="carousel-btn prev" aria-label="Previous image">‹</button>
        <button class="carousel-btn next" aria-label="Next image">›</button>
        <div class="carousel-count">${this.index + 1} / ${this.images.length}</div>
      ` : ''}
    `;

    this.carousel.querySelector('.prev')
      ?.addEventListener('click', (e) => { e.stopPropagation(); this.prev(); });
    this.carousel.querySelector('.next')
      ?.addEventListener('click', (e) => { e.stopPropagation(); this.next(); });
  },
};

/* Shared helper: attach click + Enter/Space handling to a card grid (event delegation) */
function attachCardEvents(root, selector, getHandler) {
  root.addEventListener('click', (e) => {
    const card = e.target.closest(selector);
    if (card) getHandler(card)();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest(selector);
    if (card) { e.preventDefault(); getHandler(card)(); }
  });
}

/* ================================================================
   UPDATE HERO STATS FROM HEATMAP
================================================================ */
function updateHeroStatsFromHeatmap(stats) {
  if (!stats) return;

  // Update Codeforces Rating
  const cfStat = document.querySelector('[data-stat-id="codeforces-rating"] .stat-value');
  if (cfStat && stats.cfRating !== undefined && stats.cfRating !== null) {
    // Get rank from rating
    let rank = 'Newbie';
    if (stats.cfRating >= 2900) rank = 'Legendary Grandmaster';
    else if (stats.cfRating >= 2600) rank = 'International Grandmaster';
    else if (stats.cfRating >= 2400) rank = 'Grandmaster';
    else if (stats.cfRating >= 2300) rank = 'International Master';
    else if (stats.cfRating >= 2100) rank = 'Master';
    else if (stats.cfRating >= 1900) rank = 'Candidate Master';
    else if (stats.cfRating >= 1600) rank = 'Expert';
    else if (stats.cfRating >= 1400) rank = 'Specialist';
    else if (stats.cfRating >= 1200) rank = 'Pupil';
    else rank = 'Newbie';

    cfStat.textContent = `${stats.cfRating} - ${rank}`;
    const parent = cfStat.closest('.stat');
    if (parent) parent.classList.add('reveal', 'visible');
  }

  // Update GitHub Commits
  const ghStat = document.querySelector('[data-stat-id="github-commits"] .stat-value');
  if (ghStat) {
    ghStat.textContent = stats.githubTotal.toLocaleString();
    const parent = ghStat.closest('.stat');
    if (parent) parent.classList.add('reveal', 'visible');
  }

  // Update Problems Solved (CF + LC + AC)
  const psStat = document.querySelector('[data-stat-id="problems-solved"] .stat-value');
  if (psStat) {
    const total = stats.cfTotal + stats.lcTotal + stats.acTotal;
    psStat.textContent = total.toLocaleString();
    const parent = psStat.closest('.stat');
    if (parent) parent.classList.add('reveal', 'visible');
  }
}

/* ===== Renderers ===== */
function renderSite(site) {
  if (!site) return;

  document.title = `${site.name || 'Portfolio'} | ${site.title || 'Developer'}`;

  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  // Rich fields — support **bold**, *italic*, `code`, [text](url) links,
  // and =(#hex)text= coloring, same as everywhere else on the site.
  const setRich = (id, val) => { const el = $(id); if (el) el.innerHTML = renderInlineMarkdown(val || ''); };
  setRich('#heroEyebrow', site.eyebrow || '');
  setRich('#heroTagline', site.tagline || '');
  setRich('#avatarLabel', site.name || '');
  setRich('#avatarStatus', site.availability || '');
  setRich('#footerName', site.name || '');
  setRich('#footerLocation', site.footerLocation || '');
  set('#footerYear', new Date().getFullYear());

  // Profile image with theme support
  const profileImg = $('#profileImg');
  if (profileImg) {
    // Set initial image based on current theme
    updateProfileImage();
    profileImg.alt = escapeHtml(stripMarkdown(site.name || 'Profile'));
  }

  // Only rewrite heroName markup if the data-driven name differs from static HTML
  const heroName = $('#heroName');
  if (heroName && site.name) {
    const parts = site.name.split(' ');
    const built = parts.map((w, i) =>
      i === parts.length - 1
        ? `<span class="accent">${renderInlineMarkdown(w)}</span>`
        : renderInlineMarkdown(w)
    ).join('<br>');
    if (heroName.innerHTML.trim() !== built) heroName.innerHTML = built;
  }

  const statsEl = $('#heroStats');
  if (statsEl && site.stats?.length) {
    statsEl.innerHTML = site.stats.map(s => `
      <div class="stat reveal" ${s.id ? `data-stat-id="${escapeHtml(s.id)}"` : ''}>
        <div class="stat-value">${renderInlineMarkdown(s.value)}</div>
        <div class="stat-label">${renderInlineMarkdown(s.label)}</div>
      </div>
    `).join('');
  }

  const ctaEl = $('#heroCtas');
  if (ctaEl && site.ctas?.length) {
    ctaEl.innerHTML = site.ctas.map(c => {
      const isExt = String(c.url).startsWith('http');
      const extAttr = isExt ? ' target="_blank" rel="noopener noreferrer"' : '';
      const cls = c.type === 'primary' ? 'btn-primary' : 'btn-ghost';
      return `<a href="${escapeHtml(c.url)}" class="btn ${cls} reveal"${extAttr}>${renderInlineMarkdown(c.label)}</a>`;
    }).join('');
  }

  const contactWrap = $('#contactWrap');
  const c = site.contact;
  if (contactWrap && c) {
    contactWrap.innerHTML = `
      <div class="reveal">
        <p class="contact-intro">${renderInlineMarkdown(c.intro || 'Get in touch')}</p>
      </div>
      <div class="contact-list">
        ${(c.emails || []).map(e => `
          <a class="contact-row reveal" href="mailto:${escapeHtml(e.address)}">
            <span class="contact-label">${renderInlineMarkdown(e.label || 'Email')}</span>
            <span class="contact-value">${renderInlineMarkdown(e.address)}</span>
          </a>`).join('')}
        ${(c.phones || []).map(p => `
          <a class="contact-row reveal" href="tel:${escapeHtml(p.number.replace(/\s/g, ''))}">
            <span class="contact-label">${renderInlineMarkdown(p.label || 'Phone')}</span>
            <span class="contact-value">${renderInlineMarkdown(p.number)}</span>
          </a>`).join('')}
        ${(c.links || []).map(l => `
          <a class="contact-row reveal" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">
            <span class="contact-label">${renderInlineMarkdown(l.platform)}</span>
            <span class="contact-value">${renderInlineMarkdown(l.handle)} ↗</span>
          </a>`).join('')}
      </div>
    `;
  }
}

function renderSkills(skills) {
  const container = $('#skillsContainer');
  if (!container) return;
  if (!skills?.length) { container.innerHTML = '<div class="loading">No skills data</div>'; return; }

  container.innerHTML = skills.map(s => `
    <div class="skill-card reveal">
      <div class="skill-cat">${renderInlineMarkdown(s.category)}</div>
      <div class="skill-items">
        ${(s.items || []).map(i => `<span class="skill-pill">${renderInlineMarkdown(i)}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

function renderAchievements(items) {
  const container = $('#achievementsContainer');
  if (!container) return;
  if (!items?.length) { container.innerHTML = '<div class="loading">No achievements</div>'; return; }

  container.innerHTML = items.map((a, i) => `
    <div class="ach-item reveal" style="transition-delay:${Math.min(i * 30, 300)}ms">
      <div class="ach-rank">${renderInlineMarkdown(a.rank)}</div>
      <div>
        <div class="ach-title">${renderInlineMarkdown(a.title)}</div>
        <div class="ach-desc">${renderInlineMarkdown(a.desc)}</div>
      </div>
    </div>
  `).join('');
}

function renderProjects(projects) {
  const root = $('#projectsGrid');
  if (!root) return;
  if (!projects?.length) { root.innerHTML = '<div class="loading">No projects</div>'; return; }

  root.innerHTML = projects.map((p, i) => {
    const thumb = (p.images?.[0]) || `content/projects/${p.id}/images/01.png`;
    return `
      <div class="project-card reveal" data-id="${escapeHtml(p.id)}"
           style="transition-delay:${Math.min(i * 50, 400)}ms" role="button" tabindex="0">
        <div class="project-thumb">
          <img src="${escapeHtml(thumb)}" alt="${escapeHtml(stripMarkdown(p.title))}" loading="lazy"
               onerror="this.parentElement.innerHTML='&lt;div class=&quot;project-thumb-empty&quot;&gt;// no preview&lt;/div&gt;'" />
        </div>
        <div class="project-body">
          <div class="project-date">${renderInlineMarkdown(p.date || '')}</div>
          <div class="project-title">${renderInlineMarkdown(p.title)}</div>
          <div class="project-desc">${renderInlineMarkdown(p.shortDesc || '')}</div>
          <div class="tech-tags">
            ${(p.tech || []).map(t => `<span class="tech-tag">${renderInlineMarkdown(t)}</span>`).join('')}
          </div>
        </div>
      </div>`;
  }).join('');

  // Event delegation: one listener for the whole grid instead of one per card
  const projectMap = new Map(projects.map(p => [p.id, p]));
  attachCardEvents(root, '.project-card', (card) => async () => {
    const p = projectMap.get(card.dataset.id);
    if (!p) return;
    const md = await fetchText(`content/projects/${p.id}/index.md`);
    const images = p.images?.length ? p.images : [`content/projects/${p.id}/images/01.png`];
    modal.open(p.title, images, renderMarkdown(md || ''));
  });

  // Cards just replaced the DOM — resync the arrow buttons / drag-scroll
  initProjectsScroller();
}

/* ================================================================
   PROJECTS — horizontal scroller
   Turns #projectsGrid into a Netflix-row-style strip: arrow buttons,
   mouse-drag panning, and vertical-wheel-to-horizontal translation,
   on top of native touch/scrollbar scrolling. Section height stays
   fixed no matter how many entries data/projects.js grows to.
================================================================ */
let _projectsScrollerBound = false;

function initProjectsScroller() {
  const grid = $('#projectsGrid');
  const prevBtn = $('#projectsPrev');
  const nextBtn = $('#projectsNext');
  if (!grid || !prevBtn || !nextBtn) return;

  const cardGap = 20; // matches --gap in .projects-grid (1.25rem)

  function step() {
    const card = grid.querySelector('.project-card');
    return card ? card.getBoundingClientRect().width + cardGap : grid.clientWidth * 0.8;
  }

  function updateButtons() {
    const maxScroll = grid.scrollWidth - grid.clientWidth - 1;
    prevBtn.disabled = grid.scrollLeft <= 0;
    nextBtn.disabled = grid.scrollLeft >= maxScroll || maxScroll <= 0;
  }

  function scrollByStep(dir) {
    grid.scrollBy({ left: dir * step(), behavior: 'smooth' });
  }

  if (!_projectsScrollerBound) {
    _projectsScrollerBound = true;

    prevBtn.addEventListener('click', () => scrollByStep(-1));
    nextBtn.addEventListener('click', () => scrollByStep(1));

    grid.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); scrollByStep(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); scrollByStep(-1); }
    });

    // Translate vertical wheel motion into horizontal scroll on desktop
    grid.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      grid.scrollLeft += e.deltaY;
    }, { passive: false });

    // Click-and-drag panning — mouse only (touch already scrolls natively;
    // handling it here too would fight the browser's own touch scrolling).
    // Scroll position only moves once the pointer has actually travelled
    // past DRAG_THRESHOLD, so ordinary clicks never get mistaken for a drag.
    const DRAG_THRESHOLD = 8;
    let isDown = false, startX = 0, startScroll = 0, moved = false;

    grid.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      isDown = true; moved = false;
      startX = e.clientX;
      startScroll = grid.scrollLeft;
    });
    window.addEventListener('pointermove', (e) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > DRAG_THRESHOLD) {
        moved = true;
        grid.classList.add('dragging');
      }
      if (moved) grid.scrollLeft = startScroll - dx;
    });
    window.addEventListener('pointerup', () => {
      isDown = false;
      grid.classList.remove('dragging');
    });
    // Suppress the click-to-open-modal only when a real drag happened
    grid.addEventListener('click', (e) => {
      if (moved) { e.stopPropagation(); moved = false; }
    }, true);

    grid.addEventListener('scroll', updateButtons, { passive: true });
    window.addEventListener('resize', updateButtons);
  }

  updateButtons();
}

function renderCertificates(certs) {
  const root = $('#certificatesContainer');
  if (!root) return;
  if (!certs?.length) { root.innerHTML = '<div class="loading">No certificates</div>'; return; }

  root.innerHTML = certs.map((c, i) => `
    <div class="cert-card reveal" data-id="${escapeHtml(c.id)}"
         style="transition-delay:${Math.min(i * 40, 350)}ms" role="button" tabindex="0">
      <div class="cert-issuer">${renderInlineMarkdown(c.issuer || 'Certificate')}</div>
      <div class="cert-title">${renderInlineMarkdown(c.title)}</div>
      <div class="cert-date">${renderInlineMarkdown(c.date || '')}</div>
    </div>
  `).join('');

  const certMap = new Map(certs.map(c => [c.id, c]));
  attachCardEvents(root, '.cert-card', (card) => async () => {
    const c = certMap.get(card.dataset.id);
    if (!c) return;
    const md = await fetchText(`content/certificates/${c.id}/index.md`);
    const img = `content/certificates/${c.id}/01.png`;
    modal.open(c.title, [img], renderMarkdown(md || c.description || ''));
  });
}

/* ================================================================
   BLOGS
   ----------------------------------------------------------------
   File layout (all under content/blogs/):
     <id>.md          the post body (markdown)
     <id>.png         cover image (card thumbnail + reader header)
     <id>_<n>.png     images used inside the post
   Post metadata (title, date, blurb, tags) lives in data/blogs.js.

   renderBlogMarkdown() is a fuller renderer than renderMarkdown()
   (which stays untouched for projects/certificates). Adds images,
   ordered lists, nested lists, blockquotes, tables, hr, ~~strike~~
   and h4-h6 on top of the usual **bold**, *italic*, `code`,
   [links](url) and =(#RRGGBB)colored text=.
================================================================ */
const BLOG_DIR = 'content/blogs/';

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

function codeBlockHtml(info, code) {
  const lang = (info || '').trim().split(/\s+/)[0].toLowerCase();
  const label = lang ? (HL_LABELS[lang] || lang.toUpperCase()) : '';
  return `<div class="blog-code"><div class="blog-code-head">` +
    `<span class="blog-code-lang">${escapeHtml(label || 'code')}</span>` +
    `<button class="blog-code-copy" type="button" aria-label="Copy code to clipboard">Copy</button></div>` +
    `<pre><code${lang ? ` class="lang-${escapeHtml(lang)}"` : ''}>${highlightCode(code, lang)}</code></pre></div>`;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

/* ---------- PDFs: first-page preview via pdf.js (loaded on demand) ---------- */
const PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
let _pdfjsPromise = null;

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (_pdfjsPromise) return _pdfjsPromise;
  _pdfjsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PDFJS_BASE + 'pdf.min.js';
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    s.onerror = () => { _pdfjsPromise = null; reject(new Error('pdf.js failed to load')); };
    document.head.appendChild(s);
  });
  return _pdfjsPromise;
}

async function renderPdfPreviews(root) {
  const figs = [...root.querySelectorAll('.blog-pdf[data-pdf]')];
  if (!figs.length) return;
  const fail = (fig) => fig.classList.add('blog-pdf--fallback');

  let lib;
  try { lib = await loadPdfJs(); } catch (e) { console.warn('[blog]', e.message); figs.forEach(fail); return; }

  for (const fig of figs) {
    try {
      const doc = await lib.getDocument(fig.dataset.pdf).promise;
      if (!fig.isConnected) continue;             // post was closed / swapped meanwhile
      const wanted = parseInt(fig.dataset.pdfPage, 10) || 1;
      const pageNum = Math.min(Math.max(wanted, 1), doc.numPages);   // clamp to a page that exists
      const page = await doc.getPage(pageNum);
      const canvas = fig.querySelector('canvas');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = fig.querySelector('.blog-pdf-link').clientWidth || 700;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (cssW * dpr) / base.width });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      fig.classList.add('blog-pdf--ready');
      const pages = fig.querySelector('.blog-pdf-pages');
      if (pages) pages.textContent = pageNum > 1
        ? `page ${pageNum} of ${doc.numPages} · `
        : `${doc.numPages} page${doc.numPages === 1 ? '' : 's'} · `;
    } catch (e) {
      console.warn('[blog] PDF preview failed:', fig.dataset.pdf, e && e.message);
      fail(fig);
    }
  }
}

function renderBlogMarkdown(md, blogId) {
  if (!md) return '';

  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;
  const restore = (s) => {
    let prev;
    do { prev = s; s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[i]); } while (s !== prev);
    return s;
  };

  // Image sources: "img:2" -> <id>_2.png, "pdf:2" -> <id>_2.pdf, bare filename -> content/blogs/<name>,
  // full URLs and site paths (content/…, assets/…, /…) pass through untouched.
  const resolveSrc = (u) => {
    u = u.trim();
    const short = /^img:(\d+)$/i.exec(u);
    if (short) return `${BLOG_DIR}${blogId}_${short[1]}.png`;
    const pdfShort = /^pdf:(\d+)$/i.exec(u);
    if (pdfShort) return `${BLOG_DIR}${blogId}_${pdfShort[1]}.pdf`;
    if (/^(https?:)?\/\//i.test(u) || /^(content|assets)\//.test(u) || u.startsWith('/')) return u;
    return BLOG_DIR + u.replace(/^\.\//, '');
  };
  const unsafeUrl = (u) => /^\s*(javascript|data|vbscript):/i.test(u.replace(/&#?\w+;/g, ''));

  // Trailing "{key=val, key2=val2, flag}" after an image/embed target, e.g.
  // {width=200} {height=40,width=auto} {embed=true} {page=3}. A bare word
  // ("embed") is shorthand for embed=true.
  const parseAttrs = (str) => {
    const o = {};
    if (!str) return o;
    str.split(',').forEach((part) => {
      const m = /^\s*([a-zA-Z]+)\s*(?:=\s*(.+?))?\s*$/.exec(part);
      if (m) o[m[1].toLowerCase()] = m[2] !== undefined ? m[2].trim() : 'true';
    });
    return o;
  };
  // width/height: a bare number is read as px; "50%", "10rem" etc pass through as-is.
  // Given only one of the two, the other is "auto" so the image keeps its aspect ratio.
  const cssLen = (v) => (/^\d+$/.test(v) ? `${v}px` : v);
  const sizeStyle = (attrs) => {
    const w = attrs.width, h = attrs.height;
    if (!w && !h) return '';
    return ` style="width:${w ? cssLen(w) : 'auto'};height:${h ? cssLen(h) : 'auto'};max-width:100%;"`;
  };

  // alt/src arrive already HTML-escaped (block path escapes them explicitly)
  const imgTag = (alt, src, cls, styleAttr = '') =>
    `<img class="${cls}" src="${resolveSrc(src)}" alt="${alt}" loading="lazy"${styleAttr} />`;
  const isPdf = (src) => /\.pdf(?:[?#].*)?$/i.test(resolveSrc(src));
  const pdfFigure = (altHtml, altPlain, src, attrs = {}) => {
    const url = resolveSrc(src);
    const page = /^\d+$/.test(attrs.page || '') ? parseInt(attrs.page, 10) : 1;
    const href = page > 1 ? `${url}#page=${page}` : url;
    const openLabel = page > 1 ? ` at page ${page}` : '';
    return `<figure class="blog-pdf blog-figure" data-pdf="${url}" data-pdf-page="${page}">` +
      `<a class="blog-pdf-link" href="${href}" target="_blank" rel="noopener noreferrer" ` +
      `aria-label="Open PDF${openLabel} in a new tab${altPlain ? ': ' + altPlain : ''}">` +
      `<canvas></canvas>` +
      `<span class="blog-pdf-badge">📄 <span class="blog-pdf-pages"></span>click to open` +
      `${page > 1 ? ` page ${page} of` : ''} the full PDF ↗</span></a>` +
      `${altHtml ? `<figcaption>${altHtml}</figcaption>` : ''}</figure>`;
  };
  // Embeds: ![Caption](https://example.com){embed=true} — an iframe of any page/app/video.
  // With no explicit size it's a responsive 16:9 box; width/height fix it to an exact size instead.
  const embedFigure = (altHtml, altPlain, url, attrs = {}) => {
    const sized = attrs.width || attrs.height;
    const style = sized
      ? ` style="width:${attrs.width ? cssLen(attrs.width) : '100%'};height:${attrs.height ? cssLen(attrs.height) : '400px'};aspect-ratio:auto;"`
      : '';
    return `<figure class="blog-embed-figure blog-figure">` +
      `<div class="blog-embed"${style}>` +
      `<iframe src="${resolveSrc(url)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" ` +
      `sandbox="allow-scripts allow-same-origin allow-popups allow-forms" ` +
      `title="${altPlain || 'Embedded content'}"></iframe></div>` +
      `${altHtml ? `<figcaption>${altHtml}</figcaption>` : ''}</figure>`;
  };

  function inline(text) {
    let h = escapeHtml(text);                     // everything below sees escaped text
    h = h.replace(/`([^`]+?)`/g, (_, c) => keep(`<code>${c}</code>`));
    h = h.replace(/=\(#([A-Fa-f0-9]{6})\)(.*?)=/gs,
      (_, hex, c) => `${keep(`<span style="color:#${hex}">`)}${c}${keep('</span>')}`);
    h = h.replace(/!\[([^\]]*)\]\(([^)\s]+)\)(?:\{([^}]*)\})?/g,
      (_, alt, src, attrStr) => {
        if (unsafeUrl(src)) return '';
        const attrs = parseAttrs(attrStr);
        if (attrs.embed === 'true') {
          const w = attrs.width ? cssLen(attrs.width) : '100%', h = attrs.height ? cssLen(attrs.height) : '360px';
          return keep(`<span class="blog-embed blog-embed--inline" style="width:${w};height:${h};aspect-ratio:auto;">` +
            `<iframe src="${resolveSrc(src)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" ` +
            `sandbox="allow-scripts allow-same-origin allow-popups allow-forms" ` +
            `title="${stripMarkdown(alt) || 'Embedded content'}"></iframe></span>`);
        }
        if (isPdf(src)) return keep(`<a href="${resolveSrc(src)}" target="_blank" rel="noopener noreferrer">📄 ${alt || 'PDF'}</a>`);
        return keep(imgTag(alt, src, 'blog-inline-img', sizeStyle(attrs)));
      });
    h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
      if (unsafeUrl(url)) return label;
      const ext = /^(https?:)?\/\//i.test(url) || url.startsWith('mailto:');
      const attrs = ext ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `${keep(`<a href="${url}"${attrs}>`)}${label}${keep('</a>')}`;
    });
    h = h.replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
         .replace(/~~(.+?)~~/gs, '<del>$1</del>')
         .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>');
    return h;
  }

  const isRule = (l) => /^\s*([-*_])(\s*\1){2,}\s*$/.test(l);
  const isHeading = (l) => /^#{1,6}\s+/.test(l);
  const isQuote = (l) => /^\s*>/.test(l);
  const listRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  const isFence = (l) => /^\u0000\d+\u0000$/.test(l.trim());
  const imgLineRe = /^\s*!\[([^\]]*)\]\(([^)\s]+)\)(?:\{([^}]*)\})?\s*$/;
  const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes('-');
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

  function parseBlocks(lines) {
    const out = [];
    let i = 0;

    const startsBlock = (l, next) =>
      isHeading(l) || isRule(l) || isQuote(l) || listRe.test(l) || isFence(l) ||
      imgLineRe.test(l) || (l.includes('|') && next !== undefined && isTableSep(next));

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      if (isFence(line)) { out.push(line.trim()); i++; continue; }

      if (isRule(line)) { out.push('<hr>'); i++; continue; }

      let m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (m) {                                    // # and ## -> <h2> (the post title is the page's <h1>)
        const lvl = Math.max(2, m[1].length);
        out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
        i++; continue;
      }

      m = imgLineRe.exec(line);
      if (m) {
        const alt = m[1];
        const srcEsc = escapeHtml(m[2]);
        const attrs = parseAttrs(m[3]);
        const captionHtml = alt ? inline(alt) : '';
        const captionPlain = escapeHtml(stripMarkdown(alt));
        if (unsafeUrl(m[2])) out.push('');
        else if (attrs.embed === 'true') out.push(embedFigure(captionHtml, captionPlain, srcEsc, attrs));
        else if (isPdf(srcEsc)) out.push(pdfFigure(captionHtml, captionPlain, srcEsc, attrs));
        else out.push(`<figure class="blog-figure">${imgTag(escapeHtml(alt), srcEsc, 'blog-img', sizeStyle(attrs))}` +
          `${captionHtml ? `<figcaption>${captionHtml}</figcaption>` : ''}</figure>`);
        i++; continue;
      }

      if (isQuote(line)) {
        const q = [];
        while (i < lines.length && isQuote(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        out.push(`<blockquote>${parseBlocks(q).join('\n')}</blockquote>`);
        continue;
      }

      if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        const head = cells(line);
        const aligns = cells(lines[i + 1]).map(c =>
          /^:-+:$/.test(c) ? 'center' : /^-+:$/.test(c) ? 'right' : '');
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) { rows.push(cells(lines[i])); i++; }
        const td = (tag, c, k) => `<${tag}${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${inline(c)}</${tag}>`;
        out.push(`<div class="blog-table-wrap"><table><thead><tr>${head.map((c, k) => td('th', c, k)).join('')}</tr></thead>` +
          `<tbody>${rows.map(r => `<tr>${head.map((_, k) => td('td', r[k] || '', k)).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }

      m = listRe.exec(line);
      if (m) {
        const baseIndent = m[1].length;
        const ordered = /\d/.test(m[2]);
        const items = [];
        while (i < lines.length) {
          const l = lines[i];
          const lm = listRe.exec(l);
          if (lm && lm[1].length <= baseIndent) {
            if (lm[1].length < baseIndent) break;
            items.push({ text: lm[3], sub: [] });
          } else if (l.trim() && items.length && /^\s+/.test(l)) {
            items[items.length - 1].sub.push(l.slice(Math.min(l.match(/^\s*/)[0].length, baseIndent + 2)));
          } else break;
          i++;
        }
        const tag = ordered ? 'ol' : 'ul';
        out.push(`<${tag}>${items.map(it =>
          `<li>${inline(it.text)}${it.sub.length ? parseBlocks(it.sub).join('') : ''}</li>`).join('')}</${tag}>`);
        continue;
      }

      // paragraph — runs until a blank line or the start of another block
      const para = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) { para.push(lines[i]); i++; }
      out.push(`<p>${inline(para.join('\n')).replace(/\n/g, '<br>')}</p>`);
    }
    return out;
  }

  let src = String(md).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
  src = src.replace(/^```([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm,
    (_, info, code) => `\n${keep(codeBlockHtml(info, code.replace(/\n$/, '')))}\n`);

  return restore(parseBlocks(src.split('\n')).join('\n'));
}

function renderBlogs(blogs) {
  const root = $('#blogsGrid');
  if (!root) return;
  blogs = (blogs || []).filter((b) => !b.hidden);   // hidden posts skip the grid, but their
                                                      // #post-<id> link still opens directly —
                                                      // so you can preview a draft before flipping hidden to false
  if (!blogs.length) { root.innerHTML = '<div class="loading">No blogs yet</div>'; return; }

  root.innerHTML = blogs.map((b, i) => `
    <a class="project-card blog-card reveal" href="#post-${escapeHtml(b.id)}" data-id="${escapeHtml(b.id)}"
       style="transition-delay:${Math.min(i * 50, 400)}ms">
      <div class="project-thumb">
        <img src="${BLOG_DIR}${escapeHtml(b.id)}.png" alt="${escapeHtml(stripMarkdown(b.title))}" loading="lazy"
             onerror="this.parentElement.innerHTML='&lt;div class=&quot;project-thumb-empty&quot;&gt;// no cover&lt;/div&gt;'" />
      </div>
      <div class="project-body">
        <div class="project-date">${renderInlineMarkdown(b.date || '')}</div>
        <div class="project-title">${renderInlineMarkdown(b.title)}</div>
        <div class="project-desc">${renderInlineMarkdown(b.shortDesc || '')}</div>
        <div class="tech-tags">
          ${(b.tags || []).map(t => `<span class="tech-tag">${renderInlineMarkdown(t)}</span>`).join('')}
        </div>
      </div>
    </a>`).join('');
  // Cards are plain #post-<id> links (middle-click / copy-link work). A normal
  // click is intercepted so we push a history entry we own — that lets the
  // reader's Back button and the browser Back button behave identically.
  if (!root._blogBound) {
    root._blogBound = true;
    root.addEventListener('click', (e) => {
      const card = e.target.closest('.blog-card');
      if (!card || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      history.pushState({ blogNav: true }, '', `#post-${card.dataset.id}`);
      blogReader.show(card.dataset.id);
    });
  }
}

const blogReader = {
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

/* ================================================================
   SCROLL REVEAL — visibility rules live in CSS; JS only drives state
================================================================ */
function initScrollReveal() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reduced motion: skip the observer, show everything immediately
  if (reduced) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
    return;
  }

  /* Mark section headings */
  document.querySelectorAll('.sec-label, .sec-title').forEach(el => {
    el.classList.add('reveal');
  });

  /* Mark hero elements */
  document.querySelectorAll('#hero .stat, #hero .btn, .hero-eyebrow, .hero-name, .hero-tagline').forEach(el => {
    el.classList.add('reveal');
  });

  /* Stagger hero elements */
  document.querySelectorAll('#hero .reveal').forEach((el, i) => {
    el.style.setProperty('--stagger-delay', `${Math.min(i * 80, 400)}ms`);
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const parent = el.parentElement;
      const siblings = [...parent.querySelectorAll('.reveal:not(.visible)')];
      const sibIdx = siblings.indexOf(el);
      const custom = parseFloat(el.style.getPropertyValue('--stagger-delay')) || 0;
      const stagger = Math.min(sibIdx * ANIM_STAGGER_MS, ANIM_STAGGER_MAX);

      setTimeout(() => {
        el.classList.add('visible');
        el.dispatchEvent(new CustomEvent('revealed', { bubbles: true }));
      }, custom + stagger);

      observer.unobserve(el);
    });
  }, { threshold: ANIM_THRESHOLD, rootMargin: ANIM_ROOT_MARGIN });

  requestAnimationFrame(() => {
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  });
}

/* ===== Button ripple ===== */
function initLinkEffects() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;

    btn.querySelectorAll('.ripple').forEach(r => r.remove());

    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });
}

/* ================================================================
   UNIFIED SCROLL HANDLER
   One rAF-throttled listener drives the progress bar, parallax, and
   heatmap fill — progress is computed once per frame and shared.
================================================================ */
function initScrollEffects() {
  /* ── progress bar ── */
  const progressBar = document.createElement('div');
  progressBar.className = 'scroll-progress';
  document.body.appendChild(progressBar);

  const nativePB = CSS.supports('animation-timeline', 'scroll()');

  /* ── heatmap elements ── */
  const heatmap = document.getElementById('heatmap');
  const heatmapBar = document.getElementById('heatmapBar');
  const indicator = document.getElementById('heatmapIndicator');
  const markers = document.querySelectorAll('.heatmap-marker');
  const pctDisplay = document.querySelector('.heatmap-percentage');
  const hasHeatmap = !!(heatmap && heatmapBar && indicator);

  /* ── heatmap particles ── */
  if (hasHeatmap) {
    const particlesEl = document.getElementById('heatmapParticles');
    if (particlesEl) {
      particlesEl.innerHTML = '';
      for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'heatmap-particle';
        const sz = (1 + Math.random() * 3) + 'px';
        p.style.cssText = [
          `left:${Math.random() * 100}%`,
          `width:${sz}`,
          `height:${sz}`,
          `opacity:${(0.2 + Math.random() * 0.3).toFixed(2)}`,
          `animation-duration:${(3 + Math.random() * 4).toFixed(2)}s`,
          `animation-delay:${(Math.random() * 5).toFixed(2)}s`,
        ].join(';');
        particlesEl.appendChild(p);
      }
    }

    /* Heatmap hover */
    heatmap.addEventListener('mouseenter', () => { heatmap.style.opacity = '0.8'; });
    heatmap.addEventListener('mouseleave', () => { heatmap.style.opacity = '0.4'; });

    /* Click to jump */
    heatmap.addEventListener('click', (e) => {
      const rect = heatmap.getBoundingClientRect();
      const pct = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
      const targetScroll = pct * (document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: targetScroll, behavior: 'smooth' });
    });
  }

  /* ── grid-bg reference (parallax) ── */
  const gridBg = document.querySelector('.grid-bg');

  let ticking = false;
  let lastTop = 0;

  function onScroll() {
    // Computed once per frame, shared by every effect below
    const scrollTop = window.pageYOffset;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

    // Skip JS-driven width updates if native CSS scroll-timeline is supported
    if (!nativePB && Math.abs(scrollTop - lastTop) > 1) {
      progressBar.style.width = Math.min(progress, 100) + '%';
      lastTop = scrollTop;
    }

    /* Parallax grid */
    if (gridBg && scrollTop < 1000) {
      gridBg.style.transform = `translateY(${scrollTop * 0.15}px)`;
    }

    /* Heatmap */
    if (hasHeatmap) {
      const eased = Math.pow(progress / 100, 0.7) * 100;
      const clamped = Math.min(Math.max(eased, 0), 100);

      heatmapBar.style.height = clamped + '%';

      const hmH = heatmap.offsetHeight;
      indicator.style.top = Math.min(Math.max((progress / 100) * hmH, 0), hmH) + 'px';

      markers.forEach(m => {
        const v = parseInt(m.dataset.value, 10);
        m.classList.toggle('active', !isNaN(v) && progress >= v);
      });

      if (pctDisplay) pctDisplay.textContent = Math.round(clamped) + '% density';

      // Single CSS var write instead of restyling all 30 particle nodes
      const speed = (3 + (progress / 100) * 4).toFixed(2);
      heatmap.style.setProperty('--particle-speed', speed + 's');

      const glow = 0.05 + (progress / 100) * 0.3;
      heatmapBar.style.boxShadow =
        `0 0 ${(20 + progress * 1.5).toFixed(1)}px rgba(232,81,15,${glow.toFixed(3)})`;

      const p = progress / 100;
      heatmapBar.style.background = `linear-gradient(to top,
        rgba(232,81,15,${(0.05 + p * 0.1).toFixed(3)}) 0%,
        rgba(232,81,15,${(0.15 + p * 0.2).toFixed(3)}) 15%,
        rgba(232,81,15,${(0.30 + p * 0.3).toFixed(3)}) 30%,
        rgba(232,81,15,${(0.50 + p * 0.4).toFixed(3)}) 50%,
        rgba(232,81,15,${(0.70 + p * 0.3).toFixed(3)}) 70%,
        rgba(232,81,15,${(0.85 + p * 0.15).toFixed(3)}) 85%,
        rgba(232,81,15,1) 100%)`;
    }
  }

  /* Initial paint */
  onScroll();

  /* Single rAF-throttled scroll listener */
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => { onScroll(); ticking = false; });
      ticking = true;
    }
  }, { passive: true });

  /* Resize */
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(onScroll, 200);
  });

  /* Smooth scroll for nav links */
  document.querySelectorAll('nav a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const id = this.getAttribute('href');
      if (id === '#') return;
      const target = document.querySelector(id);
      if (target) {
        const top = target.getBoundingClientRect().top + window.pageYOffset - 60;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        if (history.pushState) history.pushState(null, '', id);
      }
    });
  });
}

/* ================================================================
   GLOBAL HOVER TOOLTIP
   ----------------------------------------------------------------
   One shared tooltip for the whole site, positioned just above
   whatever element is being hovered, instead of each component
   managing its own tooltip node/positioning logic.

   Exposed as window.GlobalTip:
     GlobalTip.show(html, target) — show/replace contents, anchored
                                     above `target`
     GlobalTip.hide()             — hide it
     GlobalTip.bind(el, getHtml)
            — wires mouseenter/mouseleave + focus/blur on `el`;
              getHtml(el) returns the markup to display.

   Any component that wants a hover tooltip should call this rather
   than positioning its own — keeps one element in the DOM and one
   consistent look/behaviour for every hover on the page.
   ================================================================ */
window.GlobalTip = (function () {
  'use strict';

  let el = null;
  let hideTimer = null;
  let currentTarget = null;

  function ensure() {
    if (el && document.body.contains(el)) return el;
    el = document.createElement('div');
    el.className = 'global-tip';
    el.id = 'globalTip';
    el.setAttribute('role', 'tooltip');
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    injectStyles();
    return el;
  }

  // Anchors the tooltip directly above `target`, horizontally
  // centred on it, clamped so it never runs off-screen. Falls back
  // to below the target if there isn't room above (e.g. near the
  // very top of the viewport).
  function positionAboveTarget(tip, target) {
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const gap = 8;
    const margin = 8;

    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));

    let top = rect.top - tipRect.height - gap;
    const flipped = top < margin;
    if (flipped) top = rect.bottom + gap;   // not enough room above

    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.classList.toggle('global-tip--below', flipped);
  }

  function show(html, target) {
    if (!html) return;
    const tip = ensure();
    clearTimeout(hideTimer);
    currentTarget = target || null;
    tip.innerHTML = html;
    tip.setAttribute('aria-hidden', 'false');
    positionAboveTarget(tip, currentTarget);   // size/position first…
    void tip.offsetWidth;                       // …force reflow…
    tip.classList.add('global-tip--visible');    // …then fade in
  }

  function hide() {
    if (!el) return;
    currentTarget = null;
    el.classList.remove('global-tip--visible');
    el.setAttribute('aria-hidden', 'true');
    // clear contents after the fade so stale text isn't read by AT
    hideTimer = setTimeout(() => { if (el) el.innerHTML = ''; }, 200);
  }

  function bind(target, getHtml) {
    if (!target) return;
    const run = () => show(typeof getHtml === 'function' ? getHtml(target) : getHtml, target);
    target.addEventListener('mouseenter', run);
    target.addEventListener('focus', run);
    target.addEventListener('mouseleave', hide);
    target.addEventListener('blur', hide);
  }

  function injectStyles() {
    if (document.getElementById('global-tip-styles')) return;
    const style = document.createElement('style');
    style.id = 'global-tip-styles';
    style.textContent = `
      .global-tip {
        position: fixed;
        top: -9999px;   /* real position set inline by JS before it's shown */
        left: -9999px;
        z-index: 190;
        pointer-events: none;
        max-width: min(90vw, 320px);
        width: max-content;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
        justify-content: center;
        background: var(--bg2, #111);
        border: 1px solid var(--border2, #2a2a2a);
        border-radius: 10px;
        padding: 0.4rem 0.7rem;
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.7rem;
        line-height: 1.4;
        color: var(--text, #ededed);
        text-align: center;
        box-shadow: 0 10px 30px rgba(0,0,0,0.45);
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      .global-tip--visible {
        opacity: 1;
      }
      /* pointer arrow — points down at the target by default (tip
         sits above it); flipped to point up when there wasn't room
         above and the tip had to render below the target instead. */
      .global-tip::after {
        content: '';
        position: absolute;
        left: 50%;
        bottom: -5px;
        transform: translateX(-50%);
        border: 5px solid transparent;
        border-top-color: var(--bg2, #111);
        border-bottom: none;
      }
      .global-tip--below::after {
        bottom: auto;
        top: -5px;
        border-top-color: transparent;
        border-bottom-color: var(--bg2, #111);
        border-top: none;
        border-bottom: 5px solid var(--bg2, #111);
      }
      .global-tip strong {
        color: var(--green, #e8510f);
        font-weight: 700;
      }
      .global-tip span {
        color: var(--text-dim, #a0a0a0);
        padding-left: 0.5rem;
        border-left: 1px solid var(--border2, #2a2a2a);
      }
      .global-tip span:first-child { border-left: none; padding-left: 0; }

      [data-theme="light"] .global-tip {
        background: #ffffff;
        border-color: var(--border2);
        color: var(--text);
        box-shadow: 0 10px 30px rgba(0,0,0,0.10);
      }
      [data-theme="light"] .global-tip::after { border-top-color: #ffffff; }
      [data-theme="light"] .global-tip--below::after { border-top-color: transparent; border-bottom-color: #ffffff; }
      [data-theme="light"] .global-tip strong { color: var(--green-dark); }
      [data-theme="light"] .global-tip span   { color: var(--text-dim); border-left-color: var(--border2); }

      @media (prefers-reduced-motion: reduce) {
        .global-tip { transition: none; }
      }
      @media (max-width: 640px) {
        .global-tip { font-size: 0.66rem; max-width: 85vw; }
      }
    `;
    document.head.appendChild(style);
  }

  // Recompute position on resize while a tooltip is visible (target
  // may have moved).
  window.addEventListener('resize', () => {
    if (el && currentTarget && el.classList.contains('global-tip--visible')) {
      positionAboveTarget(el, currentTarget);
    }
  }, { passive: true });

  // Hide on scroll so it never strands at a stale position relative
  // to its (now-moved) target.
  window.addEventListener('scroll', hide, { passive: true });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

  return { show, hide, bind };
})();

/* ================================================================
   heatmap.js — Multi-platform Coding Activity Heatmap
   Fetches: GitHub · Codeforces · LeetCode · AtCoder (optional)
   No dependencies. Drop alongside main.js and add:
     <script src="assets/js/heatmap.js" defer></script>
   ================================================================ */

(function () {
  'use strict';

  /* ── CONFIG ─────────────────────────────────────────────────── */
  // Usernames are read from data-* attrs on #activityHeatmap.
  // Override here if you prefer:
  const OVERRIDE = {
    github: null,
    codeforces: null,
    leetcode: null,
    atcoder: null,   // leave null/empty to skip
  };

  const WEEKS_TO_SHOW = 53;  // ~1 year
  const CELL_SIZE = 11;
  const CELL_GAP = 3;
  const CELL_STEP = CELL_SIZE + CELL_GAP;

  /*
   * Theme-aware cell palettes.
   * Opacity-based greens wash out on light and disappear on very dark backgrounds
   * — so we use solid hex stops tuned per theme instead.
   *
   * Dark  : empty cell is a visible orange-tinted slate; oranges step muted → vivid.
   * Light : empty cell is soft peach; oranges are deep enough to read on white.
   */
  const PALETTES = {
    dark: [
      'transparent', // 0 — empty : invisible, blends into dark bg
      '#7a2a0a',   // 1 — low   : deep rust
      '#a83a0d',   // 2 — mid
      '#e8510f',   // 3 — high  : theme accent
      '#ff6b35',   // 4 — peak  : bright vivid orange
    ],
    light: [
      'transparent', // 0 — empty : invisible, blends into light bg
      '#e8834f',   // 1 — low   : soft orange
      '#d1611f',   // 2 — mid
      '#b0430a',   // 3 — high
      '#7a2a05',   // 4 — peak  : deep burnt orange, max contrast on light bg
    ],
  };

  function getLevels() {
    const theme = document.documentElement.dataset.theme || 'dark';
    return PALETTES[theme] || PALETTES.dark;
  }

  /* ── HELPERS ─────────────────────────────────────────────────── */
  /** ISO date string YYYY-MM-DD for a Date object */
  const toISO = (d) => d.toISOString().slice(0, 10);

  /** Date object for a YYYY-MM-DD string (local time) */
  const fromISO = (s) => new Date(s + 'T00:00:00');

  /** Number of days between two Date objects */
  const daysBetween = (a, b) => Math.round((b - a) / 86_400_000);

  /** Add n days to Date d */
  const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);

  /** Returns the Sunday that starts the week containing d */
  function weekStart(d) {
    const copy = new Date(d);
    copy.setDate(copy.getDate() - copy.getDay());
    return copy;
  }

  /* ── DATA FETCHERS ───────────────────────────────────────────── */

  /**
   * GitHub: contributions via the public contributions endpoint.
   * Uses the undocumented but stable ?from=&to= calendar endpoint
   * (same one the profile page uses).  Falls back gracefully.
   */
  async function fetchGitHub(username) {
    if (!username) return {};
    const map = {};
    try {
      // GitHub's contributions calendar is only exposed via HTML scraping
      // or the GraphQL API (needs token).  We use the public
      // contributions-collection via the v4 API without a token by
      // hitting the public JSON that the contribution graph uses.
      // As a reliable no-token alternative we use ghchart.rshah.org.
      const url = `https://github-contributions-api.jogruber.de/v4/${username}?y=last`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(r.status);
      const json = await r.json();
      // Response: { contributions: [{date:'YYYY-MM-DD', count:N}, ...] }
      for (const { date, count } of (json.contributions || [])) {
        if (count > 0) map[date] = (map[date] || 0) + count;
      }
    } catch (e) {
      console.warn('[heatmap] GitHub fetch failed:', e.message);
    }
    return map;
  }

  /**
   * Codeforces: /user.status returns all submissions AND rating.
   * Returns { submissions: {}, rating: 0 }
   */
  async function fetchCodeforces(handle) {
    if (!handle) return { submissions: {}, rating: 0 };
    const map = {};
    let rating = 0;
    try {
      // Get user info for rating
      const userUrl = `https://codeforces.com/api/user.info?handles=${handle}`;
      const userRes = await fetch(userUrl, { signal: AbortSignal.timeout(5000) });
      if (userRes.ok) {
        const userJson = await userRes.json();
        if (userJson.status === 'OK' && userJson.result.length > 0) {
          rating = userJson.result[0].rating || 0;
        }
      }

      // Get submissions
      const url = `https://codeforces.com/api/user.status?handle=${handle}&from=1&count=10000`;
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(r.status);
      const json = await r.json();
      if (json.status !== 'OK') throw new Error(json.comment);
      for (const sub of json.result) {
        const date = toISO(new Date(sub.creationTimeSeconds * 1000));
        map[date] = (map[date] || 0) + 1;
      }
    } catch (e) {
      console.warn('[heatmap] Codeforces fetch failed:', e.message);
    }
    return { submissions: map, rating };
  }

  /**
   * LeetCode: public GraphQL API.
   * submissionCalendar is a JSON-encoded map of Unix timestamps → count.
   */
  async function fetchLeetCode(username) {
    if (!username) return {};
    const map = {};

    // leetcode.com/graphql blocks CORS from browsers.
    // alfa-leetcode-api is a free public CORS proxy that mirrors the same data.
    // Endpoint is path-param style: /:username/calendar?year=YYYY
    // (the old ?username=&year= query-string route is retired and 404s).
    const url = `https://alfa-leetcode-api.onrender.com/${encodeURIComponent(username)}/calendar?year=${new Date().getFullYear()}`;

    // The free Render instance sleeps when idle and can take 20-50s to cold-start
    // on the first request. One retry with a longer timeout covers that case
    // instead of giving up after a single 12s attempt.
    const attempts = [12000, 25000];

    for (let i = 0; i < attempts.length; i++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(attempts[i]) });
        if (!r.ok) throw new Error(r.status);
        const json = await r.json();
        // Response: { submissionCalendar: '{"timestamp": count, ...}' }
        const raw = json?.submissionCalendar;
        if (!raw) throw new Error('empty response');
        const cal = typeof raw === 'string' ? JSON.parse(raw) : raw;
        for (const [ts, count] of Object.entries(cal)) {
          const date = toISO(new Date(Number(ts) * 1000));
          map[date] = (map[date] || 0) + count;
        }
        return map; // success
      } catch (e) {
        console.warn(`[heatmap] LeetCode fetch attempt ${i + 1} failed:`, e.message);
      }
    }
    return map; // both attempts failed — heatmap still renders other platforms
  }

  /**
   * AtCoder: uses the unofficial kenkoooo contest results API.
   * Returns one entry per accepted submission.
   */
  async function fetchAtCoder(username) {
    if (!username) return {};
    const map = {};
    try {
      const url = `https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${username}&from_second=0`;
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(r.status);
      const json = await r.json();
      for (const sub of json) {
        if (sub.result !== 'AC') continue;
        const date = toISO(new Date(sub.epoch_second * 1000));
        map[date] = (map[date] || 0) + 1;
      }
    } catch (e) {
      console.warn('[heatmap] AtCoder fetch failed:', e.message);
    }
    return map;
  }

  /* ── MERGE + STATS ────────────────────────────────────────────── */
  /**
   * Merge per-platform maps into { date → { total, gh, cf, lc, ac } }
   */
  function merge(gh, cf, lc, ac) {
    const all = {};
    const add = (src, key) => {
      for (const [d, n] of Object.entries(src)) {
        if (!all[d]) all[d] = { total: 0, gh: 0, cf: 0, lc: 0, ac: 0 };
        all[d][key] += n;
        all[d].total += n;
      }
    };
    add(gh, 'gh');
    add(cf, 'cf');
    add(lc, 'lc');
    add(ac, 'ac');
    return all;
  }

  function computeStats(data) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Only look at the past 365 days
    const cutoff = addDays(today, -364);
    let total = 0;
    let longest = 0;
    let current = 0;
    let lastDate = null;
    let activeDays = 0;
    let githubTotal = 0;
    let cfTotal = 0;
    let lcTotal = 0;
    let acTotal = 0;

    // Walk every day in range in order
    const start = new Date(cutoff);
    for (let i = 0; i <= 364; i++) {
      const d = addDays(start, i);
      const iso = toISO(d);
      const day = data[iso];

      if (day && day.total > 0) {
        total += day.total;
        githubTotal += day.gh;
        cfTotal += day.cf;
        lcTotal += day.lc;
        acTotal += day.ac;
        activeDays++;

        if (lastDate && daysBetween(lastDate, d) === 1) {
          current++;
        } else {
          current = 1;
        }
        if (current > longest) longest = current;
        lastDate = d;
      } else {
        current = 0;
        lastDate = null;
      }
    }

    // Current streak (up to and including today)
    let streak = 0;
    for (let i = 364; i >= 0; i--) {
      const iso = toISO(addDays(start, i));
      if (data[iso]?.total > 0) streak++;
      else break;
    }

    return { total, longest, streak, activeDays, githubTotal, cfTotal, lcTotal, acTotal };
  }

  /* ── LEVEL MAPPING ───────────────────────────────────────────── */
  function countToLevel(count, max) {
    if (!count || count === 0) return 0;
    if (max <= 0) return 1;
    const pct = count / max;
    if (pct < 0.15) return 1;
    if (pct < 0.35) return 2;
    if (pct < 0.65) return 3;
    return 4;
  }

  /* ── RENDER ──────────────────────────────────────────────────── */
  function render(root, data, stats, usernames) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Grid starts WEEKS_TO_SHOW weeks ago, on a Sunday
    const gridStart = weekStart(addDays(today, -(WEEKS_TO_SHOW - 1) * 7));

    // Build week columns: array of 7-day arrays
    const weeks = [];
    for (let w = 0; w < WEEKS_TO_SHOW; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(gridStart, w * 7 + d);
        if (date > today) { week.push(null); continue; }
        const iso = toISO(date);
        week.push({ date, iso, day: data[iso] || null });
      }
      weeks.push(week);
    }

    // Max count for level scaling
    const maxCount = Math.max(1, ...Object.values(data).map(d => d.total));

    // SVG dimensions
    const svgW = WEEKS_TO_SHOW * CELL_STEP - CELL_GAP + 32; // +32 for day labels
    const svgH = 7 * CELL_STEP - CELL_GAP + 28;             // +28 for month labels

    // Month label positions
    const monthLabels = [];
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      const firstDay = week.find(d => d !== null);
      if (!firstDay) return;
      const m = firstDay.date.getMonth();
      if (m !== lastMonth) {
        monthLabels.push({ x: 32 + wi * CELL_STEP, label: firstDay.date.toLocaleString('default', { month: 'short' }) });
        lastMonth = m;
      }
    });

    // Day labels (S M T W T F S)
    const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    // ═══ NEW: Generate last updated timestamp ═══
    const now = new Date();
    const utcString = now.toUTCString(); // "Wed, 03 Jul 2026 15:30:00 GMT"
    // For a cleaner format:
    const formattedDate = now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    root.innerHTML = `
      <div class="ahm-wrap">

        <!-- Stats bar -->
        <div class="ahm-stats">
          <div class="ahm-stat">
            <span class="ahm-stat-value">${stats.total.toLocaleString()}</span>
            <span class="ahm-stat-label">total submissions</span>
          </div>
          <div class="ahm-stat">
            <span class="ahm-stat-value">${stats.activeDays}</span>
            <span class="ahm-stat-label">active days</span>
          </div>
          <div class="ahm-stat">
            <span class="ahm-stat-value">${stats.streak}</span>
            <span class="ahm-stat-label">current streak</span>
          </div>
          <div class="ahm-stat">
            <span class="ahm-stat-value">${stats.longest}</span>
            <span class="ahm-stat-label">longest streak</span>
          </div>
          <div class="ahm-platform-badges">
            ${usernames.github ? `<span class="ahm-badge" data-platform="gh">⬡ GitHub <em>${stats.githubTotal.toLocaleString()}</em></span>` : ''}
            ${usernames.codeforces ? `<span class="ahm-badge" data-platform="cf">● CF <em>${stats.cfTotal.toLocaleString()}</em></span>` : ''}
            ${usernames.leetcode ? `<span class="ahm-badge" data-platform="lc">◆ LC <em>${stats.lcTotal.toLocaleString()}</em></span>` : ''}
            ${usernames.atcoder ? `<span class="ahm-badge" data-platform="ac">▲ AC <em>${stats.acTotal.toLocaleString()}</em></span>` : ''}
          </div>
        </div>

        <!-- Last Updated Timestamp -->
        <div class="ahm-last-updated">
          <span class="ahm-updated-icon">🔄</span>
          Last updated: <time datetime="${now.toISOString()}">${formattedDate}</time>
        </div>

        <!-- Heatmap grid -->
        <div class="ahm-grid-wrap">
          <svg class="ahm-svg" viewBox="0 0 ${svgW} ${svgH}"
               role="img" aria-label="Coding activity heatmap for the past year">

            <!-- Month labels -->
            ${monthLabels.map(({ x, label }) =>
      `<text x="${x}" y="10" class="ahm-month">${label}</text>`
    ).join('')}

            <!-- Day labels -->
            ${dayNames.map((name, i) =>
      (i % 2 === 1)   // only M W F for density
        ? `<text x="14" y="${18 + i * CELL_STEP + CELL_SIZE * 0.75}" class="ahm-day">${name}</text>`
        : ''
    ).join('')}

            <!-- Cells -->
            ${weeks.map((week, wi) =>
      week.map((cell, di) => {
        if (!cell) return '';
        const x = 32 + wi * CELL_STEP;
        const y = 18 + di * CELL_STEP;
        const count = cell.day?.total || 0;
        const level = countToLevel(count, maxCount);
        const fill = getLevels()[level];

        // Tooltip data
        const iso = cell.iso;
        const d = cell.day;
        const tip = count === 0
          ? `No activity · ${iso}`
          : [
            `${count} submission${count > 1 ? 's' : ''} · ${iso}`,
            d?.gh ? `GitHub: ${d.gh}` : '',
            d?.cf ? `Codeforces: ${d.cf}` : '',
            d?.lc ? `LeetCode: ${d.lc}` : '',
            d?.ac ? `AtCoder: ${d.ac}` : '',
          ].filter(Boolean).join('|');

        return `<rect
                  x="${x}" y="${y}"
                  width="${CELL_SIZE}" height="${CELL_SIZE}"
                  rx="2" ry="2"
                  fill="${fill}"
                  class="ahm-cell${level > 0 ? ' ahm-cell--active' : ''}"
                  data-date="${iso}"
                  data-count="${count}"
                  data-gh="${d?.gh || 0}"
                  data-cf="${d?.cf || 0}"
                  data-lc="${d?.lc || 0}"
                  data-ac="${d?.ac || 0}"
                  data-tip="${tip}"
                />`;
      }).join('')
    ).join('')}

          </svg>

          <!-- Legend -->
          <div class="ahm-legend" aria-hidden="true">
            <span>less</span>
            ${getLevels().map((c) => `<span class="ahm-legend-cell" style="background:${c}"></span>`).join('')}
            <span>more</span>
          </div>
        </div>

        <!-- Hover info renders in the shared #globalTip (top-centre,
             under the nav) — no per-component tooltip node needed. -->
      </div>
    `;

    attachTooltip(root);
    attachBadgeFilter(root, maxCount);
  }

  function renderLoading(root) {
    root.innerHTML = `
      <div class="ahm-wrap ahm-loading">
        <div class="ahm-skeleton-stats">
          ${[...Array(4)].map(() => `<div class="ahm-skeleton ahm-skeleton-stat"></div>`).join('')}
        </div>
        <div class="ahm-skeleton ahm-skeleton-grid"></div>
        <p class="ahm-loading-text">Fetching activity data…</p>
      </div>`;
  }

  function renderError(root, msg) {
    root.innerHTML = `
      <div class="ahm-wrap ahm-error">
        <p class="ahm-error-msg">⚠ ${msg}</p>
      </div>`;
  }

  /* ── TOOLTIP ─────────────────────────────────────────────────── */
  // Hover info for heatmap cells is rendered by the shared
  // GlobalTip (top-centre, under the nav) rather than a tooltip
  // node floating next to the cursor.
  function attachTooltip(root) {
    root.querySelectorAll('.ahm-cell').forEach(cell => {
      window.GlobalTip.bind(cell, (el) => {
        const parts = (el.dataset.tip || '').split('|');
        return parts.map((p, i) =>
          i === 0 ? `<strong>${p}</strong>` : `<span>${p}</span>`
        ).join('');
      });
    });
  }

  /* ── BADGE FILTER ───────────────────────────────────────────── */
  /*
   * Single-click  → filter to that platform (toggle on).
   * Click again   → clear filter, show all.
   * Only one platform active at a time.
   *
   * Works purely on already-rendered rects — no re-render.
   * Reads data-gh / data-cf / data-lc / data-ac set on each rect.
   */
  function attachBadgeFilter(root, maxCount) {
    const badges = root.querySelectorAll('.ahm-badge[data-platform]');
    const cells = root.querySelectorAll('.ahm-cell');
    let active = null;   // currently filtered platform key, or null = all

    function applyFilter(platform) {
      const levels = getLevels();
      cells.forEach(cell => {
        const count = platform
          ? parseInt(cell.dataset[platform] || '0', 10)
          : parseInt(cell.dataset.count || '0', 10);

        // recolour
        const pct = maxCount > 0 ? count / maxCount : 0;
        const lvl = count === 0 ? 0 : pct < .15 ? 1 : pct < .35 ? 2 : pct < .65 ? 3 : 4;
        cell.setAttribute('fill', levels[lvl]);

        // fade cells that have zero count for this platform
        cell.style.opacity = (platform && count === 0) ? '0.18' : '1';
      });
    }

    badges.forEach(badge => {
      badge.style.cursor = 'pointer';
      badge.setAttribute('role', 'button');
      badge.setAttribute('tabindex', '0');
      // Hover hint goes through the shared GlobalTip (top-centre,
      // under the nav) rather than the browser's native title
      // bubble, so every hover on the page reads the same way.
      const label = (badge.textContent || '').trim().replace(/\s+/g, ' ');
      window.GlobalTip.bind(badge, () =>
        `<strong>${label}</strong><span>click to filter · click again to clear</span>`
      );

      const activate = () => {
        const key = badge.dataset.platform;   // 'gh' | 'cf' | 'lc' | 'ac'

        if (active === key) {
          // toggle off → show all
          active = null;
          badges.forEach(b => b.classList.remove('ahm-badge--active'));
          applyFilter(null);
        } else {
          active = key;
          badges.forEach(b => b.classList.toggle('ahm-badge--active', b === badge));
          applyFilter(key);
        }
      };

      badge.addEventListener('click', activate);
      badge.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
      });
    });
  }

  /* ── INJECT STYLES ───────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('ahm-styles')) return;
    const style = document.createElement('style');
    style.id = 'ahm-styles';
    style.textContent = `
      /* ── Heatmap section wrapper ── */
      .ahm-wrap {
        position: relative;
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
      }

      /* ── Stats bar ── */
      .ahm-stats {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 1.5rem 2.5rem;
        margin-bottom: 0.5rem;
      }

      .ahm-stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .ahm-stat-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--green, #e8510f);
        line-height: 1;
        letter-spacing: -0.02em;
      }

      .ahm-stat-label {
        font-size: 0.65rem;
        color: var(--text-muted, #666);
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }

      /* ── Last Updated Timestamp ── */
      .ahm-last-updated {
        font-size: 0.7rem;
        color: var(--text-muted, #666);
        margin-bottom: 1rem;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.25rem 0;
        border-bottom: 1px solid var(--border, #222);
        opacity: 0.7;
        transition: opacity 0.3s ease;
      }

      .ahm-last-updated:hover {
        opacity: 1;
      }

      .ahm-updated-icon {
        font-size: 0.6rem;
        animation: ahm-spin 3s linear infinite;
      }

      @keyframes ahm-spin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }

      .ahm-last-updated time {
        color: var(--text-dim, #a0a0a0);
        font-weight: 500;
      }

      /* ── Platform badges ── */
      .ahm-platform-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-left: auto;
      }

      .ahm-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.3rem 0.7rem;
        border: 1px solid var(--border, #222);
        border-radius: 9999px;
        font-size: 0.7rem;
        color: var(--text-dim, #a0a0a0);
        background: var(--bg3, #181818);
        transition: border-color 0.2s, color 0.2s;
      }

      .ahm-badge em {
        font-style: normal;
        color: var(--green, #e8510f);
        font-weight: 600;
      }

      .ahm-badge[data-platform="gh"]:hover,
      .ahm-badge[data-platform="gh"].ahm-badge--active { border-color: #2da44e; border-width: 3px; color: var(--text); font-weight: 800;}
      .ahm-badge[data-platform="cf"]:hover,
      .ahm-badge[data-platform="cf"].ahm-badge--active { border-color: #B82024; border-width: 3px; color: var(--text); font-weight: 800;}
      .ahm-badge[data-platform="lc"]:hover,
      .ahm-badge[data-platform="lc"].ahm-badge--active { border-color: #ffa116; border-width: 3px; color: var(--text); font-weight: 800;}
      .ahm-badge[data-platform="ac"]:hover,
      .ahm-badge[data-platform="ac"].ahm-badge--active { border-color: #1890ff; border-width: 3px; color: var(--text); font-weight: 800;}

      .ahm-badge--active {
        background: rgba(255,255,255,0.05);
        font-weight: 800;
      }
      [data-theme="light"] .ahm-badge--active {
        background: rgba(0,0,0,0.05);
      }

      /* ── SVG grid ── */
      .ahm-grid-wrap {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 0.5rem;
      }

      .ahm-svg {
        display: block;
        min-width: 640px;
      }

      /* Cell SVG text */
      .ahm-month {
        font-family: var(--font-mono, monospace);
        font-size: 9px;
        fill: var(--text-muted, #666);
        letter-spacing: 0.05em;
      }

      .ahm-day {
        font-family: var(--font-mono, monospace);
        font-size: 9px;
        fill: var(--text-muted, #666);
        text-anchor: middle;
      }

      /* Cells */
      .ahm-cell {
        cursor: default;
        transition: opacity 0.15s, filter 0.15s;
        stroke-width: 1.5;
      }
      [data-theme="dark"]  .ahm-cell { stroke: #0A0A0A; }
      [data-theme="light"] .ahm-cell { stroke: #F5F5F0; }

      .ahm-cell--active {
        cursor: pointer;
      }

      .ahm-cell--active:hover {
        opacity: 0.85;
        filter: brightness(1.2);
      }

      /* Legend */
      .ahm-legend {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 0.6rem;
        justify-content: flex-end;
        font-size: 0.65rem;
        color: var(--text-muted, #666);
      }

      .ahm-legend-cell {
        width: 11px;
        height: 11px;
        border-radius: 2px;
        display: inline-block;
      }
      [data-theme="dark"]  .ahm-legend-cell { border: 1px solid rgba(255,255,255,0.06); }
      [data-theme="light"] .ahm-legend-cell { border: 1px solid rgba(0,0,0,0.08); }

      /* Tooltip styling now lives with the shared .global-tip
         component (top-centre, under the nav). */

      /* ── Loading skeleton ── */
      .ahm-skeleton {
        background: linear-gradient(
          90deg,
          var(--bg3, #181818) 25%,
          var(--bg2, #111)    50%,
          var(--bg3, #181818) 75%
        );
        background-size: 200% 100%;
        animation: ahm-shimmer 1.5s infinite;
        border-radius: 6px;
      }

      @keyframes ahm-shimmer {
        from { background-position: 200% 0; }
        to   { background-position: -200% 0; }
      }

      .ahm-skeleton-stats {
        display: flex;
        gap: 2rem;
        margin-bottom: 1.5rem;
      }

      .ahm-skeleton-stat {
        width: 80px;
        height: 48px;
      }

      .ahm-skeleton-grid {
        width: 100%;
        height: 120px;
      }

      .ahm-loading-text {
        margin-top: 1rem;
        font-size: 0.8rem;
        color: var(--text-muted, #666);
        font-family: var(--font-mono, monospace);
        text-align: center;
      }

      .ahm-error-msg {
        color: var(--text-dim, #a0a0a0);
        font-size: 0.85rem;
        font-family: var(--font-mono, monospace);
        padding: 1.5rem 0;
      }

      /* ── Reduced motion ── */
      @media (prefers-reduced-motion: reduce) {
        .ahm-skeleton { animation: none; }
        .ahm-cell      { transition: none; }
        .ahm-updated-icon { animation: none !important; }
      }

      /* ── Responsive ── */
      @media (max-width: 640px) {
        .ahm-stats { gap: 1rem 1.5rem; }
        .ahm-stat-value { font-size: 1.2rem; }
        .ahm-platform-badges { margin-left: 0; }
        .ahm-last-updated { font-size: 0.6rem; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ── BOOT ────────────────────────────────────────────────────── */

  // Cached data so theme-toggle re-renders don't refetch
  let _cachedMerged = null;
  let _cachedStats = null;
  let _cachedUsernames = null;
  let _cachedCfRating = 0;

  async function init() {
    const root = document.getElementById('activityHeatmap');
    if (!root) return;

    const usernames = {
      github: OVERRIDE.github ?? root.dataset.github ?? '',
      codeforces: OVERRIDE.codeforces ?? root.dataset.codeforces ?? '',
      leetcode: OVERRIDE.leetcode ?? root.dataset.leetcode ?? '',
      atcoder: OVERRIDE.atcoder ?? root.dataset.atcoder ?? '',
    };
    _cachedUsernames = usernames;

    injectStyles();
    renderLoading(root);

    try {
      const [gh, cf, lc, ac] = await Promise.all([
        fetchGitHub(usernames.github),
        fetchCodeforces(usernames.codeforces),
        fetchLeetCode(usernames.leetcode),
        fetchAtCoder(usernames.atcoder),
      ]);

      // Extract submissions and rating from CF response
      const cfSubmissions = cf.submissions || {};
      _cachedCfRating = cf.rating || 0;

      _cachedMerged = merge(gh, cfSubmissions, lc, ac);
      _cachedStats = computeStats(_cachedMerged);

      // Add CF rating to stats
      _cachedStats.cfRating = _cachedCfRating;

      render(root, _cachedMerged, _cachedStats, _cachedUsernames);

      // Update hero stats with real data
      updateHeroStatsFromHeatmap(_cachedStats);

    } catch (err) {
      console.error('[heatmap] Fatal error:', err);
      renderError(root, 'Could not load activity data. Check console for details.');
    }
  }

  // Re-render cells when the portfolio theme toggle fires — no refetch needed
  document.addEventListener('themeChange', () => {
    const root = document.getElementById('activityHeatmap');
    if (!root || !_cachedMerged) return;
    render(root, _cachedMerged, _cachedStats, _cachedUsernames);
    // Update hero stats on theme change too
    updateHeroStatsFromHeatmap(_cachedStats);
  });

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

/* ================================================================
   cses.js — CSES Problem Set progress (boxed table, below the
   multi-platform activity heatmap).

   Fully manual/static — CSES has no public API and no public
   per-user "which tasks are solved" data, so nothing here is
   fetched over the network:
     - The full 400-problem set below is bundled statically
       (CSES_PROBLEMSET), grouped into its 18 official categories.
     - Which boxes are highlighted "solved" comes from
       window.DATA_CSES_SOLVED (data/cses.js) — a flat list of task
       IDs you maintain by hand. See data/cses.js for details.
     - data-cses-id on #csesHeatmap is just used to build the link
       in the header badge (cses.fi/problemset/user/<id>) — it does
       not trigger any fetch.
   ================================================================ */

(function () {
  'use strict';

  /* ── Official CSES problem set, 18 categories / 400 tasks ── */
const CSES_PROBLEMSET = [
    { name: "Introductory Problems", problems: [[1068,"Weird Algorithm"],[1083,"Missing Number"],[1069,"Repetitions"],[1094,"Increasing Array"],[1070,"Permutations"],[1071,"Number Spiral"],[1072,"Two Knights"],[1092,"Two Sets"],[1617,"Bit Strings"],[1618,"Trailing Zeros"],[1754,"Coin Piles"],[1755,"Palindrome Reorder"],[2205,"Gray Code"],[2165,"Tower of Hanoi"],[1622,"Creating Strings"],[1623,"Apple Division"],[1624,"Chessboard and Queens"],[3399,"Raab Game I"],[3419,"Mex Grid Construction"],[3217,"Knight Moves Grid"],[3311,"Grid Coloring I"],[2431,"Digit Queries"],[1743,"String Reorder"],[1625,"Grid Path Description"]] },
    { name: "Sorting and Searching", problems: [[1621,"Distinct Numbers"],[1084,"Apartments"],[1090,"Ferris Wheel"],[1091,"Concert Tickets"],[1619,"Restaurant Customers"],[1629,"Movie Festival"],[1640,"Sum of Two Values"],[1643,"Maximum Subarray Sum"],[1074,"Stick Lengths"],[2183,"Missing Coin Sum"],[2216,"Collecting Numbers"],[2217,"Collecting Numbers II"],[1141,"Playlist"],[1073,"Towers"],[1163,"Traffic Lights"],[3420,"Distinct Values Subarrays"],[3421,"Distinct Values Subsequences"],[2162,"Josephus Problem I"],[2163,"Josephus Problem II"],[2168,"Nested Ranges Check"],[2169,"Nested Ranges Count"],[1164,"Room Allocation"],[1620,"Factory Machines"],[1630,"Tasks and Deadlines"],[1631,"Reading Books"],[1641,"Sum of Three Values"],[1642,"Sum of Four Values"],[1645,"Nearest Smaller Values"],[1660,"Subarray Sums I"],[1661,"Subarray Sums II"],[1662,"Subarray Divisibility"],[2428,"Distinct Values Subarrays II"],[1085,"Array Division"],[1632,"Movie Festival II"],[1644,"Maximum Subarray Sum II"]] },
    { name: "Dynamic Programming", problems: [[1633,"Dice Combinations"],[1634,"Minimizing Coins"],[1635,"Coin Combinations I"],[1636,"Coin Combinations II"],[1637,"Removing Digits"],[1638,"Grid Paths I"],[1158,"Book Shop"],[1746,"Array Description"],[2413,"Counting Towers"],[1639,"Edit Distance"],[3403,"Longest Common Subsequence"],[1744,"Rectangle Cutting"],[3359,"Minimal Grid Path"],[1745,"Money Sums"],[1097,"Removal Game"],[1093,"Two Sets II"],[3314,"Mountain Range"],[1145,"Increasing Subsequence"],[1140,"Projects"],[1653,"Elevator Rides"],[2181,"Counting Tilings"],[2220,"Counting Numbers"],[1748,"Increasing Subsequence II"]] },
    { name: "Graph Algorithms", problems: [[1192,"Counting Rooms"],[1193,"Labyrinth"],[1666,"Building Roads"],[1667,"Message Route"],[1668,"Building Teams"],[1669,"Round Trip"],[1194,"Monsters"],[1671,"Shortest Routes I"],[1672,"Shortest Routes II"],[1673,"High Score"],[1195,"Flight Discount"],[1197,"Cycle Finding"],[1196,"Flight Routes"],[1678,"Round Trip II"],[1679,"Course Schedule"],[1680,"Longest Flight Route"],[1681,"Game Routes"],[1202,"Investigation"],[1750,"Planets Queries I"],[1160,"Planets Queries II"],[1751,"Planets Cycles"],[1675,"Road Reparation"],[1676,"Road Construction"],[1682,"Flight Routes Check"],[1683,"Planets and Kingdoms"],[1684,"Giant Pizza"],[1686,"Coin Collector"],[1691,"Mail Delivery"],[1692,"De Bruijn Sequence"],[1693,"Teleporters Path"],[1690,"Hamiltonian Flights"],[1689,"Knight's Tour"],[1694,"Download Speed"],[1695,"Police Chase"],[1696,"School Dance"],[1711,"Distinct Routes"]] },
    { name: "Range Queries", problems: [[1646,"Static Range Sum Queries"],[1647,"Static Range Minimum Queries"],[1648,"Dynamic Range Sum Queries"],[1649,"Dynamic Range Minimum Queries"],[1650,"Range Xor Queries"],[1651,"Range Update Queries"],[1652,"Forest Queries"],[1143,"Hotel Queries"],[1749,"List Removals"],[1144,"Salary Queries"],[2166,"Prefix Sum Queries"],[2206,"Pizzeria Queries"],[3304,"Visible Buildings Queries"],[3163,"Range Interval Queries"],[1190,"Subarray Sum Queries"],[3226,"Subarray Sum Queries II"],[1734,"Distinct Values Queries"],[3356,"Distinct Values Queries II"],[2416,"Increasing Array Queries"],[1664,"Movie Festival Queries"],[1739,"Forest Queries II"],[1735,"Range Updates and Sums"],[1736,"Polynomial Queries"],[1737,"Range Queries and Copies"],[2184,"Missing Coin Sum Queries"]] },
    { name: "Tree Algorithms", problems: [[1674,"Subordinates"],[1130,"Tree Matching"],[1131,"Tree Diameter"],[1132,"Tree Distances I"],[1133,"Tree Distances II"],[1687,"Company Queries I"],[1688,"Company Queries II"],[1135,"Distance Queries"],[1136,"Counting Paths"],[1137,"Subtree Queries"],[1138,"Path Queries"],[2134,"Path Queries II"],[1139,"Distinct Colors"],[2079,"Finding a Centroid"],[2080,"Fixed-Length Paths I"],[2081,"Fixed-Length Paths II"]] },
    { name: "Mathematics", problems: [[2164,"Josephus Queries"],[1095,"Exponentiation"],[1712,"Exponentiation II"],[1713,"Counting Divisors"],[1081,"Common Divisors"],[1082,"Sum of Divisors"],[2182,"Divisor Analysis"],[2185,"Prime Multiples"],[2417,"Counting Coprime Pairs"],[3396,"Next Prime"],[1079,"Binomial Coefficients"],[1715,"Creating Strings II"],[1716,"Distributing Apples"],[1717,"Christmas Party"],[3397,"Permutation Order"],[3398,"Permutation Rounds"],[2064,"Bracket Sequences I"],[2187,"Bracket Sequences II"],[2209,"Counting Necklaces"],[2210,"Counting Grids"],[1722,"Fibonacci Numbers"],[1096,"Throwing Dice"],[1723,"Graph Paths I"],[1724,"Graph Paths II"],[3154,"System of Linear Equations"],[3355,"Sum of Four Squares"],[3406,"Triangle Number Sums"],[1725,"Dice Probability"],[1726,"Moving Robots"],[1727,"Candy Lottery"],[1728,"Inversion Probability"],[1729,"Stick Game"],[1730,"Nim Game I"],[1098,"Nim Game II"],[1099,"Stair Game"],[2207,"Grundy's Game"],[2208,"Another Game"]] },
    { name: "String Algorithms", problems: [[1731,"Word Combinations"],[1753,"String Matching"],[1732,"Finding Borders"],[1733,"Finding Periods"],[1110,"Minimal Rotation"],[1111,"Longest Palindrome"],[3138,"All Palindromes"],[1112,"Required Substring"],[2420,"Palindrome Queries"],[2102,"Finding Patterns"],[2103,"Counting Patterns"],[2104,"Pattern Positions"],[2105,"Distinct Substrings"],[1149,"Distinct Subsequences"],[2106,"Repeating Substring"],[2107,"String Functions"],[3225,"Inverse Suffix Array"],[1113,"String Transform"],[2108,"Substring Order I"],[2109,"Substring Order II"],[2110,"Substring Distribution"]] },
    { name: "Geometry", problems: [[2189,"Point Location Test"],[2190,"Line Segment Intersection"],[2191,"Polygon Area"],[2192,"Point in Polygon"],[2193,"Polygon Lattice Points"],[2194,"Minimum Euclidean Distance"],[2195,"Convex Hull"],[3410,"Maximum Manhattan Distances"],[3411,"All Manhattan Distances"],[1740,"Intersection Points"],[3427,"Line Segments Trace I"],[3428,"Line Segments Trace II"],[3429,"Lines and Queries I"],[3430,"Lines and Queries II"],[1741,"Area of Rectangles"],[1742,"Robot Path"]] },
    { name: "Advanced Techniques", problems: [[1628,"Meet in the Middle"],[2136,"Hamming Distance"],[3360,"Corner Subgrid Check"],[2137,"Corner Subgrid Count"],[2138,"Reachable Nodes"],[2143,"Reachability Queries"],[2072,"Cut and Paste"],[2073,"Substring Reversals"],[2074,"Reversals and Sums"],[2076,"Necessary Roads"],[2077,"Necessary Cities"],[2078,"Eulerian Subgraphs"],[2084,"Monster Game I"],[2085,"Monster Game II"],[2086,"Subarray Squares"],[2087,"Houses and Schools"],[2088,"Knuth Division"],[2111,"Apples and Bananas"],[2112,"One Bit Positions"],[2113,"Signal Processing"],[2101,"New Roads Queries"],[2133,"Dynamic Connectivity"],[2121,"Parcel Delivery"],[2129,"Task Assignment"],[2130,"Distinct Routes II"]] },
    { name: "Sliding Window Problems", problems: [[3220,"Sliding Window Sum"],[3221,"Sliding Window Minimum"],[3426,"Sliding Window Xor"],[3405,"Sliding Window Or"],[3222,"Sliding Window Distinct Values"],[3224,"Sliding Window Mode"],[3219,"Sliding Window Mex"],[1076,"Sliding Window Median"],[1077,"Sliding Window Cost"],[3223,"Sliding Window Inversions"],[3227,"Sliding Window Advertisement"]] },
    { name: "Interactive Problems", problems: [[3112,"Hidden Integer"],[3139,"Hidden Permutation"],[3305,"K-th Highest Score"],[3228,"Permuted Binary Strings"],[3273,"Colored Chairs"],[3140,"Inversion Sorting"]] },
    { name: "Bitwise Operations", problems: [[1146,"Counting Bits"],[1655,"Maximum Xor Subarray"],[3191,"Maximum Xor Subset"],[3211,"Number of Subset Xors"],[3192,"K Subset Xors"],[3233,"All Subarray Xors"],[2419,"Xor Pyramid Peak"],[3194,"Xor Pyramid Diagonal"],[3195,"Xor Pyramid Row"],[1654,"SOS Bit Problem"],[3141,"And Subset Count"]] },
    { name: "Construction Problems", problems: [[2214,"Inverse Inversions"],[2215,"Monotone Subsequences"],[3422,"Third Permutation"],[3423,"Permutation Prime Sums"],[1697,"Chess Tournament"],[3424,"Distinct Sums Grid"],[2423,"Filling Trominos"],[2418,"Grid Path Construction"]] },
    { name: "Advanced Graph Problems", problems: [[3303,"Nearest Shops"],[1134,"Pr\u00fcfer Code"],[1702,"Tree Traversals"],[1757,"Course Schedule II"],[1756,"Acyclic Graph Edges"],[2177,"Strongly Connected Edges"],[2179,"Even Outdegree Edges"],[1707,"Graph Girth"],[3357,"Fixed Length Walk Queries"],[3111,"Transfer Speeds Sum"],[3407,"MST Edge Check"],[3408,"MST Edge Set Check"],[3409,"MST Edge Cost"],[1677,"Network Breakdown"],[3114,"Tree Coin Collecting I"],[3149,"Tree Coin Collecting II"],[1700,"Tree Isomorphism I"],[1701,"Tree Isomorphism II"],[1699,"Flight Route Requests"],[1703,"Critical Cities"],[1203,"Visiting Cities"],[3308,"Graph Coloring"],[3158,"Bus Companies"],[3358,"Split into Two Paths"],[1704,"Network Renovation"],[1705,"Forbidden Cities"],[1752,"Creating Offices"],[1685,"New Flight Routes"]] },
    { name: "Counting Problems", problems: [[3413,"Filled Subgrid Count I"],[3414,"Filled Subgrid Count II"],[3415,"All Letter Subgrid Count I"],[3416,"All Letter Subgrid Count II"],[3417,"Border Subgrid Count I"],[3418,"Border Subgrid Count II"],[3400,"Raab Game II"],[1080,"Empty String"],[2229,"Permutation Inversions"],[2176,"Counting Bishops"],[2228,"Counting Sequences"],[1078,"Grid Paths II"],[1075,"Counting Permutations"],[2429,"Grid Completion"],[2421,"Counting Reorders"],[3232,"Tournament Graph Distribution"],[3157,"Collecting Numbers Distribution"],[2415,"Functional Graph Distribution"]] },
    { name: "Additional Problems I", problems: [[1087,"Shortest Subsequence"],[3150,"Distinct Values Sum"],[3190,"Distinct Values Splits"],[1670,"Swap Game"],[3175,"Beautiful Permutation II"],[2422,"Multiplication Table"],[3151,"Bubble Sort Rounds I"],[3152,"Bubble Sort Rounds II"],[3306,"Nearest Campsites I"],[3307,"Nearest Campsites II"],[1142,"Advertisement"],[2186,"Special Substrings"],[3169,"Counting LCM Arrays"],[3193,"Square Subsets"],[3294,"Subarray Sum Constraints"],[3213,"Water Containers Moves"],[3214,"Water Containers Queries"],[2425,"Stack Weights"],[3301,"Maximum Average Subarrays"],[3302,"Subsets with Fixed Average"],[3361,"Two Array Average"],[1747,"Pyramid Array"],[3404,"Permutation Subsequence"],[1188,"Bit Inversions"],[1086,"Writing Numbers"],[2427,"Letter Pair Move Game"],[1147,"Maximum Building I"],[1162,"Sorting Methods"],[1191,"Cyclic Array"],[2414,"List of Sums"]] },
    { name: "Additional Problems II", problems: [[3215,"Bouncing Ball Steps"],[3216,"Bouncing Ball Cycle"],[3218,"Knight Moves Queries"],[3108,"K Subset Sums I"],[3109,"K Subset Sums II"],[2132,"Increasing Array II"],[1189,"Food Division"],[1698,"Swap Round Sorting"],[2430,"Binary Subsequences"],[1706,"School Excursion"],[1709,"Coin Grid"],[3312,"Grid Coloring II"],[2426,"Programmers and Artists"],[2174,"Removing Digits II"],[2180,"Coin Arrangement"],[3159,"Replace with Difference"],[2432,"Grid Puzzle I"],[2131,"Grid Puzzle II"],[2115,"Bit Substrings"],[2075,"Reversal Sorting"],[1159,"Book Shop II"],[3161,"GCD Subsets"],[3402,"Minimum Cost Pairs"],[3425,"Same Sum Subsets"],[1157,"Mex Grid Queries"],[1148,"Maximum Building II"],[1161,"Stick Divisions"],[3401,"Stick Difference"],[1665,"Coding Company"],[2402,"Two Stacks Sorting"]] },
  ];

  /* ── HELPERS ─────────────────────────────────────────────────── */
  function getSolvedSet() {
    const list = Array.isArray(window.DATA_CSES_SOLVED) ? window.DATA_CSES_SOLVED : [];
    return new Set(list.map(Number));
  }

  /* ── COLLAPSE STATE (persisted per-browser via localStorage) ──── */
  const OPEN_STATE_KEY = 'cses-grid-open';

  function isGridOpen() {
    try {
      return localStorage.getItem(OPEN_STATE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function saveGridOpen(open) {
    try {
      localStorage.setItem(OPEN_STATE_KEY, open ? '1' : '0');
    } catch (e) { /* storage unavailable — collapse state just won't persist */ }
  }

  /* ── RENDER ──────────────────────────────────────────────────── */
  function render(root, solvedSet, userId) {
    // Flatten the 18 categories into one plain list — the expanded
    // view is a single cell matrix, not grouped by category.
    const allProblems = CSES_PROBLEMSET.flatMap(c => c.problems);
    const totalAll = allProblems.length;
    const solvedAll = allProblems.filter(([id]) => solvedSet.has(id)).length;
    const pct = totalAll ? Math.round((solvedAll / totalAll) * 100) : 0;
    const isOpen = isGridOpen();

    root.innerHTML = `
      <div class="cses-wrap">
        <div class="cses-stats">
          <div class="cses-stat">
            <span class="cses-stat-value">${solvedAll} / ${totalAll}</span>
            <span class="cses-stat-label">tasks solved</span>
          </div>
          <div class="cses-stat">
            <span class="cses-stat-value">${pct}%</span>
            <span class="cses-stat-label">problem set complete</span>
          </div>
          <div class="cses-platform-badges">
            <button type="button" class="cses-toggle-all-btn" data-action="expand">Expand all</button>
            <button type="button" class="cses-toggle-all-btn" data-action="collapse">Collapse all</button>
            ${userId ? `
            <a class="ahm-badge cses-badge" data-platform="cses"
               href="https://cses.fi/problemset/user/${encodeURIComponent(userId)}"
               target="_blank" rel="noopener noreferrer">◇ CSES <em>${solvedAll}</em></a>` : ''}
          </div>
        </div>

        <div class="cses-grid-wrap${isOpen ? ' cses-grid-wrap--open' : ''}" id="csesGridWrap">
          <div class="cses-grid-inner">
            <div class="cses-grid">
              ${allProblems.map(([id, name]) => {
                const isSolved = solvedSet.has(id);
                return `<a
                  class="cses-box${isSolved ? ' cses-box--solved' : ''}"
                  href="https://cses.fi/problemset/task/${id}"
                  target="_blank" rel="noopener noreferrer"
                  data-tip="${name.replace(/"/g, '&quot;')}"
                >${isSolved ? '✓' : ''}</a>`;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Hover info renders in the shared #globalTip (top-centre,
             under the nav) — no per-component tooltip node needed. -->
      </div>
    `;

    attachTooltip(root);
    attachCollapse(root);
  }

  /* ── COLLAPSE INTERACTIONS ──────────────────────────────────── */
  function attachCollapse(root) {
    const wrap = root.querySelector('#csesGridWrap');
    if (!wrap) return;

    function setOpen(open) {
      wrap.classList.toggle('cses-grid-wrap--open', open);
      saveGridOpen(open);
    }

    root.querySelectorAll('.cses-toggle-all-btn').forEach(btn => {
      btn.addEventListener('click', () => setOpen(btn.dataset.action === 'expand'));
    });
  }

  // Hover info for CSES cells goes through the shared GlobalTip
  // (top-centre, under the nav) instead of a cursor-following node.
  function attachTooltip(root) {
    root.querySelectorAll('.cses-box').forEach(box => {
      window.GlobalTip.bind(box, (el) => {
        const solved = el.classList.contains('cses-box--solved');
        return `<strong>${el.dataset.tip || ''}</strong>` +
               `<span>${solved ? 'solved' : 'not solved'}</span>`;
      });
    });
  }

  /* ── INJECT STYLES ───────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('cses-styles')) return;
    const style = document.createElement('style');
    style.id = 'cses-styles';
    style.textContent = `
      .cses-wrap {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        margin-top: 2rem;
        padding-top: 1.5rem;
        border-top: 1px solid var(--border, #222);
      }

      .cses-stats {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 1.5rem 2rem;
        margin-bottom: 1.25rem;
      }

      .cses-stat { display: flex; flex-direction: column; gap: 2px; }

      .cses-stat-value {
        font-size: 1.35rem;
        font-weight: 700;
        color: var(--green, #e8510f);
        line-height: 1;
        letter-spacing: -0.02em;
      }

      .cses-stat-label {
        font-size: 0.65rem;
        color: var(--text-muted, #666);
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }

      /* .cses-badge rides on .ahm-badge (injected by the heatmap module
         above) for the same pill look as the GitHub/CF/LC/AC badges —
         this just adds the wrapper's margin-left:auto placement. */
      .cses-platform-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-left: auto;
      }
      .cses-badge[data-platform="cses"]:hover {
        border-color: #e8510f;
        border-width: 3px;
        color: var(--text);
        font-weight: 800;
      }

      .cses-toggle-all-btn {
        font-family: inherit;
        font-size: 0.68rem;
        color: var(--text-muted, #666);
        background: transparent;
        border: 1px solid var(--border, #222);
        border-radius: 9999px;
        padding: 0.3rem 0.65rem;
        cursor: pointer;
        transition: border-color 0.2s, color 0.2s;
      }
      .cses-toggle-all-btn:hover {
        border-color: var(--green, #e8510f);
        color: var(--text, #ededed);
      }

      /* Smooth collapse/expand of the whole matrix without knowing
         its content height up front. */
      .cses-grid-wrap {
        display: grid;
        grid-template-rows: 0fr;
        transition: grid-template-rows 0.25s ease;
        margin-top: 0.75rem;
      }
      .cses-grid-wrap--open { grid-template-rows: 1fr; }

      .cses-grid-inner {
        overflow: hidden;
        min-height: 0;
      }

      .cses-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding-top: 0.25rem;
      }

      .cses-box {
        width: 20px;
        height: 20px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
        transition: transform 0.12s ease, filter 0.12s ease, opacity 0.12s ease;
        background: var(--bg3, #181818);
        border: 1.5px solid var(--border, #222);
        color: transparent;
      }

      .cses-box--solved {
        background: #e8510f;
        border-color: #e8510f;
        color: #210a02;
      }
      [data-theme="light"] .cses-box--solved { color: #fff2ea; }

      .cses-box:hover {
        transform: scale(1.15);
        filter: brightness(1.15);
        z-index: 2;
      }

      /* Tooltip styling now lives with the shared .global-tip
         component (top-centre, under the nav). */

      @media (prefers-reduced-motion: reduce) {
        .cses-box, .cses-grid-wrap { transition: none; }
      }

      @media (max-width: 640px) {
        .cses-box { width: 17px; height: 17px; }
        .cses-stats { gap: 1rem 1.25rem; }
        .cses-stat-value { font-size: 1.1rem; }
        .cses-platform-badges { margin-left: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ── BOOT ────────────────────────────────────────────────────── */
  // Everything here is local/static — reading window.DATA_CSES_SOLVED
  // and a bundled problem list — so init is synchronous, no fetch,
  // no loading state needed.
  let _cachedSolved = null;
  let _cachedUserId = null;

  function init() {
    const root = document.getElementById('csesHeatmap');
    if (!root) return;

    // data-cses-id on #csesHeatmap is only used to build the header
    // badge's link (cses.fi/problemset/user/<id>) — it doesn't fetch
    // anything.
    _cachedUserId = root.dataset.csesId || '';

    injectStyles();

    _cachedSolved = getSolvedSet();
    render(root, _cachedSolved, _cachedUserId);
  }

  // Re-render on theme change and whenever data/cses.js's list could
  // have changed — purely local, no refetch.
  document.addEventListener('themeChange', () => {
    const root = document.getElementById('csesHeatmap');
    if (!root || !_cachedSolved) return;
    render(root, _cachedSolved, _cachedUserId);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

/* ================================================================
   ERROR HANDLING
================================================================ */
function handleError(message) {
  console.error('[Portfolio]', message);
  const div = document.createElement('div');
  div.style.cssText = `
    position:fixed;bottom:20px;right:20px;padding:16px 20px;
    background:#1a1a1a;border:1px solid #e74c3c;border-radius:8px;
    color:#fff;font-family:'JetBrains Mono',monospace;font-size:14px;
    z-index:9999;max-width:400px;box-shadow:0 8px 24px rgba(0,0,0,.3);
    animation:slideUp 0.3s ease;
  `;
  div.textContent = `⚠️ ${message}`;
  document.body.appendChild(div);
  setTimeout(() => {
    div.style.transition = 'opacity 0.3s ease';
    div.style.opacity = '0';
    setTimeout(() => div.remove(), 300);
  }, 5000);
}

/* ===== Boot ===== */
document.addEventListener('DOMContentLoaded', () => {
  try {
    initTheme();
    modal.init();

    if (typeof window.DATA_SITE === 'undefined') {
      handleError('Data not loaded. Check your data.js file.');
      return;
    }

    renderSite(window.DATA_SITE);
    renderSkills(window.DATA_SKILLS);
    renderAchievements(window.DATA_ACHIEVEMENTS);
    renderProjects(window.DATA_PROJECTS);
    renderCertificates(window.DATA_CERTIFICATES);
    renderBlogs(window.DATA_BLOGS);
    blogReader.init();

    initScrollReveal();
    initLinkEffects();
    initScrollEffects();
    initNotification();

    document.dispatchEvent(new CustomEvent('portfolio:ready'));
    console.log('🚀 Portfolio ready!');
  } catch (err) {
    console.error('[Portfolio] Boot error:', err);
    handleError('Failed to initialize portfolio. Check console for details.');
  }
});

window.addEventListener('error', (e) => {
  console.error('[Portfolio] Runtime error:', e.message);
});

window.__portfolio = { modal, renderMarkdown, escapeHtml, fetchText };

if (navigator.share) {
  document.querySelector('#shareBtn')?.addEventListener('click', () => {
    navigator.share({ title: document.title, text: 'Check out my portfolio!', url: location.href });
  });
}