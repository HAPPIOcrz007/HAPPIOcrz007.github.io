const hash = location.pathname.includes('exam') ? '' : location.hash;
fetch(`/api/hit?p=${encodeURIComponent(location.pathname + hash)}`, { keepalive: true }).catch(() => {});
