/* ============================================
   Portfolio — Dynamic loader
   All content sourced from /data/*.json and /content/**/*.md
   ============================================ */

const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, html = '') => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'onclick') e.addEventListener('click', v);
    else e.setAttribute(k, v);
  }
  if (html) e.innerHTML = html;
  return e;
};
const escapeHtml = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed ${url}`);
  return r.json();
}
async function fetchText(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
}

/* ===== Minimal Markdown renderer (safe-ish) ===== */
function renderMarkdown(md) {
  if (!md) return '';
  let html = escapeHtml(md);
  // Code fences
  html = html.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c}</code></pre>`);
  // Headings
  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>')
             .replace(/^## (.*)$/gm, '<h2>$1</h2>')
             .replace(/^# (.*)$/gm, '<h1>$1</h1>');
  // Bold / italic / inline code
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
             .replace(/\*(.+?)\*/g, '<em>$1</em>')
             .replace(/`([^`]+?)`/g, '<code>$1</code>');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Lists
  html = html.replace(/(^|\n)([-*] .+(?:\n[-*] .+)*)/g, (_, pre, block) => {
    const items = block.split('\n').map(l => l.replace(/^[-*] /, '')).map(li => `<li>${li}</li>`).join('');
    return `${pre}<ul>${items}</ul>`;
  });
  // Paragraphs (split on blank lines)
  html = html.split(/\n{2,}/).map(chunk => {
    if (/^\s*<(h\d|ul|ol|pre|blockquote)/.test(chunk)) return chunk;
    return `<p>${chunk.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
  return html;
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
    this.root = $('#modal');
    this.title = $('#modalTitle');
    this.carousel = $('#modalCarousel');
    this.body = $('#modalBody');
    $('#modalClose').addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.close(); });
    document.addEventListener('keydown', (e) => {
      if (!this.root.classList.contains('open')) return;
      if (e.key === 'Escape') this.close();
      if (e.key === 'ArrowLeft') this.prev();
      if (e.key === 'ArrowRight') this.next();
    });
  },
  open(title, images, mdHtml) {
    this.title.textContent = title;
    this.images = images.filter(Boolean);
    this.index = 0;
    this.renderCarousel();
    this.body.innerHTML = mdHtml || '';
    this.root.classList.add('open');
    document.body.style.overflow = 'hidden';
  },
  close() { this.root.classList.remove('open'); document.body.style.overflow = ''; },
  prev() { if (this.images.length) { this.index = (this.index - 1 + this.images.length) % this.images.length; this.renderCarousel(); } },
  next() { if (this.images.length) { this.index = (this.index + 1) % this.images.length; this.renderCarousel(); } },
  renderCarousel() {
    if (!this.images.length) { this.carousel.innerHTML = ''; return; }
    this.carousel.innerHTML = `
      <img src="${escapeHtml(this.images[this.index])}" alt="preview"/>
      ${this.images.length > 1 ? `
        <button class="carousel-btn prev" aria-label="Previous">‹</button>
        <button class="carousel-btn next" aria-label="Next">›</button>
        <div class="carousel-count">${this.index + 1} / ${this.images.length}</div>` : ''}
    `;
    this.carousel.querySelector('.prev')?.addEventListener('click', () => this.prev());
    this.carousel.querySelector('.next')?.addEventListener('click', () => this.next());
  },
};

/* ===== Renderers ===== */
function renderSite(site) {
  document.title = `${site.name} | ${site.title}`;
  $('#heroEyebrow').textContent = site.eyebrow;
  $('#heroName').innerHTML = site.name.split(' ').map((w, i, a) =>
    i === a.length - 1 ? `<span class="accent">${w}</span>` : w
  ).join('<br>');
  $('#heroTagline').textContent = site.tagline;
  $('#profileImg').src = site.profileImage;
  $('#profileImg').alt = site.name;
  $('#avatarLabel').textContent = site.name;
  $('#avatarStatus').textContent = site.availability;
  $('#footerName').textContent = site.name;
  $('#footerLocation').textContent = site.footerLocation;
  $('#footerYear').textContent = new Date().getFullYear();

  // Stats
  const statsEl = $('#heroStats');
  statsEl.innerHTML = '';
  site.stats.forEach(s => {
    statsEl.appendChild(el('div', { class: 'stat' },
      `<div class="stat-value">${escapeHtml(s.value)}</div>
       <div class="stat-label">${escapeHtml(s.label)}</div>`));
  });

  // CTAs
  const ctaEl = $('#heroCtas');
  ctaEl.innerHTML = '';
  site.ctas.forEach(c => {
    const a = el('a', {
      href: c.url,
      class: `btn ${c.type === 'primary' ? 'btn-primary' : 'btn-ghost'}`,
      ...(c.url.startsWith('http') ? { target: '_blank', rel: 'noopener' } : {}),
    }, escapeHtml(c.label));
    ctaEl.appendChild(a);
  });

  // Contact
  const c = site.contact;
  const wrap = $('#contactWrap');
  wrap.innerHTML = `
    <div>
      <p class="contact-intro">${escapeHtml(c.intro)}</p>
    </div>
    <div class="contact-list">
      ${c.emails.map(e => `
        <a class="contact-row" href="mailto:${escapeHtml(e.address)}">
          <span class="contact-label">${escapeHtml(e.label)}</span>
          <span class="contact-value">${escapeHtml(e.address)}</span>
        </a>`).join('')}
      ${c.phones.map(p => `
        <a class="contact-row" href="tel:${escapeHtml(p.number.replace(/\s/g,''))}">
          <span class="contact-label">${escapeHtml(p.label)}</span>
          <span class="contact-value">${escapeHtml(p.number)}</span>
        </a>`).join('')}
      ${c.links.map(l => `
        <a class="contact-row" href="${escapeHtml(l.url)}" target="_blank" rel="noopener">
          <span class="contact-label">${escapeHtml(l.platform)}</span>
          <span class="contact-value">${escapeHtml(l.handle)} ↗</span>
        </a>`).join('')}
    </div>
  `;
}

function renderSkills(skills) {
  const root = $('#skillsContainer');
  root.innerHTML = '';
  skills.forEach(s => {
    root.appendChild(el('div', { class: 'skill-card' }, `
      <div class="skill-cat">${escapeHtml(s.category)}</div>
      <div class="skill-items">
        ${s.items.map(i => `<span class="skill-pill">${escapeHtml(i)}</span>`).join('')}
      </div>`));
  });
}

function renderAchievements(items) {
  const root = $('#achievementsContainer');
  root.innerHTML = '';
  items.forEach(a => {
    root.appendChild(el('div', { class: 'ach-item' }, `
      <div class="ach-rank">${escapeHtml(a.rank)}</div>
      <div>
        <div class="ach-title">${escapeHtml(a.title)}</div>
        <div class="ach-desc">${escapeHtml(a.desc)}</div>
      </div>`));
  });
}

function renderProjects(projects) {
  const root = $('#projectsGrid');
  root.innerHTML = '';
  projects.forEach(p => {
    const baseDir = `content/projects/${p.id}`;
    const thumb = `${baseDir}/images/01.png`;
    const card = el('div', { class: 'project-card' }, `
      <div class="project-thumb">
        <img src="${thumb}" alt="${escapeHtml(p.title)}" onerror="this.parentElement.innerHTML='<div class=&quot;project-thumb-empty&quot;>// no preview</div>'"/>
      </div>
      <div class="project-body">
        <div class="project-date">${escapeHtml(p.date)}</div>
        <div class="project-title">${escapeHtml(p.title)}</div>
        <div class="project-desc">${escapeHtml(p.shortDesc)}</div>
        <div class="tech-tags">${(p.tech || []).map(t => `<span class="tech-tag">${escapeHtml(t)}</span>`).join('')}</div>
      </div>`);
    card.addEventListener('click', () => {
      const md = (window.DATA_CONTENT && window.DATA_CONTENT['projects/'+p.id]) || '';
      const imgs = (p.images && p.images.length) ? p.images : [thumb];
      modal.open(p.title, imgs, renderMarkdown(md));
    });
    root.appendChild(card);
  });
}

async function renderCertificates(certs) {
  const root = $('#certificatesContainer');
  root.innerHTML = '';
  certs.forEach(c => {
    const baseDir = `content/certificates/${c.id}`;
    const card = el('div', { class: 'cert-card' }, `
      <div class="cert-issuer">${escapeHtml(c.issuer || 'Certificate')}</div>
      <div class="cert-title">${escapeHtml(c.title)}</div>
      <div class="cert-date">${escapeHtml(c.date || '')}</div>
    `);
    card.addEventListener('click', () => {
      const md = (window.DATA_CONTENT && window.DATA_CONTENT['certificates/'+c.id]) || c.description || '';
      modal.open(c.title, [`${baseDir}/image.png`], renderMarkdown(md));
    });
    root.appendChild(card);
  });
}

/* ===== Boot ===== */
function boot() {
  initTheme();
  modal.init();
  try {
    renderSite(window.DATA_SITE);
    renderSkills(window.DATA_SKILLS);
    renderAchievements(window.DATA_ACHIEVEMENTS);
    renderProjects(window.DATA_PROJECTS);
    renderCertificates(window.DATA_CERTIFICATES);
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML('afterbegin',
      `<div style="padding:1rem;background:#a00;color:#fff;text-align:center;">
        Failed to render portfolio data. Check console.
      </div>`);
  }
}
document.addEventListener('DOMContentLoaded', boot);
