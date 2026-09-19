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
    if (!wrap) return;
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

  /* ---------- Scroll reveals: IntersectionObserver + CSS transitions ---------- */
  (function reveals() {
    if (reduceMotion) return;
    if (!('IntersectionObserver' in window)) return;

    /* Only observe elements that are NOT in the hero.
       Hero has its own CSS entrance animations. */
    var targets = document.querySelectorAll(
      '.section-head, .signal-panel, .bento .tile, .blog-grid .post-card'
    );

    if (!targets.length) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);

        /* Calculate stagger delay for siblings inside grids. */
        var delay = 0;
        var group = el.closest('.bento, .blog-grid');
        if (group) {
          var tiles = group.querySelectorAll('.tile, .post-card');
          var idx = Array.prototype.indexOf.call(tiles, el);
          delay = Math.max(0, idx) * 70;
        }

        /* Phase 1: apply hidden state, let browser paint it. */
        el.style.transitionDelay = '0ms';
        el.style.opacity = '0';
        el.style.transform = 'translateY(40px)';

        /* Phase 2: after browser paints the hidden state, trigger the reveal. */
        setTimeout(function () {
          el.style.transitionDelay = delay + 'ms';
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';

          /* Phase 3: clean up inline styles after transition finishes. */
          setTimeout(function () {
            el.style.transitionDelay = '';
            el.style.opacity = '';
            el.style.transform = '';
          }, 600 + delay);
        }, 50);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -5% 0px' });

    targets.forEach(function (el) { io.observe(el); });
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
