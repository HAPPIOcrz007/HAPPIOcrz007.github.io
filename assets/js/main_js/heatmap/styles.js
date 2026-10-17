/* heatmap/styles.js — injects the heatmap CSS into <head>. */

/* ── INJECT STYLES ───────────────────────────────────────────── */
export function injectStyles() {
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
