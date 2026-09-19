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

  /* ---------- Scroll reveals: native IntersectionObserver + CSS transitions ----------
     Primary engine is dependency-free (Emil: cheapest tool that works; CSS transitions
     stay smooth under load and retarget cleanly). GSAP is only a parallax enhancement. */
  (function reveals() {
    if (reduceMotion) return;
    if (!('IntersectionObserver' in window)) return; /* content stays visible */

    var singles = document.querySelectorAll('.hero-grid > div, .section-head, .signal-panel');
    var groups = document.querySelectorAll('.bento, .blog-grid');

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);
        /* Stagger siblings inside bento / blog grids (Emil: 30-80ms). */
        var group = el.closest('.bento, .blog-grid');
        var step = 0;
        if (group) {
          var idx = Array.prototype.indexOf.call(group.querySelectorAll('.tile, .post-card'), el);
          step = Math.max(0, idx) * 60;
          el.style.transitionDelay = step + 'ms';
        }
        /* Force a frame between hidden-state paint and reveal so the transition runs. */
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { el.classList.add('io-in'); });
        });
        /* Hand styles back to the component after the reveal (kills stagger delay). */
        window.setTimeout(function () {
          el.classList.remove('io-hidden', 'io-in');
          el.style.transitionDelay = '';
        }, 700 + step);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    function arm(el) {
      el.classList.add('io-hidden');
      io.observe(el);
    }
    singles.forEach(arm);
    groups.forEach(function (group) {
      group.querySelectorAll('.tile, .post-card').forEach(arm);
    });

    /* Hero frame parallax: GSAP enhancement only, skipped when CDN is blocked. */
    var frame = document.querySelector('.product-frame');
    if (frame && window.gsap && window.ScrollTrigger && window.innerWidth >= 900) {
      gsap.registerPlugin(ScrollTrigger);
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
