/* ============================================================
   main.js — Portfolio runtime with Apple-style animations
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

/* FIX #6 — guard on `null`/`undefined` only; don't coerce 0/false to '' */
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
  });
}

/* ===== Modal ===== */
const modal = {
  root:      null,
  title:     null,
  carousel:  null,
  body:      null,
  /* FIX #3 — cache closeBtn once in init() */
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

    /* FIX #3 — reuse cached closeBtn */
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

  /* FIX #4 — simplified guard */
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

/* ===== Shared helper: attach click+Enter/Space to a card ===== */
/* FIX #5 — single reusable function replaces two identical loops */
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

  const profileImg = $('#profileImg');
  if (profileImg) {
    profileImg.src = site.profileImage || 'assets/images/profile.png';
    profileImg.alt = escapeHtml(site.name || 'Profile');
  }

  /* FIX #15 — only rewrite heroName if data differs from static HTML */
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
      <div class="stat reveal">
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

  /* FIX #5 — single event-delegated handler instead of N×2 listeners */
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

  /* FIX #5 — event delegation */
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
   SCROLL REVEAL — styles now live in CSS; JS only drives visibility
================================================================ */
function initScrollReveal() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* FIX #7 — no more runtime <style> injection; reveal rules are in styles.css.
     For reduced motion, just flip all .reveal to .visible immediately. */
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

  /* FIX #8 — single rAF is enough */
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
   FIX #1 — one scroll listener; progress computed once per frame.
   FIX #12 — skip JS progress-bar update when CSS scroll-driven
             animation is supported (browser handles it natively).
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
          /* initial speed; CSS var drives dynamic speed — see FIX #2 */
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
    /* FIX #1 — computed once, shared by every feature */
    const scrollTop = window.pageYOffset;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress  = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

    /* Progress bar — FIX #12 */
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

      /* FIX #2 — one CSS variable write instead of 30 DOM style writes */
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
    /* FIX #1 — single unified function replaces initBackgroundAnimations + initHeatmap */
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