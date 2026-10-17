/* scroll-effects.js — one rAF-throttled scroll handler: progress bar, parallax, side heatmap, smooth nav. */

/* ================================================================
   UNIFIED SCROLL HANDLER
   One rAF-throttled listener drives the progress bar, parallax, and
   heatmap fill — progress is computed once per frame and shared.
================================================================ */
export function initScrollEffects() {
  /* ── progress bar ── */
  const progressBar = document.createElement('div');
  progressBar.className = 'scroll-progress';
  document.body.appendChild(progressBar);

  const nativePB = CSS.supports('animation-timeline', 'scroll()');

  /* ── heatmap elements ── */
  const heatmap = document.getElementById('heatmap');
  const heatmapBar = document.getElementById('heatmapBar');
  const indicator = document.getElementById('heatmapIndicator');
  const markers = document.querySelectorAll('.heatmap-marker');
  const pctDisplay = document.querySelector('.heatmap-percentage');
  const hasHeatmap = !!(heatmap && heatmapBar && indicator);

  /* ── heatmap particles ── */
  if (hasHeatmap) {
    const particlesEl = document.getElementById('heatmapParticles');
    if (particlesEl) {
      particlesEl.innerHTML = '';
      for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'heatmap-particle';
        const sz = (1 + Math.random() * 3) + 'px';
        p.style.cssText = [
          `left:${Math.random() * 100}%`,
          `width:${sz}`,
          `height:${sz}`,
          `opacity:${(0.2 + Math.random() * 0.3).toFixed(2)}`,
          `animation-duration:${(3 + Math.random() * 4).toFixed(2)}s`,
          `animation-delay:${(Math.random() * 5).toFixed(2)}s`,
        ].join(';');
        particlesEl.appendChild(p);
      }
    }

    /* Heatmap hover */
    heatmap.addEventListener('mouseenter', () => { heatmap.style.opacity = '0.8'; });
    heatmap.addEventListener('mouseleave', () => { heatmap.style.opacity = '0.4'; });

    /* Click to jump */
    heatmap.addEventListener('click', (e) => {
      const rect = heatmap.getBoundingClientRect();
      const pct = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
      const targetScroll = pct * (document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: targetScroll, behavior: 'smooth' });
    });
  }

  /* ── grid-bg reference (parallax) ── */
  const gridBg = document.querySelector('.grid-bg');

  let ticking = false;
  let lastTop = 0;

  function onScroll() {
    // Computed once per frame, shared by every effect below
    const scrollTop = window.pageYOffset;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

    // Skip JS-driven width updates if native CSS scroll-timeline is supported
    if (!nativePB && Math.abs(scrollTop - lastTop) > 1) {
      progressBar.style.width = Math.min(progress, 100) + '%';
      lastTop = scrollTop;
    }

    /* Parallax grid */
    if (gridBg && scrollTop < 1000) {
      gridBg.style.transform = `translateY(${scrollTop * 0.15}px)`;
    }

    /* Heatmap */
    if (hasHeatmap) {
      const eased = Math.pow(progress / 100, 0.7) * 100;
      const clamped = Math.min(Math.max(eased, 0), 100);

      heatmapBar.style.height = clamped + '%';

      const hmH = heatmap.offsetHeight;
      indicator.style.top = Math.min(Math.max((progress / 100) * hmH, 0), hmH) + 'px';

      markers.forEach(m => {
        const v = parseInt(m.dataset.value, 10);
        m.classList.toggle('active', !isNaN(v) && progress >= v);
      });

      if (pctDisplay) pctDisplay.textContent = Math.round(clamped) + '% density';

      // Single CSS var write instead of restyling all 30 particle nodes
      const speed = (3 + (progress / 100) * 4).toFixed(2);
      heatmap.style.setProperty('--particle-speed', speed + 's');

      const glow = 0.05 + (progress / 100) * 0.3;
      heatmapBar.style.boxShadow =
        `0 0 ${(20 + progress * 1.5).toFixed(1)}px rgba(232,81,15,${glow.toFixed(3)})`;

      const p = progress / 100;
      heatmapBar.style.background = `linear-gradient(to top,
        rgba(232,81,15,${(0.05 + p * 0.1).toFixed(3)}) 0%,
        rgba(232,81,15,${(0.15 + p * 0.2).toFixed(3)}) 15%,
        rgba(232,81,15,${(0.30 + p * 0.3).toFixed(3)}) 30%,
        rgba(232,81,15,${(0.50 + p * 0.4).toFixed(3)}) 50%,
        rgba(232,81,15,${(0.70 + p * 0.3).toFixed(3)}) 70%,
        rgba(232,81,15,${(0.85 + p * 0.15).toFixed(3)}) 85%,
        rgba(232,81,15,1) 100%)`;
    }
  }

  /* Initial paint */
  onScroll();

  /* Single rAF-throttled scroll listener */
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => { onScroll(); ticking = false; });
      ticking = true;
    }
  }, { passive: true });

  /* Resize */
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(onScroll, 200);
  });

  /* Smooth scroll for nav links */
  document.querySelectorAll('nav a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const id = this.getAttribute('href');
      if (id === '#') return;
      const target = document.querySelector(id);
      if (target) {
        const top = target.getBoundingClientRect().top + window.pageYOffset - 60;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        if (history.pushState) history.pushState(null, '', id);
      }
    });
  });
}
