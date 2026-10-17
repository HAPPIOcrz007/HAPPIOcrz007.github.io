/* errors.js — on-screen error toast. */

/* ================================================================
   ERROR HANDLING
================================================================ */
export function handleError(message) {
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
