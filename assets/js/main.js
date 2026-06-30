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
const ANIM_STAGGER_MS  = 60;
const ANIM_STAGGER_MAX = 350;
const ANIM_THRESHOLD   = 0.1;
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
       .replace(/^## (.*)$/gm,  '<h2>$1</h2>')
       .replace(/^# (.*)$/gm,   '<h1>$1</h1>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
       .replace(/\*(.+?)\*/g,    '<em>$1</em>')
       .replace(/`([^`]+?)`/g,   '<code>$1</code>');
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

/* ===== Modal ===== */
const modal = {
  root:      null,
  title:     null,
  carousel:  null,
  body:      null,
  closeBtn:  null,
  images:    [],
  index:     0,
  isOpen:    false,
  _lastFocused: null,

  init() {
    this.root = $('#modal');
    if (!this.root) return;

    this.title    = $('#modalTitle');
    this.carousel = $('#modalCarousel');
    this.body     = $('#modalBody');
    this.closeBtn = $('#modalClose');

    if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.close());

    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape')     this.close();
      if (e.key === 'ArrowLeft')  this.prev();
      if (e.key === 'ArrowRight') this.next();
    });

    this.root.addEventListener('focusin', (e) => {
      if (!this.isOpen) return;
      const focusable = this.root.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.target === last)      first?.focus();
      else if (e.target === this.root) last?.focus();
    });
  },

  open(title, images, mdHtml) {
    if (!this.root) return;
    this._lastFocused = document.activeElement;

    this.title.textContent = title || 'Untitled';
    this.images = (images || []).filter(Boolean);
    this.index  = 0;
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

    const src         = escapeHtml(this.images[this.index]);
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
  set('#heroEyebrow',    site.eyebrow      || '');
  set('#heroTagline',    site.tagline      || '');
  set('#avatarLabel',    site.name         || '');
  set('#avatarStatus',   site.availability || '');
  set('#footerName',     site.name         || '');
  set('#footerLocation', site.footerLocation || '');
  set('#footerYear',     new Date().getFullYear());

  // Profile image with theme support
  const profileImg = $('#profileImg');
  if (profileImg) {
    // Set initial image based on current theme
    updateProfileImage();
    profileImg.alt = escapeHtml(site.name || 'Profile');
  }

  // Only rewrite heroName markup if the data-driven name differs from static HTML
  const heroName = $('#heroName');
  if (heroName && site.name) {
    const parts = site.name.split(' ');
    const built = parts.map((w, i) =>
      i === parts.length - 1
        ? `<span class="accent">${escapeHtml(w)}</span>`
        : escapeHtml(w)
    ).join('<br>');
    if (heroName.innerHTML.trim() !== built) heroName.innerHTML = built;
  }

  const statsEl = $('#heroStats');
  if (statsEl && site.stats?.length) {
    statsEl.innerHTML = site.stats.map(s => `
      <div class="stat reveal" ${s.id ? `data-stat-id="${s.id}"` : ''}>
        <div class="stat-value">${escapeHtml(s.value)}</div>
        <div class="stat-label">${escapeHtml(s.label)}</div>
      </div>
    `).join('');
  }

  const ctaEl = $('#heroCtas');
  if (ctaEl && site.ctas?.length) {
    ctaEl.innerHTML = site.ctas.map(c => {
      const isExt   = String(c.url).startsWith('http');
      const extAttr = isExt ? ' target="_blank" rel="noopener noreferrer"' : '';
      const cls     = c.type === 'primary' ? 'btn-primary' : 'btn-ghost';
      return `<a href="${escapeHtml(c.url)}" class="btn ${cls} reveal"${extAttr}>${escapeHtml(c.label)}</a>`;
    }).join('');
  }

  const contactWrap = $('#contactWrap');
  const c = site.contact;
  if (contactWrap && c) {
    contactWrap.innerHTML = `
      <div class="reveal">
        <p class="contact-intro">${escapeHtml(c.intro || 'Get in touch')}</p>
      </div>
      <div class="contact-list">
        ${(c.emails || []).map(e => `
          <a class="contact-row reveal" href="mailto:${escapeHtml(e.address)}">
            <span class="contact-label">${escapeHtml(e.label || 'Email')}</span>
            <span class="contact-value">${escapeHtml(e.address)}</span>
          </a>`).join('')}
        ${(c.phones || []).map(p => `
          <a class="contact-row reveal" href="tel:${escapeHtml(p.number.replace(/\s/g, ''))}">
            <span class="contact-label">${escapeHtml(p.label || 'Phone')}</span>
            <span class="contact-value">${escapeHtml(p.number)}</span>
          </a>`).join('')}
        ${(c.links || []).map(l => `
          <a class="contact-row reveal" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">
            <span class="contact-label">${escapeHtml(l.platform)}</span>
            <span class="contact-value">${escapeHtml(l.handle)} ↗</span>
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
      <div class="skill-cat">${escapeHtml(s.category)}</div>
      <div class="skill-items">
        ${(s.items || []).map(i => `<span class="skill-pill">${escapeHtml(i)}</span>`).join('')}
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
      <div class="ach-rank">${escapeHtml(a.rank)}</div>
      <div>
        <div class="ach-title">${escapeHtml(a.title)}</div>
        <div class="ach-desc">${escapeHtml(a.desc)}</div>
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
          <img src="${escapeHtml(thumb)}" alt="${escapeHtml(p.title)}" loading="lazy"
               onerror="this.parentElement.innerHTML='&lt;div class=&quot;project-thumb-empty&quot;&gt;// no preview&lt;/div&gt;'" />
        </div>
        <div class="project-body">
          <div class="project-date">${escapeHtml(p.date || '')}</div>
          <div class="project-title">${escapeHtml(p.title)}</div>
          <div class="project-desc">${escapeHtml(p.shortDesc || '')}</div>
          <div class="tech-tags">
            ${(p.tech || []).map(t => `<span class="tech-tag">${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
      </div>`;
  }).join('');

  // Event delegation: one listener for the whole grid instead of one per card
  const projectMap = new Map(projects.map(p => [p.id, p]));
  attachCardEvents(root, '.project-card', (card) => async () => {
    const p  = projectMap.get(card.dataset.id);
    if (!p) return;
    const md     = await fetchText(`content/projects/${p.id}/index.md`);
    const images = p.images?.length ? p.images : [`content/projects/${p.id}/images/01.png`];
    modal.open(p.title, images, renderMarkdown(md || ''));
  });
}

function renderCertificates(certs) {
  const root = $('#certificatesContainer');
  if (!root) return;
  if (!certs?.length) { root.innerHTML = '<div class="loading">No certificates</div>'; return; }

  root.innerHTML = certs.map((c, i) => `
    <div class="cert-card reveal" data-id="${escapeHtml(c.id)}"
         style="transition-delay:${Math.min(i * 40, 350)}ms" role="button" tabindex="0">
      <div class="cert-issuer">${escapeHtml(c.issuer || 'Certificate')}</div>
      <div class="cert-title">${escapeHtml(c.title)}</div>
      <div class="cert-date">${escapeHtml(c.date || '')}</div>
    </div>
  `).join('');

  const certMap = new Map(certs.map(c => [c.id, c]));
  attachCardEvents(root, '.cert-card', (card) => async () => {
    const c  = certMap.get(card.dataset.id);
    if (!c) return;
    const md  = await fetchText(`content/certificates/${c.id}/index.md`);
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
      const el     = entry.target;
      const parent = el.parentElement;
      const siblings = [...parent.querySelectorAll('.reveal:not(.visible)')];
      const sibIdx   = siblings.indexOf(el);
      const custom   = parseFloat(el.style.getPropertyValue('--stagger-delay')) || 0;
      const stagger  = Math.min(sibIdx * ANIM_STAGGER_MS, ANIM_STAGGER_MAX);

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
    const x    = e.clientX - rect.left - size / 2;
    const y    = e.clientY - rect.top  - size / 2;

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
  const heatmap     = document.getElementById('heatmap');
  const heatmapBar  = document.getElementById('heatmapBar');
  const indicator   = document.getElementById('heatmapIndicator');
  const markers     = document.querySelectorAll('.heatmap-marker');
  const pctDisplay  = document.querySelector('.heatmap-percentage');
  const hasHeatmap  = !!(heatmap && heatmapBar && indicator);

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
      const rect       = heatmap.getBoundingClientRect();
      const pct        = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
      const targetScroll = pct * (document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: targetScroll, behavior: 'smooth' });
    });
  }

  /* ── grid-bg reference (parallax) ── */
  const gridBg = document.querySelector('.grid-bg');

  let ticking  = false;
  let lastTop  = 0;

  function onScroll() {
    // Computed once per frame, shared by every effect below
    const scrollTop = window.pageYOffset;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress  = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

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
      const eased   = Math.pow(progress / 100, 0.7) * 100;
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
    github:      null,
    codeforces:  null,
    leetcode:    null,
    atcoder:     null,   // leave null/empty to skip
  };

  const WEEKS_TO_SHOW = 53;  // ~1 year
  const CELL_SIZE     = 11;
  const CELL_GAP      = 3;
  const CELL_STEP     = CELL_SIZE + CELL_GAP;

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
      const r   = await fetch(url, { signal: AbortSignal.timeout(8000) });
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
      const r   = await fetch(url, { signal: AbortSignal.timeout(10000) });
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
    try {
      // leetcode.com/graphql blocks CORS from browsers.
      // alfa-leetcode-api is a free public CORS proxy that mirrors the same data.
      // Fallback chain: proxy → silent fail (heatmap still renders other platforms).
      const r = await fetch(
        `https://alfa-leetcode-api.onrender.com/userProfileCalendar?username=${encodeURIComponent(username)}&year=${new Date().getFullYear()}`,
        { signal: AbortSignal.timeout(12000) }
      );
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
    } catch (e) {
      console.warn('[heatmap] LeetCode fetch failed:', e.message);
    }
    return map;
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
      const r   = await fetch(url, { signal: AbortSignal.timeout(10000) });
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
        all[d][key]   += n;
        all[d].total  += n;
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
    let total        = 0;
    let longest      = 0;
    let current      = 0;
    let lastDate     = null;
    let activeDays   = 0;
    let githubTotal  = 0;
    let cfTotal      = 0;
    let lcTotal      = 0;
    let acTotal      = 0;

    // Walk every day in range in order
    const start = new Date(cutoff);
    for (let i = 0; i <= 364; i++) {
      const d   = addDays(start, i);
      const iso = toISO(d);
      const day = data[iso];

      if (day && day.total > 0) {
        total       += day.total;
        githubTotal += day.gh;
        cfTotal     += day.cf;
        lcTotal     += day.lc;
        acTotal     += day.ac;
        activeDays++;

        if (lastDate && daysBetween(lastDate, d) === 1) {
          current++;
        } else {
          current = 1;
        }
        if (current > longest) longest = current;
        lastDate = d;
      } else {
        current  = 0;
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
        const iso  = toISO(date);
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
    const dayNames = ['S','M','T','W','T','F','S'];

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
            ${usernames.github     ? `<span class="ahm-badge" data-platform="gh">⬡ GitHub <em>${stats.githubTotal.toLocaleString()}</em></span>` : ''}
            ${usernames.codeforces ? `<span class="ahm-badge" data-platform="cf">● CF <em>${stats.cfTotal.toLocaleString()}</em></span>` : ''}
            ${usernames.leetcode   ? `<span class="ahm-badge" data-platform="lc">◆ LC <em>${stats.lcTotal.toLocaleString()}</em></span>` : ''}
            ${usernames.atcoder    ? `<span class="ahm-badge" data-platform="ac">▲ AC <em>${stats.acTotal.toLocaleString()}</em></span>` : ''}
          </div>
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
                const x     = 32 + wi * CELL_STEP;
                const y     = 18 + di * CELL_STEP;
                const count = cell.day?.total || 0;
                const level = countToLevel(count, maxCount);
                const fill  = getLevels()[level];

                // Tooltip data
                const iso  = cell.iso;
                const d    = cell.day;
                const tip  = count === 0
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
    const tip   = root.querySelector('#ahmTooltip');
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
    const rect   = root.getBoundingClientRect();
    const tipW   = tip.offsetWidth  || 180;
    const tipH   = tip.offsetHeight || 60;
    let   left   = e.clientX - rect.left + 12;
    let   top    = e.clientY - rect.top  - tipH - 8;

    if (left + tipW > rect.width - 8)  left = e.clientX - rect.left - tipW - 12;
    if (top < 4)                        top  = e.clientY - rect.top  + 20;

    tip.style.left = left + 'px';
    tip.style.top  = top  + 'px';
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
    const cells  = root.querySelectorAll('.ahm-cell');
    let   active = null;   // currently filtered platform key, or null = all

    function applyFilter(platform) {
      const levels = getLevels();
      cells.forEach(cell => {
        const count = platform
          ? parseInt(cell.dataset[platform] || '0', 10)
          : parseInt(cell.dataset.count     || '0', 10);

        // recolour
        const pct  = maxCount > 0 ? count / maxCount : 0;
        const lvl  = count === 0 ? 0 : pct < .15 ? 1 : pct < .35 ? 2 : pct < .65 ? 3 : 4;
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
        margin-bottom: 1.5rem;
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
      }

      /* ── Responsive ── */
      @media (max-width: 640px) {
        .ahm-stats { gap: 1rem 1.5rem; }
        .ahm-stat-value { font-size: 1.2rem; }
        .ahm-platform-badges { margin-left: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ── BOOT ────────────────────────────────────────────────────── */

  // Cached data so theme-toggle re-renders don't refetch
  let _cachedMerged   = null;
  let _cachedStats    = null;
  let _cachedUsernames = null;
  let _cachedCfRating = 0;

  async function init() {
    const root = document.getElementById('activityHeatmap');
    if (!root) return;

    const usernames = {
      github:      OVERRIDE.github      ?? root.dataset.github     ?? '',
      codeforces:  OVERRIDE.codeforces  ?? root.dataset.codeforces ?? '',
      leetcode:    OVERRIDE.leetcode    ?? root.dataset.leetcode   ?? '',
      atcoder:     OVERRIDE.atcoder     ?? root.dataset.atcoder    ?? '',
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
      _cachedStats  = computeStats(_cachedMerged);
      
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