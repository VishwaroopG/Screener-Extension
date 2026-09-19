/* Ticker Screener landing interactions.
   Animation: emilkowalski animate skill - ease-out only, transform+opacity,
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

  /* ---------- Floating nav: hide on scroll down, show on scroll up ---------- */
  (function floatingNav() {
    var wrap = document.getElementById('nav-wrap');
    if (!wrap || reduceMotion) return;
    var lastY = 0;
    var ticking = false;

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY;
        if (y > 120 && y > lastY + 5) {
          wrap.classList.add('nav-hidden');
        } else if (y < lastY - 5 || y < 80) {
          wrap.classList.remove('nav-hidden');
        }
        lastY = y;
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  })();

  /* ---------- Scroll reveals: IntersectionObserver + CSS transitions ----------
     Cheapest tool that works. CSS transitions stay smooth under load. */
  (function reveals() {
    if (reduceMotion) return;
    if (!('IntersectionObserver' in window)) return;

    var singles = document.querySelectorAll('.hero-grid > div, .section-head, .signal-panel');
    var groups = document.querySelectorAll('.bento, .blog-grid');
    var allReveals = [];

    function revealEl(el, delay) {
      el.style.transitionDelay = delay + 'ms';
      el.classList.add('io-hidden');
      /* Force layout so the browser registers the hidden state. */
      el.offsetHeight;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          el.classList.add('io-in');
        });
      });
        /* Clean up after transition completes. */
        var totalDelay = delay + 700;
        window.setTimeout(function () {
          el.classList.remove('io-hidden', 'io-in');
          el.style.transitionDelay = '';
        }, totalDelay);
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);

        var group = el.closest('.bento, .blog-grid');
        var step = 0;
        if (group) {
          var tiles = group.querySelectorAll('.tile, .post-card');
          var idx = Array.prototype.indexOf.call(tiles, el);
          step = Math.max(0, idx) * 60;
        }
        revealEl(el, step);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });

    singles.forEach(function (el) { io.observe(el); });
    groups.forEach(function (group) {
      group.querySelectorAll('.tile, .post-card').forEach(function (el) { io.observe(el); });
    });
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
