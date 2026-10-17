/* site.js — hero, avatar, footer and contact rendering from data/site.js. */

import { renderInlineMarkdown, stripMarkdown } from './markdown.js';
import { updateProfileImage } from './theme.js';
import { $, escapeHtml } from './utils.js';

/* ===== Renderers ===== */
export function renderSite(site) {
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
