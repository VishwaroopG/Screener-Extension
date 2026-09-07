// ticker_tape.js
(function() {
  if (document.getElementById('screener-ticker-tape')) return; // Already injected

  const tapeDiv = document.createElement('div');
  tapeDiv.id = 'screener-ticker-tape';
  
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
        <div class="screener-sparkline-title">1Y Price Trend</div>
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

  function drawSparkline(containerEl, dataPoints, color) {
    if (!Array.isArray(dataPoints) || dataPoints.length < 2) {
      containerEl.innerHTML = '<span style="color:#9aa0a6;font-size:12px;">No chart data</span>';
      return;
    }
    const min = Math.min(...dataPoints);
    const max = Math.max(...dataPoints);
    const padding = (max - min) * 0.1 || (min * 0.01) || 1;
    const yMin = min - padding;
    const yMax = max + padding;
    const w = 300, h = 80;
    
    let pathD = '';
    dataPoints.forEach((val, i) => {
      const x = (i / (dataPoints.length - 1)) * w;
      const y = h - ((val - yMin) / (yMax - yMin)) * h;
      pathD += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
    });
    
    containerEl.innerHTML = `
      <svg width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

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

  chrome.storage.local.get(['tapePaused', 'tapeSpeedMultiplier', 'tapeSpeed', 'tapeVisible', 'disabledDomains'], (res) => {
    isPaused = res.tapePaused === true;
    isVisible = res.tapeVisible !== false; // Default true
    
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
      const direction = button.dataset.direction === 'left' ? 1 : -1;
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
          <span class="screener-metric-label">1D Return</span>
          <span class="screener-metric-val ${colorCls}">${pct}</span>
        </div>
      `;

      btnEl.href = `https://finance.yahoo.com/quote/${encodeURIComponent(data.symbol || '')}/`;
      drawSparkline(sparklineEl, data.sparkline || [], '#1a73e8');
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
        { label: '1D Return', val: `<span class="${colorCls}">${pct}</span>` },
        { label: 'Market Cap', val: formatMarketCap(ratios['Market Cap'] || '-') },
        { label: 'P/E Ratio', val: ratios['Stock P/E'] || '-' },
        { label: 'Div Yield', val: ratios['Dividend Yield'] || '-' },
        { label: 'ROCE', val: ratios['ROCE'] || '-' }
      ];

      metrics.forEach(m => {
        metricsHtml += `
          <div class="screener-metric-box">
            <span class="screener-metric-label">${m.label}</span>
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

      // Draw sparkline
      const sparkColor = data.changeDir === 'up' ? '#137333' : '#d93025';
      drawSparkline(sparklineEl, data.sparkline || [], sparkColor);
    }

    metricsGrid.innerHTML = metricsHtml;
  });

  // --- Continuous GPU-Accelerated Auto-Scroll Engine ---
  // Uses translate3d which never hits DOM scroll limits or integer truncation issues
  function autoScrollStep() {
    if (!isPaused && !isDragging && !isHovered && isVisible && !isDomainDisabled) {
      if (Math.abs(arrowScrollRemaining) > 0.25) {
        const step = Math.sign(arrowScrollRemaining) * Math.max(0.5, Math.abs(arrowScrollRemaining) * 0.16);
        currentX += step;
        arrowScrollRemaining -= step;
      } else {
        arrowScrollRemaining = 0;
        currentX -= speed;
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

  // --- Render Tape Content ---
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
        return;
      }
      
      tapeDiv.style.display = 'flex';
      document.documentElement.classList.add('screener-tape-active');
      
      let html = '';
      
      // Add Market Indices (Nifty 50, Sensex, Bank Nifty, S&P 500)
      for (const [idxName, idx] of Object.entries(indices)) {
        if (!idx || !idx.price) continue;
        const isUp = idx.changeDir === 'up' || parseFloat(idx.changePct) >= 0;
        const color = isUp ? '#81c995' : '#f28b82';
        const sign = isUp ? '\u25B2' : '\u25BC';
        
        let flashClass = '';
        if (idx.flash && (Date.now() - (idx.flashTime || 0) < 5000)) {
           flashClass = idx.flash === 'up' ? 'screener-tape-flash-up' : 'screener-tape-flash-down';
        }

        const formattedPrice = idx.price;

        html += `
          <div class="screener-ticker-item screener-clickable-ticker" data-ticker="${idxName}" data-is-index="true" style="cursor: pointer;">
            <span class="screener-ticker-name">${idxName}</span>
            <span class="screener-ticker-price ${flashClass}">${formattedPrice}</span>
            <span style="color: ${color}; font-size: 12px; margin-left: 6px;">${sign} ${Math.abs(parseFloat(idx.changePct)).toFixed(2)}%</span>
          </div>
        `;
      }
      
      // Add Watchlist Stocks
      for (const ticker of list) {
        const data = cached[ticker];
        if (data && data.success) {
          const price = data.ratios['Current Price'] || '-';
          
          let pctHtml = '';
          if (data.changePct) {
            const color = data.changeDir === 'up' ? '#81c995' : '#f28b82';
            const sign = data.changeDir === 'up' ? '\u25B2' : '\u25BC';
            pctHtml = `<span style="color: ${color}; font-size: 12px; margin-left: 6px;">${sign} ${data.changePct}</span>`;
          }

          let flashClass = '';
          if (data.flash && (Date.now() - (data.flashTime || 0) < 5000)) {
            flashClass = data.flash === 'up' ? 'screener-tape-flash-up' : 'screener-tape-flash-down';
          }

          html += `
            <div class="screener-ticker-item screener-clickable-ticker" data-ticker="${ticker}" style="cursor: pointer;">
              <span class="screener-ticker-name">${data.companyName || ticker}</span>
              <span class="screener-ticker-price ${flashClass}">${price}</span>
              ${pctHtml}
            </div>
          `;
        }
      }
      
      if (html === '') {
        marquee.innerHTML = `<div class="screener-ticker-item">Loading Screener Watchlist...</div>`;
      } else {
        let itemsCount = Object.keys(indices).length + list.length;
        let gapHtml = '';
        if (itemsCount < 8) {
          // Add a large visual gap so the same stock doesn't appear right next to itself
          gapHtml = `<div class="screener-ticker-item" style="border: none; padding: 0; margin-right: 80vw;"></div>`;
        }
        const block = html + gapHtml;
        // We must duplicate the block at least once for the infinite scroll math to work seamlessly
        marquee.innerHTML = block + block;
      }
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
