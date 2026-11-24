const hash = location.pathname.includes('exam') ? '' : location.hash;

(function () {
  const send = (params) =>
    fetch('/api/hit?' + new URLSearchParams(params), { keepalive: true }).catch(() => {});

  // Page view (the exam page is counted by path only, so nothing in its URL hash gets logged)
  const hash = location.pathname.includes('exam') ? '' : location.hash;
  send({ p: location.pathname + hash, ev: 'view' });

  // Custom events: window.track('blog_open', 'post title')
  window.track = (ev, name) => send({ p: location.pathname, ev, n: name || '' });

  // Outbound link clicks (GitHub repos, live demos, certificates ...), no per-link code needed
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.origin === location.origin) return;
    send({ p: location.pathname, ev: 'outbound', n: a.hostname + a.pathname });
  });
})();
