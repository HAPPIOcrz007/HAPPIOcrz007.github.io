/* errors.js — on-screen error toast. */

/* ================================================================
   ERROR HANDLING
================================================================ */
export function handleError(message) {
  console.error('[Portfolio]', message);
  const div = document.createElement('div');
  div.style.cssText = `
    position:fixed;bottom:20px;right:20px;padding:16px 20px;
    background:var(--card);border:1px solid var(--danger);border-radius:var(--radius-sm);
    color:var(--text);font-family:var(--font-mono);font-size:14px;
    z-index:var(--z-skip);max-width:400px;box-shadow:var(--shadow);
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
