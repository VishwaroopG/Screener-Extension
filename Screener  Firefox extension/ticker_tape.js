// ticker_tape.js
(function() {
  if (document.getElementById('screener-ticker-tape')) return; // Already injected

  const tapeDiv = document.createElement('div');
  tapeDiv.id = 'screener-ticker-tape';
  tapeDiv.classList.add('screener-tape-bottom', 'screener-tape-comfortable', 'screener-tape-dark');

  // --- User-configurable tape settings (managed via side-panel Settings) ---
  const TAPE_DEFAULTS = {
    tapePosition: 'bottom',
    tapeSize: 'comfortable',
    tapeTheme: 'dark',
    tapeDirection: 'left',
    tapePauseOnHover: true,
    tapeShowIndices: true,
    tapeShowChange: true,
    tapeShowAmount: false
  };
  let tapePosition = TAPE_DEFAULTS.tapePosition;
  let tapeSize = TAPE_DEFAULTS.tapeSize;
  let tapeTheme = TAPE_DEFAULTS.tapeTheme;
  let tapeDirection = TAPE_DEFAULTS.tapeDirection;
  let tapePauseOnHover = TAPE_DEFAULTS.tapePauseOnHover;
  let tapeShowIndices = TAPE_DEFAULTS.tapeShowIndices;
  let tapeShowChange = TAPE_DEFAULTS.tapeShowChange;
  let tapeShowAmount = TAPE_DEFAULTS.tapeShowAmount;

  function applyTapeSettings() {
    tapeDiv.classList.toggle('screener-tape-top', tapePosition === 'top');
    tapeDiv.classList.toggle('screener-tape-bottom', tapePosition !== 'top');
    tapeDiv.classList.toggle('screener-tape-compact', tapeSize === 'compact');
    tapeDiv.classList.toggle('screener-tape-comfortable', tapeSize !== 'compact' && tapeSize !== 'large');
    tapeDiv.classList.toggle('screener-tape-large', tapeSize === 'large');
    tapeDiv.classList.toggle('screener-tape-dark', tapeTheme !== 'light' && tapeTheme !== 'blue');
    tapeDiv.classList.toggle('screener-tape-light', tapeTheme === 'light');
    tapeDiv.classList.toggle('screener-tape-blue', tapeTheme === 'blue');
    tapeDiv.classList.toggle('screener-tape-hide-change', tapeShowChange === false);
    tapeDiv.classList.toggle('screener-tape-hide-amount', tapeShowAmount === false);
    const root = document.documentElement;
    const sizeH = tapeSize === 'compact' ? '26px' : (tapeSize === 'large' ? '38px' : '30px');
    root.style.setProperty('--screener-tape-h', sizeH);
    root.classList.toggle('screener-tape-active-top', tapePosition === 'top');
    try { lastRenderedKey = ''; } catch (e) {}
    if (typeof renderTape === 'function') renderTape();
  }

  function readTapeSettings(res) {
    if (!res) return false;
    let changed = false;
    if (typeof res.tapePosition === 'string' && (res.tapePosition === 'top' || res.tapePosition === 'bottom') && res.tapePosition !== tapePosition) { tapePosition = res.tapePosition; changed = true; }
    if (typeof res.tapeSize === 'string' && ['compact', 'comfortable', 'large'].includes(res.tapeSize) && res.tapeSize !== tapeSize) { tapeSize = res.tapeSize; changed = true; }
    if (typeof res.tapeTheme === 'string' && ['dark', 'light', 'blue'].includes(res.tapeTheme) && res.tapeTheme !== tapeTheme) { tapeTheme = res.tapeTheme; changed = true; }
    if (typeof res.tapeDirection === 'string' && (res.tapeDirection === 'left' || res.tapeDirection === 'right') && res.tapeDirection !== tapeDirection) { tapeDirection = res.tapeDirection; changed = true; }
    if (typeof res.tapePauseOnHover === 'boolean' && res.tapePauseOnHover !== tapePauseOnHover) { tapePauseOnHover = res.tapePauseOnHover; changed = true; }
    if (typeof res.tapeShowIndices === 'boolean' && res.tapeShowIndices !== tapeShowIndices) { tapeShowIndices = res.tapeShowIndices; changed = true; }
    if (typeof res.tapeShowChange === 'boolean' && res.tapeShowChange !== tapeShowChange) { tapeShowChange = res.tapeShowChange; changed = true; }
    if (typeof res.tapeShowAmount === 'boolean' && res.tapeShowAmount !== tapeShowAmount) { tapeShowAmount = res.tapeShowAmount; changed = true; }
    return changed;
  }
  
  const container = document.createElement('div');
  container.className = 'screener-marquee-container';
  
  const marquee = document.createElement('div');
  marquee.className = 'screener-marquee';

  const tapeControls = document.createElement('div');
  tapeControls.className = 'screener-tape-controls';
  tapeControls.innerHTML = `
    <button class="screener-tape-scroll-btn" data-direction="left" type="button" title="Scroll tape left" aria-label="Scroll tape left">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
    </button>
    <button class="screener-tape-scroll-btn" data-direction="right" type="button" title="Scroll tape right" aria-label="Scroll tape right">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="m8.59 16.59 1.41 1.41 6-6-6-6-1.41 1.41L13.17 12z"/></svg>
    </button>
  `;
  
  container.appendChild(marquee);
  tapeDiv.appendChild(container);
  tapeDiv.appendChild(tapeControls);
  
  document.documentElement.appendChild(tapeDiv);
  document.documentElement.classList.add('screener-tape-active');

  // --- Modal Injection ---
  const modalBackdrop = document.createElement('div');
  modalBackdrop.className = 'screener-modal-backdrop';
  modalBackdrop.innerHTML = `
    <div class="screener-detail-modal">
      <div class="screener-modal-header">
        <div>
          <h3 class="screener-modal-title" id="screener-modal-title">Company Name</h3>
          <div class="screener-modal-subtitle" id="screener-modal-subtitle">Details</div>
        </div>
        <button class="screener-modal-close" id="screener-modal-close">&times;</button>
      </div>
      <div class="screener-modal-body">
        <div class="screener-modal-desc" id="screener-modal-desc"></div>
        <div class="screener-chart-periods" id="screener-chart-periods">
          <button class="screener-period-btn active" data-range="1mo" data-interval="1d">1M</button>
          <button class="screener-period-btn" data-range="6mo" data-interval="1d">6M</button>
          <button class="screener-period-btn" data-range="1y" data-interval="1d">1Y</button>
          <button class="screener-period-btn" data-range="3y" data-interval="1wk">3Y</button>
          <button class="screener-period-btn" data-range="5y" data-interval="1wk">5Y</button>
          <button class="screener-period-btn" data-range="10y" data-interval="1mo">10Y</button>
          <button class="screener-period-btn" data-range="max" data-interval="1mo">MAX</button>
        </div>
        <div class="screener-sparkline-container" id="screener-sparkline-container"></div>
        <div class="screener-metrics-grid" id="screener-metrics-grid"></div>
      </div>
      <div class="screener-modal-footer">
        <a href="#" target="_blank" class="screener-btn-details" id="screener-btn-details">View Details</a>
      </div>
    </div>
  `;
  document.documentElement.appendChild(modalBackdrop);

  // Close Modal logic
  const closeBtn = modalBackdrop.querySelector('#screener-modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modalBackdrop.classList.remove('visible');
      isPaused = false; // Resume tape
    });
  }
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) {
      modalBackdrop.classList.remove('visible');
      isPaused = false;
    }
  });

  function drawSparkline(containerEl, chartData, color) {
    const points = chartData?.data || (Array.isArray(chartData) ? chartData : []);
    const timestamps = chartData?.timestamps || [];
    if (points.length < 2) {
      containerEl.innerHTML = '<span style="color:#9aa0a6;font-size:12px;">No chart data</span>';
      return;
    }
    const min = Math.min(...points);
    const max = Math.max(...points);
    const padding = (max - min) * 0.1 || (min * 0.01) || 1;
    const yMin = min - padding;
    const yMax = max + padding;
    
    // Canvas dimensions (no axes / grid — clean line only)
    const w = 340, h = 120;
    const marginL = 4, marginR = 4, marginT = 8, marginB = 8;
    const graphW = w - marginL - marginR;
    const graphH = h - marginT - marginB;

    let pathD = '';
    points.forEach((val, i) => {
      const x = marginL + (i / (points.length - 1)) * graphW;
      const y = marginT + graphH - ((val - yMin) / (yMax - yMin)) * graphH;
      pathD += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
    });

    // Pre-compute SVG coords for hover lookup
    const coords = points.map((val, i) => ({
      x: marginL + (i / (points.length - 1)) * graphW,
      y: marginT + graphH - ((val - yMin) / (yMax - yMin)) * graphH,
      val
    }));

    const formatFullDate = (ts) => {
      if (!ts) return '';
      const d = new Date(ts * 1000);
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };
    const formatPrice = (v) => Number(v).toLocaleString(currentModalLocale, { maximumFractionDigits: 2 });

    containerEl.innerHTML = `
      <svg width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="screener-chart-svg" style="display:block; cursor:crosshair;">
        <!-- Data line -->
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>

        <!-- Hover crosshair + dot (hidden by default) -->
        <line class="screener-hover-line" y1="${marginT}" y2="${marginT + graphH}" stroke="${color}" stroke-width="1" stroke-dasharray="3,2" opacity="0.7" style="display:none;"/>
        <circle class="screener-hover-dot" r="4" fill="${color}" stroke="#fff" stroke-width="2" style="display:none;"/>
        <!-- Transparent capture layer -->
        <rect class="screener-hover-capture" x="${marginL}" y="${marginT}" width="${graphW}" height="${graphH}" fill="transparent"/>
      </svg>
      <div class="screener-chart-tip" style="display:none; position:absolute; pointer-events:none; background:#202124; color:#fff; font-size:11px; font-weight:600; padding:4px 8px; border-radius:6px; white-space:nowrap; z-index:5; transform:translate(-50%, -110%); box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>
    `;

    // Wire up hover-to-see-price
    try {
      const svg = containerEl.querySelector('.screener-chart-svg');
      const hoverLine = containerEl.querySelector('.screener-hover-line');
      const hoverDot = containerEl.querySelector('.screener-hover-dot');
      const capture = containerEl.querySelector('.screener-hover-capture');
      const tip = containerEl.querySelector('.screener-chart-tip');
      if (!svg || !capture || !tip) return;

      capture.addEventListener('mousemove', (e) => {
        const rect = svg.getBoundingClientRect();
        if (!rect.width) return;
        // Convert client X to viewBox X (handles preserveAspectRatio="none" stretch)
        const vbX = marginL + ((e.clientX - rect.left) / rect.width) * w - marginL;
        let frac = (vbX - marginL) / graphW;
        frac = Math.max(0, Math.min(1, frac));
        const idx = Math.round(frac * (coords.length - 1));
        const pt = coords[idx];
        if (!pt) return;

        hoverLine.setAttribute('x1', pt.x);
        hoverLine.setAttribute('x2', pt.x);
        hoverLine.style.display = 'block';
        hoverDot.setAttribute('cx', pt.x);
        hoverDot.setAttribute('cy', pt.y);
        hoverDot.style.display = 'block';

        const dateStr = formatFullDate(timestamps[idx]);
        tip.textContent = '';
        const priceLine = document.createElement('div');
        priceLine.textContent = `${currentModalCurrPrefix}${formatPrice(pt.val)}`;
        tip.appendChild(priceLine);
        if (dateStr) {
          const dateLine = document.createElement('div');
          dateLine.textContent = dateStr;
          dateLine.style.cssText = 'font-weight:400; opacity:0.8; font-size:10px;';
          tip.appendChild(dateLine);
        }
        tip.style.display = 'block';
        // Position tip using % of container (matches viewBox proportionally)
        const leftPct = (pt.x / w) * 100;
        const topPct = (pt.y / h) * 100;
        tip.style.left = leftPct + '%';
        tip.style.top = topPct + '%';
        // Keep tooltip inside container horizontally
        if (leftPct < 18) tip.style.transform = 'translate(0%, -110%)';
        else if (leftPct > 82) tip.style.transform = 'translate(-100%, -110%)';
        else tip.style.transform = 'translate(-50%, -110%)';
      });
      capture.addEventListener('mouseleave', () => {
        hoverLine.style.display = 'none';
        hoverDot.style.display = 'none';
        tip.style.display = 'none';
      });
    } catch (err) {}
  }

  // --- Multi-Period Chart Support ---
  let currentModalSymbol = '';
  let currentModalIsIndex = false;
  let currentModalChangeDir = 'up';
  let currentModalFallback = [];
  let currentModalCurrPrefix = '₹';
  let currentModalLocale = 'en-IN';
  // Guards against out-of-order responses: only the latest requested
  // period/ticker may paint the modal (fixes "chart not changing").
  let modalChartSeq = 0;

  function prefixForCurrencyCode(code) {
    switch ((code || '').toUpperCase()) {
      case 'INR': return { prefix: '₹', locale: 'en-IN' };
      case 'USD': return { prefix: '$', locale: 'en-US' };
      case 'GBP': return { prefix: '£', locale: 'en-GB' };
      case 'EUR': return { prefix: '€', locale: 'de-DE' };
      case 'JPY': return { prefix: '¥', locale: 'ja-JP' };
      case 'SGD': return { prefix: 'S$', locale: 'en-SG' };
      default: return code ? { prefix: code + ' ', locale: 'en-US' } : null;
    }
  }

  function extractPrefix(formatted) {
    if (!formatted) return null;
    const m = String(formatted).match(/^[^\d\-+.,\s]+/);
    return m ? m[0] : null;
  }

  async function fetchChartData(symbol, range, interval) {
    try {
      return await Promise.race([
        new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage({ type: 'FETCH_CHART', symbol, range, interval }, (res) => {
              if (chrome.runtime.lastError) {
                resolve({ data: [], timestamps: [] });
                return;
              }
              resolve({ data: (res && res.data) || [], timestamps: (res && res.timestamps) || [] });
            });
          } catch (e) {
            resolve({ data: [], timestamps: [] });
          }
        }),
        // Never leave the modal stuck on "Loading..." — fall back to cache.
        new Promise((resolve) => setTimeout(() => resolve({ data: [], timestamps: [] }), 20000))
      ]);
    } catch (e) {
      return { data: [], timestamps: [] };
    }
  }

  function getChartSymbol(ticker, isIndex, data) {
    if (isIndex) return data?.symbol || ticker;
    if (data?.source === 'yahoo') return ticker;
    // Indian stock from screener.in
    return ticker + '.NS';
  }

  // Keep only finite numbers — Yahoo occasionally returns "N/A"/null holes
  // that would otherwise poison the SVG path (blank chart, no error).
  function cleanSeries(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (const v of arr) {
      const n = typeof v === 'number' ? v : parseFloat(v);
      if (Number.isFinite(n)) out.push(n);
    }
    return out;
  }

  // Sparkline color follows the displayed period's return: red when the
  // period return is negative, green when positive. Shades adapt to the
  // modal theme (dark modal uses the brighter palette).
  function periodLineColor(dataArray) {
    let dark = false;
    try { dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) {}
    const up = dark ? '#81c995' : '#137333';
    const down = dark ? '#f28b82' : '#d93025';
    if (dataArray && dataArray.length >= 2) {
      const first = dataArray[0];
      const last = dataArray[dataArray.length - 1];
      if (Number.isFinite(first) && Number.isFinite(last) && first !== 0) {
        return ((last - first) / Math.abs(first)) >= 0 ? up : down;
      }
    }
    return up;
  }

  function updatePeriodReturn(dataArray, range) {
    try {
      const labelEl = modalBackdrop.querySelector('#screener-return-label');
      const valEl = modalBackdrop.querySelector('#screener-period-return');
      if (!labelEl || !valEl) return;
      const labelMap = { '1mo': '1M Return', '6mo': '6M Return', '1y': '1Y Return', '3y': '3Y Return', '5y': '5Y Return', '10y': '10Y Return', 'max': 'Overall Return' };
      labelEl.textContent = labelMap[range] || `${range} Return`;
      if (!dataArray || dataArray.length < 2) {
        valEl.textContent = '-';
        return;
      }
      const first = dataArray[0];
      const last = dataArray[dataArray.length - 1];
      if (!isFinite(first) || !isFinite(last) || first === 0) {
        valEl.textContent = '-';
        return;
      }
      const pct = ((last - first) / Math.abs(first)) * 100;
      const sign = pct >= 0 ? '+' : '';
      valEl.textContent = `${sign}${pct.toFixed(2)}%`;
      valEl.classList.remove('screener-metric-up', 'screener-metric-down');
      valEl.classList.add(pct >= 0 ? 'screener-metric-up' : 'screener-metric-down');
    } catch (e) {}
  }

  async function loadChartForPeriod(range, interval) {
    const seq = ++modalChartSeq;
    const sparklineEl = modalBackdrop.querySelector('#screener-sparkline-container');
    if (!sparklineEl) return;
    sparklineEl.innerHTML = '<span style="color:#9aa0a6;font-size:12px;">' + t('chartLoading') + '</span>';
    const chartData = await fetchChartData(currentModalSymbol, range, interval);
    if (seq !== modalChartSeq) return; // stale: user switched period/ticker meanwhile
    let data = cleanSeries(chartData.data);
    let timestamps = Array.isArray(chartData.timestamps) ? chartData.timestamps : [];
    // Fallback to cached sparkline when live fetch returns nothing (offline / rate-limit / weekend gap)
    if (data.length < 2) {
      data = cleanSeries(currentModalFallback);
      timestamps = [];
    }
    drawSparkline(sparklineEl, { data, timestamps: timestamps.slice(0, data.length) }, periodLineColor(data));
    updatePeriodReturn(data, range);
  }

  // Wire period buttons
  const periodBtns = modalBackdrop.querySelectorAll('.screener-period-btn');
  periodBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      periodBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadChartForPeriod(btn.dataset.range, btn.dataset.interval);
    });
  });

  function formatMarketCap(value) {
    if (value === null || value === undefined || value === '-') return value;
    return String(value).replace(/[\d,]+(?:\.\d+)?/g, (match) => {
      const num = Number(match.replace(/,/g, ''));
      return Number.isFinite(num)
        ? num.toLocaleString('en-IN', { maximumFractionDigits: 0 })
        : match;
    });
  }


  // --- State Variables ---
  let isPaused = false;
  let isVisible = true;
  let isDragging = false;
  let isHovered = false;
  let startX = 0;
  let dragStartX = 0;
  let currentX = 0;
  let arrowScrollRemaining = 0;
  let speed = 0.8; // Default 1x speed in pixels per frame
  let latestCachedData = {};
  let latestIndices = {};

  // Read stored preferences (controlled via side panel)
  let isDomainDisabled = false;
  const currentDomain = window.location.hostname;

  chrome.storage.local.get(['tapePaused', 'tapeSpeedMultiplier', 'tapeSpeed', 'tapeVisible', 'disabledDomains', 'tapePosition', 'tapeSize', 'tapeTheme', 'tapeDirection', 'tapePauseOnHover', 'tapeShowIndices', 'tapeShowChange', 'tapeShowAmount'], (res) => {
    isPaused = res.tapePaused === true;
    isVisible = res.tapeVisible !== false; // Default true
    readTapeSettings(res);
    applyTapeSettings();
    
    const disabledDomains = res.disabledDomains || [];
    if (disabledDomains.includes(currentDomain)) {
      isDomainDisabled = true;
    }

    if (res.tapeSpeedMultiplier !== undefined && typeof res.tapeSpeedMultiplier === 'number') {
      speed = res.tapeSpeedMultiplier * 0.8;
    } else if (res.tapeSpeed !== undefined && typeof res.tapeSpeed === 'number') {
      speed = res.tapeSpeed;
    }
    renderTape(); // Force an initial render now that all prefs are loaded
  });

  // Listen for control updates from side panel
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.tapePaused !== undefined) {
        isPaused = changes.tapePaused.newValue === true;
      }
      if (changes.tapeVisible !== undefined) {
        isVisible = changes.tapeVisible.newValue !== false;
        renderTape();
      }
      if (changes.disabledDomains !== undefined) {
        const disabledDomains = changes.disabledDomains.newValue || [];
        isDomainDisabled = disabledDomains.includes(currentDomain);
        renderTape();
      }
      if (changes.tapeSpeedMultiplier !== undefined) {
        speed = changes.tapeSpeedMultiplier.newValue * 0.8;
      } else if (changes.tapeSpeed !== undefined) {
        speed = changes.tapeSpeed.newValue;
      }
      let settingsChanged = false;
      ['tapePosition', 'tapeSize', 'tapeTheme', 'tapeDirection', 'tapePauseOnHover', 'tapeShowIndices', 'tapeShowChange', 'tapeShowAmount'].forEach((k) => {
        if (changes[k] !== undefined) {
          const patch = {};
          patch[k] = changes[k].newValue;
          if (readTapeSettings(patch)) settingsChanged = true;
        }
      });
      if (settingsChanged) applyTapeSettings();
      if (changes.cachedData || changes.screenerWatchlist || changes.marketIndices) {
        renderTape();
      }
    }
  });

  // --- Interactive Grab-and-Drag (Left / Right) ---
  container.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Left click only
    isDragging = true;
    startX = e.pageX;
    dragStartX = currentX;
    container.classList.add('grabbing');
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.pageX - startX;
    currentX = dragStartX + dx;

    // Infinite loop wrap while dragging
    const halfWidth = marquee.scrollWidth / 2;
    if (halfWidth > 0) {
      if (currentX > 0) {
        currentX -= halfWidth;
        dragStartX -= halfWidth;
      } else if (Math.abs(currentX) >= halfWidth) {
        currentX += halfWidth;
        dragStartX += halfWidth;
      }
    }
    marquee.style.transform = `translate3d(${currentX}px, 0, 0)`;
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      container.classList.remove('grabbing');
    }
  });

  // Mouse wheel and trackpad horizontal scrolling
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    currentX -= delta;

    const halfWidth = marquee.scrollWidth / 2;
    if (halfWidth > 0) {
      if (currentX > 0) {
        currentX -= halfWidth;
      } else if (Math.abs(currentX) >= halfWidth) {
        currentX += halfWidth;
      }
    }
    marquee.style.transform = `translate3d(${currentX}px, 0, 0)`;
  }, { passive: false });

  function normalizeTapePosition() {
    const halfWidth = marquee.scrollWidth / 2;
    if (halfWidth <= 0) return;
    if (currentX > 0) {
      currentX -= halfWidth;
    } else if (Math.abs(currentX) >= halfWidth) {
      currentX += halfWidth;
    }
  }

  tapeControls.querySelectorAll('.screener-tape-scroll-btn').forEach((button) => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const direction = button.dataset.direction === 'left' ? -1 : 1;
      // Ease each press into the same continuous motion as the live marquee.
      arrowScrollRemaining += direction * 180;
    });
  });
  // Hover detection (temporarily pause scrolling while user actively hovers)
  container.addEventListener('mouseenter', () => { isHovered = true; });
  container.addEventListener('mouseleave', () => { isHovered = false; });

  // Global mousemove safeguard: If cursor moves anywhere outside the container, clear isHovered
  document.addEventListener('mousemove', (e) => {
    if (isHovered && (!container || !container.contains(e.target))) {
      isHovered = false;
    }
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    isHovered = false;
  }, { passive: true });

  // Window blur and visibility safeguards (prevents tape from getting stuck)
  window.addEventListener('blur', () => {
    isHovered = false;
    isDragging = false;
    if (container) container.classList.remove('grabbing');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      isHovered = false;
      isDragging = false;
      if (container) container.classList.remove('grabbing');
    }
  });

  // Modal Open Logic via Event Delegation
  marquee.addEventListener('click', (e) => {
    // Only open if we didn't just drag
    if (Math.abs(startX - e.pageX) > 5) return;

    const tickerItem = e.target.closest('.screener-clickable-ticker');
    if (!tickerItem) return;

    const ticker = tickerItem.getAttribute('data-ticker');
    const isIndex = tickerItem.getAttribute('data-is-index') === 'true';

    let data;
    let symbolForLink = ticker;
    if (isIndex) {
      data = latestIndices[ticker];
      if (data) symbolForLink = data.symbol;
    } else {
      data = latestCachedData[ticker];
    }

    if (!data) return;

    isPaused = true; // Pause tape while modal is open
    modalBackdrop.classList.add('visible');

    // Set multi-period chart state
    currentModalIsIndex = isIndex;
    currentModalChangeDir = data.changeDir || 'up';
    currentModalSymbol = getChartSymbol(ticker, isIndex, data);
    currentModalFallback = Array.isArray(data.sparkline) ? data.sparkline : [];
    // Derive correct currency prefix for the hover tooltip (fixes ₹ shown for STI etc.)
    try {
      const formattedRef = isIndex ? (data.price || '') : ((data.ratios || {})['Current Price'] || '');
      const codeRef = isIndex ? (data.curr || data.currency || '') : (data.currency || '');
      const fromFormatted = extractPrefix(formattedRef);
      const localeForPrefix = (p) => {
        if (p === '₹') return 'en-IN';
        if (p === 'S$') return 'en-SG';
        if (p === '$') return 'en-US';
        if (p === '£') return 'en-GB';
        if (p === '€') return 'de-DE';
        if (p === '¥') return 'ja-JP';
        return null;
      };
      if (fromFormatted) {
        currentModalCurrPrefix = fromFormatted;
        currentModalLocale = localeForPrefix(fromFormatted) || currentModalLocale;
      }
      if (codeRef) {
        const mapped = prefixForCurrencyCode(codeRef);
        if (mapped) {
          if (!fromFormatted) currentModalCurrPrefix = mapped.prefix;
          currentModalLocale = mapped.locale;
        }
      }
      if (!fromFormatted && !codeRef) {
        currentModalCurrPrefix = isIndex ? '' : '₹';
        currentModalLocale = 'en-US';
      }
    } catch (e) {}

    // Reset period buttons to 1M active
    periodBtns.forEach(b => b.classList.remove('active'));
    const firstBtn = modalBackdrop.querySelector('.screener-period-btn[data-range="1mo"]');
    if (firstBtn) firstBtn.classList.add('active');

    const titleEl = modalBackdrop.querySelector('#screener-modal-title');
    const subtitleEl = modalBackdrop.querySelector('#screener-modal-subtitle');
    const descEl = modalBackdrop.querySelector('#screener-modal-desc');
    const sparklineEl = modalBackdrop.querySelector('#screener-sparkline-container');
    const metricsGrid = modalBackdrop.querySelector('#screener-metrics-grid');
    const btnEl = modalBackdrop.querySelector('#screener-btn-details');

    let metricsHtml = '';

    if (isIndex) {
      titleEl.innerText = ticker; // e.g. "S&P 500 (USA)"
      subtitleEl.innerText = `Market Index • ${data.symbol || ''}`;
      descEl.innerText = '';
      
      const price = data.price || '';
      const pct = data.changePct || '';
      const colorCls = data.changeDir === 'up' ? 'screener-metric-up' : 'screener-metric-down';
      
      metricsHtml = `
        <div class="screener-metric-box">
          <span class="screener-metric-label">Last Price</span>
          <span class="screener-metric-val">${price}</span>
        </div>
        <div class="screener-metric-box">
          <span class="screener-metric-label" id="screener-return-label">1M Return</span>
          <span class="screener-metric-val ${colorCls}" id="screener-period-return">${pct}</span>
        </div>
      `;

      btnEl.href = `https://finance.yahoo.com/quote/${encodeURIComponent(data.symbol || '')}/`;
      loadChartForPeriod('1mo', '1d');
    } else {
      titleEl.innerText = data.companyName || ticker;
      
      const ratios = data.ratios || {};
      const sector = ratios['Type'] || ratios['Sector'] || 'Equity';
      const exchange = ratios['Exchange'] || (data.source === 'yahoo' ? 'Global' : 'NSE/BSE');
      subtitleEl.innerText = `${sector} • ${exchange} • ${ticker}`;
      
      descEl.innerText = data.aboutText || '';

      const pct = data.changePct || '';
      const colorCls = data.changeDir === 'up' ? 'screener-metric-up' : 'screener-metric-down';

      const metrics = [
        { label: 'Last Price', val: ratios['Current Price'] || '-' },
        { label: '1M Return', val: `<span class="${colorCls}" id="screener-period-return">${pct}</span>`, labelId: 'screener-return-label' },
        { label: 'Market Cap', val: formatMarketCap(ratios['Market Cap'] || '-') },
        { label: 'P/E Ratio', val: ratios['Stock P/E'] || '-' },
        { label: 'Div Yield', val: ratios['Dividend Yield'] || '-' },
        { label: 'ROCE', val: ratios['ROCE'] || '-' }
      ];

      metrics.forEach(m => {
        metricsHtml += `
          <div class="screener-metric-box">
            <span class="screener-metric-label"${m.labelId ? ` id="${m.labelId}"` : ''}>${m.label}</span>
            <span class="screener-metric-val">${m.val}</span>
          </div>
        `;
      });

      // Set correct URL
      if (data.source === 'yahoo') {
        btnEl.href = `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/`;
      } else {
        btnEl.href = `https://www.screener.in/company/${encodeURIComponent(ticker)}/`;
      }

      // Load chart for default period
      loadChartForPeriod('1mo', '1d');
    }

    metricsGrid.innerHTML = metricsHtml;
  });

  // --- Continuous GPU-Accelerated Auto-Scroll Engine ---
  // Uses translate3d which never hits DOM scroll limits or integer truncation issues
  function autoScrollStep() {
    const hoverPauses = tapePauseOnHover !== false && isHovered;
    if (!isPaused && !isDragging && !hoverPauses && isVisible && !isDomainDisabled) {
      if (Math.abs(arrowScrollRemaining) > 0.25) {
        const step = Math.sign(arrowScrollRemaining) * Math.max(0.5, Math.abs(arrowScrollRemaining) * 0.16);
        currentX += step;
        arrowScrollRemaining -= step;
      } else {
        arrowScrollRemaining = 0;
        const dirSign = tapeDirection === 'right' ? 1 : -1;
        currentX += dirSign * speed;
      }
      const halfWidth = marquee.scrollWidth / 2;
      
      // Use modulo to prevent massive negative values if it ever gets out of sync
      if (halfWidth > 0 && Math.abs(currentX) >= halfWidth) {
        currentX = currentX % halfWidth;
      }
      marquee.style.transform = `translate3d(${currentX}px, 0, 0)`;
    }
    requestAnimationFrame(autoScrollStep);
  }
  requestAnimationFrame(autoScrollStep);

  // Absolute change text (e.g. "(+₹12.34)") derived from the displayed
  // price + % change. Shown when the "Show amount change" setting is on.
  function absChangeText(priceStr, pctStr, isUp) {
    try {
      const priceNum = parseFloat(String(priceStr || '').replace(/[^0-9.\-]/g, ''));
      const pctNum = parseFloat(String(pctStr || ''));
      if (!isFinite(priceNum) || !isFinite(pctNum)) return '';
      const abs = (priceNum * Math.abs(pctNum)) / 100;
      if (!isFinite(abs)) return '';
      const prefixMatch = String(priceStr || '').match(/^[^\d\-+.,\s]+/);
      const prefix = prefixMatch ? prefixMatch[0] : '';
      const sign = isUp ? '+' : '-';
      return `(${sign}${prefix}${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    } catch (e) {
      return '';
    }
  }

  // --- Render Tape Content ---
  let lastRenderedKey = '';
  
  function renderTape() {
    chrome.storage.local.get(['screenerWatchlist', 'portfolios', 'cachedData', 'marketIndices'], (res) => {
      let list = res.screenerWatchlist || [];
      const portfolios = res.portfolios || {};
      for (const portList of Object.values(portfolios)) {
        if (Array.isArray(portList)) list.push(...portList);
      }
      list = [...new Set(list)];
      const cached = res.cachedData || {};
      const indices = res.marketIndices || {};
      
      latestCachedData = cached;
      latestIndices = indices;

      if (!isVisible || isDomainDisabled || (list.length === 0 && Object.keys(indices).length === 0)) {
        tapeDiv.style.display = 'none';
        document.documentElement.classList.remove('screener-tape-active');
        lastRenderedKey = '';
        return;
      }
      
      tapeDiv.style.display = 'flex';
      document.documentElement.classList.add('screener-tape-active');
      
      const currentKey = Object.keys(indices).join(',') + '|' + list.filter(t => cached[t] && cached[t].success).join(',');

      // Soft update: If the list of symbols hasn't changed, just update the DOM nodes
      if (lastRenderedKey === currentKey && marquee.children.length > 0) {
        const itemNodes = marquee.querySelectorAll('.screener-clickable-ticker');
        itemNodes.forEach(node => {
          const ticker = node.getAttribute('data-ticker');
          const isIndex = node.getAttribute('data-is-index') === 'true';
          const priceSpan = node.querySelector('.screener-ticker-price');
          const changeSpan = node.querySelector('.screener-ticker-change');
          const amountSpan = node.querySelector('.screener-ticker-amount');

          if (isIndex) {
            const idx = indices[ticker];
            if (idx && priceSpan) {
              const isUp = idx.changeDir === 'up' || parseFloat(idx.changePct) >= 0;
              const color = isUp ? '#81c995' : '#f28b82';
              const sign = isUp ? '\u25B2' : '\u25BC';

              if (idx.flash && (Date.now() - (idx.flashTime || 0) < 1000)) {
                 priceSpan.className = 'screener-ticker-price ' + (idx.flash === 'up' ? 'screener-tape-flash-up' : 'screener-tape-flash-down');
              } else {
                 priceSpan.className = 'screener-ticker-price';
              }
              priceSpan.textContent = idx.price;

              if (changeSpan) {
                changeSpan.style.color = color;
                changeSpan.textContent = `${sign} ${Math.abs(parseFloat(idx.changePct)).toFixed(2)}%`;
              }
              if (amountSpan) {
                amountSpan.style.color = color;
                amountSpan.textContent = absChangeText(idx.price, idx.changePct, isUp);
              }
            }
          } else {
            const data = cached[ticker];
            if (data && data.success && priceSpan) {
              const price = data.ratios['Current Price'] || '-';
              
              if (data.flash && (Date.now() - (data.flashTime || 0) < 1000)) {
                priceSpan.className = 'screener-ticker-price ' + (data.flash === 'up' ? 'screener-tape-flash-up' : 'screener-tape-flash-down');
              } else {
                priceSpan.className = 'screener-ticker-price';
              }
              priceSpan.textContent = price;

              if (changeSpan && data.changePct) {
                const color = data.changeDir === 'up' ? '#81c995' : '#f28b82';
                const sign = data.changeDir === 'up' ? '\u25B2' : '\u25BC';
                changeSpan.style.color = color;
                changeSpan.textContent = `${sign} ${data.changePct}`;
              }
              if (amountSpan && data.changePct) {
                amountSpan.style.color = data.changeDir === 'up' ? '#81c995' : '#f28b82';
                amountSpan.textContent = absChangeText(price, data.changePct, data.changeDir === 'up');
              }
            }
          }
        });
        return; // Skip full DOM rebuild
      }
      
      // Full rebuild
      lastRenderedKey = currentKey;
      let html = '';
      
      // Add Market Indices (skipped when user hides them in Settings)
      const visibleIndices = tapeShowIndices === false ? {} : indices;
      for (const [idxName, idx] of Object.entries(visibleIndices)) {
        if (!idx || !idx.price) continue;
        const isUp = idx.changeDir === 'up' || parseFloat(idx.changePct) >= 0;
        const color = isUp ? '#81c995' : '#f28b82';
        const sign = isUp ? '\u25B2' : '\u25BC';
        
        let flashClass = '';
        if (idx.flash && (Date.now() - (idx.flashTime || 0) < 1000)) {
           flashClass = idx.flash === 'up' ? 'screener-tape-flash-up' : 'screener-tape-flash-down';
        }

        const idxAmt = absChangeText(idx.price, idx.changePct, isUp);
        html += `
          <div class="screener-ticker-item screener-clickable-ticker" data-ticker="${idxName}" data-is-index="true" style="cursor: pointer;">
            <span class="screener-ticker-name">${idxName}</span>
            <span class="screener-ticker-price ${flashClass}">${idx.price}</span>
            <span class="screener-ticker-change" style="color: ${color}; font-size: 12px; margin-left: 6px;">${sign} ${Math.abs(parseFloat(idx.changePct)).toFixed(2)}%</span>
            ${idxAmt ? `<span class="screener-ticker-amount" style="color: ${color};">${idxAmt}</span>` : ''}
          </div>
        `;
      }
      
      // Add Watchlist Stocks
      for (const ticker of list) {
        const data = cached[ticker];
        if (data && data.success) {
          const price = data.ratios['Current Price'] || '-';
          
          let pctHtml = '';
          if (data.changePct && tapeShowChange !== false) {
            const color = data.changeDir === 'up' ? '#81c995' : '#f28b82';
            const sign = data.changeDir === 'up' ? '\u25B2' : '\u25BC';
            pctHtml = `<span class="screener-ticker-change" style="color: ${color}; font-size: 12px; margin-left: 6px;">${sign} ${data.changePct}</span>`;
          }

          let amtHtml = '';
          if (data.changePct) {
            const amtColor = data.changeDir === 'up' ? '#81c995' : '#f28b82';
            const amt = absChangeText(price, data.changePct, data.changeDir === 'up');
            if (amt) amtHtml = `<span class="screener-ticker-amount" style="color: ${amtColor};">${amt}</span>`;
          }

          let flashClass = '';
          if (data.flash && (Date.now() - (data.flashTime || 0) < 1000)) {
            flashClass = data.flash === 'up' ? 'screener-tape-flash-up' : 'screener-tape-flash-down';
          }

          html += `
            <div class="screener-ticker-item screener-clickable-ticker" data-ticker="${ticker}" style="cursor: pointer;">
              <span class="screener-ticker-name">${data.companyName || ticker}</span>
              <span class="screener-ticker-price ${flashClass}">${price}</span>
              ${pctHtml}
              ${amtHtml}
            </div>
          `;
        }
      }
      
      if (html === '') {
        marquee.innerHTML = `<div class="screener-ticker-item">Loading Screener Watchlist...</div>`;
      } else {
        let itemsCount = Object.keys(visibleIndices).length + list.length;
        let gapHtml = '';
        if (itemsCount < 8) {
          gapHtml = `<div class="screener-ticker-item" style="border: none; padding: 0; margin-right: 80vw;"></div>`;
        }
        const block = html + gapHtml;
        marquee.innerHTML = block + block;
      }
      // If we just rebuilt, don't clobber currentX immediately if tape is running
      marquee.style.transform = `translate3d(${currentX}px, 0, 0)`;
    });
  }

  // Listen for updates from background script and sidepanel
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'WATCHLIST_UPDATED') {
      renderTape();
    }
    if (msg.type === 'TAPE_PAUSE_UPDATE') {
      isPaused = msg.isPaused === true;
    }
    if (msg.type === 'TAPE_SPEED_UPDATE') {
      if (typeof msg.speedMultiplier === 'number') {
        speed = msg.speedMultiplier * 0.8;
      }
    }
    if (msg.type === 'TAPE_VISIBILITY_UPDATE') {
      isVisible = msg.isVisible !== false;
      renderTape();
    }
    if (msg.type === 'TAPE_DOMAIN_TOGGLE') {
      isDomainDisabled = msg.disabled === true;
      renderTape();
    }
    if (msg.type === 'TAPE_SETTINGS_UPDATE' && msg.settings) {
      if (typeof msg.settings.tapeVisible === 'boolean') {
        isVisible = msg.settings.tapeVisible !== false;
      }
      if (readTapeSettings(msg.settings)) applyTapeSettings();
      else renderTape();
    }
  });
})();

// Keep background worker active and trigger price polling from any webpage
setInterval(() => {
  try {
    chrome.runtime.sendMessage({ type: 'PING' }, () => {
      if (chrome.runtime.lastError) { /* ignore */ }
    });
  } catch(e) {}
}, 1000);
