/* ============================================================
   main.js — Portfolio runtime
   Single source of truth. No duplicate logic in index.html.
   ============================================================ */

/* ================================================================
   SCROLL ANIMATION CONFIG — Apple-style smooth reveal
================================================================ */
const ANIM_PRESET     = 'apple';   // Apple-style animation
const ANIM_DURATION_MS  = 700;
const ANIM_STAGGER_MS   = 60;
const ANIM_STAGGER_MAX  = 350;
const ANIM_THRESHOLD    = 0.1;
const ANIM_ROOT_MARGIN  = '0px 0px -80px 0px';

/* ===== Tiny DOM helpers ===== */
const $ = (sel) => document.querySelector(sel);

const escapeHtml = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

async function fetchText(url) {
  try {
    const r = await fetch(url);
    return r.ok ? r.text() : null;
  } catch {
    return null;
  }
}

/* ===== Markdown renderer (XSS-safe, color-code aware) ===== */
function applyColorCodes(html) {
  return html.replace(/=\(#([A-Fa-f0-9]{6})\)(.*?)=/gs,
    (_, hex, content) => `<span style="color:#${hex}">${content}</span>`);
}

function renderMarkdown(md) {
  if (!md) return '';
  let h = escapeHtml(md);
  h = applyColorCodes(h);
  h = h.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c}</code></pre>`);
  h = h.replace(/^### (.*)$/gm, '<h3>$1</h3>')
       .replace(/^## (.*)$/gm,  '<h2>$1</h2>')
       .replace(/^# (.*)$/gm,   '<h1>$1</h1>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
       .replace(/\*(.+?)\*/g,    '<em>$1</em>')
       .replace(/`([^`]+?)`/g,   '<code>$1</code>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');
  h = h.replace(/(^|\n)((?:[-*] .+\n?)+)/g, (_, pre, block) => {
    const items = block.trim().split('\n')
      .map(l => `<li>${l.replace(/^[-*] /, '')}</li>`).join('');
    return `${pre}<ul>${items}</ul>`;
  });
  h = h.split(/\n{2,}/).map(chunk =>
    /^\s*<(h\d|ul|ol|pre|blockquote)/.test(chunk)
      ? chunk
      : `<p>${chunk.replace(/\n/g, '<br>')}</p>`
  ).join('\n');
  return h;
}

/* ===== Theme ===== */
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.dataset.theme = saved;
  const btn = $('#themeBtn');
  btn.textContent = saved === 'dark' ? '☾' : '☀';
  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    btn.textContent = next === 'dark' ? '☾' : '☀';
    localStorage.setItem('theme', next);
  });
}

/* ===== Modal ===== */
const modal = {
  root: null, title: null, carousel: null, body: null,
  images: [], index: 0,

  init() {
    this.root     = $('#modal');
    this.title    = $('#modalTitle');
    this.carousel = $('#modalCarousel');
    this.body     = $('#modalBody');
    $('#modalClose').addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.close(); });
    document.addEventListener('keydown', (e) => {
      if (!this.root.classList.contains('open')) return;
      if (e.key === 'Escape')     this.close();
      if (e.key === 'ArrowLeft')  this.prev();
      if (e.key === 'ArrowRight') this.next();
    });
  },

  open(title, images, mdHtml) {
    this.title.textContent = title;
    this.images = images.filter(Boolean);
    this.index  = 0;
    this.renderCarousel();
    this.body.innerHTML = mdHtml || '';
    this.root.classList.add('open');
    document.body.style.overflow = 'hidden';
  },

  close() {
    this.root.classList.remove('open');
    document.body.style.overflow = '';
  },

  prev() {
    if (!this.images.length) return;
    this.index = (this.index - 1 + this.images.length) % this.images.length;
    this.renderCarousel();
  },

  next() {
    if (!this.images.length) return;
    this.index = (this.index + 1) % this.images.length;
    this.renderCarousel();
  },

  renderCarousel() {
    if (!this.images.length) { this.carousel.innerHTML = ''; return; }
    const src = escapeHtml(this.images[this.index]);
    this.carousel.innerHTML = `
      <img src="${src}" alt="preview" onerror="this.style.opacity='0.4'" />
      ${this.images.length > 1 ? `
        <button class="carousel-btn prev" aria-label="Previous">‹</button>
        <button class="carousel-btn next" aria-label="Next">›</button>
        <div class="carousel-count">${this.index + 1} / ${this.images.length}</div>
      ` : ''}
    `;
    this.carousel.querySelector('.prev')?.addEventListener('click', () => this.prev());
    this.carousel.querySelector('.next')?.addEventListener('click', () => this.next());
  },
};

/* ===== Renderers ===== */
function renderSite(site) {
  document.title = `${site.name} | ${site.title}`;
  $('#heroEyebrow').textContent    = site.eyebrow;
  $('#heroTagline').textContent    = site.tagline;
  $('#profileImg').src             = site.profileImage || 'assets/images/profile.png';
  $('#profileImg').alt             = escapeHtml(site.name);
  $('#avatarLabel').textContent    = site.name;
  $('#avatarStatus').textContent   = site.availability;
  $('#footerName').textContent     = site.name;
  $('#footerLocation').textContent = site.footerLocation;
  $('#footerYear').textContent     = new Date().getFullYear();

  const nameParts = site.name.split(' ');
  $('#heroName').innerHTML = nameParts
    .map((w, i) => i === nameParts.length - 1
      ? `<span class="accent">${escapeHtml(w)}</span>`
      : escapeHtml(w))
    .join('<br>');

  const statsEl = $('#heroStats');
  statsEl.innerHTML = (site.stats || []).map(s => `
    <div class="stat reveal">
      <div class="stat-value">${escapeHtml(s.value)}</div>
      <div class="stat-label">${escapeHtml(s.label)}</div>
    </div>`).join('');

  const ctaEl = $('#heroCtas');
  ctaEl.innerHTML = (site.ctas || []).map(c => {
    const isExt = String(c.url).startsWith('http');
    const extAttrs = isExt ? ' target="_blank" rel="noopener"' : '';
    const cls = c.type === 'primary' ? 'btn-primary' : 'btn-ghost';
    return `<a href="${escapeHtml(c.url)}" class="btn ${cls} reveal"${extAttrs}>${escapeHtml(c.label)}</a>`;
  }).join('');

  const c = site.contact;
  if (!c) return;
  $('#contactWrap').innerHTML = `
    <div class="reveal">
      <p class="contact-intro">${escapeHtml(c.intro)}</p>
    </div>
    <div class="contact-list">
      ${(c.emails || []).map(e => `
        <a class="contact-row reveal" href="mailto:${escapeHtml(e.address)}">
          <span class="contact-label">${escapeHtml(e.label)}</span>
          <span class="contact-value">${escapeHtml(e.address)}</span>
        </a>`).join('')}
      ${(c.phones || []).map(p => `
        <a class="contact-row reveal" href="tel:${escapeHtml(p.number.replace(/\s/g, ''))}">
          <span class="contact-label">${escapeHtml(p.label)}</span>
          <span class="contact-value">${escapeHtml(p.number)}</span>
        </a>`).join('')}
      ${(c.links || []).map(l => `
        <a class="contact-row reveal" href="${escapeHtml(l.url)}" target="_blank" rel="noopener">
          <span class="contact-label">${escapeHtml(l.platform)}</span>
          <span class="contact-value">${escapeHtml(l.handle)} ↗</span>
        </a>`).join('')}
    </div>
  `;
}

function renderSkills(skills) {
  $('#skillsContainer').innerHTML = (skills || []).map(s => `
    <div class="skill-card reveal">
      <div class="skill-cat">${escapeHtml(s.category)}</div>
      <div class="skill-items">
        ${(s.items || []).map(i => `<span class="skill-pill">${escapeHtml(i)}</span>`).join('')}
      </div>
    </div>`).join('') || '<div class="loading">No skills data</div>';
}

function renderAchievements(items) {
  $('#achievementsContainer').innerHTML = (items || []).map((a, index) => `
    <div class="ach-item reveal" style="transition-delay: ${Math.min(index * 30, 300)}ms">
      <div class="ach-rank">${escapeHtml(a.rank)}</div>
      <div>
        <div class="ach-title">${escapeHtml(a.title)}</div>
        <div class="ach-desc">${escapeHtml(a.desc)}</div>
      </div>
    </div>`).join('') || '<div class="loading">No achievements</div>';
}

function renderProjects(projects) {
  const root = $('#projectsGrid');
  if (!projects?.length) { root.innerHTML = '<div class="loading">No projects</div>'; return; }

  root.innerHTML = projects.map((p, index) => {
    const thumb = (p.images && p.images[0]) || `content/projects/${p.id}/images/01.png`;
    return `
      <div class="project-card reveal" data-id="${escapeHtml(p.id)}" style="transition-delay: ${Math.min(index * 50, 400)}ms">
        <div class="project-thumb">
          <img src="${escapeHtml(thumb)}" alt="${escapeHtml(p.title)}"
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

  projects.forEach(p => {
    const card = root.querySelector(`.project-card[data-id="${CSS.escape(p.id)}"]`);
    if (!card) return;
    card.addEventListener('click', async () => {
      const md     = await fetchText(`content/projects/${p.id}/index.md`);
      const images = p.images?.length ? p.images : [`content/projects/${p.id}/images/01.png`];
      modal.open(p.title, images, renderMarkdown(md || ''));
    });
  });
}

function renderCertificates(certs) {
  const root = $('#certificatesContainer');
  if (!certs?.length) { root.innerHTML = '<div class="loading">No certificates</div>'; return; }

  root.innerHTML = certs.map((c, index) => `
    <div class="cert-card reveal" data-id="${escapeHtml(c.id)}" style="transition-delay: ${Math.min(index * 40, 350)}ms">
      <div class="cert-issuer">${escapeHtml(c.issuer || 'Certificate')}</div>
      <div class="cert-title">${escapeHtml(c.title)}</div>
      <div class="cert-date">${escapeHtml(c.date || '')}</div>
    </div>`).join('');

  certs.forEach(c => {
    const card = root.querySelector(`.cert-card[data-id="${CSS.escape(c.id)}"]`);
    if (!card) return;
    card.addEventListener('click', async () => {
      const md  = await fetchText(`content/certificates/${c.id}/index.md`);
      const img = `content/certificates/${c.id}/01.png`;
      modal.open(c.title, [img], renderMarkdown(md || c.description || ''));
    });
  });
}

/* ================================================================
   SCROLL REVEAL SYSTEM — Apple-style smooth reveals
   - Elements fade in with a subtle upward motion
   - Smooth cubic-bezier easing for a premium feel
   - Staggered timing for lists
   - Respects prefers-reduced-motion
================================================================ */
function initScrollReveal() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Apple-style preset CSS ---
  // This creates the smooth, elegant reveal Apple uses
  const applePreset = `
    .reveal {
      opacity: 0;
      transform: translateY(24px) scale(0.98);
      transition: 
        opacity ${ANIM_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1),
        transform ${ANIM_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1);
      will-change: opacity, transform;
    }
    
    .reveal.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    
    /* Extra smooth for cards and larger elements */
    .project-card.reveal,
    .cert-card.reveal,
    .skill-card.reveal {
      transition: 
        opacity ${ANIM_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1),
        transform ${ANIM_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1),
        border-color 0.25s ease,
        transform 0.25s ease,
        box-shadow 0.25s ease;
    }
    
    /* Section headers reveal slightly faster */
    .sec-label.reveal,
    .sec-title.reveal {
      transition: 
        opacity 500ms cubic-bezier(0.22, 1, 0.36, 1),
        transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
    }
  `;

  const style = document.createElement('style');
  style.id = 'anim-preset';
  style.textContent = reduced
    ? '.reveal { opacity:1 !important; transform:none !important; transition:none !important; }'
    : applePreset;
  document.head.appendChild(style);

  if (reduced) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
    return;
  }

  // Mark section headings as reveal targets
  document.querySelectorAll('.sec-label, .sec-title').forEach(el => {
    if (!el.classList.contains('reveal')) el.classList.add('reveal');
  });

  // Also mark hero elements
  document.querySelectorAll('#hero .stat, #hero .btn, .hero-eyebrow, .hero-name, .hero-tagline').forEach(el => {
    if (!el.classList.contains('reveal')) el.classList.add('reveal');
  });

  // Stagger hero elements
  const heroElements = document.querySelectorAll('#hero .reveal');
  heroElements.forEach((el, i) => {
    const delay = Math.min(i * 80, 400);
    el.style.setProperty('--stagger-delay', `${delay}ms`);
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;

      const el = entry.target;
      
      // Check for custom stagger delay
      const customDelay = parseFloat(el.style.getPropertyValue('--stagger-delay')) || 0;
      
      // Count only un-revealed siblings in this container for stagger
      const parent = el.parentElement;
      const unrevealedSiblings = [...parent.querySelectorAll('.reveal:not(.visible)')];
      const order = unrevealedSiblings.indexOf(el);
      const staggerDelay = Math.min(order * ANIM_STAGGER_MS, ANIM_STAGGER_MAX);
      
      const totalDelay = customDelay + staggerDelay;

      setTimeout(() => {
        el.classList.add('visible');
        // Dispatch event for any listeners
        el.dispatchEvent(new CustomEvent('revealed'));
      }, totalDelay);
      
      observer.unobserve(el);
    });
  }, {
    threshold: ANIM_THRESHOLD,
    rootMargin: ANIM_ROOT_MARGIN,
  });

  // Double rAF: lets the browser finish layout + paint before we observe
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    });
  });
}

/* ===== Button ripple on click ===== */
function initLinkEffects() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    btn.querySelectorAll('.ripple').forEach(r => r.remove());
    const rect   = btn.getBoundingClientRect();
    const size   = Math.max(rect.width, rect.height) * 2;
    const x      = e.clientX - rect.left - size / 2;
    const y      = e.clientY - rect.top  - size / 2;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px`;
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });
}

/* ===== Boot ===== */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  modal.init();

  try {
    renderSite(window.DATA_SITE);
    renderSkills(window.DATA_SKILLS);
    renderAchievements(window.DATA_ACHIEVEMENTS);
    renderProjects(window.DATA_PROJECTS);
    renderCertificates(window.DATA_CERTIFICATES);
  } catch (err) {
    console.error('[Portfolio] Render error:', err);
    document.body.insertAdjacentHTML('afterbegin',
      `<div style="padding:1rem;background:#a00;color:#fff;text-align:center;font-family:monospace;">
        Failed to render portfolio data — check console.
      </div>`);
  }

  initScrollReveal();
  initLinkEffects();
});