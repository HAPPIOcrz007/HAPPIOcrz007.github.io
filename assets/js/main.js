/* ============================================================
   main.js — Portfolio runtime with Apple-style animations
   ============================================================ */

/* ================================================================
   SCROLL ANIMATION CONFIG — Apple-style smooth reveal
================================================================ */
const ANIM_DURATION_MS  = 700;
const ANIM_STAGGER_MS   = 60;
const ANIM_STAGGER_MAX  = 350;
const ANIM_THRESHOLD    = 0.1;
const ANIM_ROOT_MARGIN  = '0px 0px -80px 0px';

/* ===== Tiny DOM helpers ===== */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const escapeHtml = (s = '') => {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
};

async function fetchText(url) {
  try {
    const r = await fetch(url);
    return r.ok ? r.text() : null;
  } catch (error) {
    console.warn(`[fetchText] Failed to load ${url}:`, error);
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
  
  // Custom color codes
  h = applyColorCodes(h);
  
  // Code blocks
  h = h.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
  
  // Headers
  h = h.replace(/^### (.*)$/gm, '<h3>$1</h3>')
       .replace(/^## (.*)$/gm, '<h2>$1</h2>')
       .replace(/^# (.*)$/gm, '<h1>$1</h1>');
  
  // Inline formatting
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
       .replace(/\*(.+?)\*/g, '<em>$1</em>')
       .replace(/`([^`]+?)`/g, '<code>$1</code>');
  
  // Links
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Lists
  h = h.replace(/(^|\n)((?:[-*] .+\n?)+)/g, (_, pre, block) => {
    const items = block.trim().split('\n')
      .map(l => `<li>${l.replace(/^[-*] /, '').trim()}</li>`).join('');
    return `${pre}<ul>${items}</ul>`;
  });
  
  // Paragraphs (with proper handling)
  h = h.split(/\n{2,}/).map(chunk => {
    const trimmed = chunk.trim();
    if (!trimmed) return '';
    if (/^\s*<(h\d|ul|ol|pre|blockquote|table)/.test(trimmed)) {
      return trimmed;
    }
    return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
  }).filter(Boolean).join('\n');
  
  return h;
}

/* ===== Theme ===== */
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.dataset.theme = saved;
  const btn = $('#themeBtn');
  if (btn) {
    btn.textContent = saved === 'dark' ? '☾' : '☀';
    btn.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      btn.textContent = next === 'dark' ? '☾' : '☀';
      localStorage.setItem('theme', next);
      
      // Dispatch event for other components if needed
      document.dispatchEvent(new CustomEvent('themeChange', { detail: { theme: next } }));
    });
  }
}

/* ===== Modal ===== */
const modal = {
  root: null, 
  title: null, 
  carousel: null, 
  body: null,
  images: [], 
  index: 0,
  isOpen: false,

  init() {
    this.root = $('#modal');
    if (!this.root) return;
    
    this.title = $('#modalTitle');
    this.carousel = $('#modalCarousel');
    this.body = $('#modalBody');
    
    const closeBtn = $('#modalClose');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    
    // Close on overlay click
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
    
    // Keyboard support
    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') this.close();
      if (e.key === 'ArrowLeft') this.prev();
      if (e.key === 'ArrowRight') this.next();
    });
    
    // Trap focus inside modal when open
    this.root.addEventListener('focusin', (e) => {
      if (!this.isOpen) return;
      const focusable = this.root.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.target === this.root || e.target === last) {
        if (e.target === last) first?.focus();
        if (e.target === this.root) last?.focus();
      }
    });
  },

  open(title, images, mdHtml) {
    if (!this.root) return;
    
    this.title.textContent = title || 'Untitled';
    this.images = (images || []).filter(Boolean);
    this.index = 0;
    this.isOpen = true;
    
    this.renderCarousel();
    this.body.innerHTML = mdHtml || '';
    this.root.classList.add('open');
    document.body.style.overflow = 'hidden';
    
    // Focus management
    setTimeout(() => {
      const closeBtn = $('#modalClose');
      if (closeBtn) closeBtn.focus();
    }, 100);
  },

  close() {
    if (!this.root) return;
    this.root.classList.remove('open');
    document.body.style.overflow = '';
    this.isOpen = false;
    
    // Return focus to previous element
    if (this._lastFocused) {
      this._lastFocused.focus();
      this._lastFocused = null;
    }
  },

  prev() {
    if (!this.images.length || this.images.length <= 1) return;
    this.index = (this.index - 1 + this.images.length) % this.images.length;
    this.renderCarousel();
  },

  next() {
    if (!this.images.length || this.images.length <= 1) return;
    this.index = (this.index + 1) % this.images.length;
    this.renderCarousel();
  },

  renderCarousel() {
    if (!this.carousel) return;
    if (!this.images.length) { 
      this.carousel.innerHTML = ''; 
      return; 
    }
    
    const src = escapeHtml(this.images[this.index]);
    const hasMultiple = this.images.length > 1;
    
    this.carousel.innerHTML = `
      <img src="${src}" alt="Preview" 
           loading="lazy" 
           onerror="this.style.opacity='0.4'; this.alt='Image not available';" />
      ${hasMultiple ? `
        <button class="carousel-btn prev" aria-label="Previous image">‹</button>
        <button class="carousel-btn next" aria-label="Next image">›</button>
        <div class="carousel-count">${this.index + 1} / ${this.images.length}</div>
      ` : ''}
    `;
    
    const prevBtn = this.carousel.querySelector('.prev');
    const nextBtn = this.carousel.querySelector('.next');
    if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); this.prev(); });
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); this.next(); });
  },
};

/* ===== Renderers ===== */
function renderSite(site) {
  if (!site) return;
  
  // Title
  document.title = `${site.name || 'Portfolio'} | ${site.title || 'Developer'}`;
  
  // Hero
  const heroEyebrow = $('#heroEyebrow');
  if (heroEyebrow) heroEyebrow.textContent = site.eyebrow || '';
  
  const heroTagline = $('#heroTagline');
  if (heroTagline) heroTagline.textContent = site.tagline || '';
  
  const profileImg = $('#profileImg');
  if (profileImg) {
    profileImg.src = site.profileImage || 'assets/images/profile.png';
    profileImg.alt = escapeHtml(site.name || 'Profile');
  }
  
  const avatarLabel = $('#avatarLabel');
  if (avatarLabel) avatarLabel.textContent = site.name || '';
  
  const avatarStatus = $('#avatarStatus');
  if (avatarStatus) avatarStatus.textContent = site.availability || '';
  
  const footerName = $('#footerName');
  if (footerName) footerName.textContent = site.name || '';
  
  const footerLocation = $('#footerLocation');
  if (footerLocation) footerLocation.textContent = site.footerLocation || '';
  
  const footerYear = $('#footerYear');
  if (footerYear) footerYear.textContent = new Date().getFullYear();

  // Hero name with accent on last part
  const heroName = $('#heroName');
  if (heroName && site.name) {
    const nameParts = site.name.split(' ');
    heroName.innerHTML = nameParts
      .map((w, i) => i === nameParts.length - 1
        ? `<span class="accent">${escapeHtml(w)}</span>`
        : escapeHtml(w))
      .join('<br>');
  }

  // Stats
  const statsEl = $('#heroStats');
  if (statsEl && site.stats?.length) {
    statsEl.innerHTML = site.stats.map(s => `
      <div class="stat reveal">
        <div class="stat-value">${escapeHtml(s.value)}</div>
        <div class="stat-label">${escapeHtml(s.label)}</div>
      </div>
    `).join('');
  }

  // CTAs
  const ctaEl = $('#heroCtas');
  if (ctaEl && site.ctas?.length) {
    ctaEl.innerHTML = site.ctas.map(c => {
      const isExt = String(c.url).startsWith('http');
      const extAttrs = isExt ? ' target="_blank" rel="noopener noreferrer"' : '';
      const cls = c.type === 'primary' ? 'btn-primary' : 'btn-ghost';
      return `<a href="${escapeHtml(c.url)}" class="btn ${cls} reveal"${extAttrs}>${escapeHtml(c.label)}</a>`;
    }).join('');
  }

  // Contact
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
  
  if (!skills?.length) {
    container.innerHTML = '<div class="loading">No skills data</div>';
    return;
  }
  
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
  
  if (!items?.length) {
    container.innerHTML = '<div class="loading">No achievements</div>';
    return;
  }
  
  container.innerHTML = items.map((a, index) => `
    <div class="ach-item reveal" style="transition-delay: ${Math.min(index * 30, 300)}ms">
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
  
  if (!projects?.length) {
    root.innerHTML = '<div class="loading">No projects</div>';
    return;
  }

  root.innerHTML = projects.map((p, index) => {
    const thumb = (p.images && p.images[0]) || `content/projects/${p.id}/images/01.png`;
    return `
      <div class="project-card reveal" data-id="${escapeHtml(p.id)}" 
           style="transition-delay: ${Math.min(index * 50, 400)}ms" role="button" tabindex="0">
        <div class="project-thumb">
          <img src="${escapeHtml(thumb)}" alt="${escapeHtml(p.title)}"
               loading="lazy" 
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

  // Event listeners
  projects.forEach(p => {
    const card = root.querySelector(`.project-card[data-id="${CSS.escape(p.id)}"]`);
    if (!card) return;
    
    const openProject = async () => {
      const md = await fetchText(`content/projects/${p.id}/index.md`);
      const images = p.images?.length ? p.images : [`content/projects/${p.id}/images/01.png`];
      modal.open(p.title, images, renderMarkdown(md || ''));
    };
    
    card.addEventListener('click', openProject);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openProject();
      }
    });
  });
}

function renderCertificates(certs) {
  const root = $('#certificatesContainer');
  if (!root) return;
  
  if (!certs?.length) {
    root.innerHTML = '<div class="loading">No certificates</div>';
    return;
  }

  root.innerHTML = certs.map((c, index) => `
    <div class="cert-card reveal" data-id="${escapeHtml(c.id)}" 
         style="transition-delay: ${Math.min(index * 40, 350)}ms" role="button" tabindex="0">
      <div class="cert-issuer">${escapeHtml(c.issuer || 'Certificate')}</div>
      <div class="cert-title">${escapeHtml(c.title)}</div>
      <div class="cert-date">${escapeHtml(c.date || '')}</div>
    </div>
  `).join('');

  certs.forEach(c => {
    const card = root.querySelector(`.cert-card[data-id="${CSS.escape(c.id)}"]`);
    if (!card) return;
    
    const openCert = async () => {
      const md = await fetchText(`content/certificates/${c.id}/index.md`);
      const img = `content/certificates/${c.id}/01.png`;
      modal.open(c.title, [img], renderMarkdown(md || c.description || ''));
    };
    
    card.addEventListener('click', openCert);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openCert();
      }
    });
  });
}

/* ================================================================
   SCROLL REVEAL — Apple-style smooth reveals
================================================================ */
function initScrollReveal() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const appleStyle = `
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
    
    .project-card.reveal,
    .cert-card.reveal,
    .skill-card.reveal {
      transition: 
        opacity ${ANIM_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1),
        transform ${ANIM_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1),
        border-color 0.25s ease,
        box-shadow 0.25s ease;
    }
    
    .sec-label.reveal,
    .sec-title.reveal {
      transition: 
        opacity 500ms cubic-bezier(0.22, 1, 0.36, 1),
        transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    
    /* Prevent FOUC */
    .reveal:not(.visible) {
      visibility: hidden;
    }
    .reveal.visible {
      visibility: visible;
    }
  `;

  const style = document.createElement('style');
  style.id = 'anim-preset';
  style.textContent = reduced
    ? '.reveal { opacity:1 !important; transform:none !important; transition:none !important; visibility:visible !important; }'
    : appleStyle;
  document.head.appendChild(style);

  if (reduced) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
    return;
  }

  // Mark section headings
  document.querySelectorAll('.sec-label, .sec-title').forEach(el => {
    if (!el.classList.contains('reveal')) el.classList.add('reveal');
  });

  // Mark hero elements
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
      
      // Check if parent has visible children already
      const parent = el.parentElement;
      const allRevealChildren = [...parent.querySelectorAll('.reveal:not(.visible)')];
      const siblingOrder = allRevealChildren.indexOf(el);
      
      // Use dataset stagger if available, otherwise calculate from siblings
      const customDelay = parseFloat(el.style.getPropertyValue('--stagger-delay')) || 0;
      const staggerDelay = Math.min(siblingOrder * ANIM_STAGGER_MS, ANIM_STAGGER_MAX);
      
      const totalDelay = customDelay + staggerDelay;

      setTimeout(() => {
        el.classList.add('visible');
        // Dispatch custom event
        el.dispatchEvent(new CustomEvent('revealed', { bubbles: true }));
      }, totalDelay);
      
      observer.unobserve(el);
    });
  }, {
    threshold: ANIM_THRESHOLD,
    rootMargin: ANIM_ROOT_MARGIN,
  });

  // Use microtask to ensure DOM is ready
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    });
  });
}

/* ===== Button ripple ===== */
function initLinkEffects() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    
    // Remove existing ripples
    btn.querySelectorAll('.ripple').forEach(r => r.remove());
    
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${x}px;
      top: ${y}px;
      position: absolute;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.15);
      pointer-events: none;
      animation: ripple-expand 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
    `;
    
    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(ripple);
    
    ripple.addEventListener('animationend', () => ripple.remove());
  });
}

/* ================================================================
   BACKGROUND SCROLL — Subtle Apple-style effects
================================================================ */
function initBackgroundAnimations() {
  // --- Subtle scroll progress bar ---
  const progressBar = document.createElement('div');
  progressBar.className = 'scroll-progress';
  document.body.appendChild(progressBar);

  let lastScroll = 0;
  
  window.addEventListener('scroll', () => {
    const scrollTop = window.pageYOffset;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    
    // Use requestAnimationFrame for smooth updates
    if (Math.abs(scrollTop - lastScroll) > 1) {
      requestAnimationFrame(() => {
        progressBar.style.width = Math.min(progress, 100) + '%';
      });
      lastScroll = scrollTop;
    }
    
    // --- Very subtle parallax on grid ---
    const gridBg = document.querySelector('.grid-bg');
    if (gridBg && scrollTop < 1000) {
      gridBg.style.transform = `translateY(${scrollTop * 0.15}px)`;
    }
  }, { passive: true });

  // --- Smooth scroll for nav links ---
  document.querySelectorAll('nav a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        const navHeight = 60;
        const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - navHeight;
        
        window.scrollTo({
          top: Math.max(0, targetPosition),
          behavior: 'smooth'
        });
        
        // Update URL without jump
        if (history.pushState) {
          history.pushState(null, '', targetId);
        }
      }
    });
  });
}

/* ================================================================
   HEATMAP WATERFALL - Density visualization on the right
================================================================ */
function initHeatmap() {
  const heatmap = document.getElementById('heatmap');
  if (!heatmap) return;
  
  const heatmapBar = document.getElementById('heatmapBar');
  const indicator = document.getElementById('heatmapIndicator');
  const particlesContainer = document.getElementById('heatmapParticles');
  const markers = document.querySelectorAll('.heatmap-marker');
  const percentageDisplay = document.querySelector('.heatmap-percentage');

  if (!heatmapBar || !indicator) return;

  // Create floating particles
  function createParticles() {
    if (!particlesContainer) return;
    // Clear existing particles
    particlesContainer.innerHTML = '';
    
    for (let i = 0; i < 30; i++) {
      const particle = document.createElement('div');
      particle.className = 'heatmap-particle';
      particle.style.left = Math.random() * 100 + '%';
      particle.style.animationDuration = (3 + Math.random() * 4) + 's';
      particle.style.animationDelay = (Math.random() * 5) + 's';
      particle.style.width = (1 + Math.random() * 3) + 'px';
      particle.style.height = particle.style.width;
      particle.style.opacity = 0.2 + Math.random() * 0.3;
      particlesContainer.appendChild(particle);
    }
  }
  createParticles();

  // Update heatmap on scroll
  function updateHeatmap() {
    const scrollTop = window.pageYOffset;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    
    // Using a curve that starts slow then accelerates for "density" feel
    const easedProgress = Math.pow(progress / 100, 0.7) * 100;
    const clampedProgress = Math.min(Math.max(easedProgress, 0), 100);
    
    // Update bar height
    heatmapBar.style.height = clampedProgress + '%';
    
    // Update scroll indicator position
    const heatmapHeight = heatmap.offsetHeight;
    const indicatorPosition = (progress / 100) * heatmapHeight;
    indicator.style.top = Math.min(Math.max(indicatorPosition, 0), heatmapHeight) + 'px';
    
    // Update marker states
    markers.forEach(marker => {
      const value = parseInt(marker.dataset.value, 10);
      if (!isNaN(value) && progress >= value) {
        marker.classList.add('active');
      } else {
        marker.classList.remove('active');
      }
    });

    // Update percentage display
    if (percentageDisplay) {
      const displayPercent = Math.round(clampedProgress);
      percentageDisplay.textContent = displayPercent + '% density';
    }

    // Dynamic particle speed based on density
    const particleSpeed = 3 + (progress / 100) * 4;
    document.querySelectorAll('.heatmap-particle').forEach((p, i) => {
      const delay = i % 5;
      p.style.animationDuration = (particleSpeed + Math.random() * 2) + 's';
      p.style.animationDelay = (delay + Math.random() * 2) + 's';
    });

    // Update heatmap glow intensity
    const glowIntensity = 0.05 + (progress / 100) * 0.3;
    heatmapBar.style.boxShadow = `0 0 ${20 + progress * 1.5}px rgba(245, 197, 24, ${glowIntensity})`;
    
    // Update bar gradient based on progress
    const gradientStops = [
      `rgba(245, 197, 24, ${0.05 + (progress / 100) * 0.1}) 0%`,
      `rgba(245, 197, 24, ${0.15 + (progress / 100) * 0.2}) 15%`,
      `rgba(245, 197, 24, ${0.30 + (progress / 100) * 0.3}) 30%`,
      `rgba(245, 197, 24, ${0.50 + (progress / 100) * 0.4}) 50%`,
      `rgba(245, 197, 24, ${0.70 + (progress / 100) * 0.3}) 70%`,
      `rgba(245, 197, 24, ${0.85 + (progress / 100) * 0.15}) 85%`,
      `rgba(245, 197, 24, ${1}) 100%`
    ];
    heatmapBar.style.background = `linear-gradient(to top, ${gradientStops.join(', ')})`;
  }

  // Initial update
  updateHeatmap();

  // Update on scroll with throttling for performance
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updateHeatmap();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  // Update on resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(updateHeatmap, 200);
  });

  // Hover interactions
  heatmap.addEventListener('mouseenter', () => {
    heatmap.style.opacity = '0.8';
  });
  
  heatmap.addEventListener('mouseleave', () => {
    heatmap.style.opacity = '0.4';
  });

  // Click on heatmap to scroll to corresponding position
  heatmap.addEventListener('click', (e) => {
    const rect = heatmap.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const percentage = Math.min(Math.max(clickY / rect.height, 0), 1);
    const targetScroll = percentage * (document.documentElement.scrollHeight - window.innerHeight);
    
    window.scrollTo({
      top: targetScroll,
      behavior: 'smooth'
    });
  });
}

/* ================================================================
   ERROR HANDLING & BOOT
================================================================ */
function handleError(message) {
  console.error('[Portfolio]', message);
  
  // Show user-friendly error
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 16px 20px;
    background: #1a1a1a;
    border: 1px solid #e74c3c;
    border-radius: 8px;
    color: #fff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    z-index: 9999;
    max-width: 400px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    animation: slideUp 0.3s ease;
  `;
  errorDiv.textContent = `⚠️ ${message}`;
  document.body.appendChild(errorDiv);
  
  setTimeout(() => {
    errorDiv.style.opacity = '0';
    errorDiv.style.transition = 'opacity 0.3s ease';
    setTimeout(() => errorDiv.remove(), 300);
  }, 5000);
}

/* ===== Boot ===== */
document.addEventListener('DOMContentLoaded', () => {
  try {
    initTheme();
    modal.init();

    // Check if data exists
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
    initBackgroundAnimations();
    initHeatmap();
    
    // Dispatch ready event
    document.dispatchEvent(new CustomEvent('portfolio:ready'));
    
    console.log('🚀 Portfolio ready!');
  } catch (err) {
    console.error('[Portfolio] Boot error:', err);
    handleError('Failed to initialize portfolio. Check console for details.');
  }
});

// Handle errors gracefully
window.addEventListener('error', (e) => {
  console.error('[Portfolio] Runtime error:', e.message);
});

// Expose for debugging
window.__portfolio = {
  modal,
  renderMarkdown,
  escapeHtml,
  fetchText,
};

// In main.js
if (navigator.share) {
  document.querySelector('#shareBtn')?.addEventListener('click', () => {
    navigator.share({
      title: document.title,
      text: 'Check out my portfolio!',
      url: window.location.href,
    });
  });
}

