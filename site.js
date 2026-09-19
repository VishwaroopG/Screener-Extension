/* Ticker Screener landing interactions.
   Motion: emilkowalski animate skill — ease-out only, transform+opacity,
   UI <300ms, stagger 30-80ms, reduced-motion + hover gating. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Tape: duplicate once for a seamless linear loop ---------- */
  (function tape() {
    var track = document.getElementById('tape-track');
    if (!track || reduceMotion) return;
    track.innerHTML += track.innerHTML;
  })();

  /* ---------- Scroll reveals: GSAP when available, IntersectionObserver fallback ----------
     Fallback matters: if the GSAP CDN is blocked, reveals still run on native APIs. */
  (function reveals() {
    if (reduceMotion) return;

    var singles = '.hero-grid > div, .section-head, .signal-panel';

    /* No GSAP (CDN blocked/offline): CSS-transition reveals via IntersectionObserver. */
    if (!window.gsap) {
      var ioTargets = document.querySelectorAll(singles + ', .tile, .post-card');
      if (!('IntersectionObserver' in window)) return; /* content stays visible */
      ioTargets.forEach(function (el) { el.classList.add('io-hidden'); });
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          /* Stagger siblings inside bento / blog grids (Emil: 30-80ms). */
          var group = el.closest('.bento, .blog-grid');
          if (group) {
            var idx = Array.prototype.indexOf.call(group.querySelectorAll('.tile, .post-card'), el);
            el.style.transitionDelay = (Math.max(0, idx) * 60) + 'ms';
          }
          el.classList.add('io-in');
          io.unobserve(el);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      ioTargets.forEach(function (el) { io.observe(el); });
      return;
    }

    if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

    gsap.utils.toArray(singles).forEach(function (el) {
      gsap.fromTo(el,
        { opacity: 0, y: 24 },
        {
          opacity: 1, y: 0, duration: 0.7, ease: 'power3.out',
          scrollTrigger: window.ScrollTrigger
            ? { trigger: el, start: 'top 88%', once: true }
            : undefined
        });
    });

    /* Bento tiles + blog cards: 60ms stagger cascade (Emil: 30-80ms). */
    gsap.utils.toArray('.bento, .blog-grid').forEach(function (group) {
      var items = group.querySelectorAll('.tile, .post-card');
      if (!items.length) return;
      gsap.fromTo(items,
        { opacity: 0, y: 24 },
        {
          opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.06,
          scrollTrigger: window.ScrollTrigger
            ? { trigger: group, start: 'top 85%', once: true }
            : undefined
        });
    });

    /* Hero frame: gentle parallax on scroll (decorative, desktop only). */
    var frame = document.querySelector('.product-frame');
    if (frame && window.ScrollTrigger && window.innerWidth >= 900) {
      gsap.to(frame, {
        y: -24, ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1 }
      });
    }
  })();

  /* ---------- Mobile drawer (Emil drawer curve via CSS, transform only) ---------- */
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
