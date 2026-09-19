document.addEventListener('DOMContentLoaded', () => {
  // --- i18n: localized UI strings (Chrome + Firefox) ---
  const t = (key, subs) => chrome.i18n.getMessage(key, subs);
  const RATIO_LABELS = { 'Current Price': 'ratioCurrentPrice', 'Day Range': 'ratioDayRange', '52W Range': 'ratio52W', 'Volume': 'ratioVolume', 'Type': 'ratioType', 'Exchange': 'ratioExchange', 'Market Cap': 'ratioMCap', 'Stock P/E': 'ratioPE', 'Dividend Yield': 'ratioDiv', 'ROCE': 'ratioROCE' };
  const ratioLabel = (key) => t(RATIO_LABELS[key] || '') || key;
  function localizeSuggestionType(item) {
    if (item.source === 'screener') return t('typeIndian');
    const ty = item.type || 'Stock';
    if (ty === 'Index') return t('typeIndex');
    if (ty === 'ETF') return t('typeETF');
    if (ty === 'Stock') return t('typeDefault');
    if (ty.endsWith(' Stock')) return t('typeExchangeStock', ty.slice(0, -6));
    return ty;
  }
  function applyStaticI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => { const v = t(el.getAttribute('data-i18n')); if (v) el.textContent = v; });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => { const v = t(el.getAttribute('data-i18n-title')); if (v) el.title = v; });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { const v = t(el.getAttribute('data-i18n-aria')); if (v) el.setAttribute('aria-label', v); });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => { const v = t(el.getAttribute('data-i18n-ph')); if (v) el.placeholder = v; });
    document.querySelectorAll('[data-i18n-alt]').forEach((el) => { const v = t(el.getAttribute('data-i18n-alt')); if (v) el.alt = v; });
  }
  applyStaticI18n();
  // Elements
  const tabSearch = document.getElementById('tab-search');
  const tabWatchlist = null;
  const tabMarkets = document.getElementById('tab-markets');
  const tabNews = document.getElementById('tab-news');
  const viewSearch = document.getElementById('view-search');
  const viewMarkets = document.getElementById('view-markets');
  const viewNews = document.getElementById('view-news');
  const btnSearch = document.getElementById('btn-search');
  const inputSearch = document.getElementById('input-search');
  const resultsSearch = document.getElementById('results-search');
  const searchSuggestions = document.getElementById('search-suggestions');

  const btnWlAdd = null;
  const inputWlAdd = null;
  const wlItemsContainer = document.getElementById('wl-items-container');
  const wlSuggestions = null;

  const themeToggle = document.getElementById('theme-toggle');
  
  const portfolioSelect = document.getElementById('portfolio-select');
  const btnNewPortfolio = document.getElementById('btn-new-portfolio');
  const btnExportCsv = document.getElementById('btn-export-csv');
  const newsContainer = document.getElementById('news-container');
  const extensionVersion = document.getElementById('extension-version');

  let activePortfolio = 'Sample';

  const DEFAULT_WEEKEND = ['Sat', 'Sun'];
  // Trading holidays are NOT bundled — they are fetched daily from the
  // published site and cached in chrome.storage.local, so holiday fixes
  // reach all users with no extension re-publish. A missing or stale cache
  // simply falls back to time+weekend logic.
  const HOLIDAYS_URL = 'https://vishwaroopg.github.io/Screener-Extension/market-holidays.json';
  const HOLIDAYS_TTL_MS = 24 * 60 * 60 * 1000;
  let remoteHolidays = {};
  let holidaysFetchInFlight = false;

  function loadHolidaysFromCache() {
    try {
      chrome.storage.local.get(['marketHolidays'], (res) => {
        if (res && res.marketHolidays && typeof res.marketHolidays === 'object') {
          remoteHolidays = res.marketHolidays;
          tickClocks();
        }
      });
    } catch (e) {}
  }

  function ensureHolidaysFresh() {
    if (holidaysFetchInFlight) return;
    try {
      chrome.storage.local.get(['marketHolidaysFetchedAt'], (res) => {
        const fetchedAt = res && res.marketHolidaysFetchedAt;
        if (fetchedAt && (Date.now() - fetchedAt) < HOLIDAYS_TTL_MS) return;
        holidaysFetchInFlight = true;
        fetch(HOLIDAYS_URL + '?v=' + new Date().toISOString().slice(0, 10))
          .then((r) => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          })
          .then((data) => {
            if (data && data.holidays && typeof data.holidays === 'object') {
              remoteHolidays = data.holidays;
              chrome.storage.local.set(
                { marketHolidays: data.holidays, marketHolidaysFetchedAt: Date.now() },
                () => tickClocks()
              );
            }
          })
          .catch(() => {})
          .finally(() => { holidaysFetchInFlight = false; });
      });
    } catch (e) {
      holidaysFetchInFlight = false;
    }
  }
  const MARKET_CATALOG = [
    { key: 'newyork', city: 'New York', country: 'USA', tz: 'America/New_York', sessions: [[9 * 60 + 30, 16 * 60]] },
    { key: 'london', city: 'London', country: 'UK', tz: 'Europe/London', sessions: [[8 * 60, 16 * 60 + 30]] },
    { key: 'mumbai', city: 'Mumbai', country: 'India', tz: 'Asia/Kolkata', sessions: [[9 * 60 + 15, 15 * 60 + 30]] },
    { key: 'hongkong', city: 'Hong Kong', country: 'Hong Kong', tz: 'Asia/Hong_Kong', sessions: [[9 * 60 + 30, 12 * 60], [13 * 60, 16 * 60]] },
    { key: 'singapore', city: 'Singapore', country: 'Singapore', tz: 'Asia/Singapore', sessions: [[9 * 60, 12 * 60], [13 * 60, 17 * 60]] },
    { key: 'tokyo', city: 'Tokyo', country: 'Japan', tz: 'Asia/Tokyo', sessions: [[9 * 60, 11 * 60 + 30], [12 * 60 + 30, 15 * 60]] },
    { key: 'shanghai', city: 'Shanghai', country: 'China', tz: 'Asia/Shanghai', sessions: [[9 * 60 + 30, 11 * 60 + 30], [13 * 60, 15 * 60]] },
    { key: 'seoul', city: 'Seoul', country: 'South Korea', tz: 'Asia/Seoul', sessions: [[9 * 60, 15 * 60 + 30]] },
    { key: 'sydney', city: 'Sydney', country: 'Australia', tz: 'Australia/Sydney', sessions: [[10 * 60, 16 * 60]] },
    { key: 'frankfurt', city: 'Frankfurt', country: 'Germany', tz: 'Europe/Berlin', sessions: [[9 * 60, 17 * 60 + 30]] },
    { key: 'paris', city: 'Paris', country: 'France', tz: 'Europe/Paris', sessions: [[9 * 60, 17 * 60 + 30]] },
    { key: 'zurich', city: 'Zurich', country: 'Switzerland', tz: 'Europe/Zurich', sessions: [[9 * 60, 17 * 60 + 30]] },
    { key: 'toronto', city: 'Toronto', country: 'Canada', tz: 'America/Toronto', sessions: [[9 * 60 + 30, 16 * 60]] },
    { key: 'saopaulo', city: 'S\u00E3o Paulo', country: 'Brazil', tz: 'America/Sao_Paulo', sessions: [[10 * 60, 17 * 60]] },
    { key: 'dubai', city: 'Dubai', country: 'UAE', tz: 'Asia/Dubai', sessions: [[10 * 60, 15 * 60]] }
  ];
  const MARKET_BY_KEY = {};
  MARKET_CATALOG.forEach((m) => { MARKET_BY_KEY[m.key] = m; });
  const DEFAULT_CLOCK_KEYS = ['newyork', 'london', 'mumbai', 'hongkong', 'singapore'];
  const MAX_CLOCKS = 6;
  const MIN_CLOCKS = 1;
  let clockKeys = DEFAULT_CLOCK_KEYS.slice();
  let replaceClockKey = null;
  let clockDragKey = null;
  let lastClockDropAt = 0;

  function getClockParts(tz) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short'
    }).formatToParts(new Date());
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    let hour = parseInt(get('hour'), 10);
    if (hour === 24) hour = 0;
    const minute = parseInt(get('minute'), 10);
    return {
      hour,
      minute,
      weekday: get('weekday'),
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    };
  }

  // Default placement is ascending local market time (earliest clock first).
  function getMarketMinutes(tz) {
    try {
      const p = getClockParts(tz);
      const h = Number.isFinite(p.hour) ? p.hour : 0;
      const m = Number.isFinite(p.minute) ? p.minute : 0;
      return h * 60 + m;
    } catch (e) {
      return 0;
    }
  }

  function sortKeysByTime(keys) {
    return (Array.isArray(keys) ? keys.slice() : []).sort((a, b) => {
      const ma = MARKET_BY_KEY[a];
      const mb = MARKET_BY_KEY[b];
      if (!ma) return 1;
      if (!mb) return -1;
      const ta = getMarketMinutes(ma.tz);
      const tb = getMarketMinutes(mb.tz);
      if (ta !== tb) return ta - tb;
      return ma.city.localeCompare(mb.city);
    });
  }

  function defaultClockKeysByTime() {
    return sortKeysByTime(DEFAULT_CLOCK_KEYS);
  }

  function getMarketDateString(tz, now) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(now || new Date());
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function isMarketOpen(tz, sessions, weekend, marketKey, now) {
    const list = marketKey && remoteHolidays[marketKey];
    if (Array.isArray(list)) {
      if (list.indexOf(getMarketDateString(tz, now)) !== -1) return false;
    }
    const { hour, minute, weekday } = getClockParts(tz);
    if ((weekend || DEFAULT_WEEKEND).indexOf(weekday) !== -1) return false;
    const mins = hour * 60 + minute;
    return sessions.some(([start, end]) => mins >= start && mins < end);
  }

  function sanitizeClockKeys(keys) {
    const seen = {};
    const out = [];
    (Array.isArray(keys) ? keys : []).forEach((k) => {
      if (typeof k === 'string' && MARKET_BY_KEY[k] && !seen[k]) {
        seen[k] = true;
        out.push(k);
      }
    });
    return out.slice(0, MAX_CLOCKS);
  }

  function activeClocks() {
    return clockKeys
      .filter((k) => MARKET_BY_KEY[k])
      .map((k) => Object.assign({}, MARKET_BY_KEY[k]));
  }

  function saveClockKeys() {
    clockKeys = sanitizeClockKeys(clockKeys);
    if (clockKeys.length < MIN_CLOCKS) clockKeys = defaultClockKeysByTime();
    chrome.storage.local.set({ clockKeys }, () => renderClocks());
    if (chrome.storage.local.remove) {
      try { chrome.storage.local.remove(['customClocks']); } catch (e) {}
    }
  }

  function renderClocks() {
    const root = document.getElementById('world-clocks');
    if (!root) return;
    const clocks = activeClocks();
    const canAdd = clocks.length < MAX_CLOCKS;

    root.innerHTML = clocks.map((c) => `
      <div class="world-clock is-closed is-editable" data-clock-key="${c.key}" tabindex="0" draggable="true" title="${(t('changeMarketTitle') || 'Change market') + ' · ' + (t('dragHint') || 'Drag to reorder')}">
        ${clocks.length > MIN_CLOCKS ? `<button class="world-clock-remove" data-remove-clock="${c.key}" title="${t('deleteTitle') || 'Remove'}">&times;</button>` : ''}
        <div class="world-clock-city">${c.city}</div>
        <div class="world-clock-time">--:--</div>
        <div class="world-clock-status">${t('clockClosed')}</div>
      </div>`).join('') + (canAdd ? `
      <div class="world-clock world-clock-add" id="world-clock-add" title="${t('addMarketTitle') || 'Add market'}" role="button" tabindex="0">
        <div class="world-clock-add-plus">+</div>
        <div class="world-clock-add-label">${t('addLabel') || 'Add'}</div>
      </div>` : '');

    root.querySelectorAll('[data-remove-clock]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeClock(btn.getAttribute('data-remove-clock'));
      });
    });
    root.querySelectorAll('[data-clock-key]').forEach((tile) => {
      const tileKey = tile.getAttribute('data-clock-key');
      const openReplace = () => openAddMarketModal(tileKey);
      tile.addEventListener('click', (e) => {
        if (e.target.closest('[data-remove-clock]')) return;
        // Suppress the click that follows a drag-and-drop reorder.
        if (Date.now() - lastClockDropAt < 300) return;
        openReplace();
      });
      tile.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openReplace(); return; }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          const delta = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 1;
          const idx = clockKeys.indexOf(tileKey);
          const next = idx + delta;
          if (idx === -1 || next < 0 || next >= clockKeys.length) return;
          const moved = clockKeys.splice(idx, 1)[0];
          clockKeys.splice(next, 0, moved);
          saveClockKeys();
          setTimeout(() => {
            const again = root.querySelector(`[data-clock-key="${moved}"]`);
            if (again) again.focus();
          }, 50);
        }
      });
      tile.addEventListener('dragstart', (e) => {
        clockDragKey = tileKey;
        tile.classList.add('is-dragging');
        try {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', tileKey);
        } catch (err) {}
      });
      tile.addEventListener('dragend', () => {
        tile.classList.remove('is-dragging');
        root.querySelectorAll('.world-clock.is-drag-over').forEach((el) => el.classList.remove('is-drag-over'));
        clockDragKey = null;
      });
      tile.addEventListener('dragover', (e) => {
        e.preventDefault();
        try { e.dataTransfer.dropEffect = 'move'; } catch (err) {}
        if (clockDragKey && clockDragKey !== tileKey) tile.classList.add('is-drag-over');
        return false;
      });
      tile.addEventListener('dragleave', () => {
        tile.classList.remove('is-drag-over');
      });
      tile.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        tile.classList.remove('is-drag-over');
        const fromKey = clockDragKey || (() => { try { return e.dataTransfer.getData('text/plain'); } catch (err) { return null; } })();
        if (fromKey) reorderClock(fromKey, tileKey);
        return false;
      });
    });
    const addTile = document.getElementById('world-clock-add');
    if (addTile) {
      addTile.addEventListener('click', openAddMarketModal);
      addTile.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAddMarketModal(); }
      });
    }
    tickClocks();
  }

  function tickClocks() {
    const root = document.getElementById('world-clocks');
    if (!root) return;
    root.querySelectorAll('[data-clock-key]').forEach((card) => {
      const def = MARKET_BY_KEY[card.getAttribute('data-clock-key')];
      if (!def) return;
      const open = isMarketOpen(def.tz, def.sessions, def.weekend, def.key);
      const { time } = getClockParts(def.tz);
      const timeEl = card.querySelector('.world-clock-time');
      const statusEl = card.querySelector('.world-clock-status');
      if (timeEl) timeEl.textContent = time;
      if (statusEl) statusEl.textContent = open ? t('clockOpen') : t('clockClosed');
      card.classList.toggle('is-open', open);
      card.classList.toggle('is-closed', !open);
    });
  }

  function initWorldClocks() {
    chrome.storage.local.get(['clockKeys', 'customClocks'], (res) => {
      if (res && Array.isArray(res.clockKeys)) {
        clockKeys = sanitizeClockKeys(res.clockKeys);
      } else if (res && Array.isArray(res.customClocks)) {
        // Migrate from the earlier add-one-market version
        clockKeys = sanitizeClockKeys(DEFAULT_CLOCK_KEYS.concat(res.customClocks));
      } else {
        // Fresh install: default placement is ascending local market time.
        clockKeys = defaultClockKeysByTime();
      }
      if (clockKeys.length < MIN_CLOCKS) clockKeys = defaultClockKeysByTime();
      renderClocks();
    });
    loadHolidaysFromCache();
    ensureHolidaysFresh();
    try {
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.marketHolidays && changes.marketHolidays.newValue) {
          remoteHolidays = changes.marketHolidays.newValue;
          tickClocks();
        }
      });
    } catch (e) {}
    setInterval(tickClocks, 1000);
  }

  function addClock(key) {
    if (!MARKET_BY_KEY[key] || clockKeys.indexOf(key) !== -1) return;
    if (clockKeys.length >= MAX_CLOCKS) return;
    // Insert at the ascending-time slot so default placement stays time-ordered.
    const incoming = MARKET_BY_KEY[key];
    const incomingMins = getMarketMinutes(incoming.tz);
    let at = clockKeys.length;
    for (let i = 0; i < clockKeys.length; i++) {
      const cur = MARKET_BY_KEY[clockKeys[i]];
      if (!cur) continue;
      const curMins = getMarketMinutes(cur.tz);
      if (curMins > incomingMins || (curMins === incomingMins && cur.city.localeCompare(incoming.city) > 0)) {
        at = i;
        break;
      }
    }
    clockKeys.splice(at, 0, key);
    saveClockKeys();
    closeAddMarketModal();
    renderClocks();
  }

  function removeClock(key) {
    if (clockKeys.length <= MIN_CLOCKS) return;
    clockKeys = clockKeys.filter((k) => k !== key);
    saveClockKeys();
  }

  function replaceClock(oldKey, newKey) {
    if (!MARKET_BY_KEY[newKey]) return;
    const idx = clockKeys.indexOf(oldKey);
    if (idx === -1) return;
    if (newKey !== oldKey && clockKeys.indexOf(newKey) !== -1) return;
    clockKeys[idx] = newKey;
    replaceClockKey = null;
    saveClockKeys();
    closeAddMarketModal();
    renderClocks();
  }

  function reorderClock(fromKey, toKey) {
    if (!fromKey || !toKey || fromKey === toKey) return;
    const fromIdx = clockKeys.indexOf(fromKey);
    const toIdx = clockKeys.indexOf(toKey);
    if (fromIdx === -1 || toIdx === -1) return;
    const moved = clockKeys.splice(fromIdx, 1)[0];
    clockKeys.splice(toIdx, 0, moved);
    lastClockDropAt = Date.now();
    clockDragKey = null;
    saveClockKeys();
  }

  function resetClocks() {
    clockKeys = defaultClockKeysByTime();
    replaceClockKey = null;
    saveClockKeys();
    closeAddMarketModal();
    renderClocks();
  }

  function openAddMarketModal(replaceKey) {
    const modal = document.getElementById('add-market-modal');
    const list = document.getElementById('market-pick-list');
    const title = document.getElementById('add-market-title');
    const subtitle = document.getElementById('add-market-subtitle');
    if (!modal || !list) return;
    replaceClockKey = (replaceKey && MARKET_BY_KEY[replaceKey]) ? replaceKey : null;
    const replacing = replaceClockKey ? MARKET_BY_KEY[replaceClockKey] : null;
    const clocks = activeClocks();
    if (title) {
      title.textContent = replacing
        ? (t('replaceMarketTitle') || 'Replace {city}').replace('{city}', replacing.city)
        : (t('addMarketTitle') || 'Add market');
    }
    if (subtitle) {
      subtitle.textContent = replacing
        ? ((t('replaceMarketSubtitle') || 'Pick a market to show instead of {city}').replace('{city}', replacing.city))
        : (t('addMarketSubtitle') || 'Showing {0} of {1} markets').replace('{0}', String(clocks.length)).replace('{1}', String(MAX_CLOCKS));
    }
    const visibleKeys = clocks.map((c) => c.key);
    const isFull = clocks.length >= MAX_CLOCKS;
    list.innerHTML = MARKET_CATALOG.map((m) => {
      const isVisible = visibleKeys.indexOf(m.key) !== -1;
      const isTarget = replacing && m.key === replaceClockKey;
      const disabled = replacing ? (isVisible && !isTarget) : (isVisible || isFull);
      const { time } = getClockParts(m.tz);
      const open = isMarketOpen(m.tz, m.sessions, m.weekend, m.key);
      const dotColor = open ? '#188038' : '#d93025';
      const state = isTarget
        ? `<span style="font-size:10px; font-weight:600; color:var(--link-color, #1a73e8);">${t('currentLabel') || 'Current'}</span>`
        : (isVisible
            ? `<span style="font-size:14px; color:#188038;">&#10003;</span>`
            : `<span style="font-size:16px; font-weight:700; color:var(--label-color);">+</span>`);
      return `
        <div class="market-pick-row${disabled ? ' is-disabled' : ''}"${disabled ? '' : ` data-market-key="${m.key}"`}>
          <div style="min-width:0; flex:1;">
            <div style="font-weight:600; font-size:13px; color:var(--text-color); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.city}</div>
            <div style="font-size:10px; color:var(--label-color);">${m.country} &bull; ${time}</div>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            <span style="width:7px; height:7px; border-radius:50%; background:${dotColor}; display:inline-block;"></span>
            ${state}
          </div>
        </div>`;
    }).join('');
    list.querySelectorAll('[data-market-key]').forEach((row) => {
      row.addEventListener('click', () => {
        const key = row.getAttribute('data-market-key');
        if (replaceClockKey) replaceClock(replaceClockKey, key);
        else addClock(key);
      });
    });
    modal.style.display = 'flex';
  }

  function closeAddMarketModal() {
    replaceClockKey = null;
    const modal = document.getElementById('add-market-modal');
    if (modal) modal.style.display = 'none';
  }

  initWorldClocks();

  if (extensionVersion) {
    extensionVersion.textContent = `v${chrome.runtime.getManifest().version}`;
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
  // Tab Switching Logic
  function switchTab(activeTab, activeView) {
    [tabSearch, tabMarkets, tabNews].forEach(t => t && t.classList.remove('active'));
    [viewSearch, viewMarkets, viewNews].forEach(v => v && v.classList.remove('active'));

    activeTab.classList.add('active');
    activeView.classList.add('active');

    if (activeTab === tabSearch) renderWatchlist();
    if (activeTab === tabMarkets) {
      if (typeof renderOverviewShell === 'function' && !document.getElementById('overview-body')) {
        renderOverviewShell();
      }
      if (typeof fetchMacroStats === 'function') fetchMacroStats(activeEconomy);
      if (typeof fetchOverview === 'function') fetchOverview(activeEconomy);
    }
    if (activeTab === tabNews) renderNews();
  }

  tabSearch.addEventListener('click', () => switchTab(tabSearch, viewSearch));
  if (tabMarkets) tabMarkets.addEventListener('click', () => switchTab(tabMarkets, viewMarkets));
  tabNews.addEventListener('click', () => switchTab(tabNews, viewNews));
  // --- Google Material Design 3 Header Controls ---
  const svgMoon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>`;
  const svgSun = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c1.65 0 3 1.35 3 3s-1.35 3-3 3-3-1.35-3-3 1.35-3 3-3m0-2c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>`;
  const svgPause = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
  const svgPlay = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
  const svgEye = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
  const svgEyeOff = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>`;

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
      if (themeToggle) {
        themeToggle.innerHTML = svgSun;
        themeToggle.title = t('themeToLight');
      }
    } else {
      document.body.classList.remove('dark-mode');
      if (themeToggle) {
        themeToggle.innerHTML = svgMoon;
        themeToggle.title = t('themeToDark');
      }
    }
  }

  // Load Initial Theme
  chrome.storage.local.get(['theme'], (res) => {
    applyTheme(res.theme || 'light');
  });

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isDark = document.body.classList.contains('dark-mode');
      const nextTheme = isDark ? 'light' : 'dark';
      applyTheme(nextTheme);
      chrome.storage.local.set({ theme: nextTheme });
    });
  }

  // Tape Speed Control Popover (0.5x to 3.0x with 0.1 intervals)
  const tapeSpeedBtn = document.getElementById('tape-speed-btn');
  const speedPopover = document.getElementById('speed-popover');
  const speedSlider = document.getElementById('speed-slider');
  const speedDisplayVal = document.getElementById('speed-display-val');
  const btnSpeedMinus = document.getElementById('btn-speed-minus');
  const btnSpeedPlus = document.getElementById('btn-speed-plus');
  const speedCustomInput = document.getElementById('speed-custom-input');

  function setSpeedMultiplier(mult, save = true) {
    let m = parseFloat(mult);
    if (isNaN(m)) m = 1.0;
    m = Math.round(m * 10) / 10;
    if (m < 0.5) m = 0.5;
    if (m > 3.0) m = 3.0;

    const formatted = m.toFixed(1) + 'x';
    if (tapeSpeedBtn) {
      tapeSpeedBtn.textContent = formatted;
      tapeSpeedBtn.title = t('speedTitle', formatted);
    }
    if (speedDisplayVal) speedDisplayVal.textContent = formatted;
    if (speedSlider) speedSlider.value = m.toString();
    if (speedCustomInput && document.activeElement !== speedCustomInput) speedCustomInput.value = m.toFixed(1);

    if (save) {
      chrome.storage.local.set({ tapeSpeedMultiplier: m, tapeSpeed: m * 0.8 });
      try {
        chrome.runtime.sendMessage({ type: 'SET_TAPE_SPEED', speedMultiplier: m }, () => {
          if (chrome.runtime.lastError) {}
        });
      } catch (e) {}
      try {
        if (chrome.tabs && chrome.tabs.query) {
          chrome.tabs.query({}, (tabs) => {
            for (const t of (tabs || [])) {
              if (t && t.id) {
                chrome.tabs.sendMessage(t.id, { type: 'TAPE_SPEED_UPDATE', speedMultiplier: m }, () => {
                  if (chrome.runtime.lastError) {}
                });
              }
            }
          });
        }
      } catch (e) {}
    }
  }

  // Toggle speed popover
  if (tapeSpeedBtn && speedPopover) {
    tapeSpeedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = speedPopover.style.display !== 'none';
      speedPopover.style.display = isOpen ? 'none' : 'block';
      if (!isOpen && speedCustomInput) {
        speedCustomInput.value = parseFloat(speedSlider ? speedSlider.value : 1.0).toFixed(1);
      }
    });

    document.addEventListener('click', (e) => {
      if (speedPopover && !speedPopover.contains(e.target) && e.target !== tapeSpeedBtn) {
        speedPopover.style.display = 'none';
      }
    });
  }

  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      setSpeedMultiplier(e.target.value);
    });
  }

  if (btnSpeedMinus) {
    btnSpeedMinus.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = parseFloat(speedSlider ? speedSlider.value : 1.0);
      setSpeedMultiplier(cur - 0.1);
    });
  }

  if (btnSpeedPlus) {
    btnSpeedPlus.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = parseFloat(speedSlider ? speedSlider.value : 1.0);
      setSpeedMultiplier(cur + 0.1);
    });
  }

  // Custom number input field in popover
  if (speedCustomInput) {
    speedCustomInput.addEventListener('input', () => {
      const val = parseFloat(speedCustomInput.value);
      if (!isNaN(val) && val >= 0.5 && val <= 3.0) {
        setSpeedMultiplier(val, true);
      }
    });
    speedCustomInput.addEventListener('blur', () => {
      const val = parseFloat(speedCustomInput.value);
      if (!isNaN(val)) {
        setSpeedMultiplier(val, true);
      }
    });
    speedCustomInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const val = parseFloat(speedCustomInput.value);
        if (!isNaN(val)) setSpeedMultiplier(val, true);
        speedPopover.style.display = 'none';
      }
    });
    speedCustomInput.addEventListener('click', (e) => e.stopPropagation());
  }

  // Clickable preset labels (0.5x, 1.0x, 2.0x, 3.0x)
  const speedPresets = document.querySelectorAll('.speed-preset');
  speedPresets.forEach(preset => {
    preset.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = parseFloat(preset.getAttribute('data-speed'));
      if (!isNaN(val)) {
        setSpeedMultiplier(val);
      }
    });
  });

  // Load Initial Speed
  chrome.storage.local.get(['tapeSpeedMultiplier', 'tapeSpeed'], (res) => {
    let initialM = 1.0;
    if (res.tapeSpeedMultiplier !== undefined) {
      initialM = parseFloat(res.tapeSpeedMultiplier);
    } else if (res.tapeSpeed !== undefined) {
      initialM = parseFloat(res.tapeSpeed) / 0.8;
    }
    setSpeedMultiplier(initialM, false);
  });

  const tapePauseBtn = document.getElementById('tape-pause-btn');
  const tapeVisibilityBtn = document.getElementById('tape-visibility-btn');
  let isTapePaused = false;
  let isTapeVisible = true;

  function updatePauseUI(paused) {
    isTapePaused = paused === true;
    if (!tapePauseBtn) return;
    tapePauseBtn.innerHTML = isTapePaused ? svgPlay : svgPause;
    tapePauseBtn.title = isTapePaused ? t('resumeTape') : t('pauseTape');
    tapePauseBtn.setAttribute('aria-label', isTapePaused ? t('resumeTape') : t('pauseTape'));
    if (isTapePaused) {
      tapePauseBtn.classList.add('tape-is-paused');
    } else {
      tapePauseBtn.classList.remove('tape-is-paused');
    }
  }

  function updateVisibilityUI(visible) {
    isTapeVisible = visible !== false; // default true
    if (!tapeVisibilityBtn) return;
    tapeVisibilityBtn.innerHTML = isTapeVisible ? svgEye : svgEyeOff;
    tapeVisibilityBtn.title = isTapeVisible ? t('hideTape') : t('showTape');
    tapeVisibilityBtn.setAttribute('aria-label', isTapeVisible ? t('hideTape') : t('showTape'));
  }

  // Load Initial States from Storage
  chrome.storage.local.get(['tapePaused', 'tapeVisible'], (res) => {
    updatePauseUI(res.tapePaused === true);
    updateVisibilityUI(res.tapeVisible !== false);
  });

  // Listen for storage changes from any other window/panel
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.tapePaused !== undefined) {
        updatePauseUI(changes.tapePaused.newValue === true);
      }
      if (changes.tapeVisible !== undefined) {
        updateVisibilityUI(changes.tapeVisible.newValue !== false);
      }
    }
  });

  if (tapePauseBtn) {
    tapePauseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nextState = !isTapePaused;

      // 1. Instant optimistic UI update (0ms latency)
      updatePauseUI(nextState);

      // 2. Persist state to storage
      chrome.storage.local.set({ tapePaused: nextState });

      // 3. Notify background service worker
      try {
        chrome.runtime.sendMessage({ type: 'SET_TAPE_PAUSED', isPaused: nextState }, () => {
          if (chrome.runtime.lastError) {}
        });
      } catch (err) {}

      // 4. Directly broadcast to all open tabs for instant content script response
      try {
        if (chrome.tabs && chrome.tabs.query) {
          chrome.tabs.query({}, (tabs) => {
            for (const t of (tabs || [])) {
              if (t && t.id) {
                chrome.tabs.sendMessage(t.id, { type: 'TAPE_PAUSE_UPDATE', isPaused: nextState }, () => {
                  if (chrome.runtime.lastError) {}
                });
              }
            }
          });
        }
      } catch (err) {}
    });
  }

  // NOTE: The global show/hide toggle lives only in Settings → Visibility
  // ("Show ticker tape"). No header button — updateVisibilityUI is kept as a
  // harmless no-op guard for the Settings/reset/storage call sites below.
  void tapeVisibilityBtn;

  // --- Domain Disable Logic ---
  const tapeDomainBtn = document.getElementById('tape-domain-btn');
  let currentDomain = '';
  let disabledDomains = [];

  const svgDomainDisabled = '<svg width="18" height="18" viewBox="0 0 24 24" fill="#d93025"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z"/></svg>';
  const svgDomainEnabled = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm-1.1 14.2-3.8-3.8 1.4-1.4 2.4 2.4 4.6-4.6 1.4 1.4z"/></svg>';

  function updateDomainUI() {
    if (!tapeDomainBtn || !currentDomain) return;
    const isDisabled = disabledDomains.includes(currentDomain);
    tapeDomainBtn.innerHTML = isDisabled ? svgDomainDisabled : svgDomainEnabled;
    tapeDomainBtn.title = isDisabled ? t('domainEnable', currentDomain) : t('domainDisable', currentDomain);
    
    if (isDisabled) {
      tapeDomainBtn.style.color = '#d93025';
    } else {
      tapeDomainBtn.style.color = ''; // reset to default
    }
    try {
      if (typeof refreshSettingsDomainRow === 'function') refreshSettingsDomainRow();
    } catch (e) {}
  }

  // Get current active tab
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs && tabs.length > 0 && tabs[0].url) {
      try {
        currentDomain = new URL(tabs[0].url).hostname;
        chrome.storage.local.get(['disabledDomains'], (res) => {
          disabledDomains = res.disabledDomains || [];
          updateDomainUI();
        });
      } catch (e) {}
    }
  });

  if (tapeDomainBtn) {
    tapeDomainBtn.addEventListener('click', () => {
      if (!currentDomain) return;
      const isCurrentlyDisabled = disabledDomains.includes(currentDomain);
      if (isCurrentlyDisabled) {
        disabledDomains = disabledDomains.filter(d => d !== currentDomain);
      } else {
        disabledDomains.push(currentDomain);
      }
      
      chrome.storage.local.set({ disabledDomains }, () => {
        updateDomainUI();
        // Send message to active tab to show/hide instantly
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'TAPE_DOMAIN_TOGGLE', disabled: !isCurrentlyDisabled }, () => {
              if (chrome.runtime.lastError) {}
            });
          }
        });
      });
    });
  }

  // When tab changes, update domain UI
  chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (tab && tab.url) {
        try {
          currentDomain = new URL(tab.url).hostname;
          updateDomainUI();
        } catch (e) {}
      }
    });
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && tab.url) {
      try {
        currentDomain = new URL(tab.url).hostname;
        updateDomainUI();
      } catch (e) {}
    }
  });



  // --- Tape Settings Modal (position, appearance, behavior, visibility) ---
  const TAPE_SETTING_DEFAULTS = {
    tapePosition: 'bottom',
    tapeSize: 'comfortable',
    tapeTheme: 'dark',
    tapeDirection: 'left',
    tapePauseOnHover: true,
    tapeShowIndices: true,
    tapeShowChange: true,
    tapeShowAmount: false,
    tapeVisible: true
  };
  const btnSettings = document.getElementById('btn-settings');
  const settingsModal = document.getElementById('settings-modal');
  const btnSettingsClose = document.getElementById('btn-settings-close');
  const btnSettingsDone = document.getElementById('btn-settings-done');
  const btnSettingsReset = document.getElementById('btn-settings-reset');
  const settingsTheme = document.getElementById('settings-theme');
  const settingsSize = document.getElementById('settings-size');
  const settingsDirection = document.getElementById('settings-direction');
  const settingsPauseHover = document.getElementById('settings-pause-hover');
  const settingsShowIndices = document.getElementById('settings-show-indices');
  const settingsShowChange = document.getElementById('settings-show-change');
  const settingsShowAmount = document.getElementById('settings-show-amount');
  const settingsVisible = document.getElementById('settings-visible');
  const settingsDomainRow = document.getElementById('settings-domain-row');
  const settingsPositionGroup = document.getElementById('settings-position-group');
  const settingsSyncToggle = document.getElementById('settings-sync');
  const settingsAccountEmail = document.getElementById('settings-account-email');
  const settingsAccountDot = document.getElementById('settings-account-dot');
  const settingsSyncTime = document.getElementById('settings-sync-time');
  const btnSyncNow = document.getElementById('btn-sync-now');

  function broadcastTapeSettings(settings) {
    try {
      if (chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({}, (tabs) => {
          for (const tab of (tabs || [])) {
            if (tab && tab.id) {
              chrome.tabs.sendMessage(tab.id, { type: 'TAPE_SETTINGS_UPDATE', settings }, () => {
                if (chrome.runtime.lastError) {}
              });
            }
          }
        });
      }
    } catch (e) {}
  }

  function paintPositionSegmented(value) {
    if (!settingsPositionGroup) return;
    settingsPositionGroup.querySelectorAll('button[data-value]').forEach((b) => {
      b.classList.toggle('is-active', b.getAttribute('data-value') === value);
      b.setAttribute('aria-checked', b.getAttribute('data-value') === value ? 'true' : 'false');
    });
  }

  function refreshSettingsDomainRow() {
    if (!settingsDomainRow) return;
    if (!currentDomain) {
      settingsDomainRow.textContent = '';
      return;
    }
    const isDisabled = disabledDomains.includes(currentDomain);
    const hiddenMsg = (t('settingsDomainHidden', currentDomain) || '').replace('$DOMAIN$', currentDomain) || ('Hidden on ' + currentDomain);
    const shownMsg = (t('settingsDomainShown', currentDomain) || '').replace('$DOMAIN$', currentDomain) || ('Showing on ' + currentDomain);
    settingsDomainRow.textContent = isDisabled ? hiddenMsg : shownMsg;
  }

  function loadTapeSettingsIntoUI() {
    chrome.storage.local.get(['tapePosition', 'tapeSize', 'tapeTheme', 'tapeDirection', 'tapePauseOnHover', 'tapeShowIndices', 'tapeShowChange', 'tapeShowAmount', 'tapeVisible', 'disabledDomains'], (res) => {
      const pos = res.tapePosition || TAPE_SETTING_DEFAULTS.tapePosition;
      paintPositionSegmented(pos);
      if (settingsTheme) settingsTheme.value = res.tapeTheme || TAPE_SETTING_DEFAULTS.tapeTheme;
      if (settingsSize) settingsSize.value = res.tapeSize || TAPE_SETTING_DEFAULTS.tapeSize;
      if (settingsDirection) settingsDirection.value = res.tapeDirection || TAPE_SETTING_DEFAULTS.tapeDirection;
      if (settingsPauseHover) settingsPauseHover.checked = res.tapePauseOnHover !== false;
      if (settingsShowIndices) settingsShowIndices.checked = res.tapeShowIndices !== false;
      if (settingsShowChange) settingsShowChange.checked = res.tapeShowChange !== false;
      if (settingsShowAmount) settingsShowAmount.checked = res.tapeShowAmount === true;
      // % change and amount change are independent — both on shows "+40.29 (0.37%)"
      if (settingsVisible) settingsVisible.checked = res.tapeVisible !== false;
      if (Array.isArray(res.disabledDomains)) disabledDomains = res.disabledDomains;
      updateDomainUI();
      refreshSettingsDomainRow();
    });
  }

  function persistTapeSetting(patch) {
    chrome.storage.local.set(patch, () => {
      broadcastTapeSettings(patch);
      // Keep the header eye icon in sync when visibility changes from Settings
      if (patch.tapeVisible !== undefined) updateVisibilityUI(patch.tapeVisible);
    });
  }

  function formatSyncTime(ts) {
    if (!ts) return t('settingsNeverSynced') || 'Not synced yet';
    try {
      const when = new Date(ts).toLocaleString();
      return (t('settingsLastSync', String(when)) || '').replace('$TIME$', when) || ('Last synced: ' + when);
    } catch (e) {
      return t('settingsNeverSynced') || 'Not synced yet';
    }
  }

  function isBrave() {
    try { return navigator.userAgent && navigator.userAgent.includes('Brave'); } catch (e) { return false; }
  }

  function paintSyncUI(state) {
    const enabled = !state || state.enabled !== false;
    const supported = !state || state.supported !== false;
    // canReadIdentity is false on browsers where the profile email can't be
    // read (e.g. Firefox, Brave) — there we must not claim "Not signed in".
    const identityReadable = !state || state.canReadIdentity !== false;
    const signedOut = !!(state && supported && identityReadable && state.canReadIdentity === true && !state.email && !isBrave());
    if (settingsSyncToggle) settingsSyncToggle.checked = enabled;
    if (settingsSyncToggle) settingsSyncToggle.disabled = !supported;
    if (btnSyncNow) btnSyncNow.disabled = !supported || !enabled;
    if (settingsAccountEmail) {
      if (!supported) {
        settingsAccountEmail.textContent = t('settingsSyncUnsupported') || 'Browser sync not available';
      } else if (state && state.email) {
        settingsAccountEmail.textContent = state.email;
      } else if (state && !identityReadable) {
        settingsAccountEmail.textContent = t('settingsBrowserSync') || 'Syncs with your browser account';
      } else if (isBrave()) {
        settingsAccountEmail.textContent = t('settingsBrowserSync') || 'Syncs with your browser account';
      } else if (signedOut) {
        settingsAccountEmail.textContent = t('settingsSignedOut') || 'Not signed in';
      } else {
        settingsAccountEmail.textContent = '…';
      }
    }
    if (settingsAccountDot) {
      settingsAccountDot.classList.toggle('is-signed-in', !!(state && state.email) || (isBrave() && enabled));
    }
    if (settingsSyncTime) {
      if (!supported || signedOut) {
        // Showing a stored time next to "Not signed in" is contradictory —
        // and on some browsers the email simply can't be read — so only show
        // the time when it can honestly mean a cross-device sync happened.
        settingsSyncTime.textContent = '';
      } else if (state) {
        settingsSyncTime.textContent = formatSyncTime(state.lastSync);
      }
    }
  }

  function loadSyncUI() {
    // Local toggle state first for instant paint; background fills in email + time.
    chrome.storage.local.get(['syncEnabled', 'lastPrefsSyncAt'], (res) => {
      paintSyncUI({ enabled: res.syncEnabled !== false, lastSync: res.lastPrefsSyncAt || 0, email: '', supported: true });
      try {
        chrome.runtime.sendMessage({ type: 'GET_SYNC_STATE' }, (state) => {
          if (chrome.runtime.lastError || !state) return;
          paintSyncUI(state);
        });
      } catch (e) {}
    });
  }

  function openSettingsModal() {
    loadTapeSettingsIntoUI();
    loadSyncUI();
    if (settingsModal) settingsModal.style.display = 'flex';
  }
  function closeSettingsModal() {
    if (settingsModal) settingsModal.style.display = 'none';
  }

  if (btnSettings) btnSettings.addEventListener('click', openSettingsModal);
  if (btnSettingsClose) btnSettingsClose.addEventListener('click', closeSettingsModal);
  if (btnSettingsDone) btnSettingsDone.addEventListener('click', closeSettingsModal);
  if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) closeSettingsModal();
    });
  }
  if (settingsPositionGroup) {
    settingsPositionGroup.querySelectorAll('button[data-value]').forEach((b) => {
      b.addEventListener('click', () => {
        const value = b.getAttribute('data-value');
        paintPositionSegmented(value);
        persistTapeSetting({ tapePosition: value });
      });
    });
  }
  if (settingsTheme) settingsTheme.addEventListener('change', () => persistTapeSetting({ tapeTheme: settingsTheme.value }));
  if (settingsSize) settingsSize.addEventListener('change', () => persistTapeSetting({ tapeSize: settingsSize.value }));
  if (settingsDirection) settingsDirection.addEventListener('change', () => persistTapeSetting({ tapeDirection: settingsDirection.value }));
  if (settingsPauseHover) settingsPauseHover.addEventListener('change', () => persistTapeSetting({ tapePauseOnHover: settingsPauseHover.checked }));
  if (settingsShowIndices) settingsShowIndices.addEventListener('change', () => persistTapeSetting({ tapeShowIndices: settingsShowIndices.checked }));
  // % change and amount change are independent toggles — both on shows "+40.29 (0.37%)"
  if (settingsShowChange) settingsShowChange.addEventListener('change', () => {
    persistTapeSetting({ tapeShowChange: settingsShowChange.checked });
  });
  if (settingsShowAmount) settingsShowAmount.addEventListener('change', () => {
    persistTapeSetting({ tapeShowAmount: settingsShowAmount.checked });
  });
  if (settingsVisible) settingsVisible.addEventListener('change', () => persistTapeSetting({ tapeVisible: settingsVisible.checked }));
  if (settingsSyncToggle) {
    settingsSyncToggle.addEventListener('change', () => {
      const enabled = settingsSyncToggle.checked;
      chrome.storage.local.set({ syncEnabled: enabled }, () => {
        if (enabled) {
          try {
            chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, () => {
              if (chrome.runtime.lastError) {}
              loadSyncUI();
            });
          } catch (e) {}
        }
        loadSyncUI();
      });
    });
  }
  if (btnSyncNow) {
    btnSyncNow.addEventListener('click', () => {
      const original = btnSyncNow.textContent;
      btnSyncNow.disabled = true;
      btnSyncNow.textContent = t('settingsSyncing') || 'Syncing…';
      const restore = () => {
        btnSyncNow.textContent = original;
        loadSyncUI();
      };
      try {
        chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, () => {
          if (chrome.runtime.lastError) {}
          restore();
        });
      } catch (e) {
        restore();
      }
      setTimeout(() => {
        if (btnSyncNow.disabled) restore();
      }, 8000);
    });
  }
  if (btnSettingsReset) {
    btnSettingsReset.addEventListener('click', () => {
      const resetPatch = Object.assign({}, TAPE_SETTING_DEFAULTS);
      chrome.storage.local.set(resetPatch, () => {
        broadcastTapeSettings(resetPatch);
        updateVisibilityUI(true);
        loadTapeSettingsIntoUI();
      });
    });
  }
  // Keep Settings UI fresh if storage changes elsewhere
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && settingsModal && settingsModal.style.display !== 'none') {
      if (changes.tapePosition || changes.tapeSize || changes.tapeTheme || changes.tapeDirection || changes.tapePauseOnHover || changes.tapeShowIndices || changes.tapeShowChange || changes.tapeShowAmount || changes.tapeVisible || changes.disabledDomains) {
        loadTapeSettingsIntoUI();
      }
      if (changes.syncEnabled || changes.lastPrefsSyncAt) {
        loadSyncUI();
      }
    }
  });

  // About & Support Modal
  const btnAbout = document.getElementById('btn-about');
  const aboutModal = document.getElementById('about-modal');
  const btnAboutClose = document.getElementById('btn-about-close');

  if (btnAbout && aboutModal) {
    btnAbout.addEventListener('click', () => {
      aboutModal.style.display = 'flex';
    });
  }
  if (btnAboutClose && aboutModal) {
    btnAboutClose.addEventListener('click', () => {
      aboutModal.style.display = 'none';
    });
  }

  // Fullscreen tab: open this panel in a full browser tab (?fullscreen=1).
  // The layout is fluid so it fills the tab; a roomier centered style applies.
  let isFullscreenTab = false;
  try {
    isFullscreenTab = new URLSearchParams(location.search).get('fullscreen') === '1';
  } catch (e) {}
  if (isFullscreenTab) document.body.classList.add('screener-fullscreen');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const btnSidebar = document.getElementById('btn-sidebar');
  if (btnFullscreen) {
    if (isFullscreenTab) {
      btnFullscreen.style.display = 'none';
      if (btnSidebar) btnSidebar.style.display = '';
    } else {
      btnFullscreen.addEventListener('click', () => {
        const url = chrome.runtime.getURL('sidepanel.html?fullscreen=1');
        try {
          chrome.tabs.create({ url }, () => {
            // Close the side panel after opening fullscreen tab
            try { window.close(); } catch (e) {}
          });
        } catch (e) {
          window.open(url, '_blank');
          try { window.close(); } catch (e) {}
        }
      });
    }
  }
  if (btnSidebar) {
    btnSidebar.addEventListener('click', () => {
      // Tell background to open sidebar, then close this tab
      try {
        chrome.runtime.sendMessage({ type: 'OPEN_SIDEBAR' }, () => {
          chrome.tabs.getCurrent((tab) => {
            if (tab && tab.id) {
              setTimeout(() => { chrome.tabs.remove(tab.id); }, 300);
            }
          });
        });
      } catch (e) {
        try { window.close(); } catch (e2) {}
      }
    });
  }
  if (aboutModal) {
    aboutModal.addEventListener('click', (e) => {
      if (e.target === aboutModal) aboutModal.style.display = 'none';
    });
  }

  // Add Market modal (world clocks): cancel + backdrop close
  const addMarketModalEl = document.getElementById('add-market-modal');
  const btnAddMarketCancel = document.getElementById('btn-add-market-cancel');
  const btnAddMarketReset = document.getElementById('btn-add-market-reset');
  if (btnAddMarketCancel) btnAddMarketCancel.addEventListener('click', closeAddMarketModal);
  if (btnAddMarketReset) btnAddMarketReset.addEventListener('click', resetClocks);
  if (addMarketModalEl) {
    addMarketModalEl.addEventListener('click', (e) => {
      if (e.target === addMarketModalEl) closeAddMarketModal();
    });
  }


  // --- Multi-Portfolio Logic ---
  const btnRenamePortfolio = document.getElementById('btn-rename-portfolio');
  
  function loadPortfolios(callback) {
    chrome.storage.local.get(['portfolios', 'screenerWatchlist'], (res) => {
      let portfolios = res.portfolios || {};
      let needsSave = false;
      
      // Migration for old users & Default override
      if (portfolios['Default'] && !portfolios['Sample']) {
        let listToMigrate = portfolios['Default'];
        if (listToMigrate.length === 0) {
           listToMigrate = ['AAPL', 'MSFT', 'NVDA', 'TSLA'];
        }
        portfolios['Sample'] = listToMigrate;
        delete portfolios['Default'];
        if (activePortfolio === 'Default') activePortfolio = 'Sample';
        needsSave = true;
      }

      if (Object.keys(portfolios).length === 0) {
        // Pre-populate with top US stocks if empty
        let initialList = res.screenerWatchlist && res.screenerWatchlist.length > 0 ? res.screenerWatchlist : ['AAPL', 'MSFT', 'NVDA', 'TSLA'];
        portfolios['Sample'] = initialList;
        if (activePortfolio === 'Default') activePortfolio = 'Sample';
        needsSave = true;
      }

      portfolioSelect.innerHTML = '';
      for (const name in portfolios) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        portfolioSelect.appendChild(opt);
      }
      portfolioSelect.value = activePortfolio;

      if (needsSave) {
        chrome.storage.local.set({ portfolios, screenerWatchlist: portfolios['Sample'] }, () => {
          if (callback) callback();
        });
      } else {
        if (callback) callback();
      }
    });
  }

  chrome.storage.local.get(['activePortfolioName'], (res) => {
    if (res && res.activePortfolioName) activePortfolio = res.activePortfolioName;
    loadPortfolios(() => {
      renderDefaultSearch();
      renderWatchlist(); // Instantly render watchlist from cache with zero delay!
      initMarketOverview();
    });
  });

  portfolioSelect.addEventListener('change', (e) => {
    activePortfolio = e.target.value;
    chrome.storage.local.get(['portfolios'], (res) => {
       const ports = res.portfolios || {};
       chrome.storage.local.set({ screenerWatchlist: ports[activePortfolio] || [], activePortfolioName: activePortfolio }, () => {
         renderWatchlist();
       });
    });
  });

  // Dashboard refresh: full re-sync + fast-price poll, list repaints on WATCHLIST_UPDATED
  const btnWatchlistRefresh = document.getElementById('btn-watchlist-refresh');
  if (btnWatchlistRefresh) btnWatchlistRefresh.addEventListener('click', () => {
    btnWatchlistRefresh.disabled = true;
    btnWatchlistRefresh.style.opacity = '0.5';
    const done = () => {
      btnWatchlistRefresh.disabled = false;
      btnWatchlistRefresh.style.opacity = '';
    };
    const safety = setTimeout(done, 30000);
    try {
      chrome.runtime.sendMessage({ type: 'FORCE_SYNC' }, () => {
        if (chrome.runtime.lastError) {}
        clearTimeout(safety);
        chrome.runtime.sendMessage({ type: 'POLL_NOW' });
        renderWatchlist();
        done();
      });
    } catch (e) {
      clearTimeout(safety);
      done();
    }
  });

  // --- Custom Text Prompt Logic ---
  const textPromptModal = document.getElementById('text-prompt-modal');
  const textPromptTitle = document.getElementById('text-prompt-title');
  const textPromptInput = document.getElementById('text-prompt-input');
  const btnTextPromptCancel = document.getElementById('btn-text-prompt-cancel');
  const btnTextPromptSave = document.getElementById('btn-text-prompt-save');

  let textPromptCallback = null;

  function showCustomPrompt(title, defaultValue, callback) {
    textPromptTitle.textContent = title;
    textPromptInput.value = defaultValue || '';
    textPromptCallback = callback;
    textPromptModal.style.display = 'flex';
    setTimeout(() => {
      textPromptInput.focus();
      textPromptInput.select();
    }, 50);
  }

  function closeCustomPrompt() {
    textPromptModal.style.display = 'none';
    textPromptCallback = null;
  }

  btnTextPromptCancel.addEventListener('click', closeCustomPrompt);
  
  textPromptModal.addEventListener('click', (e) => {
    if (e.target === textPromptModal) closeCustomPrompt();
  });

  btnTextPromptSave.addEventListener('click', () => {
    if (textPromptCallback) {
      textPromptCallback(textPromptInput.value);
    }
    closeCustomPrompt();
  });
  
  textPromptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnTextPromptSave.click();
    } else if (e.key === 'Escape') {
      btnTextPromptCancel.click();
    }
  });

  if (btnRenamePortfolio) {
    btnRenamePortfolio.addEventListener('click', () => {
      showCustomPrompt(t('renamePrompt', activePortfolio), activePortfolio, (newName) => {
        if (newName && newName.trim() !== '' && newName !== activePortfolio) {
          chrome.storage.local.get(['portfolios'], (res) => {
            let ports = res.portfolios || {};
            if (ports[newName]) {
              alert(t('portfolioExists'));
              return;
            }
            ports[newName] = ports[activePortfolio];
            delete ports[activePortfolio];
            activePortfolio = newName;
            chrome.storage.local.set({ portfolios: ports, activePortfolioName: activePortfolio }, () => {
              loadPortfolios();
            });
          });
        }
      });
    });
  }

  btnNewPortfolio.addEventListener('click', () => {
    showCustomPrompt(t('newPrompt'), "", (name) => {
      if (name && name.trim() !== '') {
        chrome.storage.local.get(['portfolios'], (res) => {
          const ports = res.portfolios || {};
          if (!ports[name]) {
            ports[name] = [];
            activePortfolio = name;
            chrome.storage.local.set({ portfolios: ports, screenerWatchlist: [], activePortfolioName: activePortfolio }, () => {
              loadPortfolios();
              renderWatchlist();
            });
          } else {
            alert(t('portfolioExists'));
          }
        });
      }
    });
  });


  // --- Export to CSV ---
  btnExportCsv.addEventListener('click', () => {
    
    chrome.storage.local.get(['portfolios', 'cachedData'], (res) => {
      const list = (res.portfolios || {})[activePortfolio] || [];
      const data = res.cachedData || {};
      
      let csv = "Ticker,Company,Current Price,P/E,Market Cap,ROCE\n";
      for (const ticker of list) {
        const d = data[ticker];
        if (d && d.success) {
          csv += `"${ticker}","${d.companyName}","${d.ratios['Current Price']||''}","${d.ratios['Stock P/E']||''}","${d.ratios['Market Cap']||''}","${d.ratios['ROCE']||''}"\n`;
        }
      }
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Screener_Watchlist_${activePortfolio}.csv`;
      a.click();
    });
  });

  // --- Smart Verdict Engine ---
  function generateVerdict(ratios) {
    const peRaw = ratios['Stock P/E'];
    const roceRaw = ratios['ROCE'];
    

    if (!peRaw || !roceRaw) return `<div style="background:var(--verdict-bg); border:1px solid var(--verdict-border); padding:12px; border-radius:8px; margin-top:12px; font-size:13px;"><span style="color:var(--label-color); font-weight:600;">${t('verdictLabel')}</span> <span style="color:#fbbc04; font-weight:500;">${t('verdictNoData')}</span></div>`;
    
    const pe = parseFloat(peRaw.replace(/[^\d\.\-]/g, ''));
    const roce = parseFloat(roceRaw.replace(/[^\d\.\-]/g, ''));
    
    let verdict = "";
    let sentimentColor = 'var(--label-color)';
    
    if (pe < 15 && roce > 20) {
      verdict = t('verdictGem');
      sentimentColor = 'var(--link-green)';
    } else if (pe > 40 && roce > 15) {
      verdict = t('verdictExpensive');
      sentimentColor = '#d93025';
    } else if (pe > 30 && roce < 10) {
      verdict = t('verdictRisk');
      sentimentColor = '#d93025';
    } else if (pe < 25 && roce > 15) {
      verdict = t('verdictSolid');
      sentimentColor = 'var(--link-green)';
    } else {
      verdict = t('verdictAvg');
      sentimentColor = '#fbbc04';
    }

    return `<div style="background:var(--verdict-bg); border:var(--border-color); padding:12px; border-radius:8px; margin-top:12px; font-size:13px;">
      <span style="color:var(--label-color); font-weight:600;">${t('verdictLabel')}</span> <span style="color:${sentimentColor}; font-weight:500;">${verdict}</span>
    </div>`;
  }

  // --- Search Logic ---
  btnSearch.addEventListener('click', async () => {
    const ticker = inputSearch.value.trim().toUpperCase();
    if (!ticker) return;
    
    resultsSearch.innerHTML = '<div class="screener-loading">' + t('scrapingData') + '</div>';
    
    try {
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'FORCE_SYNC', ticker: ticker }, resolve);
      });
      // The background script just synced, now we read from cache
      chrome.storage.local.get(['cachedData'], (res) => {
        const data = (res.cachedData || {})[ticker];
        if (data && data.success) {
           

           const companyUrl = (data.source === 'yahoo' || ticker.startsWith('^'))
             ? `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}`
             : `https://www.screener.in/company/${ticker}/`;
           let html = `<div style="display:flex; justify-content:space-between; align-items:flex-start;">
             <h3 style="margin:0 0 4px 0;"><a href="${companyUrl}" target="_blank" style="color:var(--link-green); text-decoration:none;">${data.companyName}</a></h3>
             <button id="btn-back-dashboard" class="screener-btn screener-btn-secondary" style="padding:4px 8px; font-size:11px; flex-shrink:0; margin-left:8px;">${t('backButton')}</button>
           </div>`;
            if (data.isIndex) {
              html += `<div style="background:var(--verdict-bg); border:var(--border-color); padding:12px; border-radius:8px; margin-top:12px; font-size:13px;"><span style="color:var(--label-color); font-weight:600;">${t('verdictLabel')}</span> <span style="color:var(--link-green); font-weight:500;">${t('verdictIndex')}</span></div>`;
            } else {
              html += generateVerdict(data.ratios);
            }

            // Add to Watchlist button
           html += `<button id="btn-search-add-wl" data-ticker="${ticker}" style="margin-top:12px; width:100%; padding:10px; border-radius:8px; border:1px solid var(--border-color); cursor:pointer; font-weight:600; font-size:14px; background:var(--btn-wl-bg); color:#fff;">${t('addToWatchlist')}</button>`;

           html += `<div style="width:100%; overflow-x:auto; margin-top:16px; border:1px solid var(--border-color); border-radius:8px;">`;
           html += `<table style="width:100%; border-collapse:collapse; overflow:hidden; font-size:14px; font-family:Roboto,sans-serif;">`;
           let i = 0;
           for (const [k, v] of Object.entries(data.ratios)) {
             html += `<tr style="background:var(--verdict-bg);">
               <td style="padding:12px 16px; color:var(--label-color); font-weight:500; border-bottom:1px solid var(--border-light); white-space:nowrap;">${ratioLabel(k)}</td>
               <td style="padding:12px 16px; color:var(--text-color); font-weight:600; text-align:right; border-bottom:1px solid var(--border-light);">${v}</td>
             </tr>`;
             i++;
           }
           html += `</table></div>`;
           html += `<div style="text-align:right; margin-top:8px;">
             <a href="https://www.screener.in/company/${ticker}/" target="_blank" style="color:#1a73e8; font-size:12px; text-decoration:none; font-weight:500;">&#9881; ${t('customizeScreener')}</a>
           </div>`;
           if (data.aboutText) html += `<div class="screener-about" style="margin-top:16px;">${data.aboutText}</div>`;
             
             html += `<div id="search-peers-container"></div>`;
             html += `<div id="search-announcements-container"></div>`;

              resultsSearch.innerHTML = html;

              // Async fetch for Peers & Announcements
             fetch(`https://www.screener.in/company/${ticker}/consolidated/`)
               .then(r => {
                 if (!r.ok) return fetch(`https://www.screener.in/company/${ticker}/`);
                 return r;
               })
               .then(r => r.text())
               .then(htmlStr => {
                 const parser = new DOMParser();
                 const doc = parser.parseFromString(htmlStr, 'text/html');
                 
                 // Parse Peers
                 const peersTable = doc.querySelector('#peers table');
                 if (peersTable) {
                   const trs = Array.from(peersTable.querySelectorAll('tr'));
                   trs.forEach(tr => {
                      Array.from(tr.querySelectorAll('a')).forEach(a => a.style.color = linkColor);
                      Array.from(tr.querySelectorAll('td')).forEach(td => td.style.padding = '8px');
                   });
                   const tableHtml = `<table style="width:100%; border-collapse:collapse; font-size:12px; text-align:right; color:var(--text-color); white-space:nowrap;">${trs.slice(0,4).map(tr => {
                     const isHeader = tr.querySelector('th');
                     return `<tr style="border-bottom:1px solid var(--border-color); ${isHeader ? 'font-weight:bold; background:var(--row-even)' : ''}">${tr.innerHTML}</tr>`;
                   }).join('')}</table>`;
                    document.getElementById('search-peers-container').innerHTML = `<h4 style="margin:16px 0 8px 0; color:var(--text-color);">${t('peerTitle')}</h4><div style="border:1px solid var(--border-color); border-radius:8px; overflow-x:auto;">${tableHtml}</div>`;
                 }
                 
                 // Parse Announcements (Documents)
                 const docsSec = doc.querySelector('#documents');
                 if (docsSec) {
                   // Announcements are usually the first <ul>
                   const annList = docsSec.querySelector('ul');
                   if (annList) {
                     const lis = Array.from(annList.querySelectorAll('li')).slice(0, 5);
                     const annHtml = lis.map(li => {
                       const link = li.querySelector('a');
                       if (link) {
                         link.style.color = linkColor;
                         link.style.textDecoration = 'none';
                         if (link.href.startsWith('chrome-extension')) {
                           link.href = 'https://www.screener.in' + link.getAttribute('href');
                         }
                       }
                       return `<div style="padding:8px 0; border-bottom:1px solid var(--border-color); font-size:12px; color:var(--text-color);">${li.innerHTML}</div>`;
                     }).join('');
                     document.getElementById('search-announcements-container').innerHTML = `<h4 style="margin:16px 0 8px 0; color:var(--text-color);">${t('annTitle')}</h4>${annHtml}`;
                   }
                 }
               })
               .catch(() => {});
  
             // Wire up the Add to Watchlist button
           const addBtn = document.getElementById('btn-search-add-wl');
           if (addBtn) {
             addBtn.onclick = () => {
               chrome.storage.local.get(['portfolios'], (r) => {
                 const ports = r.portfolios || {};
                 const list = ports[activePortfolio] || [];
                 if (!list.includes(ticker)) {
                   list.push(ticker);
                   ports[activePortfolio] = list;
                   chrome.storage.local.set({ portfolios: ports, screenerWatchlist: list }, () => {
                     addBtn.textContent = t('addedButton');
                     addBtn.style.background = '#5f6368';
                     addBtn.disabled = true;
                     chrome.runtime.sendMessage({ type: 'FORCE_SYNC' });
                   });
                 } else {
                   addBtn.textContent = t('alreadyButton');
                   addBtn.style.background = '#5f6368';
                 }
               });
             };
           }
        } else {
           resultsSearch.innerHTML = '<div class="screener-error">' + t('fetchFailed') + '</div>';
        }
      });
    } catch (e) {
      resultsSearch.innerHTML = '<div class="screener-error">' + t('fetchError') + '</div>';
    }
  });
  
  // --- Event Delegation for Back Button ---
  resultsSearch.addEventListener('click', (e) => {
    if (e.target.closest('#btn-back-dashboard')) {
      inputSearch.value = '';
      searchSuggestions.style.display = 'none';
      renderDefaultSearch();
    }
  });

  // --- Watchlist Rendering ---
  function removeTicker(ticker) {
    chrome.storage.local.get(['portfolios'], (res) => {
      const ports = res.portfolios || {};
      const list = ports[activePortfolio] || [];
      ports[activePortfolio] = list.filter(t => t !== ticker);
      
      // Update screenerWatchlist compatibility
      chrome.storage.local.set({ portfolios: ports, screenerWatchlist: ports[activePortfolio] }, () => {
        renderWatchlist();
      });
    });
  }

    // btnWlAdd logic removed

  // --- Modals Logic ---
  const alertModal = document.getElementById('alert-modal');
  const btnAlertCancel = document.getElementById('btn-alert-cancel');
  const btnAlertSave = document.getElementById('btn-alert-save');
  const inputAlertAbove = document.getElementById('alert-above');
  const inputAlertBelow = document.getElementById('alert-below');
  let currentAlertTicker = '';

  window.openAlertModal = function(ticker) {
    currentAlertTicker = ticker;
    document.getElementById('alert-ticker').textContent = ticker;
    chrome.storage.local.get(['alerts'], (res) => {
      const alerts = res.alerts || {};
      inputAlertAbove.value = alerts[ticker]?.above || '';
      inputAlertBelow.value = alerts[ticker]?.below || '';
      alertModal.style.display = 'flex';
    });
  };

  btnAlertCancel.onclick = () => alertModal.style.display = 'none';
  btnAlertSave.onclick = () => {
    chrome.storage.local.get(['alerts'], (res) => {
      const alerts = res.alerts || {};
      const above = parseFloat(inputAlertAbove.value) || null;
      const below = parseFloat(inputAlertBelow.value) || null;
      if (above || below) {
        alerts[currentAlertTicker] = { above, below };
      } else {
        delete alerts[currentAlertTicker];
      }
      chrome.storage.local.set({ alerts }, () => {
        alertModal.style.display = 'none';
        renderWatchlist();
      });
    });
  };

  function createSparkline(data) {
    if (!data || data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const width = 50, height = 18;
    const points = data.map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');
    const isUp = data[data.length - 1] >= data[0];
    const color = isUp ? '#188038' : '#d93025';
    const first = parseFloat(data[0]);
    const last = parseFloat(data[data.length - 1]);
    let retHtml = '';
    if (first && isFinite(first) && isFinite(last)) {
      const ret = ((last - first) / Math.abs(first)) * 100;
      const sign = ret >= 0 ? '▲' : '▼';
      retHtml = `<div style="font-size:10px; font-weight:600; text-align:center; color:${color};" title="${t('trendReturnTitle')}">${sign} ${Math.abs(ret).toFixed(2)}%</div>`;
    }
    return `<div style="display:block; margin:4px auto; width:max-content;"><svg viewBox="-2 -2 ${width + 4} ${height + 4}" width="${width}" height="${height}" style="overflow:visible; display:block; margin:0 auto;"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${retHtml}</div>`;
  }

  let currentSortBy = null; // 'price', 'mcap'
  let currentSortDesc = true;
  let isDragging = false; // Prevent re-rendering while user is dragging

  function getSortIndicator(col) {
    if (currentSortBy !== col) return '';
    return currentSortDesc ? ' ▼' : ' ▲';
  }

  function handleSort(column) {
    if (currentSortBy === column) {
      currentSortDesc = !currentSortDesc;
    } else {
      currentSortBy = column;
      currentSortDesc = true;
    }
    renderWatchlist();
  }

  function renderWatchlist() {
    if (isDragging) return; // Do not interrupt drag and drop

    // Single consolidated fetch for instant rendering with zero network delay
    chrome.storage.local.get(['portfolios', 'screenerWatchlist', 'cachedData', 'alerts'], (res) => {
      const ports = res.portfolios || {};
      let list = ports[activePortfolio] || res.screenerWatchlist || [];
      const cached = res.cachedData || {};
      const alertsObj = res.alerts || {};

      if (list.length === 0) {
        wlItemsContainer.innerHTML = '<div style="text-align:center;color:var(--label-color);padding:24px 16px;font-size:13px;">' + t('watchlistEmpty') + '</div>';
        return;
      }

      // Handle Sorting
      if (currentSortBy) {
        list = [...list].sort((a, b) => {
          const dA = cached[a];
          const dB = cached[b];
          if (!dA || !dB) return 0;
          
          let valA = 0;
          let valB = 0;
          
          if (currentSortBy === 'price') {
            valA = parseFloat(((dA.ratios || {})['Current Price'] || '0').replace(/[^\d.-]/g, '')) || 0;
            valB = parseFloat(((dB.ratios || {})['Current Price'] || '0').replace(/[^\d.-]/g, '')) || 0;
          } else if (currentSortBy === 'mcap') {
            const parseMcap = (str) => {
              const num = parseFloat((str || '0').replace(/[^\d.-]/g, '')) || 0;
              if ((str || '').includes('T')) return num * 1000;
              if ((str || '').includes('B')) return num;
              if ((str || '').includes('M')) return num / 1000;
              if ((str || '').includes('Cr')) return num * 10; // Rs Crores ~ 10M
              return num;
            };
            valA = parseMcap((dA.ratios || {})['Market Cap'] || '');
            valB = parseMcap((dB.ratios || {})['Market Cap'] || '');
          }
          
          return currentSortDesc ? valB - valA : valA - valB;
        });
      }

      let html = `<div style="width:100%; overflow-x:auto; border:1px solid var(--border-color); border-radius:8px;">
        <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:right; color:var(--text-color); white-space:nowrap;">
          <thead>
            <tr style="background:var(--header-bg); border-bottom:1px solid var(--border-color); font-weight:600;">
              <td style="text-align:left; padding:10px;">${t('colSymbol')}</td>
              <td style="padding:10px; text-align:center;">${t('colTrend')}</td>
              <td style="padding:10px; cursor:pointer;" id="sort-price" title="${t('sortByPrice')}">${t('colPrice')}${getSortIndicator('price')}</td>
              <td style="padding:10px;">${t('colPE')}</td>
              <td style="padding:10px; cursor:pointer;" id="sort-mcap" title="${t('sortByMCap')}">${t('colMCap')}${getSortIndicator('mcap')}</td>
              <td style="padding:10px; text-align:center;">${t('colActions')}</td>
            </tr>
          </thead>
          <tbody>`;
        
        let idx = 0;
        for (const ticker of list) {
          const data = cached[ticker];
          
          if (!data || data.success === false || !data.ratios) {
             const msg = data && data.success === false ? `Could not fetch ${ticker}. Retrying...` : `Waiting for sync (${ticker})...`;
             html += `<tr style="background:${idx % 2 === 0 ? 'var(--row-even)' : 'var(--row-odd)'}; border-bottom:1px solid var(--border-color);">
               <td colspan="6" style="padding:10px; text-align:left;">${msg}</td>
             </tr>`;
          } else {
            let pctHtml = '';
            let flashClass = '';
            if (data.changePct) {
              const color = data.changeDir === 'up' ? '#188038' : '#d93025';
              const sign = data.changeDir === 'up' ? '\u25B2' : '\u25BC';
              pctHtml = `<span style="color:${color}; font-size:11px;">${sign} ${data.changePct}</span>`;
            }
            flashClass = data.flash && (Date.now() - (data.flashTime || 0) < 1500) ? (data.flash === 'up' ? 'screener-flash-up' : 'screener-flash-down') : '';

            const hasAlert = !!(alertsObj[ticker] && (alertsObj[ticker].above || alertsObj[ticker].below));
            const ratios = data.ratios || {};

            const spark = createSparkline(data.sparkline);

            html += `
              <tr class="watchlist-row" draggable="true" data-ticker="${ticker}" style="background:${idx % 2 === 0 ? 'var(--row-even)' : 'var(--row-odd)'}; border-bottom:1px solid var(--border-color); cursor:grab;">
                <td style="text-align:left; padding:10px; font-weight:500;">
                  <span style="color:#aaa; margin-right:4px; font-size:10px;" title="${t('dragHint')}">⣿</span>
                  <a href="${data.source === 'yahoo' || ticker.startsWith('^') ? 'https://finance.yahoo.com/quote/' + encodeURIComponent(ticker) : 'https://www.screener.in/company/' + ticker + '/'}" target="_blank" title="${data.companyName || ticker}" style="color:var(--link-green); text-decoration:none;">${ticker}</a>
                </td>
                <td style="padding:10px;">${spark}</td>
                <td class="${flashClass}" style="padding:10px;">${ratios['Current Price']||'-'}<br/>${pctHtml}</td>
                <td style="padding:10px;">${ratios['Stock P/E']||'-'}</td>
                <td style="padding:10px;">${formatMarketCap(ratios['Market Cap'] || '-')}</td>
                <td style="padding:10px; text-align:center;">
                  <button class="screener-alert-btn" data-ticker="${ticker}" style="background:none; border:none; cursor:pointer; font-size:14px; padding:2px;" title="${t('setAlertTitle')}">${hasAlert ? '\uD83D\uDD14' : '\u23F0'}</button>
                  <button class="screener-del-btn" data-ticker="${ticker}" style="background:none; border:none; color:#d93025; cursor:pointer; font-size:14px; padding:2px;" title="${t('deleteTitle')}">&#128465;</button>
                </td>
              </tr>
            `;
          }
          idx++;
        }
        
        html += `</tbody></table></div>`;
        wlItemsContainer.innerHTML = html;

        // Wire up sorting
        const sortPrice = document.getElementById('sort-price');
        const sortMcap = document.getElementById('sort-mcap');
        if (sortPrice) sortPrice.onclick = () => handleSort('price');
        if (sortMcap) sortMcap.onclick = () => handleSort('mcap');

        // Wire up row action buttons (alert + delete)
        wlItemsContainer.querySelectorAll('.screener-del-btn').forEach(b => b.onclick = () => removeTicker(b.getAttribute('data-ticker')));
        wlItemsContainer.querySelectorAll('.screener-alert-btn').forEach(b => b.onclick = () => openAlertModal(b.getAttribute('data-ticker')));

        // Wire up Drag and Drop
        let draggedRow = null;
        wlItemsContainer.querySelectorAll('.watchlist-row').forEach(row => {
          row.addEventListener('dragstart', function(e) {
            isDragging = true;
            draggedRow = this;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this.getAttribute('data-ticker'));
            this.style.opacity = '0.5';
          });
          row.addEventListener('dragend', function() {
            isDragging = false;
            draggedRow = null;
            this.style.opacity = '1';
          });
          row.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            return false;
          });
          row.addEventListener('dragenter', function(e) {
            e.preventDefault();
            this.style.background = 'var(--row-hover)';
          });
          row.addEventListener('dragleave', function() {
            this.style.background = '';
          });
          row.addEventListener('drop', function(e) {
            e.stopPropagation();
            this.style.background = '';
            if (draggedRow && draggedRow !== this) {
              const allRows = Array.from(wlItemsContainer.querySelectorAll('.watchlist-row'));
              const fromIdx = allRows.indexOf(draggedRow);
              const toIdx = allRows.indexOf(this);
              
              if (fromIdx >= 0 && toIdx >= 0) {
                // Clear sort visually
                if (currentSortBy) {
                  currentSortBy = null;
                }
                
                // Reorder DOM synchronously before dragend sets draggedRow to null
                const tbody = this.parentNode;
                const rowToMove = draggedRow; // Capture locally
                if (fromIdx < toIdx) {
                  tbody.insertBefore(rowToMove, this.nextSibling);
                } else {
                  tbody.insertBefore(rowToMove, this);
                }
                
                // Build new array based on new DOM order
                const newOrder = Array.from(tbody.querySelectorAll('.watchlist-row')).map(r => r.getAttribute('data-ticker'));
                
                // Save to storage asynchronously
                chrome.storage.local.get(['portfolios', 'screenerWatchlist'], (localRes) => {
                  let p = localRes.portfolios || {};
                  p[activePortfolio] = newOrder;
                  chrome.storage.local.set({ portfolios: p, screenerWatchlist: newOrder }, () => {
                     renderWatchlist();
                  });
                });
              }
            }
            return false;
          });
        });
    });
  }

  // --- Default Search Render (Customizable 4 Pinned Cards) ---
  const defaultPinnedIndices = [
    { key: 'S&P 500 (USA)', symbol: '^GSPC', curr: 'USD' },
    { key: 'NIKKEI (Japan)', symbol: '^N225', curr: 'JPY' },
    { key: 'STI (Singapore)', symbol: '^STI', curr: 'SGD' },
    { key: 'FTSE 100 (UK)', symbol: '^FTSE', curr: 'GBP' }
  ];

  function renderDefaultSearch() {
    chrome.storage.local.get(['pinnedIndices', 'marketIndices'], (res) => {
      const pinned = Array.isArray(res.pinnedIndices) ? res.pinnedIndices : defaultPinnedIndices;
      const indices = res.marketIndices || {};

      let html = `<div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:12px;">
        <span style="color:var(--label-color); font-size:13px; font-weight:500;">${t('marketIndices')}</span>
      </div>`;
      html += `<div id="market-indices-container" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">`;

      pinned.forEach((item, slot) => {
        const data = indices[item.key] || {};
        const changeVal = parseFloat(data.changePct || '0');
        const changeColor = changeVal > 0 ? '#188038' : (changeVal < 0 ? '#d93025' : 'var(--label-color)');
        const changeSign = changeVal > 0 ? '&#9650;' : (changeVal < 0 ? '&#9660;' : '');
        const flashClass = data.flash && (Date.now() - (data.flashTime || 0) < 1500) ? (data.flash === 'up' ? 'screener-flash-up' : 'screener-flash-down') : '';

        const displayPrice = data.price || t('loadingPrice');
        const displayPct = data.changePct ? `${Math.abs(changeVal).toFixed(2)}%` : '0.00%';

        html += `
          <div class="pinned-card" data-slot="${slot}" style="background:var(--verdict-bg); border:1px solid var(--border-color); border-radius:8px; padding:12px 10px; text-align:center; position:relative; cursor:pointer; transition:border-color 0.2s, box-shadow 0.2s;" title="${t('clickEditCard', item.key)}">
            <div style="font-weight:600; color:var(--text-color); font-size:13px; margin-bottom:6px; padding:0 14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${item.key}">${item.key}</div>
            <div class="${flashClass}" style="font-weight:bold; font-size:15px; color:var(--text-color); margin-bottom:4px;">${displayPrice}</div>
            <div style="color:${changeColor}; font-size:11px; font-weight:500;">${changeSign} ${displayPct}</div>
          </div>
        `;
      });
      
      for (let slot = pinned.length; slot < 4; slot++) {
        html += `
          <div class="pinned-card empty-slot" data-slot="${slot}" style="background:var(--verdict-bg); border:1px dashed var(--border-color); border-radius:8px; padding:12px 10px; text-align:center; position:relative; cursor:pointer; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.6; transition:border-color 0.2s, opacity 0.2s;" title="${t('addNewSlot')}">
            <div style="font-size:24px; color:var(--label-color); line-height:1;">+</div>
            <div style="font-size:12px; font-weight:500; color:var(--label-color); margin-top:4px;">${t('addTicker')}</div>
          </div>
        `;
      }

      html += `</div>`;
      
      resultsSearch.innerHTML = html;

      // Wire up card hover and edit modal triggers
      resultsSearch.querySelectorAll('.pinned-card').forEach(card => {
        card.addEventListener('mouseenter', () => {
          card.style.borderColor = 'var(--accent-color, #1a73e8)';
        });
        card.addEventListener('mouseleave', () => {
          card.style.borderColor = 'var(--border-color)';
        });
        card.addEventListener('click', () => {
          const slot = parseInt(card.getAttribute('data-slot'));
          openEditPinnedModal(slot);
        });
      });
    });
  }

  // --- Edit Pinned Card Modal Logic ---
  let editingPinnedSlot = 0;
  const editPinnedModal = document.getElementById('edit-pinned-modal');
  const pinnedDisplayName = document.getElementById('pinned-display-name');
  const pinnedSymbol = document.getElementById('pinned-symbol');
  const btnPinnedCancel = document.getElementById('btn-pinned-cancel');
  const btnPinnedSave = document.getElementById('btn-pinned-save');
  const btnPinnedRemove = document.getElementById('btn-pinned-remove');

  function openEditPinnedModal(slot) {
    editingPinnedSlot = slot;
    chrome.storage.local.get(['pinnedIndices'], (res) => {
      const pinned = Array.isArray(res.pinnedIndices) ? res.pinnedIndices : defaultPinnedIndices;
      const cur = pinned[slot] || { key: '', symbol: '' };
      pinnedDisplayName.value = cur.key || '';
      pinnedSymbol.value = cur.symbol || '';
      if (editPinnedModal) editPinnedModal.style.display = 'flex';
      // Show full indices list by default
      setTimeout(() => {
        showPinnedSuggestions(pinnedDisplayName.value || '');
        pinnedDisplayName.focus();
      }, 50);
    });
  }

  const presetMap = {
    'NIFTY 50': '^NSEI',
    'BANK NIFTY': '^NSEBANK',
    'SENSEX': '^BSESN',
    'NIFTY IT': '^CNXIT',
    'FIN NIFTY': 'NIFTY_FIN_SERVICE.NS',
    'NIFTY MIDCAP 50': '^NSEMDCP50',
    'NIFTY AUTO': '^CNXAUTO',
    'NIFTY ENERGY': '^CNXENERGY',
    'NIFTY FMCG': '^CNXFMCG',
    'NIFTY PHARMA': '^CNXPHARMA',
    'S&P 500': '^GSPC',
    'NASDAQ': '^IXIC',
    'DOW JONES': '^DJI',
    'RUSSELL 2000': '^RUT',
    'FTSE 100': '^FTSE',
    'NIKKEI 225': '^N225',
    'HANG SENG': '^HSI',
    'Singapore (STI)': '^STI',
    'GOLD Futures': 'GC=F',
    'SILVER Futures': 'SI=F',
    'CRUDE OIL': 'CL=F',
    'Bitcoin': 'BTC-USD',
    'Ethereum': 'ETH-USD',
    'NIFTY METAL': '^CNXMETAL',
    'NIFTY REALTY': '^CNXREALTY',
    'NIFTY PSU BANK': '^CNXPSUBANK',
    'NIFTY MEDIA': '^CNXMEDIA',
    'INDIA VIX': '^INDIAVIX',
    'VIX': '^VIX',
    'DAX': '^GDAXI',
    'CAC 40': '^FCHI',
    'ASX 200': '^AXJO',
    'USD/INR': 'INR=X',
    'EUR/USD': 'EURUSD=X',
    'GBP/USD': 'GBPUSD=X'
  };

  const pinnedNameSuggestions = document.getElementById('pinned-name-suggestions');

  function showPinnedSuggestions(query) {
    if (!pinnedNameSuggestions) return;
    const trimmed = (query || '').trim().toLowerCase();
    // Empty query => show full list by default
    const matches = trimmed.length === 0
      ? Object.entries(presetMap)
      : Object.entries(presetMap).filter(([name]) =>
          name.toLowerCase().includes(trimmed)
        );
    if (matches.length === 0) {
      pinnedNameSuggestions.style.display = 'none';
      return;
    }
    pinnedNameSuggestions.innerHTML = matches.map(([name, symbol]) => `
      <div class="screener-suggestion-item" data-name="${name}" data-symbol="${symbol}" style="display:flex; justify-content:space-between; align-items:center; width:100%; cursor:pointer;">
        <span style="font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:8px;">${name}</span>
        <span style="font-size:10px; padding:2px 6px; border-radius:4px; background:var(--verdict-bg, #f1f3f4); color:var(--text-color, #3c4043); border:1px solid var(--border-color, #dadce0); flex-shrink:0;">Index</span>
      </div>
    `).join('');
    pinnedNameSuggestions.style.display = 'block';

    pinnedNameSuggestions.querySelectorAll('.screener-suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        pinnedDisplayName.value = item.getAttribute('data-name');
        pinnedSymbol.value = item.getAttribute('data-symbol');
        pinnedNameSuggestions.style.display = 'none';
      });
    });
  }

  if (pinnedDisplayName) {
    pinnedDisplayName.addEventListener('input', () => {
      const val = pinnedDisplayName.value;
      if (presetMap[val]) {
        pinnedSymbol.value = presetMap[val];
        pinnedNameSuggestions.style.display = 'none';
      } else {
        showPinnedSuggestions(val);
      }
    });
    pinnedDisplayName.addEventListener('focus', () => {
      showPinnedSuggestions(pinnedDisplayName.value || '');
    });
  }

  const pinnedSymbolSuggestions = document.getElementById('pinned-symbol-suggestions');

  function showPinnedSymbolSuggestions(query) {
    if (!pinnedSymbolSuggestions) return;
    const trimmed = (query || '').trim().toLowerCase();
    const matches = trimmed.length === 0
      ? Object.entries(presetMap)
      : Object.entries(presetMap).filter(([name, sym]) =>
          sym.toLowerCase().includes(trimmed)
        );
    if (matches.length === 0) {
      pinnedSymbolSuggestions.style.display = 'none';
      return;
    }
    pinnedSymbolSuggestions.innerHTML = matches.map(([name, symbol]) => `
      <div class="screener-suggestion-item" data-name="${name}" data-symbol="${symbol}" style="display:flex; justify-content:space-between; align-items:center; width:100%; cursor:pointer;">
        <span style="font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:8px;">${symbol}</span>
        <span style="font-size:10px; padding:2px 6px; border-radius:4px; background:var(--verdict-bg, #f1f3f4); color:var(--text-color, #3c4043); border:1px solid var(--border-color, #dadce0); flex-shrink:0;">Index</span>
      </div>
    `).join('');
    pinnedSymbolSuggestions.style.display = 'block';

    pinnedSymbolSuggestions.querySelectorAll('.screener-suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        pinnedDisplayName.value = item.getAttribute('data-name');
        pinnedSymbol.value = item.getAttribute('data-symbol');
        pinnedSymbolSuggestions.style.display = 'none';
      });
    });
  }

  if (pinnedSymbol) {
    pinnedSymbol.addEventListener('input', () => {
      const val = pinnedSymbol.value;
      const nameMatch = Object.keys(presetMap).find(k => presetMap[k] === val);
      if (nameMatch) {
        pinnedDisplayName.value = nameMatch;
        pinnedSymbolSuggestions.style.display = 'none';
      } else {
        showPinnedSymbolSuggestions(val);
      }
    });
    pinnedSymbol.addEventListener('focus', () => {
      showPinnedSymbolSuggestions(pinnedSymbol.value || '');
    });
  }

  if (btnPinnedCancel && editPinnedModal) {
    btnPinnedCancel.addEventListener('click', () => {
      editPinnedModal.style.display = 'none';
      if (pinnedNameSuggestions) pinnedNameSuggestions.style.display = 'none';
    });
  }

  if (editPinnedModal) {
    editPinnedModal.addEventListener('click', (e) => {
      if (e.target === editPinnedModal) {
        editPinnedModal.style.display = 'none';
        if (pinnedNameSuggestions) pinnedNameSuggestions.style.display = 'none';
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (pinnedNameSuggestions && !pinnedNameSuggestions.contains(e.target) && e.target !== pinnedDisplayName) {
      pinnedNameSuggestions.style.display = 'none';
    }
  });

  if (btnPinnedRemove) {
    btnPinnedRemove.addEventListener('click', () => {
      chrome.storage.local.get(['pinnedIndices', 'marketIndices'], (res) => {
        let pinned = Array.isArray(res.pinnedIndices) ? [...res.pinnedIndices] : [...defaultPinnedIndices];
        const oldKey = pinned[editingPinnedSlot]?.key;
        
        pinned.splice(editingPinnedSlot, 1); // Remove the item
        
        const marketIndices = res.marketIndices || {};
        if (oldKey) {
          delete marketIndices[oldKey];
        }

        chrome.storage.local.set({ pinnedIndices: pinned, marketIndices }, () => {
          if (editPinnedModal) editPinnedModal.style.display = 'none';
          if (pinnedNameSuggestions) pinnedNameSuggestions.style.display = 'none';
          renderDefaultSearch();
          chrome.runtime.sendMessage({ type: 'POLL_NOW' });
        });
      });
    });
  }

  if (btnPinnedSave) {
    btnPinnedSave.addEventListener('click', () => {
      const name = pinnedDisplayName.value.trim();
      const sym = pinnedSymbol.value.trim();

      if (!name || !sym) {
        alert(t('needBoth'));
        return;
      }

      chrome.storage.local.get(['pinnedIndices', 'marketIndices'], (res) => {
        let pinned = Array.isArray(res.pinnedIndices) ? [...res.pinnedIndices] : [...defaultPinnedIndices];
        const oldKey = pinned[editingPinnedSlot]?.key;
        pinned[editingPinnedSlot] = { key: name, symbol: sym };
        
        const marketIndices = res.marketIndices || {};
        if (oldKey && oldKey !== name) {
          delete marketIndices[oldKey];
        }

        chrome.storage.local.set({ pinnedIndices: pinned, marketIndices }, () => {
          if (editPinnedModal) editPinnedModal.style.display = 'none';
          if (pinnedNameSuggestions) pinnedNameSuggestions.style.display = 'none';
          renderDefaultSearch();
          chrome.runtime.sendMessage({ type: 'POLL_NOW' });
        });
      });
    });
  }

  // --- Market Overview (Top Gainers / Losers per economy) ---
  const MARKET_ECONOMIES = {
    'USA': {
      curr: 'USD',
      indices: [
        { key: 'S&P 500', symbol: '^GSPC' },
        { key: 'NASDAQ', symbol: '^IXIC' },
        { key: 'DOW', symbol: '^DJI' },
        { key: 'RUSSELL 2000', symbol: '^RUT' }
      ],
      stocks: [
        { key: 'Apple', symbol: 'AAPL' },
        { key: 'Microsoft', symbol: 'MSFT' },
        { key: 'NVIDIA', symbol: 'NVDA' },
        { key: 'Tesla', symbol: 'TSLA' },
        { key: 'Amazon', symbol: 'AMZN' },
        { key: 'Meta', symbol: 'META' },
        { key: 'Alphabet', symbol: 'GOOGL' },
        { key: 'AMD', symbol: 'AMD' }
      ]
    },
    'India': {
      curr: 'INR',
      indices: [
        { key: 'NIFTY 50', symbol: '^NSEI' },
        { key: 'SENSEX', symbol: '^BSESN' },
        { key: 'BANK NIFTY', symbol: '^NSEBANK' },
        { key: 'NIFTY IT', symbol: '^CNXIT' }
      ],
      stocks: [
        { key: 'Reliance', symbol: 'RELIANCE.NS' },
        { key: 'TCS', symbol: 'TCS.NS' },
        { key: 'HDFC Bank', symbol: 'HDFCBANK.NS' },
        { key: 'Infosys', symbol: 'INFY.NS' },
        { key: 'ICICI Bank', symbol: 'ICICIBANK.NS' },
        { key: 'SBI', symbol: 'SBIN.NS' },
        { key: 'Tata Motors PV', symbol: 'TMPV.NS' },
        { key: 'Axis Bank', symbol: 'AXISBANK.NS' }
      ]
    },
    'UK': {
      curr: 'GBP',
      indices: [
        { key: 'FTSE 100', symbol: '^FTSE' },
        { key: 'FTSE 250', symbol: '^FTMC' }
      ],
      stocks: [
        { key: 'HSBC', symbol: 'HSBA.L' },
        { key: 'Shell', symbol: 'SHEL.L' },
        { key: 'AstraZeneca', symbol: 'AZN.L' },
        { key: 'BP', symbol: 'BP.L' },
        { key: 'Unilever', symbol: 'ULVR.L' },
        { key: 'Lloyds', symbol: 'LLOY.L' },
        { key: 'Barclays', symbol: 'BARC.L' },
        { key: 'Vodafone', symbol: 'VOD.L' }
      ]
    },
    'Singapore': {
      curr: 'SGD',
      indices: [
        { key: 'STI', symbol: '^STI' }
      ],
      stocks: [
        { key: 'DBS', symbol: 'D05.SI' },
        { key: 'OCBC', symbol: 'O39.SI' },
        { key: 'UOB', symbol: 'U11.SI' },
        { key: 'Singtel', symbol: 'Z74.SI' },
        { key: 'SIA', symbol: 'C6L.SI' },
        { key: 'Wilmar', symbol: 'F34.SI' },
        { key: 'Keppel', symbol: 'BN4.SI' },
        { key: 'CapLand IntCom', symbol: 'C38U.SI' }
      ]
    },
    'Japan': {
      curr: 'JPY',
      indices: [
        { key: 'NIKKEI 225', symbol: '^N225' }
      ],
      stocks: [
        { key: 'Toyota', symbol: '7203.T' },
        { key: 'Sony Group', symbol: '6758.T' },
        { key: 'SoftBank Group', symbol: '9984.T' },
        { key: 'Mitsubishi UFJ', symbol: '8306.T' },
        { key: 'Fast Retailing', symbol: '9983.T' },
        { key: 'NTT', symbol: '9432.T' }
      ]
    },
    'Hong Kong': {
      curr: 'HKD',
      indices: [
        { key: 'HANG SENG', symbol: '^HSI' }
      ],
      stocks: [
        { key: 'Tencent', symbol: '0700.HK' },
        { key: 'HSBC', symbol: '0005.HK' },
        { key: 'China Mobile', symbol: '0941.HK' },
        { key: 'AIA', symbol: '1299.HK' },
        { key: 'CCB', symbol: '0939.HK' },
        { key: 'Ping An', symbol: '2318.HK' },
        { key: 'Meituan', symbol: '3690.HK' },
        { key: 'Xiaomi', symbol: '1810.HK' }
      ]
    },
    'Germany': {
      curr: 'EUR',
      indices: [
        { key: 'DAX', symbol: '^GDAXI' }
      ],
      stocks: [
        { key: 'SAP', symbol: 'SAP.DE' },
        { key: 'Siemens', symbol: 'SIE.DE' },
        { key: 'Allianz', symbol: 'ALV.DE' },
        { key: 'Deutsche Telekom', symbol: 'DTE.DE' },
        { key: 'Mercedes-Benz', symbol: 'MBG.DE' },
        { key: 'BMW', symbol: 'BMW.DE' },
        { key: 'BASF', symbol: 'BAS.DE' },
        { key: 'Deutsche Bank', symbol: 'DBK.DE' }
      ]
    },
    'France': {
      curr: 'EUR',
      indices: [
        { key: 'CAC 40', symbol: '^FCHI' }
      ],
      stocks: [
        { key: 'LVMH', symbol: 'MC.PA' },
        { key: 'L\u2019Oreal', symbol: 'OR.PA' },
        { key: 'TotalEnergies', symbol: 'TTE.PA' },
        { key: 'Sanofi', symbol: 'SAN.PA' },
        { key: 'Airbus', symbol: 'AIR.PA' },
        { key: 'BNP Paribas', symbol: 'BNP.PA' }
      ]
    },
    'Australia': {
      curr: 'AUD',
      indices: [
        { key: 'ASX 200', symbol: '^AXJO' }
      ],
      stocks: [
        { key: 'CBA', symbol: 'CBA.AX' },
        { key: 'BHP', symbol: 'BHP.AX' },
        { key: 'CSL', symbol: 'CSL.AX' },
        { key: 'NAB', symbol: 'NAB.AX' },
        { key: 'Westpac', symbol: 'WBC.AX' },
        { key: 'ANZ', symbol: 'ANZ.AX' }
      ]
    },
    'Canada': {
      curr: 'CAD',
      indices: [
        { key: 'TSX Composite', symbol: '^GSPTSE' }
      ],
      stocks: [
        { key: 'RBC', symbol: 'RY.TO' },
        { key: 'TD Bank', symbol: 'TD.TO' },
        { key: 'Shopify', symbol: 'SHOP.TO' },
        { key: 'Enbridge', symbol: 'ENB.TO' },
        { key: 'Scotiabank', symbol: 'BNS.TO' },
        { key: 'BMO', symbol: 'BMO.TO' }
      ]
    }
  };

  let activeEconomy = 'USA';
  const overviewCache = {};
  const overviewUpdatedAt = {};
  const overviewContainer = document.getElementById('market-overview');

  function renderOverviewShell() {
    if (!overviewContainer) return;
    const options = Object.keys(MARKET_ECONOMIES).map(name => `
      <option value="${name}"${name === activeEconomy ? ' selected' : ''}>${name}</option>
    `).join('');
    overviewContainer.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:10px;">
        <span style="color:var(--label-color); font-size:13px; font-weight:500;">${t('overviewTitle')}</span>
        <button id="btn-overview-refresh" title="${t('refreshTitle')}" style="background:none; border:1px solid var(--border-color); border-radius:6px; color:var(--label-color); cursor:pointer; font-size:12px; padding:3px 9px;">${t('refreshBtn')}</button>
      </div>
      <div style="margin-bottom:10px;">
        <label style="display:block; font-size:11px; font-weight:500; color:var(--label-color); margin-bottom:4px;">${t('selectMarket')}</label>
        <select id="overview-economy-select" class="screener-input" style="width:100%; padding:8px 10px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-color); cursor:pointer;">${options}</select>
      </div>
      <div id="overview-body"><div class="screener-loading" style="padding:16px;">${t('loadingMarkets', activeEconomy)}</div></div>
      <div style="font-size:11px; font-weight:600; color:var(--label-color); margin:12px 0 6px 0; letter-spacing:0.03em;">${t('indicatorsTitle')}</div>
      <div id="macro-body" style="margin-bottom:10px;"><div class="screener-loading" style="padding:10px;">${t('loadingIndicators')}</div></div>
    `;
    const economySelect = document.getElementById('overview-economy-select');
    if (economySelect) {
      economySelect.addEventListener('change', () => {
        const eco = economySelect.value;
        if (eco && eco !== activeEconomy && MARKET_ECONOMIES[eco]) {
          activeEconomy = eco;
          chrome.storage.local.set({ overviewEconomy: eco });
          fetchMacroStats(eco);
          fetchOverview(eco);
        }
      });
    }
    const refreshBtn = document.getElementById('btn-overview-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
      fetchMacroStats(activeEconomy, true);
      fetchOverview(activeEconomy, true);
    });
  }

  // World Bank country codes per market
  const ECONOMY_WB_COUNTRY = { 'USA': 'USA', 'India': 'IND', 'UK': 'GBR', 'Singapore': 'SGP', 'Japan': 'JPN', 'Hong Kong': 'HKG', 'Germany': 'DEU', 'France': 'FRA', 'Australia': 'AUS', 'Canada': 'CAN' };
  // Indicator catalog (mirrors background MACRO_INDICATOR_DEFS labels)
  const MACRO_CATALOG = [
    { key: 'inflation', label: t('macroInflation') },
    { key: 'unemployment', label: t('macroUnemployment') },
    { key: 'gdp', label: t('macroGdp') },
    { key: 'gdppc', label: t('macroGdppc') },
    { key: 'gdptotal', label: t('macroGdptotal') },
    { key: 'trade', label: t('macroTrade') },
    { key: 'reserves', label: t('macroReserves') },
    { key: 'population', label: t('macroPopulation') },
  ];
  const DEFAULT_MACRO_TILES = ['inflation', 'unemployment', 'gdp', 'gdppc'];
  let macroTilesConfig = {};
  const macroCache = {};

  function activeMacroTiles() {
    const cfg = macroTilesConfig[activeEconomy];
    if (Array.isArray(cfg) && cfg.length === 4 && cfg.every(k => MACRO_CATALOG.some(c => c.key === k))) {
      return cfg;
    }
    return DEFAULT_MACRO_TILES;
  }

  function fetchMacroStats(economy, force) {
    const body = document.getElementById('macro-body');
    const country = ECONOMY_WB_COUNTRY[economy];
    if (!country) return;
    if (!force && macroCache[economy]) {
      renderMacroStats(macroCache[economy]);
      return;
    }
    if (body) body.innerHTML = '<div class="screener-loading" style="padding:10px;">' + t('loadingIndicators') + '</div>';
    chrome.runtime.sendMessage({ type: 'FETCH_MACRO_STATS', country }, (res) => {
      const stats = (res && res.stats) || {};
      macroCache[economy] = stats;
      if (economy === activeEconomy) renderMacroStats(stats);
    });
  }

  function renderMacroStats(stats) {
    const body = document.getElementById('macro-body');
    if (!body) return;
    const order = activeMacroTiles();
    const tiles = order
      .map((k, slot) => {
        const s = stats[k];
        const localCat = MACRO_CATALOG.find(c => c.key === k);
      const label = (localCat && localCat.label) || (s ? s.label : k);
        return `
          <div class="overview-heat-tile overview-macro-tile" data-slot="${slot}" title="${t('macroEditTitle', [label, s ? ` (${s.year})` : ''])}">
            <div class="overview-heat-name">${label}</div>
            <div class="overview-heat-price">${s ? s.value : '—'}</div>
            <div style="font-size:10px; color:var(--label-color);">${s ? t('latestLabel') : t('loadingWord')}</div>
          </div>`;
      }).join('');
    body.innerHTML = tiles
      ? `<div class="overview-heatmap">${tiles}</div>`
      : '<div style="font-size:12px; color:var(--label-color); padding:6px 0;">' + t('indicatorsDown') + '</div>';

    body.querySelectorAll('.overview-macro-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        openEditMacroModal(parseInt(tile.getAttribute('data-slot'), 10));
      });
    });
  }

  // --- Edit Macro Indicator Modal Logic ---
  let editingMacroSlot = 0;
  const editMacroModal = document.getElementById('edit-macro-modal');
  const macroIndicatorSelect = document.getElementById('macro-indicator-select');
  const editMacroSubtitle = document.getElementById('edit-macro-subtitle');
  const btnMacroWbLink = document.getElementById('btn-macro-wb-link');
  const btnMacroCancel = document.getElementById('btn-macro-cancel');
  const btnMacroSave = document.getElementById('btn-macro-save');

  function openEditMacroModal(slot) {
    editingMacroSlot = slot;
    const tiles = activeMacroTiles();
    const cur = tiles[slot] || DEFAULT_MACRO_TILES[slot];
    if (macroIndicatorSelect) {
      macroIndicatorSelect.innerHTML = MACRO_CATALOG.map(c => `
        <option value="${c.key}"${c.key === cur ? ' selected' : ''}>${c.label}</option>
      `).join('');
    }
    if (editMacroSubtitle) editMacroSubtitle.textContent = `${activeEconomy} • ${t('macroTileOf', String(slot + 1))}`;
    const stats = macroCache[activeEconomy] || {};
    const curStat = stats[cur];
    if (btnMacroWbLink) {
      if (curStat && curStat.link) {
        btnMacroWbLink.href = curStat.link;
        btnMacroWbLink.style.display = '';
      } else {
        btnMacroWbLink.style.display = 'none';
      }
    }
    if (editMacroModal) editMacroModal.style.display = 'flex';
  }

  function closeEditMacroModal() {
    if (editMacroModal) editMacroModal.style.display = 'none';
  }

  if (btnMacroCancel) btnMacroCancel.addEventListener('click', closeEditMacroModal);
  if (editMacroModal) {
    editMacroModal.addEventListener('click', (e) => {
      if (e.target === editMacroModal) closeEditMacroModal();
    });
  }

  if (btnMacroSave) {
    btnMacroSave.addEventListener('click', () => {
      const picked = macroIndicatorSelect ? macroIndicatorSelect.value : null;
      if (!picked) return;
      const tiles = [...activeMacroTiles()];
      // Swap if the picked indicator already occupies another tile
      const existingIdx = tiles.indexOf(picked);
      if (existingIdx >= 0 && existingIdx !== editingMacroSlot) {
        tiles[existingIdx] = tiles[editingMacroSlot];
      }
      tiles[editingMacroSlot] = picked;
      macroTilesConfig[activeEconomy] = tiles;
      chrome.storage.local.set({ macroTiles: macroTilesConfig }, () => {
        closeEditMacroModal();
        renderMacroStats(macroCache[activeEconomy] || {});
      });
    });
  }

  function fetchOverview(economy, force) {
    const body = document.getElementById('overview-body');
    const cfg = MARKET_ECONOMIES[economy];
    if (!cfg) return;
    if (!force && overviewCache[economy]) {
      renderOverviewBody(overviewCache[economy]);
      return;
    }
    if (body) body.innerHTML = `<div class="screener-loading" style="padding:16px;">Loading ${economy} markets...</div>`;
    const items = cfg.stocks.map(s => ({ ...s, kind: 'stock', curr: cfg.curr }));
    chrome.runtime.sendMessage({ type: 'FETCH_OVERVIEW', items }, (res) => {
      const quotes = (res && res.quotes) || [];
      if (quotes.length === 0) {
        if (body) body.innerHTML = '<div class="screener-error">' + t('marketDataError') + '</div>';
        return;
      }
      const byKey = {};
      quotes.forEach(q => { byKey[q.symbol] = q; });
      const data = {
        stocks: cfg.stocks.map(s => byKey[s.symbol] || { ...s, price: '-', changePct: '0.00%', pctNum: 0, changeDir: 'up' })
      };
      overviewCache[economy] = data;
      overviewUpdatedAt[economy] = Date.now();
      if (economy === activeEconomy) renderOverviewBody(data);
    });
  }

  function renderOverviewBody(data) {
    const body = document.getElementById('overview-body');
    if (!body) return;
    const updatedAt = overviewUpdatedAt[activeEconomy];
    const updatedStr = updatedAt ? new Date(updatedAt).toLocaleTimeString() : '';

    const gainers = [...data.stocks]
      .filter(q => (q.pctNum || 0) > 0)
      .sort((a, b) => (b.pctNum || 0) - (a.pctNum || 0))
      .slice(0, 4);
    const losers = [...data.stocks]
      .filter(q => (q.pctNum || 0) < 0)
      .sort((a, b) => (a.pctNum || 0) - (b.pctNum || 0))
      .slice(0, 4);

    const moverRow = (q) => {
      const up = q.changeDir === 'up';
      const pctColor = up ? '#188038' : '#d93025';
      const sign = up ? '\u25B2' : '\u25BC';
      return `
        <div class="overview-mover-row" data-symbol="${q.symbol}" title="${t('clickAnalyze', q.key)}">
          <div style="min-width:0; flex:1; margin-right:8px;">
            <div style="font-weight:500; font-size:13px; color:var(--text-color); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${q.key}</div>
            <div style="font-size:10px; color:var(--label-color);">${q.symbol}</div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div style="font-size:13px; font-weight:600; color:var(--text-color);">${q.price}</div>
            <div style="font-size:11px; font-weight:600; color:${pctColor};">${sign} ${q.changePct}</div>
          </div>
        </div>`;
    };

    body.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <div>
          <div style="font-size:11px; font-weight:600; color:#188038; margin-bottom:6px; letter-spacing:0.03em;">${t('gainersTitle')}</div>
          <div class="overview-movers">${gainers.length ? gainers.map(moverRow).join('') : '<div style="padding:10px; font-size:12px; color:var(--label-color);">' + t('noGainers') + '</div>'}</div>
        </div>
        <div>
          <div style="font-size:11px; font-weight:600; color:#d93025; margin-bottom:6px; letter-spacing:0.03em;">${t('losersTitle')}</div>
          <div class="overview-movers">${losers.length ? losers.map(moverRow).join('') : '<div style="padding:10px; font-size:12px; color:var(--label-color);">' + t('noLosers') + '</div>'}</div>
        </div>
      </div>
      ${updatedStr ? `<div style="font-size:10px; color:var(--label-color); text-align:right; margin-top:8px;">${t('updatedAt', updatedStr)}</div>` : ''}
    `;

    body.querySelectorAll('.overview-mover-row').forEach(el => {
      el.addEventListener('click', () => {
        const sym = el.getAttribute('data-symbol');
        if (sym && inputSearch && btnSearch) {
          if (typeof switchTab === 'function' && tabSearch && viewSearch) switchTab(tabSearch, viewSearch);
          inputSearch.value = sym;
          btnSearch.click();
        }
      });
    });
  }

  function initMarketOverview() {
    chrome.storage.local.get(['overviewEconomy', 'macroTiles'], (res) => {
      if (res.overviewEconomy && MARKET_ECONOMIES[res.overviewEconomy]) {
        activeEconomy = res.overviewEconomy;
      }
      if (res.macroTiles && typeof res.macroTiles === 'object') {
        macroTilesConfig = res.macroTiles;
      }
      renderOverviewShell();
      fetchMacroStats(activeEconomy);
      fetchOverview(activeEconomy);
    });
  }

  // --- News thumbnails ---
  // Google News RSS carries no article images, so each row shows the
  // publisher's favicon (via Google's favicon service) over a
  // source-initial fallback tile. The <source url="..."> attribute holds
  // the publisher's real domain (item <link> always points at news.google.com).
  function newsSourceHost(item) {
    try {
      const srcUrl = item.querySelector('source')?.getAttribute('url') || '';
      const host = srcUrl ? new URL(srcUrl).hostname : '';
      return host || '';
    } catch (e) {
      return '';
    }
  }
  function newsThumbHtml(item, source) {
    const host = newsSourceHost(item);
    const name = (source || '').trim();
    const initial = /^[A-Za-z0-9]/.test(name) ? name.charAt(0).toUpperCase() : '•';
    const img = host
      ? `<img class="news-thumb" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64" alt="" loading="lazy" style="position:absolute; inset:0; width:100%; height:100%; object-fit:contain; background:#fff; border-radius:8px;" />`
      : '';
    return `<div style="position:relative; flex:0 0 36px; width:36px; height:36px; border-radius:8px; background:var(--border-color, #e8eaed); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:15px; color:var(--label-color); overflow:hidden;"><span>${initial}</span>${img}</div>`;
  }
  // Broken favicons are removed (capture phase: img errors don't bubble).
  // Inline onerror is avoided — MV3 extension pages block inline handlers.
  newsContainer.addEventListener('error', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('news-thumb')) {
      e.target.remove();
    }
  }, true);

  // --- News Render ---
  function renderNews() {
    chrome.storage.local.get(['portfolios'], async (res) => {
      const list = (res.portfolios || {})[activePortfolio] || [];
      if (list.length === 0) {
        newsContainer.innerHTML = '<div class="screener-loading" style="text-align:center; padding:20px;">' + t('fetchingMacroNews') + '</div>';
        try {
          const feedRes = await fetch(`https://news.google.com/rss/search?q=US+Economy+OR+Federal+Reserve+OR+S%26P+500&hl=en-US&gl=US&ceid=US:en`);
          const text = await feedRes.text();
          const parser = new DOMParser();
          const xml = parser.parseFromString(text, 'text/xml');
          const items = Array.from(xml.querySelectorAll('item')).slice(0, 6);
          
          if (items.length > 0) {
            let allNewsHtml = `<div style="font-size:12px; font-weight:bold; color:var(--accent-color, #1a73e8); margin-top:12px; margin-bottom:4px; padding:0 12px;">${t('macroNewsTitle')}</div>`;
            items.forEach(item => {
              const title = item.querySelector('title')?.textContent || '';
              const link = item.querySelector('link')?.textContent || '';
              const pubDate = item.querySelector('pubDate')?.textContent || '';
              const source = item.querySelector('source')?.textContent || t('newsSourceDefault');
              const dateStr = pubDate ? new Date(pubDate).toLocaleDateString() : '';
              const thumb = newsThumbHtml(item, source);

              allNewsHtml += `
                <div style="padding: 12px; border-bottom: 1px solid var(--border-color); display:flex; gap:10px; align-items:flex-start;">
                  ${thumb}
                  <div style="min-width:0; flex:1;">
                    <a href="${link}" target="_blank" style="color:var(--text-color); text-decoration:none; font-size:14px; display:block; margin-bottom:4px;">${title}</a>
                    <div style="font-size:11px; color:var(--label-color);">${source} &bull; ${dateStr}</div>
                  </div>
                </div>
              `;
            });
            newsContainer.innerHTML = allNewsHtml;
            return;
          }
        } catch (e) {
          console.error('US Macro News error', e);
        }
        newsContainer.innerHTML = '<div style="text-align:center;color:var(--label-color);padding:20px;">' + t('noPortfolioNews') + '</div>';
        return;
      }
      
      newsContainer.innerHTML = '<div class="screener-loading" style="text-align:center; padding:20px;">' + t('fetchingNews') + '</div>';
      
      let allNewsHtml = '';
      const results = await Promise.all(list.map(async (ticker) => {
          try {
            const feedRes = await fetch(`https://news.google.com/rss/search?q=${ticker}+stock&hl=en-IN&gl=IN&ceid=IN:en`);
            const text = await feedRes.text();
            const parser = new DOMParser();
            const xml = parser.parseFromString(text, 'text/xml');
            const items = Array.from(xml.querySelectorAll('item')).slice(0, 2);
            let html = '';
            
            if (items.length > 0) {
              html += `<div style="font-size:12px; font-weight:bold; color:var(--accent-color, #1a73e8); margin-top:12px; margin-bottom:4px; padding:0 12px;">${t('tickerNewsTitle', ticker)}</div>`;
              items.forEach(item => {
                const title = item.querySelector('title')?.textContent || '';
                const link = item.querySelector('link')?.textContent || '';
                const pubDate = item.querySelector('pubDate')?.textContent || '';
                const source = item.querySelector('source')?.textContent || t('newsSourceDefault');
                const dateStr = pubDate ? new Date(pubDate).toLocaleDateString() : '';
                const thumb = newsThumbHtml(item, source);

                html += `
                  <div style="padding: 12px; border-bottom: 1px solid var(--border-color); display:flex; gap:10px; align-items:flex-start;">
                    ${thumb}
                    <div style="min-width:0; flex:1;">
                      <a href="${link}" target="_blank" style="color:var(--text-color); text-decoration:none; font-size:14px; display:block; margin-bottom:4px;">${title}</a>
                      <div style="font-size:11px; color:var(--label-color);">${source} &bull; ${dateStr}</div>
                    </div>
                  </div>
                `;
              });
            }
            return html;
          } catch (e) {
            console.error('News error for', ticker, e);
            return '';
          }
      }));
      allNewsHtml = results.join('');
      
      if (allNewsHtml === '') {
        newsContainer.innerHTML = '<div style="text-align:center;color:#6c757d;padding:20px;">' + t('noRecentNews') + '</div>';
      } else {
        newsContainer.innerHTML = allNewsHtml;
      }
    });
  }




  // Listen for background updates
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'WATCHLIST_UPDATED') {
       if (tabSearch.classList.contains('active')) {
         renderWatchlist();
         if (!inputSearch.value.trim() && resultsSearch.querySelector('#market-indices-container')) {
           renderDefaultSearch();
         }
       }
    }
  });

  // --- Autocomplete Logic with Keyboard Navigation ---
  let debounceTimer;
  let activeIndex = -1;

  function highlightItem(container, index) {
    const items = container.querySelectorAll('.screener-suggestion-item');
    items.forEach((el, i) => {
      el.style.backgroundColor = i === index ? '#e8eaed' : '';
      if (document.body.classList.contains('dark-mode')) {
        el.style.backgroundColor = i === index ? '#3c4043' : '';
      }
    });
  }

  async function handleInput(e, suggestionsContainer, inputElement, actionBtn) {
    clearTimeout(debounceTimer);
    activeIndex = -1;
    const query = inputElement.value.trim();
    if (query.length < 2) {
      suggestionsContainer.style.display = 'none';
      if (query.length === 0 && inputElement === inputSearch) {
        renderDefaultSearch();
      }
      return;
    }
      debounceTimer = setTimeout(async () => {
        try {
          const results = await new Promise(resolve => {
            chrome.runtime.sendMessage({ type: 'SEARCH_COMPANY', query: query }, resolve);
          });
          if (results && results.length > 0) {
          suggestionsContainer.innerHTML = '';
          results.forEach(item => {
            const div = document.createElement('div');
            div.className = 'screener-suggestion-item';
            const itemType = localizeSuggestionType(item);
            div.innerHTML = `
              <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                <span style="font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:8px;">${item.name}</span>
                <span style="font-size:10px; padding:2px 6px; border-radius:4px; background:var(--verdict-bg, #f1f3f4); color:var(--text-color, #3c4043); border:1px solid var(--border-color, #dadce0); flex-shrink:0;">${itemType}</span>
              </div>
            `;
            div.dataset.ticker = item.ticker || (item.url ? item.url.split('/')[2] : item.name);
            div.onclick = () => {
              inputElement.value = div.dataset.ticker;
              suggestionsContainer.style.display = 'none';
              activeIndex = -1;
              if (actionBtn) actionBtn.click();
            };
            suggestionsContainer.appendChild(div);
          });
          suggestionsContainer.style.display = 'block';
        }
      } catch (err) {}
    }, 300);
  }

  function handleKeydown(e, suggestionsContainer, inputElement, actionBtn) {
    const items = suggestionsContainer.querySelectorAll('.screener-suggestion-item');
    if (!items.length || suggestionsContainer.style.display === 'none') return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      highlightItem(suggestionsContainer, activeIndex);
      items[activeIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      highlightItem(suggestionsContainer, activeIndex);
      items[activeIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < items.length) {
        items[activeIndex].click();
      } else if (items.length > 0) {
        items[0].click();
      }
    } else if (e.key === 'Escape') {
      suggestionsContainer.style.display = 'none';
      activeIndex = -1;
    }
  }

  inputSearch.addEventListener('input', (e) => handleInput(e, searchSuggestions, inputSearch, btnSearch));
  inputSearch.addEventListener('keydown', (e) => handleKeydown(e, searchSuggestions, inputSearch, btnSearch));

  // WL search logic removed

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.screener-search-container')) {
      if (searchSuggestions) searchSuggestions.style.display = 'none';
      if (wlSuggestions) wlSuggestions.style.display = 'none';
      activeIndex = -1;
    }
  });

});



// --- Sparklines SVG Builder ---
async function buildSparkline(ticker) {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.NS?range=1y&interval=1d`);
    const data = await res.json();
    const prices = data.chart.result[0].indicators.quote[0].close.filter(p => p !== null);
    if (prices.length < 2) return '';

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    
    const width = 60;
    const height = 20;
    
    const points = prices.map((p, i) => {
      const x = (i / (prices.length - 1)) * width;
      const y = height - ((p - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');

    const isUp = prices[prices.length - 1] >= prices[0];
    const color = isUp ? '#188038' : '#d93025';

    return `<svg width="${width}" height="${height}" style="margin-top:4px;"><polyline fill="none" stroke="${color}" stroke-width="1.5" points="${points}"/></svg>`;
  } catch(e) {
    return '';
  }
}
// Keep background worker alive and trigger ultra-fast price polling
setInterval(() => {
  try {
    chrome.runtime.sendMessage({ type: 'PING' }, () => {
      if (chrome.runtime.lastError) { /* ignore */ }
    });
  } catch(e) {}
}, 1000);






