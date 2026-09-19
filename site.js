/* Ticker Screener — 3D Animation Engine
   Synthesizing principles from:
   - emilkowalski/skills (spring physics, ease-out curves, 60fps compositor transforms, hover gating)
   - pbakaus/impeccable (restraint in chrome, brilliance in texture, rich feedback)
   - leonxlnx/taste-skill (anti-slop, tactile feedback, ambient illumination, 3D multiplane depth)
*/
(function () {
  'use strict';

  var EASE_OUT    = 'cubic-bezier(0.23, 1, 0.32, 1)';
  var EASE_SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
  var canHover    = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ─────────────────────────────────────────────────────────────
     1. TAPE MARQUEE: infinite loop + live financial tick updates
  ───────────────────────────────────────────────────────────── */
  (function initTape() {
    var track = document.getElementById('tape-track');
    if (!track) return;

    track.innerHTML += track.innerHTML;

    var spans = track.querySelectorAll('span');
    if (!spans.length) return;

    var tickerData = [];
    spans.forEach(function(span) {
      var text = span.textContent;
      var priceMatch = text.match(/[\$]?([\d,]+\.?\d*)/);
      var basePrice = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;
      var isIndex = text.indexOf('S&P') !== -1 || text.indexOf('NASDAQ') !== -1 || text.indexOf('DOW') !== -1;
      tickerData.push({
        span: span,
        basePrice: basePrice,
        currentPrice: basePrice,
        isIndex: isIndex,
        volatility: isIndex ? 0.0003 : 0.002
      });
    });

    function updateRandomTicker() {
      var randIdx = Math.floor(Math.random() * tickerData.length);
      var data = tickerData[randIdx];
      if (!data || data.basePrice === 0) {
        setTimeout(updateRandomTicker, 1000);
        return;
      }

      var changePercent = (Math.random() - 0.5) * data.volatility * 2;
      var newPrice = data.currentPrice * (1 + changePercent);
      var minPrice = data.basePrice * 0.98;
      var maxPrice = data.basePrice * 1.02;
      newPrice = Math.max(minPrice, Math.min(maxPrice, newPrice));
      data.currentPrice = newPrice;

      var totalChange = ((newPrice - data.basePrice) / data.basePrice) * 100;
      var isUp = totalChange >= 0;
      var changeStr = (isUp ? '+' : '') + totalChange.toFixed(2) + '%';

      var priceStr;
      if (data.isIndex) {
        priceStr = newPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      } else {
        priceStr = '$' + newPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }

      var boldEl = data.span.querySelector('b');
      var tickerName = boldEl ? boldEl.textContent : '';
      var changeClass = isUp ? 'up' : 'down';
      data.span.innerHTML = '<b>' + tickerName + '</b> ' + priceStr + ' <span class="' + changeClass + '">' + changeStr + '</span>';

      var flashClass = isUp ? 'ticker-tick-up' : 'ticker-tick-down';
      data.span.classList.remove('ticker-tick-up', 'ticker-tick-down');
      void data.span.offsetWidth;
      data.span.classList.add(flashClass);
      setTimeout(function() { data.span.classList.remove(flashClass); }, 800);

      setTimeout(updateRandomTicker, 800 + Math.random() * 1200);
    }

    setTimeout(updateRandomTicker, 1500);
  })();

  /* ─────────────────────────────────────────────────────────────
     2. FLOATING NAV: smooth rAF-throttled scroll hide/show
  ───────────────────────────────────────────────────────────── */
  (function initNav() {
    var wrap = document.getElementById('nav-wrap');
    if (!wrap) return;

    var lastY = 0;
    var ticking = false;
    var isHidden = false;

    function onScroll() {
      var y = window.scrollY || window.pageYOffset;
      var diff = y - lastY;

      if (y > 110 && diff > 5 && !isHidden) {
        wrap.classList.add('nav-hidden');
        isHidden = true;
      } else if ((diff < -5 || y < 60) && isHidden) {
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

  /* ─────────────────────────────────────────────────────────────
     3. HERO 3D MULTIPLANE PARALLAX & SPECULAR GLARE
  ───────────────────────────────────────────────────────────── */
  (function initHero3D() {
    if (!canHover) return;

    var stage = document.getElementById('hero-frame-wrap');
    var frame = document.getElementById('product-frame');
    var chip  = document.getElementById('ticker-chip');
    if (!stage || !frame) return;

    var isRunning = false;
    var targetRotX = 0;
    var targetRotY = 0;
    var shineX = 50;
    var shineY = 50;

    stage.addEventListener('mousemove', function (e) {
      var rect = frame.getBoundingClientRect();
      var x = ((e.clientX - rect.left) / rect.width - 0.5) * 2; // -1 to 1
      var y = ((e.clientY - rect.top) / rect.height - 0.5) * 2; // -1 to 1

      // Clamp within bounds
      x = Math.max(-1.1, Math.min(1.1, x));
      y = Math.max(-1.1, Math.min(1.1, y));

      targetRotX = -y * 5.5; // Max 5.5deg
      targetRotY =  x * 6.5; // Max 6.5deg

      shineX = e.clientX - rect.left;
      shineY = e.clientY - rect.top;

      if (!isRunning) {
        requestAnimationFrame(renderFrame3D);
        isRunning = true;
      }
    });

    function renderFrame3D() {
      frame.style.setProperty('--shine-x', shineX + 'px');
      frame.style.setProperty('--shine-y', shineY + 'px');

      frame.style.transform = 
        'perspective(1400px) rotateX(' + targetRotX.toFixed(2) + 'deg) rotateY(' + targetRotY.toFixed(2) + 'deg) translateY(-4px)';

      // 3D Parallax offset on chip
      if (chip) {
        var chipShiftX = (targetRotY * 1.8).toFixed(1);
        var chipShiftY = (-targetRotX * 1.8).toFixed(1);
        chip.style.transform = 
          'translate(calc(-50% + ' + chipShiftX + 'px), calc(-50% + ' + chipShiftY + 'px)) translateZ(65px)';
      }

      isRunning = false;
    }

    stage.addEventListener('mouseleave', function () {
      frame.style.transition = 'transform 600ms ' + EASE_SPRING + ', box-shadow 400ms ease';
      frame.style.transform = 'perspective(1400px) rotateX(0deg) rotateY(0deg) translateY(0)';

      if (chip) {
        chip.style.transition = 'transform 600ms ' + EASE_SPRING + ', box-shadow 300ms ease';
        chip.style.transform = 'translate(-50%, -50%) translateZ(65px)';
      }

      setTimeout(function () {
        frame.style.transition = '';
        if (chip) chip.style.transition = '';
      }, 620);
    });
  })();

  /* ─────────────────────────────────────────────────────────────
     4. 3D BENTO CARDS & FLASHLIGHT SPOTLIGHT
  ───────────────────────────────────────────────────────────── */
  (function init3DCards() {
    if (!canHover) return;

    function bindCards(container) {
      var cards = (container || document).querySelectorAll('[data-3d-card]');
      cards.forEach(function (card) {
        if (card._has3DBound) return;
        card._has3DBound = true;

        var isCardMoving = false;

        card.addEventListener('mousemove', function (e) {
          if (!isCardMoving) {
            requestAnimationFrame(function () {
              var rect = card.getBoundingClientRect();
              var mx = e.clientX - rect.left;
              var my = e.clientY - rect.top;

              card.style.setProperty('--mouse-x', mx.toFixed(1) + 'px');
              card.style.setProperty('--mouse-y', my.toFixed(1) + 'px');
              card.style.setProperty('--spotlight-opacity', '1');

              var dx = ((mx / rect.width)  - 0.5) * 2;
              var dy = ((my / rect.height) - 0.5) * 2;

              var rotX = -dy * 4.5;
              var rotY =  dx * 4.5;

              card.style.transform = 
                'perspective(1000px) rotateX(' + rotX.toFixed(2) + 'deg) rotateY(' + rotY.toFixed(2) + 'deg) translateY(-4px)';

              isCardMoving = false;
            });
            isCardMoving = true;
          }
        });

        card.addEventListener('mouseleave', function () {
          card.style.setProperty('--spotlight-opacity', '0');
          card.style.transition = 'transform 450ms ' + EASE_SPRING + ', box-shadow 300ms ease, border-color 300ms ease';
          card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)';
          setTimeout(function () {
            card.style.transition = '';
          }, 470);
        });
      });
    }

    bindCards();

    // Bind cards in dynamically loaded sections (like blog posts)
    var blogWrap = document.getElementById('latest-posts');
    if (blogWrap) {
      var observer = new MutationObserver(function () {
        bindCards(blogWrap);
      });
      observer.observe(blogWrap, { childList: true });
    }
  })();

  /* ─────────────────────────────────────────────────────────────
     5. 3D MAGNETIC BUTTONS
  ───────────────────────────────────────────────────────────── */
  (function initMagneticButtons() {
    if (!canHover) return;

    var buttons = document.querySelectorAll('.hero-actions .button, .nav .button-primary');
    buttons.forEach(function (btn) {
      btn.addEventListener('mousemove', function (e) {
        requestAnimationFrame(function () {
          var rect = btn.getBoundingClientRect();
          var dx = ((e.clientX - rect.left) / rect.width  - 0.5) * 12;
          var dy = ((e.clientY - rect.top)  / rect.height - 0.5) * 10;
          btn.style.transform = 'translate3d(' + dx.toFixed(1) + 'px, ' + dy.toFixed(1) + 'px, 10px)';
        });
      });

      btn.addEventListener('mouseleave', function () {
        btn.style.transition = 'transform 350ms ' + EASE_SPRING + ', box-shadow 250ms ease';
        btn.style.transform = 'translate3d(0, 0, 0)';
        setTimeout(function () {
          btn.style.transition = '';
        }, 360);
      });
    });
  })();

  /* ─────────────────────────────────────────────────────────────
     6. SCROLL REVEALS: Staggered 3D Entrances
  ───────────────────────────────────────────────────────────── */
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
      // Only hide elements starting below viewport
      if (rect.top > vh * 0.95) {
        el.style.opacity    = '0';
        el.style.transform  = 'translateY(32px)';
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
        void el.offsetWidth;

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

  /* ─────────────────────────────────────────────────────────────
     7. MOBILE DRAWER & FEATURE EXPANDERS
  ───────────────────────────────────────────────────────────── */
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

  /* Feature Accordion Toggles */
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
