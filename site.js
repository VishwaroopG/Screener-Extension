/* Ticker Screener — Animation Engine
   Sources: emilkowalski/skills, pbakaus/impeccable, leonxlnx/taste-skill
   Rules:
   - transform + opacity ONLY (compositor thread)
   - ease-out cubic-bezier for entrances
   - IntersectionObserver for scroll reveals (NOT scroll events)
   - Hover gating via pointer:fine media query
   - Full prefers-reduced-motion support
*/
(function () {
  'use strict';

  var EASE_OUT    = 'cubic-bezier(0.23, 1, 0.32, 1)';
  var EASE_SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
  var EASE_SMOOTH = 'cubic-bezier(0.4, 0, 0.2, 1)';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover     = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* 1. TAPE ─ duplicate for seamless loop */
  (function initTape() {
    var track = document.getElementById('tape-track');
    if (!track || reduceMotion) return;
    track.innerHTML += track.innerHTML;
  })();

  /* 2. NAV ─ hide on scroll-down, show on scroll-up */
  (function initNav() {
    var wrap = document.getElementById('nav-wrap');
    if (!wrap) return;
    var lastY = 0, ticking = false, isHidden = false;
    function update() {
      var y = window.scrollY;
      if (y > 80 && y > lastY + 4 && !isHidden) {
        wrap.classList.add('nav-hidden');
        isHidden = true;
      } else if ((y < lastY - 4 || y < 60) && isHidden) {
        wrap.classList.remove('nav-hidden');
        isHidden = false;
      }
      lastY = y;
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
  })();

  /* 3. SCROLL REVEALS ─ IntersectionObserver + CSS class toggle
     CRITICAL: Only pre-hide elements that start BELOW the fold.
     Elements already in view animate in immediately on load. */
  (function initReveals() {
    if (reduceMotion) return;
    if (!('IntersectionObserver' in window)) return;

    var targets = Array.prototype.slice.call(document.querySelectorAll(
      '.section-head, .signal-panel, .bento .tile, .blog-grid .post-card'
    ));
    if (!targets.length) return;

    var vh = window.innerHeight;
    var TRANSITION = 'opacity 700ms ' + EASE_OUT + ', transform 700ms ' + EASE_OUT;

    /* Pre-hide only elements that are currently BELOW the viewport */
    targets.forEach(function (el) {
      var rect = el.getBoundingClientRect();
      if (rect.top > vh) {
        /* Set hidden state instantly (no transition yet) */
        el.style.transition = 'none';
        el.style.opacity    = '0';
        el.style.transform  = 'translateY(32px)';
      }
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);

        /* Stagger delay for grid siblings */
        var delay = 0;
        var group = el.closest('.bento, .blog-grid');
        if (group) {
          var siblings = Array.prototype.slice.call(
            group.querySelectorAll('.tile, .post-card')
          );
          delay = Math.max(0, siblings.indexOf(el)) * 60;
        }

        /* Force reflow so transition doesn't fire on the hidden-state set */
        el.getBoundingClientRect();

        /* Now apply transition and reveal */
        el.style.transition      = TRANSITION;
        el.style.transitionDelay = delay + 'ms';
        el.style.opacity         = '1';
        el.style.transform       = 'translateY(0)';

        /* Clean up after animation completes */
        setTimeout(function () {
          el.style.transition      = '';
          el.style.transitionDelay = '';
          el.style.opacity         = '';
          el.style.transform       = '';
        }, 700 + delay + 100);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    targets.forEach(function (el) { io.observe(el); });
  })();

  /* 4. PRODUCT FRAME ─ 3D tilt on hover */
  (function initFrameTilt() {
    if (reduceMotion || !canHover) return;
    var frame = document.querySelector('.product-frame');
    if (!frame) return;

    frame.addEventListener('mousemove', function (e) {
      requestAnimationFrame(function () {
        var r  = frame.getBoundingClientRect();
        var dx = ((e.clientX - r.left) / r.width  - 0.5) * 2;
        var dy = ((e.clientY - r.top)  / r.height - 0.5) * 2;
        frame.style.transition = 'transform 80ms linear';
        frame.style.transform  =
          'perspective(1200px) rotateY(' + (dx * 5) + 'deg) rotateX(' + (-dy * 3) + 'deg) translateY(-4px)';
      });
    });

    frame.addEventListener('mouseleave', function () {
      frame.style.transition = 'transform 500ms ' + EASE_SPRING;
      frame.style.transform  = 'perspective(1200px) rotateY(0deg) rotateX(0deg) translateY(0)';
      setTimeout(function () {
        frame.style.transition = '';
        frame.style.transform  = '';
      }, 520);
    });
  })();

  /* 5. BENTO TILES ─ subtle lift + magnetic hover */
  (function initTileHover() {
    if (reduceMotion || !canHover) return;
    Array.prototype.forEach.call(document.querySelectorAll('.bento .tile'), function (tile) {
      tile.addEventListener('mousemove', function (e) {
        requestAnimationFrame(function () {
          var r  = tile.getBoundingClientRect();
          var dx = ((e.clientX - r.left) / r.width  - 0.5) * 6;
          var dy = ((e.clientY - r.top)  / r.height - 0.5) * 6;
          tile.style.transition = 'transform 80ms linear, box-shadow 80ms linear, border-color 200ms ' + EASE_OUT;
          tile.style.transform  = 'translate(' + dx + 'px, ' + (dy - 4) + 'px)';
          tile.style.boxShadow  = '0 12px 40px rgba(0,0,0,0.12)';
        });
      });
      tile.addEventListener('mouseleave', function () {
        tile.style.transition = 'transform 400ms ' + EASE_SPRING + ', box-shadow 300ms ' + EASE_OUT;
        tile.style.transform  = '';
        tile.style.boxShadow  = '';
        setTimeout(function () {
          tile.style.transition = '';
        }, 420);
      });
    });
  })();

  /* 6. CHIP ENTRANCE ─ spring in after frame */
  (function initChip() {
    if (reduceMotion) return;
    var chip = document.querySelector('.ticker-chip');
    if (!chip) return;
    /* Start hidden below center */
    chip.style.opacity   = '0';
    chip.style.transform = 'translate(-50%, calc(-50% + 24px)) scale(0.88)';
    chip.style.transition = 'none';
    /* Spring in at 1000ms (after frame animation completes) */
    setTimeout(function () {
      chip.style.transition = 'opacity 500ms ' + EASE_OUT + ' , transform 600ms ' + EASE_SPRING;
      chip.style.opacity    = '1';
      chip.style.transform  = 'translate(-50%, -50%) scale(1)';
    }, 950);
  })();

  /* 7. MOBILE DRAWER */
  (function initDrawer() {
    var btn   = document.getElementById('menu-btn');
    var nav   = document.getElementById('mobile-drawer');
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
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) close(); });
    if (scrim) scrim.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) { close(); btn.focus(); }
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 800 && nav.classList.contains('open')) close();
    });
  })();

  /* 8. FEATURE EXPANDERS ─ animated show/hide */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.feature-toggle');
    if (!btn) return;
    var more = btn.parentElement.querySelector('.feature-more');
    if (!more) return;
    var opening = more.hidden;
    if (opening) {
      more.hidden = false;
      if (!reduceMotion) {
        more.style.transition = 'none';
        more.style.opacity    = '0';
        more.style.transform  = 'translateY(-6px)';
        more.getBoundingClientRect(); /* force reflow */
        more.style.transition = 'opacity 250ms ' + EASE_OUT + ', transform 250ms ' + EASE_OUT;
        more.style.opacity    = '1';
        more.style.transform  = 'translateY(0)';
      }
    } else {
      if (!reduceMotion) {
        more.style.transition = 'opacity 180ms ' + EASE_SMOOTH + ', transform 180ms ' + EASE_SMOOTH;
        more.style.opacity    = '0';
        more.style.transform  = 'translateY(-6px)';
        setTimeout(function () {
          more.hidden           = true;
          more.style.transition = '';
          more.style.opacity    = '';
          more.style.transform  = '';
        }, 200);
      } else {
        more.hidden = true;
      }
    }
    btn.setAttribute('aria-expanded', String(opening));
    btn.textContent = opening ? 'Read less' : 'Read more';
  });

})();
