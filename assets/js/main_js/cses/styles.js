/* cses/styles.js — injects the CSES grid CSS into <head>. */

/* ── INJECT STYLES ───────────────────────────────────────────── */
export function injectStyles() {
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
