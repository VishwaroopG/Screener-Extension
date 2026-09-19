/* Ticker Screener — Animation Engine
   Crafted following principles from:
   - emilkowalski/skills (spring physics, ease-out transitions, 60fps compositor transforms)
   - pbakaus/impeccable (visual hierarchy, micro-interactions, robust fallbacks)
   - leonxlnx/taste-skill (refined typography, ambient glow, tactile feedback)
*/
(function () {
  'use strict';

  var EASE_OUT    = 'cubic-bezier(0.23, 1, 0.32, 1)';
  var EASE_SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

  /* 1. TAPE MARQUEE: duplicate track children for infinite loop */
  (function initTape() {
    var track = document.getElementById('tape-track');
    if (!track) return;
    // Duplicate once so CSS animation loop never shows blank space
    track.innerHTML += track.innerHTML;
  })();

  /* 2. FLOATING NAV: hide on scroll down, show on scroll up */
  (function initNav() {
    var wrap = document.getElementById('nav-wrap');
    if (!wrap) return;

    var lastY = 0;
    var ticking = false;
    var isHidden = false;

    function onScroll() {
      var y = window.scrollY || window.pageYOffset;
      var diff = y - lastY;

      if (y > 100 && diff > 4 && !isHidden) {
        wrap.classList.add('nav-hidden');
        isHidden = true;
      } else if ((diff < -4 || y < 60) && isHidden) {
        wrap.classList.remove('nav-hidden');
        isHidden = false;
      }
      lastY = y;
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        requestAnimationFrame(onScroll);
        ticking = true;
      }
    }, { passive: true });
  })();

  /* 3. SCROLL REVEALS: Staggered IntersectionObserver */
  (function initReveals() {
    if (!('IntersectionObserver' in window)) return;

    var targets = document.querySelectorAll(
      '.section-head, .signal-panel, .bento .tile, .blog-grid .post-card'
    );
    if (!targets.length) return;

    var vh = window.innerHeight;
    var TRANSITION = 'opacity 650ms ' + EASE_OUT + ', transform 650ms ' + EASE_OUT;

    targets.forEach(function (el) {
      var rect = el.getBoundingClientRect();
      // Only hide elements starting below the viewport
      if (rect.top > vh * 0.95) {
        el.style.opacity    = '0';
        el.style.transform  = 'translateY(28px)';
        el.style.transition = 'none';
      }
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);

        var delay = 0;
        var parentGrid = el.closest('.bento, .blog-grid');
        if (parentGrid) {
          var siblings = Array.prototype.slice.call(
            parentGrid.querySelectorAll('.tile, .post-card')
          );
          var idx = siblings.indexOf(el);
          if (idx >= 0) {
            delay = (idx % 3) * 75;
          }
        }

        // Force reflow
        el.getBoundingClientRect();

        el.style.transition      = TRANSITION;
        el.style.transitionDelay = delay + 'ms';
        el.style.opacity         = '1';
        el.style.transform       = 'translateY(0)';

        setTimeout(function () {
          el.style.transition      = '';
          el.style.transitionDelay = '';
          el.style.opacity         = '';
          el.style.transform       = '';
        }, 700 + delay);
      });
    }, {
      threshold: 0.08,
      rootMargin: '0px 0px -30px 0px'
    });

    targets.forEach(function (el) { io.observe(el); });
  })();

  /* 4. HERO PRODUCT FRAME: 3D perspective tilt on hover */
  (function initFrameTilt() {
    var frame = document.querySelector('.product-frame');
    if (!frame) return;

    var isMoving = false;

    frame.addEventListener('mousemove', function (e) {
      if (!isMoving) {
        requestAnimationFrame(function () {
          var rect = frame.getBoundingClientRect();
          var x = ((e.clientX - rect.left) / rect.width  - 0.5) * 2; // -1 to 1
          var y = ((e.clientY - rect.top)  / rect.height - 0.5) * 2; // -1 to 1

          var rotX = -y * 3.5; // degrees
          var rotY =  x * 4.5; // degrees

          frame.style.transition = 'transform 80ms linear';
          frame.style.transform  =
            'perspective(1200px) rotateX(' + rotX.toFixed(2) + 'deg) rotateY(' + rotY.toFixed(2) + 'deg) translateY(-4px)';
          isMoving = false;
        });
        isMoving = true;
      }
    });

    frame.addEventListener('mouseleave', function () {
      frame.style.transition = 'transform 500ms ' + EASE_SPRING;
      frame.style.transform  = 'perspective(1200px) rotateX(0deg) rotateY(0deg) translateY(0)';
      setTimeout(function () {
        frame.style.transition = '';
        frame.style.transform  = '';
      }, 520);
    });
  })();

  /* 5. BENTO TILES: Magnetic cursor follow */
  (function initBentoTiles() {
    var tiles = document.querySelectorAll('.bento .tile');
    tiles.forEach(function (tile) {
      tile.addEventListener('mousemove', function (e) {
        requestAnimationFrame(function () {
          var r  = tile.getBoundingClientRect();
          var dx = ((e.clientX - r.left) / r.width  - 0.5) * 6;
          var dy = ((e.clientY - r.top)  / r.height - 0.5) * 6;
          tile.style.transition = 'transform 80ms linear, box-shadow 80ms linear, border-color 200ms ' + EASE_OUT;
          tile.style.transform  = 'translate(' + dx.toFixed(1) + 'px, ' + (dy - 4).toFixed(1) + 'px)';
          tile.style.boxShadow  = '0 16px 40px rgba(0,0,0,0.14)';
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

  /* 6. MOBILE DRAWER */
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
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) close();
    });
    if (scrim) scrim.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        close();
        btn.focus();
      }
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 800 && nav.classList.contains('open')) close();
    });
  })();

  /* 7. FEATURE EXPANDERS */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.feature-toggle');
    if (!btn) return;
    var more = btn.parentElement.querySelector('.feature-more');
    if (!more) return;
    var opening = more.hidden;
    more.hidden = !opening;
    btn.setAttribute('aria-expanded', String(opening));
    btn.textContent = opening ? 'Read less' : 'Read more';
  });

})();
