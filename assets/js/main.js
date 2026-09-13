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
        `0 0 ${(20 + progress * 1.5).toFixed(1)}px rgba(45,164,78,${glow.toFixed(3)})`;

      const p = progress / 100;
      heatmapBar.style.background = `linear-gradient(to top,
        rgba(45,164,78,${(0.05 + p * 0.1).toFixed(3)}) 0%,
        rgba(45,164,78,${(0.15 + p * 0.2).toFixed(3)}) 15%,
        rgba(45,164,78,${(0.30 + p * 0.3).toFixed(3)}) 30%,
        rgba(45,164,78,${(0.50 + p * 0.4).toFixed(3)}) 50%,
        rgba(45,164,78,${(0.70 + p * 0.3).toFixed(3)}) 70%,
        rgba(45,164,78,${(0.85 + p * 0.15).toFixed(3)}) 85%,
        rgba(45,164,78,1) 100%)`;
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
   * Dark  : empty cell is a visible green-tinted slate; greens step muted → vivid.
   * Light : empty cell is soft sage; greens are deep enough to read on white.
   */
  const PALETTES = {
    dark: [
      'transparent', // 0 — empty : invisible, blends into dark bg
      '#1a6130',   // 1 — low   : deep forest
      '#216e39',   // 2 — mid
      '#2da44e',   // 3 — high
      '#3fb950',   // 4 — peak  : bright GitHub green
    ],
    light: [
      'transparent', // 0 — empty : invisible, blends into light bg
      '#6abf6a',   // 1 — low   : mid green
      '#3a9e46',   // 2 — mid
      '#1e7a33',   // 3 — high
      '#0f5323',   // 4 — peak  : deep forest, max contrast on light bg
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

        <!-- Tooltip (positioned by JS) -->
        <div class="ahm-tooltip" id="ahmTooltip" role="tooltip" aria-hidden="true"></div>
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
  function attachTooltip(root) {
    const tip = root.querySelector('#ahmTooltip');
    const cells = root.querySelectorAll('.ahm-cell');

    cells.forEach(cell => {
      cell.addEventListener('mouseenter', (e) => {
        const parts = cell.dataset.tip.split('|');
        tip.innerHTML = parts.map((p, i) =>
          i === 0
            ? `<strong>${p}</strong>`
            : `<span>${p}</span>`
        ).join('');
        tip.setAttribute('aria-hidden', 'false');
        moveTip(e, tip, root);
        tip.classList.add('ahm-tooltip--visible');
      });

      cell.addEventListener('mousemove', (e) => moveTip(e, tip, root));

      cell.addEventListener('mouseleave', () => {
        tip.classList.remove('ahm-tooltip--visible');
        tip.setAttribute('aria-hidden', 'true');
      });
    });
  }

  function moveTip(e, tip, root) {
    const rect = root.getBoundingClientRect();
    const tipW = tip.offsetWidth || 180;
    const tipH = tip.offsetHeight || 60;
    let left = e.clientX - rect.left + 12;
    let top = e.clientY - rect.top - tipH - 8;

    if (left + tipW > rect.width - 8) left = e.clientX - rect.left - tipW - 12;
    if (top < 4) top = e.clientY - rect.top + 20;

    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
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
      badge.title = 'Click to filter · click again to clear';

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
        color: var(--green, #2da44e);
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
        color: var(--green, #2da44e);
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

      /* ── Tooltip ── */
      .ahm-tooltip {
        position: absolute;
        pointer-events: none;
        background: var(--bg2, #111);
        border: 1px solid var(--border2, #2a2a2a);
        border-radius: 8px;
        padding: 0.5rem 0.75rem;
        font-size: 0.72rem;
        color: var(--text, #ededed);
        white-space: nowrap;
        z-index: 50;
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 0.12s ease, transform 0.12s ease;
        line-height: 1.65;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .ahm-tooltip--visible {
        opacity: 1;
        transform: translateY(0);
      }

      .ahm-tooltip strong {
        color: var(--green, #2da44e);
        display: block;
      }

      .ahm-tooltip span {
        color: var(--text-dim, #a0a0a0);
        display: block;
        padding-left: 0.5rem;
        border-left: 2px solid var(--border, #222);
      }

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
        .ahm-tooltip  { transition: none; }
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

        <div class="cses-tooltip" id="csesTooltip" role="tooltip" aria-hidden="true"></div>
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

  function attachTooltip(root) {


    const tip = root.querySelector('#csesTooltip');
    if (!tip) return;
    const boxes = root.querySelectorAll('.cses-box');

    boxes.forEach(box => {
      box.addEventListener('mouseenter', (e) => {
        tip.textContent = box.dataset.tip + (box.classList.contains('cses-box--solved') ? ' · solved' : ' · not solved');
        tip.setAttribute('aria-hidden', 'false');
        moveTip(e, tip, root);
        tip.classList.add('cses-tooltip--visible');
      });
      box.addEventListener('mousemove', (e) => moveTip(e, tip, root));
      box.addEventListener('mouseleave', () => {
        tip.classList.remove('cses-tooltip--visible');
        tip.setAttribute('aria-hidden', 'true');
      });
    });
  }

  function moveTip(e, tip, root) {
    const rect = root.getBoundingClientRect();
    const tipW = tip.offsetWidth || 140;
    const tipH = tip.offsetHeight || 28;
    let left = e.clientX - rect.left + 12;
    let top = e.clientY - rect.top - tipH - 8;
    if (left + tipW > rect.width - 8) left = e.clientX - rect.left - tipW - 12;
    if (top < 4) top = e.clientY - rect.top + 20;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
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
        color: var(--green, #2da44e);
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
        border-color: #2da44e;
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
        border-color: var(--green, #2da44e);
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
        background: #2da44e;
        border-color: #2da44e;
        color: #05170a;
      }
      [data-theme="light"] .cses-box--solved { color: #eafff0; }

      .cses-box:hover {
        transform: scale(1.15);
        filter: brightness(1.15);
        z-index: 2;
      }

      /* ── Tooltip ── */
      .cses-tooltip {
        position: absolute;
        pointer-events: none;
        background: var(--bg2, #111);
        border: 1px solid var(--border2, #2a2a2a);
        border-radius: 8px;
        padding: 0.4rem 0.65rem;
        font-size: 0.7rem;
        color: var(--text, #ededed);
        white-space: nowrap;
        z-index: 50;
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 0.12s ease, transform 0.12s ease;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      }
      .cses-tooltip--visible { opacity: 1; transform: translateY(0); }

      @media (prefers-reduced-motion: reduce) {
        .cses-tooltip, .cses-box, .cses-grid-wrap { transition: none; }
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