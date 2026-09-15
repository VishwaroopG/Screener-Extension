/* Ticker Screener landing interactions: custom cursor, scroll reveals, mobile drawer, read-more toggles. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;
  var desktop = window.innerWidth >= 768;

  /* ---------- Custom cursor: glow dot + trailing ring that reacts to interactive elements ---------- */
  (function cursor() {
    if (!finePointer || reduceMotion) return;
    var dot = document.getElementById('cursor-dot');
    var ring = document.getElementById('cursor-ring');
    if (!dot || !ring) return;

    var x = -100, y = -100, rx = -100, ry = -100, shown = false;
    function place() {
      dot.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px)';
    }
    place();

    if (window.gsap && window.gsap.quickTo) {
      var dotX = gsap.quickTo(dot, 'x', { duration: 0.12, ease: 'power2' });
      var dotY = gsap.quickTo(dot, 'y', { duration: 0.12, ease: 'power2' });
      var ringX = gsap.quickTo(ring, 'x', { duration: 0.4, ease: 'power3' });
      var ringY = gsap.quickTo(ring, 'y', { duration: 0.4, ease: 'power3' });
      dot.style.transform = '';
      ring.style.transform = '';
      window.addEventListener('mousemove', function (e) {
        if (!shown) { shown = true; dot.classList.add('on'); ring.classList.add('on'); }
        dotX(e.clientX); dotY(e.clientY); ringX(e.clientX); ringY(e.clientY);
      }, { passive: true });
    } else {
      window.addEventListener('mousemove', function (e) {
        if (!shown) { shown = true; dot.classList.add('on'); ring.classList.add('on'); }
        x = e.clientX; y = e.clientY;
        place();
      }, { passive: true });
      (function loop() {
        rx += (x - rx) * 0.16;
        ry += (y - ry) * 0.16;
        if (shown) place();
        requestAnimationFrame(loop);
      })();
    }

    document.addEventListener('mouseover', function (e) {
      if (e.target.closest('a, button, .feature, .post-card')) ring.classList.add('hot');
      else ring.classList.remove('hot');
    });
    document.addEventListener('mouseleave', function () {
      dot.classList.remove('on'); ring.classList.remove('on'); shown = false;
    });
  })();

  /* ---------- GSAP scroll reveals (desktop only; content stays visible without JS/GSAP) ---------- */
  (function reveals() {
    if (reduceMotion || !desktop || !window.gsap) return;
    if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
    var targets = '.hero-grid > div, .section-head, .feature, .stat, .signal-panel, .post-card, #developer .section-head';
    gsap.utils.toArray(targets).forEach(function (el) {
      gsap.fromTo(el,
        { opacity: 0, y: 36 },
        {
          opacity: 1, y: 0, duration: 0.8, ease: 'power2.out',
          scrollTrigger: window.ScrollTrigger
            ? { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' }
            : undefined
        });
    });
    /* Subtle hero product tilt on scroll */
    var frame = document.querySelector('.product-frame');
    if (frame && window.ScrollTrigger) {
      gsap.to(frame, {
        y: -30, ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1 }
      });
    }
  })();

  /* ---------- Glassmorphic mobile drawer (always mounted; visibility via classes) ---------- */
  (function drawer() {
    var btn = document.getElementById('menu-btn');
    var nav = document.getElementById('mobile-drawer');
    var scrim = document.getElementById('drawer-scrim');
    if (!btn || !nav) return;

    function open() {
      nav.classList.add('open');
      if (scrim) scrim.hidden = false;
      btn.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Close menu');
      document.body.style.overflow = 'hidden';
    }
    function close() {
      nav.classList.remove('open');
      if (scrim) scrim.hidden = true;
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Open menu');
      document.body.style.overflow = '';
    }
    btn.addEventListener('click', function () {
      nav.classList.contains('open') ? close() : open();
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) close();
    });
    if (scrim) scrim.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) { close(); btn.focus(); }
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 800 && nav.classList.contains('open')) close();
    });
  })();

  /* ---------- Feature "Read more" expanders ---------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.feature-toggle');
    if (!btn) return;
    var more = btn.parentElement.querySelector('.feature-more');
    if (!more) return;
    var open = more.hidden;
    more.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'Read less' : 'Read more';
  });
})();
