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
    if (ty === 'Crypto') return t('typeCrypto') || 'Crypto';
    if (ty === 'Forex') return t('typeForex') || 'Forex';
    if (ty === 'Commodity') return t('typeCommodity') || 'Commodity';
    if (ty === 'Stock') return t('typeDefault');
    if (ty.endsWith(' Stock')) return t('typeExchangeStock', ty.slice(0, -6));
    return ty;
  }
  // Mirror of background classifyAsset() for cached entries saved before
  // assetKind existed (pattern-only, no quote meta available here)
  function inferAssetKind(ticker, data) {
    if (data && data.assetKind) return data.assetKind;
    const k = classifyTickerPattern(ticker);
    if (k !== 'stock') return k;
    if (data && data.isIndex) return 'index';
    return 'stock';
  }
  function classifyTickerPattern(ticker) {
    const t = String(ticker || '').toUpperCase();
    if (t.startsWith('^')) return 'index';
    if (/-USD[TC]?$/.test(t)) return 'crypto';
    if (/=X$/.test(t)) return 'forex';
    if (/=F$/.test(t)) return 'commodity';
    return 'stock';
  }
  function verdictForKind(kind) {
    if (kind === 'crypto') return t('verdictCrypto');
    if (kind === 'forex') return t('verdictForex');
    if (kind === 'commodity') return t('verdictCommodity');
    return '';
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
  const tagFilterSelect = document.getElementById('tag-filter');
  const btnNewPortfolio = document.getElementById('btn-new-portfolio');
  const btnExportCsv = document.getElementById('btn-export-csv');
  const newsContainer = document.getElementById('news-container');
  const extensionVersion = document.getElementById('extension-version');

  let activePortfolio = 'Sample';
  let cachedMacroItems = null;
  let cachedWatchlistHtml = null;
  let cachedNewsTime = 0;
  let currentNewsFilter = 'all';

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
  function mcapPrefixForCode(code) {
    if (!code) return '';
    const c = String(code).trim();
    if (!/^[A-Za-z]{3}$/.test(c)) return c; // already a symbol (₹, $, S$...)
    switch (c.toUpperCase()) {
      case 'INR': return '₹';
      case 'USD': return '$';
      case 'GBP': return '£';
      case 'EUR': return '€';
      case 'JPY': return '¥';
      case 'SGD': return 'S$';
      case 'HKD': return 'HK$';
      case 'AUD': return 'A$';
      case 'CAD': return 'C$';
      default: return c + ' ';
    }
  }
  // Prefix Market Cap with currency (₹, $, £...) when the stored value lacks one.
  // Handles legacy cache entries saved before the prefix was stored at source.
  function formatMcapCell(raw, data) {
    const formatted = formatMarketCap(raw == null ? '-' : raw);
    if (formatted === '-' || formatted == null) return formatted;
    if (/^[^\d\-+.,\s]+/.test(String(formatted))) return formatted; // already prefixed
    let prefix = '';
    if (data) {
      if (data.currency) prefix = mcapPrefixForCode(data.currency);
      if (!prefix) {
        const m = String((data.ratios || {})['Current Price'] || '').match(/^[^\d\-+.,\s]+/);
        if (m) prefix = m[0];
      }
      if (!prefix && data.source === 'screener') prefix = '₹';
    }
    return prefix ? prefix + formatted : formatted;
  }
  // Tab Switching Logic
  function switchTab(activeTab, activeView) {
    const wasActive = activeTab.classList.contains('active');
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
    if (activeTab === tabNews) renderNews(wasActive);
  }

  tabSearch.addEventListener('click', () => switchTab(tabSearch, viewSearch));
  if (tabMarkets) tabMarkets.addEventListener('click', () => switchTab(tabMarkets, viewMarkets));
  tabNews.addEventListener('click', () => switchTab(tabNews, viewNews));

  // --- Your Alerts view (header bell) ---
  const btnAlerts = document.getElementById('btn-alerts');
  const viewAlerts = document.getElementById('view-alerts');
  const alertsList = document.getElementById('alerts-list');
  const alertsEmpty = document.getElementById('alerts-empty');
  const alertsBadge = document.getElementById('alerts-badge');
  const alertsBack = document.getElementById('alerts-back');
  const tabsBar = document.querySelector('.screener-tabs');
  function openAlertsView() {
    [tabSearch, tabMarkets, tabNews].forEach(t => t && t.classList.remove('active'));
    [viewSearch, viewMarkets, viewNews].forEach(v => v && v.classList.remove('active'));
    if (tabsBar) tabsBar.style.display = 'none';
    if (viewAlerts) viewAlerts.classList.add('active');
    renderAlertsList();
  }
  function closeAlertsView() {
    if (viewAlerts) viewAlerts.classList.remove('active');
    if (tabsBar) tabsBar.style.display = '';
    switchTab(tabSearch, viewSearch);
  }
  if (btnAlerts) btnAlerts.addEventListener('click', openAlertsView);
  if (alertsBack) alertsBack.addEventListener('click', (e) => { e.preventDefault(); closeAlertsView(); });
  function countActiveAlerts(alerts) {
    return Object.values(alerts || {}).filter(a => a && (a.above || a.below || a.movePct || a.high52 || a.low52)).length;
  }
  function refreshAlertsBadge() {
    try {
      chrome.storage.local.get(['alerts'], (res) => {
        const n = countActiveAlerts(res.alerts);
        if (alertsBadge) {
          alertsBadge.style.display = n ? '' : 'none';
          alertsBadge.textContent = n > 99 ? '99+' : String(n);
        }
      });
    } catch (e) {}
  }
  function renderAlertsList() {
    if (!alertsList || !alertsEmpty) return;
    try {
      chrome.storage.local.get(['alerts', 'cachedData'], (res) => {
        const alerts = res.alerts || {};
        const cached = res.cachedData || {};
        const tickers = Object.keys(alerts).filter(k => alerts[k] && (alerts[k].above || alerts[k].below || alerts[k].movePct || alerts[k].high52 || alerts[k].low52));
        if (!tickers.length) {
          alertsList.innerHTML = '';
          alertsEmpty.style.display = '';
          return;
        }
        alertsEmpty.style.display = 'none';
        alertsList.innerHTML = tickers.map((ticker) => {
          const a = alerts[ticker] || {};
          const d = cached[ticker] || {};
          let prefix = '';
          try { if (d.currency) prefix = mcapPrefixForCode(d.currency) || ''; } catch (e) {}
          prefix = prefix || (ticker.includes('.NS') || ticker.includes('.BO') ? '₹' : '$');
          const parts = [];
          if (a.above) parts.push((t('alertsAbove') || 'Above') + ' ' + prefix + a.above);
          if (a.below) parts.push((t('alertsBelow') || 'Below') + ' ' + prefix + a.below);
          if (a.movePct) parts.push('±' + a.movePct + '%');
          if (a.high52) parts.push('52W High');
          if (a.low52) parts.push('52W Low');
          if (a.repeat) parts.push('↻ Repeat');
          if (a.expiresAt) {
            const left = Math.ceil((a.expiresAt - Date.now()) / 86400000);
            if (left > 0) parts.push(left + 'd left');
          }
          if (a.note) parts.push('"' + a.note + '"');
          return '<div style="display:flex; align-items:center; gap:8px; padding:10px 2px; border-bottom:1px solid var(--border-color);">'
            + '<button class="screener-alert-edit" data-ticker="' + escHtml(ticker) + '" title="' + escHtml(t('setAlertTitle') || 'Set Alert') + '" style="background:none; border:none; cursor:pointer; font-size:13px; font-weight:700; color:var(--link-green); padding:0;">' + escHtml(ticker) + '</button>'
            + '<span style="flex:1; font-size:12px; color:var(--label-color);">' + escHtml(parts.join(' · ')) + '</span>'
            + '<button class="screener-alert-del" data-ticker="' + escHtml(ticker) + '" title="' + escHtml(t('alertsDelete') || 'Delete alert') + '" style="background:none; border:none; cursor:pointer; font-size:13px; color:var(--label-color); padding:2px 6px;">&#10005;</button>'
            + '</div>';
        }).join('');
        alertsList.querySelectorAll('.screener-alert-del').forEach(b => b.onclick = () => {
          const tk = b.getAttribute('data-ticker');
          chrome.storage.local.get(['alerts'], (r2) => {
            const al = r2.alerts || {};
            delete al[tk];
            chrome.storage.local.set({ alerts: al }, () => {
              renderAlertsList();
              refreshAlertsBadge();
              try { renderWatchlist(); } catch (e) {}
            });
          });
        });
        alertsList.querySelectorAll('.screener-alert-edit').forEach(b => b.onclick = () => {
          if (typeof window.openAlertModal === 'function') window.openAlertModal(b.getAttribute('data-ticker'));
        });
      });
    } catch (e) {}
  }
  refreshAlertsBadge();
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.alerts) {
          refreshAlertsBadge();
          if (viewAlerts && viewAlerts.classList.contains('active')) renderAlertsList();
        }
        if (changes.portfolios || changes.screenerWatchlist) {
          cachedWatchlistHtml = null;
          cachedNewsTime = 0;
          if (viewNews && viewNews.classList.contains('active')) renderNews(true);
        }
        if (changes.overviewEconomy) {
          cachedMacroItems = null;
          cachedNewsTime = 0;
          if (viewNews && viewNews.classList.contains('active')) renderNews(true);
        }
      }
    });
  } catch (e) {}
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
      // Single theme control: the header toggle also drives the ticker tape
      try { persistTapeSetting({ tapeTheme: nextTheme }); } catch (e) {}
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
      if (settingsTheme) settingsTheme.value = (res.tapeTheme === 'blue' ? 'dark' : (res.tapeTheme || TAPE_SETTING_DEFAULTS.tapeTheme));
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

  // In-panel Feedback Modal (posts to the inbox via FormSubmit, mailto fallback)
  const feedbackModal = document.getElementById('feedback-modal');
  const footerFeedback = document.getElementById('footer-feedback');
  const btnFeedbackCancel = document.getElementById('btn-feedback-cancel');
  const btnFeedbackSend = document.getElementById('btn-feedback-send');
  const inputFeedbackName = document.getElementById('feedback-name');
  const inputFeedbackEmail = document.getElementById('feedback-email');
  const inputFeedbackMsg = document.getElementById('feedback-message');
  const feedbackStatus = document.getElementById('feedback-status');
  const inputFeedbackAttach = document.getElementById('feedback-attach');
  const feedbackAttachPreview = document.getElementById('feedback-attach-preview');
  const btnFeedbackAttachClear = document.getElementById('feedback-attach-clear');
  let feedbackAttachment = null;
  function clearAttachment() {
    feedbackAttachment = null;
    if (inputFeedbackAttach) inputFeedbackAttach.value = '';
    if (feedbackAttachPreview) {
      try { if (feedbackAttachPreview.src) URL.revokeObjectURL(feedbackAttachPreview.src); } catch (e) {}
      feedbackAttachPreview.removeAttribute('src');
      feedbackAttachPreview.style.display = 'none';
    }
    if (btnFeedbackAttachClear) btnFeedbackAttachClear.style.display = 'none';
  }
  if (inputFeedbackAttach) inputFeedbackAttach.addEventListener('change', () => {
    const f = inputFeedbackAttach.files && inputFeedbackAttach.files[0];
    if (!f || !/^image\//.test(f.type || '')) { clearAttachment(); return; }
    if (f.size > 5 * 1024 * 1024) {
      if (feedbackStatus) feedbackStatus.textContent = t('feedbackAttachBig') || 'Image must be smaller than 5 MB.';
      clearAttachment();
      return;
    }
    clearAttachment();
    feedbackAttachment = f;
    if (feedbackAttachPreview) {
      feedbackAttachPreview.src = URL.createObjectURL(f);
      feedbackAttachPreview.style.display = 'block';
    }
    if (btnFeedbackAttachClear) btnFeedbackAttachClear.style.display = '';
  });
  if (btnFeedbackAttachClear) btnFeedbackAttachClear.addEventListener('click', clearAttachment);

  function openFeedbackModal() {
    if (feedbackStatus) feedbackStatus.textContent = '';
    if (feedbackModal) feedbackModal.style.display = 'flex';
    setTimeout(() => { try { inputFeedbackMsg.focus(); } catch (e) {} }, 50);
  }
  function closeFeedbackModal() {
    if (feedbackModal) feedbackModal.style.display = 'none';
  }

  if (footerFeedback) {
    footerFeedback.addEventListener('click', (e) => {
      e.preventDefault();
      openFeedbackModal();
    });
  }
  if (btnFeedbackCancel) btnFeedbackCancel.addEventListener('click', closeFeedbackModal);
  if (feedbackModal) {
    feedbackModal.addEventListener('click', (e) => {
      if (e.target === feedbackModal) closeFeedbackModal();
    });
  }
  if (btnFeedbackSend) {
    btnFeedbackSend.addEventListener('click', async () => {
      const name = (inputFeedbackName.value || '').trim();
      const email = (inputFeedbackEmail.value || '').trim();
      const message = (inputFeedbackMsg.value || '').trim();
      if (!message) {
        if (feedbackStatus) feedbackStatus.textContent = t('feedbackNeedMsg') || 'Please write a message first.';
        return;
      }
      btnFeedbackSend.disabled = true;
      if (feedbackStatus) feedbackStatus.textContent = t('feedbackSending') || 'Sending…';
      try {
        const data = new FormData();
        data.append('name', name);
        data.append('email', email);
        data.append('message', message + '\n\n[source: in-panel]');
        data.append('_subject', 'Ticker Screener feedback');
        data.append('_template', 'table');
        data.append('_captcha', 'false');
        if (feedbackAttachment) data.append('attachment', feedbackAttachment, feedbackAttachment.name || 'screenshot.png');
        const r = await fetch('https://formsubmit.co/ajax/vishwaroopg8@gmail.com', {
          method: 'POST',
          headers: { 'Accept': 'application/json' },
          body: data
        });
        if (!r.ok) throw new Error('send failed');
        inputFeedbackMsg.value = '';
        clearAttachment();
        if (feedbackStatus) feedbackStatus.textContent = t('feedbackSent') || 'Thanks — we read every message.';
        setTimeout(closeFeedbackModal, 1800);
      } catch (err) {
        const mailto = 'mailto:vishwaroopg8@gmail.com?subject='
          + encodeURIComponent('Ticker Screener feedback')
          + '&body=' + encodeURIComponent((name ? 'Name: ' + name + '\n' : '')
            + (email ? 'Email: ' + email + '\n' : '') + '\n' + message);
        if (feedbackStatus) feedbackStatus.innerHTML = (t('feedbackFailed') || 'Automatic send failed.')
          + ' <a href="' + mailto + '" style="color:var(--link-color,#1a73e8);">'
          + (t('feedbackEmailInstead') || 'Send via your email app instead') + '</a>.';
      } finally {
        btnFeedbackSend.disabled = false;
      }
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

  if (tagFilterSelect) tagFilterSelect.addEventListener('change', (e) => {
    activeTagFilter = e.target.value;
    renderWatchlist();
  });

  const bulkToggle = document.getElementById('btn-bulk-select');
  if (bulkToggle) bulkToggle.addEventListener('click', () => {
    if (bulkMode) exitBulkMode(); else enterBulkMode();
  });
  // Delete key removes checked stocks while in bulk mode (not while typing).
  document.addEventListener('keydown', (e) => {
    if (!bulkMode || bulkSelected.size === 0) return;
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    e.preventDefault();
    bulkDelete();
  });

  // --- Smart Focus UI: filter button + rules popover ---
  // focusOnly is session state (resets when the panel reloads); rule
  // on/off + thresholds persist in storage `smartFocus`.
  let focusOnly = false;
  function paintFocusToggle() {
    const btn = document.getElementById('btn-focus-filter');
    if (!btn) return;
    btn.textContent = (t('sfFilter') || 'Focus') + (focusOnly ? ' ✓' : '');
    btn.style.background = focusOnly ? '#1a73e8' : '';
    btn.style.color = focusOnly ? '#fff' : '';
  }
  function closeFocusPopover() {
    const m = document.getElementById('focus-popover');
    if (m) m.remove();
    document.removeEventListener('click', closeFocusPopoverOutside);
  }
  function closeFocusPopoverOutside(e) {
    const m = document.getElementById('focus-popover');
    if (m && !m.contains(e.target)) closeFocusPopover();
  }
  function openFocusPopover(anchor) {
    closeFocusPopover();
    chrome.storage.local.get(['smartFocus'], (res) => {
      const p = Object.assign({ big: true, swing: true, near: true, bigMovePct: 5, swingX: 2.5, nearPct: 2 }, res.smartFocus || {});
      const numStyle = 'margin-left:auto; width:58px; padding:3px 6px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-color); font-size:12px;';
      const ruleRow = (key, label, numKey, numVal, suffix) => `<label style="display:flex; align-items:center; gap:8px; padding:7px 4px; cursor:pointer; color:var(--text-color);"><input type="checkbox" data-sf="${key}"${p[key] ? ' checked' : ''} style="accent-color:#1a73e8;">${label}<input type="number" data-sf-num="${numKey}" value="${numVal}" min="0" step="0.5" title="${label}" style="${numStyle}">${suffix}</label>`;
      const pop = document.createElement('div');
      pop.id = 'focus-popover';
      pop.style.cssText = 'position:fixed; z-index:9999; width:238px; padding:10px 12px; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-color); box-shadow:0 10px 30px rgba(0,0,0,.3); font-size:12px;';
      pop.innerHTML = `<div style="font-weight:700; margin-bottom:4px; color:var(--text-color);">${t('sfTitle') || 'Smart Focus'}</div>`
        + ruleRow('big', t('sfBigMove') || 'Big price move', 'bigMovePct', p.bigMovePct, '%')
        + ruleRow('swing', t('sfSwing') || 'Unusual swing', 'swingX', p.swingX, '×')
        + ruleRow('near', t('sfNear') || '52-week high/low', 'nearPct', p.nearPct, '%');
      document.body.appendChild(pop);
      try {
        const r = anchor.getBoundingClientRect();
        pop.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 250)) + 'px';
        pop.style.top = Math.min(r.bottom + 4, window.innerHeight - 220) + 'px';
      } catch (e) {}
      const save = () => {
        const np = {
          big: pop.querySelector('[data-sf="big"]').checked,
          swing: pop.querySelector('[data-sf="swing"]').checked,
          near: pop.querySelector('[data-sf="near"]').checked,
          bigMovePct: parseFloat(pop.querySelector('[data-sf-num="bigMovePct"]').value) || 5,
          swingX: parseFloat(pop.querySelector('[data-sf-num="swingX"]').value) || 2.5,
          nearPct: parseFloat(pop.querySelector('[data-sf-num="nearPct"]').value) || 2
        };
        chrome.storage.local.set({ smartFocus: np }, () => renderWatchlist());
      };
      pop.querySelectorAll('input').forEach((i) => i.addEventListener('change', save));
      setTimeout(() => document.addEventListener('click', closeFocusPopoverOutside), 0);
    });
  }
  const focusBtn = document.createElement('button');
  focusBtn.id = 'btn-focus-filter';
  focusBtn.className = 'screener-btn';
  focusBtn.textContent = t('sfFilter') || 'Focus';
  focusBtn.title = t('sfFilterTitle') || 'Show only Smart Focus highlights';
  focusBtn.style.cssText = 'margin-right:8px; padding:8px 12px; border-radius:16px; font-size:12px; flex-shrink:0; line-height:1;';
  const focusGear = document.createElement('button');
  focusGear.id = 'btn-focus-settings';
  focusGear.className = 'screener-btn';
  focusGear.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>';
  focusGear.title = t('sfTitle') || 'Smart Focus settings';
  focusGear.style.cssText = 'margin-right:8px; width:32px; height:32px; padding:0; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:14px;';
  if (btnExportCsv && btnExportCsv.parentNode) {
    btnExportCsv.parentNode.insertBefore(focusBtn, btnExportCsv);
    btnExportCsv.parentNode.insertBefore(focusGear, btnExportCsv);
  }
  focusBtn.addEventListener('click', () => { focusOnly = !focusOnly; paintFocusToggle(); renderWatchlist(); });
  focusGear.addEventListener('click', (e) => { e.stopPropagation(); openFocusPopover(focusGear); });

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
    
    chrome.storage.local.get(['portfolios', 'cachedData', 'colorTags'], (res) => {
      const list = (res.portfolios || {})[activePortfolio] || [];
      const data = res.cachedData || {};
      const tags = res.colorTags || {};
      
      let csv = "Ticker,Company,Current Price,P/E,Market Cap,ROCE,Tag\n";
      for (const ticker of list) {
        const d = data[ticker];
        if (d && d.success) {
          csv += `"${ticker}","${d.companyName}","${d.ratios['Current Price']||''}","${d.ratios['Stock P/E']||''}","${d.ratios['Market Cap']||''}","${d.ratios['ROCE']||''}","${tagLabel(tags[ticker])}"\n`;
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

  // --- Import watchlist (Zerodha Kite / Screener.in / TradingView / paste / CSV) ---
  // Merges into the active portfolio. Flow: scrape open tab OR paste text OR
  // upload CSV -> preview with checkboxes -> resolve via background
  // (RESOLVE_IMPORT_TICKERS) -> merge missing symbols -> FORCE_SYNC.
  const btnImportWatchlist = document.getElementById('btn-import-watchlist');
  const importModal = document.getElementById('import-modal');
  const btnImportClose = document.getElementById('btn-import-close');
  const btnImportCancel = document.getElementById('btn-import-cancel');
  const btnImportScrape = document.getElementById('btn-import-scrape');
  const importScrapeStatus = document.getElementById('import-scrape-status');
  const importPaste = document.getElementById('import-paste');
  const importFile = document.getElementById('import-file');
  const importFileName = document.getElementById('import-file-name');
  const importPreviewWrap = document.getElementById('import-preview-wrap');
  const importPreview = document.getElementById('import-preview');
  const importPreviewCount = document.getElementById('import-preview-count');
  const btnImportSelectAll = document.getElementById('btn-import-select-all');
  const importStatus = document.getElementById('import-status');
  const btnImportConfirm = document.getElementById('btn-import-confirm');
  let importCandidates = []; // [{ raw, tvExchange, checked }]

  function openImportModal() {
    if (!importModal) return;
    importModal.style.display = 'flex';
    setImportStatus('');
    if (importScrapeStatus) importScrapeStatus.textContent = '';
  }
  function closeImportModal() {
    if (!importModal) return;
    importModal.style.display = 'none';
  }
  function setImportStatus(msg) {
    if (importStatus) importStatus.textContent = msg || '';
  }
  function setScrapeStatus(msg) {
    if (importScrapeStatus) importScrapeStatus.textContent = msg || '';
  }
  function normalizeImportToken(s) {
    let v = String(s || '').trim();
    if (!v) return '';
    // TradingView "EXCHANGE:SYMBOL" -> symbol; keep NSE/BSE hint in tvExchange
    let tvExchange = '';
    const tv = v.match(/^([A-Za-z]{2,12}):([A-Za-z0-9.\-^=_]{1,24})$/);
    if (tv) { tvExchange = tv[1].toUpperCase(); v = tv[2]; }
    v = v.toUpperCase().replace(/^["'\s]+|["'\s]+$/g, '');
    v = v.replace(/^(NSE|BSE)[:-]\s*/i, '');
    if (!/^[A-Z0-9.\-^=_]{1,24}$/.test(v)) return '';
    if (/^[0-9.\-^=_]+$/.test(v)) return '';
    return v ? { raw: v, tvExchange } : '';
  }
  function setImportCandidates(list, sourceLabel) {
    const seen = {};
    importCandidates = [];
    (list || []).forEach((entry) => {
      const norm = normalizeImportToken(entry && entry.raw !== undefined ? entry.raw : entry);
      if (!norm || seen[norm.raw]) return;
      seen[norm.raw] = true;
      importCandidates.push({ raw: norm.raw, tvExchange: (entry && entry.tvExchange) || norm.tvExchange || '', checked: true });
    });
    renderImportPreview();
    if (importCandidates.length) {
      setImportStatus((t('importFound') || 'Found {N} tickers') .replace('{N}', String(importCandidates.length)) + (sourceLabel ? ' — ' + sourceLabel : ''));
    } else {
      setImportStatus(t('importNoneFound') || 'No tickers found. Try pasting or a CSV file.');
    }
  }
  function paintImportSelection() {
    const total = importCandidates.length;
    const sel = importCandidates.filter((c) => c.checked).length;
    if (importPreviewCount) {
      importPreviewCount.textContent = (t('importSelectedCount') || '{S} of {N} selected')
        .replace('{S}', String(sel)).replace('{N}', String(total));
    }
    if (btnImportSelectAll) {
      const allOn = total > 0 && sel === total;
      btnImportSelectAll.textContent = allOn
        ? (t('importSelectNone') || 'None')
        : (t('importSelectAll') || 'All');
    }
  }
  function renderImportPreview() {
    if (!importPreview || !importPreviewWrap) return;
    if (!importCandidates.length) {
      importPreviewWrap.style.display = 'none';
      return;
    }
    importPreviewWrap.style.display = '';
    importPreview.innerHTML = '';
    importCandidates.forEach((c, idx) => {
      const label = document.createElement('label');
      label.className = 'import-preview-row' + (c.checked ? ' checked' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = c.checked;
      cb.setAttribute('aria-label', c.raw);
      cb.addEventListener('change', () => {
        importCandidates[idx].checked = cb.checked;
        label.classList.toggle('checked', cb.checked);
        paintImportSelection();
      });
      const num = document.createElement('span');
      num.className = 'import-preview-idx';
      num.textContent = String(idx + 1);
      const span = document.createElement('span');
      span.className = 'import-preview-ticker';
      span.textContent = c.raw;
      span.title = c.raw + (c.tvExchange ? ' (' + c.tvExchange + ')' : '');
      label.appendChild(cb);
      label.appendChild(num);
      label.appendChild(span);
      importPreview.appendChild(label);
    });
    paintImportSelection();
  }
  // Paste box -> candidates (live, debounced)
  let importPasteTimer = null;
  if (importPaste) importPaste.addEventListener('input', () => {
    clearTimeout(importPasteTimer);
    importPasteTimer = setTimeout(() => {
      const text = importPaste.value || '';
      if (!text.trim()) return;
      const parts = text.split(/[,;\s|]+/);
      setImportCandidates(parts, t('importSourcePaste') || 'pasted');
    }, 400);
  });
  // CSV / TXT file -> candidates. Handles Zerodha holdings (Instrument/Scrip),
  // Screener.in exports and TradingView exports (Ticker like NSE:RELIANCE).
  function splitCsvLine(line) {
    const cells = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if ((ch === ',' || ch === ';' || ch === '\t') && !inQ) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells.map((c) => c.replace(/^"|"$/g, '').trim());
  }
  function parseImportCsv(text) {
    const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    let startIdx = 0;
    let symIdx = 0;
    const headerCells = splitCsvLine(lines[0]);
    const isHeader = headerCells.some((c) => /instrument|symbol|scrip|ticker|security|tradingsymbol|company/i.test(c));
    if (isHeader) {
      startIdx = 1;
      let best = -1;
      headerCells.forEach((c, i) => {
        if (/tradingsymbol|symbol|ticker/i.test(c) && best === -1) best = i;
      });
      if (best === -1) headerCells.forEach((c, i) => {
        if (/instrument|scrip|security/i.test(c) && best === -1) best = i;
      });
      symIdx = best === -1 ? 0 : best;
    } else if (lines.length && splitCsvLine(lines[0]).length > 1) {
      // No header but multi-column (e.g. holdings with qty): symbol usually col 0
      symIdx = 0;
    }
    const vals = [];
    for (let i = startIdx; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i]);
      const cell = cells[Math.min(symIdx, cells.length - 1)] || cells[0] || '';
      // Skip summary/footer rows (totals, dates, numbers)
      if (/total|grand|summary|^\d{4}-\d{2}-\d{2}/i.test(cell)) continue;
      if (cell) vals.push(cell);
    }
    return vals;
  }
  if (importFile) importFile.addEventListener('change', () => {
    const f = importFile.files && importFile.files[0];
    if (importFileName) importFileName.textContent = f ? f.name : '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setImportCandidates(parseImportCsv(reader.result), f.name);
      } catch (e) {
        setImportStatus(t('importFileError') || 'Could not read that file.');
      }
    };
    reader.onerror = () => setImportStatus(t('importFileError') || 'Could not read that file.');
    reader.readAsText(f);
  });
  // Scrape the active tab via the already-injected content script
  // (ticker_tape.js answers SCREENER_EXTRACT_WATCHLIST). No new permissions.
  function scrapeActiveTab() {
    setScrapeStatus(t('importDetecting') || 'Detecting tickers on the open tab…');
    setImportStatus('');
    try {
      if (chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
          if (chrome.runtime.lastError) {
            setScrapeStatus(t('importTabBlocked') || 'Cannot read this tab. Paste tickers or upload a CSV instead.');
            return;
          }
          const tab = tabs && tabs[0];
          if (!tab || !tab.id) {
            setScrapeStatus(t('importTabBlocked') || 'Cannot read this tab. Paste tickers or upload a CSV instead.');
            return;
          }
          const url = String(tab.url || '');
          if (!/^https?:\/\//i.test(url)) {
            setScrapeStatus(t('importTabBlocked') || 'Cannot read this tab. Paste tickers or upload a CSV instead.');
            return;
          }
          let responded = false;
          try {
            chrome.tabs.sendMessage(tab.id, { type: 'SCREENER_EXTRACT_WATCHLIST' }, (res) => {
              responded = true;
              if (chrome.runtime.lastError || !res) {
                setScrapeStatus(t('importTabEmpty') || 'Nothing detected. Open your Kite / Screener / TradingView watchlist, then retry — or paste below.');
                return;
              }
              const items = (res.items || []).map((it) => (typeof it === 'string' ? { raw: it } : it));
              if (!items.length) {
                setScrapeStatus(t('importTabEmpty') || 'Nothing detected. Open your Kite / Screener / TradingView watchlist, then retry — or paste below.');
                return;
              }
              setImportCandidates(items, res.site || '');
              setScrapeStatus((t('importDetected') || 'Detected {N} from {S}').replace('{N}', String(items.length)).replace('{S}', res.site || url));
            });
          } catch (e) {
            setScrapeStatus(t('importTabBlocked') || 'Cannot read this tab. Paste tickers or upload a CSV instead.');
            return;
          }
          setTimeout(() => {
            if (!responded) setScrapeStatus(t('importTabEmpty') || 'Nothing detected. Open your Kite / Screener / TradingView watchlist, then retry — or paste below.');
          }, 5000);
        });
      } else {
        setScrapeStatus(t('importTabBlocked') || 'Cannot read this tab. Paste tickers or upload a CSV instead.');
      }
    } catch (e) {
      setScrapeStatus(t('importTabBlocked') || 'Cannot read this tab. Paste tickers or upload a CSV instead.');
    }
  }
  if (btnImportScrape) btnImportScrape.addEventListener('click', scrapeActiveTab);
  if (btnImportSelectAll) btnImportSelectAll.addEventListener('click', () => {
    const allOn = !importCandidates.every((c) => c.checked);
    importCandidates.forEach((c) => { c.checked = allOn; });
    renderImportPreview();
  });
  // Resolve checked candidates, then merge missing symbols into active portfolio
  if (btnImportConfirm) btnImportConfirm.addEventListener('click', () => {
    const selected = importCandidates.filter((c) => c.checked);
    if (!selected.length) {
      setImportStatus(t('importSelectFirst') || 'Select at least one ticker first.');
      return;
    }
    btnImportConfirm.disabled = true;
    setImportStatus(t('importResolving') || 'Resolving tickers…');
    const payload = selected.map((c) => ({ raw: c.raw, tvExchange: c.tvExchange }));
    const mergeSymbols = (symbols) => {
      chrome.storage.local.get(['portfolios'], (res) => {
        const ports = res.portfolios || {};
        const list = ports[activePortfolio] || [];
        const have = {};
        list.forEach((s) => { have[String(s).toUpperCase()] = true; });
        let added = 0;
        let skipped = 0;
        const addedNow = [];
        symbols.forEach((sym) => {
          const up = String(sym || '').toUpperCase();
          if (!up) return;
          if (have[up]) { skipped++; return; }
          have[up] = true;
          list.push(up);
          addedNow.push(up);
          added++;
        });
        ports[activePortfolio] = list;
        const update = { portfolios: ports };
        if (activePortfolio === 'Sample' || true) update.screenerWatchlist = ports[activePortfolio];
        chrome.storage.local.set(update, () => {
          renderWatchlist();
          try { chrome.runtime.sendMessage({ type: 'FORCE_SYNC' }); } catch (e) {}
          btnImportConfirm.disabled = false;
          const parts = [];
          if (added) parts.push((t('importAdded') || 'Added {N}').replace('{N}', String(added)));
          if (skipped) parts.push((t('importSkipped') || '{N} already in watchlist').replace('{N}', String(skipped)));
          setImportStatus(parts.join(' · ') || (t('importDone') || 'Done.'));
          if (added) {
            importCandidates = importCandidates.filter((c) => addedNow.indexOf(c.raw) === -1);
            renderImportPreview();
          }
        });
      });
    };
    try {
      chrome.runtime.sendMessage({ type: 'RESOLVE_IMPORT_TICKERS', tickers: payload }, (res) => {
        if (chrome.runtime.lastError || !res || !Array.isArray(res.results)) {
          mergeSymbols(selected.map((c) => c.raw));
          return;
        }
        mergeSymbols(res.results.map((r) => (r && r.symbol) || (r && r.raw)));
      });
    } catch (e) {
      mergeSymbols(selected.map((c) => c.raw));
    }
  });
  if (btnImportWatchlist) btnImportWatchlist.addEventListener('click', openImportModal);
  if (btnImportClose) btnImportClose.addEventListener('click', closeImportModal);
  if (btnImportCancel) btnImportCancel.addEventListener('click', closeImportModal);
  if (importModal) importModal.addEventListener('click', (e) => {
    if (e.target === importModal) closeImportModal();
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
             const assetKind = inferAssetKind(ticker, data);
             const isNonEquity = assetKind === 'crypto' || assetKind === 'forex' || assetKind === 'commodity';
             if (data.isIndex) {
               html += `<div style="background:var(--verdict-bg); border:var(--border-color); padding:12px; border-radius:8px; margin-top:12px; font-size:13px;"><span style="color:var(--label-color); font-weight:600;">${t('verdictLabel')}</span> <span style="color:var(--link-green); font-weight:500;">${t('verdictIndex')}</span></div>`;
             } else {
               const kindVerdict = verdictForKind(assetKind);
               html += kindVerdict
                 ? `<div style="background:var(--verdict-bg); border:var(--border-color); padding:12px; border-radius:8px; margin-top:12px; font-size:13px;"><span style="color:var(--label-color); font-weight:600;">${t('verdictLabel')}</span> <span style="color:var(--link-green); font-weight:500;">${kindVerdict}</span></div>`
                 : generateVerdict(data.ratios);
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
            // Screener.in links & peers only make sense for equities —
            // skip them for crypto/forex/commodities
            if (!isNonEquity) {
              html += `<div style="text-align:right; margin-top:8px;">
                <a href="https://www.screener.in/company/${ticker}/" target="_blank" style="color:#1a73e8; font-size:12px; text-decoration:none; font-weight:500;">&#9881; ${t('customizeScreener')}</a>
              </div>`;
            }
           if (data.aboutText) html += `<div class="screener-about" style="margin-top:16px;">${data.aboutText}</div>`;
             
             html += `<div id="search-peers-container"></div>`;
             html += `<div id="search-announcements-container"></div>`;

               resultsSearch.innerHTML = html;

               // Async fetch for Peers & Announcements (equities only)
              if (!isNonEquity) {
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
              }
  
              // Wire up the Add / Remove Watchlist toggle button
            const addBtn = document.getElementById('btn-search-add-wl');
            if (addBtn) {
              const paintWlBtn = (inList) => {
                if (inList) {
                  const addedTxt = t('addedButton') || 'Added!';
                  const removeTxt = t('removeBtn') || 'Remove';
                  addBtn.textContent = `\u2713 ${addedTxt} \u2014 ${removeTxt}`;
                  addBtn.style.background = '#a93226';
                  addBtn.disabled = false;
                } else {
                  addBtn.textContent = t('addToWatchlist') || '+ Add to Watchlist';
                  addBtn.style.background = 'var(--btn-wl-bg)';
                  addBtn.disabled = false;
                }
              };
              // If ticker is already in the active portfolio, show Remove state right away
              chrome.storage.local.get(['portfolios'], (r) => {
                const ports = r.portfolios || {};
                const list = ports[activePortfolio] || [];
                if (list.includes(ticker)) paintWlBtn(true);
              });
              addBtn.onclick = () => {
                chrome.storage.local.get(['portfolios'], (r) => {
                  const ports = r.portfolios || {};
                  const list = ports[activePortfolio] || [];
                  if (!list.includes(ticker)) {
                    list.push(ticker);
                    ports[activePortfolio] = list;
                    chrome.storage.local.set({ portfolios: ports, screenerWatchlist: list }, () => {
                      paintWlBtn(true);
                      renderWatchlist();
                      chrome.runtime.sendMessage({ type: 'FORCE_SYNC' });
                    });
                  } else {
                    ports[activePortfolio] = list.filter((sym) => sym !== ticker);
                    chrome.storage.local.set({ portfolios: ports, screenerWatchlist: ports[activePortfolio] }, () => {
                      paintWlBtn(false);
                      renderWatchlist();
                    });
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

  // --- Bulk edit: multi-select stocks to tag, move, copy or delete together ---
  function enterBulkMode() {
    bulkMode = true;
    paintBulkToggle();
    renderWatchlist();
  }
  function exitBulkMode() {
    bulkMode = false;
    bulkSelected.clear();
    paintBulkToggle();
    renderWatchlist();
  }
  function paintBulkToggle() {
    const btn = document.getElementById('btn-bulk-select');
    if (!btn) return;
    btn.textContent = bulkMode ? (t('bulkDone') || 'Done') : (t('bulkSelect') || 'Select');
    btn.style.background = bulkMode ? '#1a73e8' : '';
    btn.style.color = bulkMode ? '#fff' : '';
  }
  function bulkDelete() {
    if (bulkSelected.size === 0) return;
    chrome.storage.local.get(['portfolios'], (res) => {
      const ports = res.portfolios || {};
      const list = ports[activePortfolio] || [];
      ports[activePortfolio] = list.filter((tk) => !bulkSelected.has(tk));
      bulkSelected.clear();
      chrome.storage.local.set({ portfolios: ports, screenerWatchlist: ports[activePortfolio] }, () => renderWatchlist());
    });
  }
  function bulkTag(tag) {
    if (bulkSelected.size === 0 || !tag) return;
    chrome.storage.local.get(['colorTags'], (res) => {
      const tags = res.colorTags || {};
      bulkSelected.forEach((tk) => { tags[tk] = tag; });
      chrome.storage.local.set({ colorTags: tags }, () => renderWatchlist());
    });
  }
  function bulkMoveCopy(mode) {
    if (bulkSelected.size === 0) return;
    const targetSel = document.getElementById('bulk-portfolio');
    const target = targetSel ? targetSel.value : '';
    if (!target) return;
    chrome.storage.local.get(['portfolios'], (res) => {
      const ports = res.portfolios || {};
      const dest = ports[target] || [];
      bulkSelected.forEach((tk) => { if (!dest.includes(tk)) dest.push(tk); });
      ports[target] = dest;
      const update = { portfolios: ports };
      if (mode === 'move' && target !== activePortfolio) {
        ports[activePortfolio] = (ports[activePortfolio] || []).filter((tk) => !bulkSelected.has(tk));
        update.portfolios = ports;
        update.screenerWatchlist = ports[activePortfolio];
        bulkSelected.clear();
      }
      chrome.storage.local.set(update, () => renderWatchlist());
    });
  }

    // btnWlAdd logic removed

  // --- Modals Logic ---
  const alertModal = document.getElementById('alert-modal');
  const btnAlertCancel = document.getElementById('btn-alert-cancel');
  const btnAlertSave = document.getElementById('btn-alert-save');
  const btnAlertDelete = document.getElementById('btn-alert-delete');
  const btnAlertCloseX = document.getElementById('btn-alert-close-x');
  const inputAlertAbove = document.getElementById('alert-above');
  const inputAlertBelow = document.getElementById('alert-below');
  const alertAboveClear = document.getElementById('alert-above-clear');
  const alertBelowClear = document.getElementById('alert-below-clear');
  const alertCurPriceBadge = document.getElementById('alert-cur-price-badge');
  const alertCurSymbolAbove = document.getElementById('alert-cur-symbol-above');
  const alertCurSymbolBelow = document.getElementById('alert-cur-symbol-below');
  const alertAdvancedDetails = document.getElementById('alert-advanced');
  const alertAdvancedBadge = document.getElementById('alert-advanced-badge');
  const inputAlertMovePct = document.getElementById('alert-movepct');
  const inputAlertHigh52 = document.getElementById('alert-high52');
  const inputAlertLow52 = document.getElementById('alert-low52');
  const alert52hVal = document.getElementById('alert-52h-val');
  const alert52lVal = document.getElementById('alert-52l-val');
  const alertFreqOnce = document.getElementById('alert-freq-once');
  const alertFreqRepeat = document.getElementById('alert-freq-repeat');
  const alertExpireSelect = document.getElementById('alert-expire-select');
  const inputAlertNote = document.getElementById('alert-note');
  const inputAlertSound = document.getElementById('alert-sound');

  let currentAlertTicker = '';
  let currentAlertNumericPrice = 0;

  function formatTargetPrice(val) {
    if (!val || isNaN(val)) return '';
    if (val >= 1000) return (Math.round(val * 10) / 10).toString();
    if (val >= 10) return (Math.round(val * 100) / 100).toFixed(2);
    if (val >= 1) return (Math.round(val * 100) / 100).toFixed(2);
    return (Math.round(val * 10000) / 10000).toFixed(4);
  }

  function updateAdvancedBadge() {
    const isMove = inputAlertMovePct && parseFloat(inputAlertMovePct.value) > 0;
    const isHigh52 = inputAlertHigh52 && inputAlertHigh52.checked;
    const isLow52 = inputAlertLow52 && inputAlertLow52.checked;
    const isRepeat = alertFreqRepeat && alertFreqRepeat.checked;
    const isExpire = alertExpireSelect && alertExpireSelect.value !== 'never';
    const isNote = inputAlertNote && inputAlertNote.value.trim().length > 0;
    const isSoundOff = inputAlertSound && !inputAlertSound.checked;
    const count = [isMove, isHigh52, isLow52, isRepeat, isExpire, isNote, isSoundOff].filter(Boolean).length;
    if (alertAdvancedBadge) {
      if (count > 0) {
        alertAdvancedBadge.style.display = 'inline-block';
        alertAdvancedBadge.textContent = count + ' active';
      } else {
        alertAdvancedBadge.style.display = 'none';
      }
    }
  }

  // Quick % buttons for Above (+2%, +5%, +10%)
  document.querySelectorAll('.alert-chip-above').forEach(btn => {
    btn.onclick = () => {
      if (!currentAlertNumericPrice) return;
      const pct = parseFloat(btn.getAttribute('data-pct')) || 0;
      const val = currentAlertNumericPrice * (1 + pct / 100);
      if (inputAlertAbove) inputAlertAbove.value = formatTargetPrice(val);
    };
  });

  // Quick % buttons for Below (-2%, -5%, -10%)
  document.querySelectorAll('.alert-chip-below').forEach(btn => {
    btn.onclick = () => {
      if (!currentAlertNumericPrice) return;
      const pct = parseFloat(btn.getAttribute('data-pct')) || 0;
      const val = currentAlertNumericPrice * (1 + pct / 100);
      if (inputAlertBelow) inputAlertBelow.value = formatTargetPrice(val);
    };
  });

  // Quick % buttons for Move (±3%, ±5%, ±10%)
  document.querySelectorAll('.alert-chip-move').forEach(btn => {
    btn.onclick = () => {
      const val = parseFloat(btn.getAttribute('data-val')) || 0;
      if (inputAlertMovePct) inputAlertMovePct.value = val;
      updateAdvancedBadge();
    };
  });

  // Input clear buttons
  if (alertAboveClear) alertAboveClear.onclick = () => { if (inputAlertAbove) inputAlertAbove.value = ''; };
  if (alertBelowClear) alertBelowClear.onclick = () => { if (inputAlertBelow) inputAlertBelow.value = ''; };

  // Listeners to update badge
  [inputAlertMovePct, inputAlertHigh52, inputAlertLow52, alertFreqOnce, alertFreqRepeat, alertExpireSelect, inputAlertNote, inputAlertSound].forEach(el => {
    if (el) {
      el.addEventListener('change', updateAdvancedBadge);
      el.addEventListener('input', updateAdvancedBadge);
    }
  });

  window.openAlertModal = function(ticker) {
    currentAlertTicker = ticker;
    const tickerEl = document.getElementById('alert-ticker');
    if (tickerEl) tickerEl.textContent = ticker;

    const aboveEl = document.getElementById('alert-above-label');
    const belowEl = document.getElementById('alert-below-label');

    try {
      chrome.storage.local.get(['cachedData', 'alerts'], (res) => {
        const cached = (res.cachedData || {})[ticker] || {};
        const alerts = res.alerts || {};
        const cur = alerts[ticker] || {};

        let prefix = '';
        if (cached.currency) prefix = mcapPrefixForCode(cached.currency);
        if (!prefix) {
          const m = String((cached.ratios || {})['Current Price'] || '').match(/^[^\d\-+.,\s]+/);
          if (m) prefix = m[0];
        }
        prefix = prefix || (ticker.includes('.NS') || ticker.includes('.BO') ? '₹' : '$');

        if (alertCurSymbolAbove) alertCurSymbolAbove.textContent = prefix;
        if (alertCurSymbolBelow) alertCurSymbolBelow.textContent = prefix;
        if (aboveEl) aboveEl.textContent = (t('alertAboveDyn') || 'Alert if price goes ABOVE ({CUR}):').replace('{CUR}', prefix);
        if (belowEl) belowEl.textContent = (t('alertBelowDyn') || 'Alert if price goes BELOW ({CUR}):').replace('{CUR}', prefix);

        // Numeric current price
        const rawPrice = (cached.ratios || {})['Current Price'] || '';
        const numMatch = String(rawPrice).replace(/,/g, '').match(/[\d.]+/);
        currentAlertNumericPrice = numMatch ? parseFloat(numMatch[0]) : 0;

        if (alertCurPriceBadge) {
          if (currentAlertNumericPrice > 0) {
            const rawPct = cached.pctChange || (cached.ratios || {})['Day Change %'] || '';
            const isUp = !String(rawPct).startsWith('-');
            const color = isUp ? '#188038' : '#d93025';
            const pctStr = rawPct ? ` <span style="color:${color}; font-weight:600;">(${rawPct})</span>` : '';
            alertCurPriceBadge.innerHTML = `${t('alertCurPrice') || 'Current:'} <strong>${prefix}${currentAlertNumericPrice.toLocaleString()}</strong>${pctStr}`;
          } else {
            alertCurPriceBadge.textContent = '';
          }
        }

        // 52-Week High / Low
        const range52 = (cached.ratios || {})['52W Range'] || '';
        if (range52) {
          const parts = range52.split('-').map(s => s.trim());
          if (parts[0] && alert52lVal) alert52lVal.textContent = `(${parts[0]})`;
          if (parts[1] && alert52hVal) alert52hVal.textContent = `(${parts[1]})`;
        } else {
          if (alert52lVal) alert52lVal.textContent = '';
          if (alert52hVal) alert52hVal.textContent = '';
        }

        // Populate fields
        if (inputAlertAbove) inputAlertAbove.value = cur.above || '';
        if (inputAlertBelow) inputAlertBelow.value = cur.below || '';
        if (inputAlertMovePct) inputAlertMovePct.value = cur.movePct || '';
        if (inputAlertHigh52) inputAlertHigh52.checked = !!cur.high52;
        if (inputAlertLow52) inputAlertLow52.checked = !!cur.low52;
        if (inputAlertNote) inputAlertNote.value = cur.note || '';
        if (inputAlertSound) inputAlertSound.checked = cur.sound !== false;

        if (cur.repeat) {
          if (alertFreqRepeat) alertFreqRepeat.checked = true;
        } else {
          if (alertFreqOnce) alertFreqOnce.checked = true;
        }

        if (alertExpireSelect) {
          if (cur.expiresAt && cur.expiresAt > Date.now()) {
            const days = Math.ceil((cur.expiresAt - Date.now()) / 86400000);
            if (days <= 1) alertExpireSelect.value = '1';
            else if (days <= 7) alertExpireSelect.value = '7';
            else if (days <= 30) alertExpireSelect.value = '30';
            else alertExpireSelect.value = '90';
          } else {
            alertExpireSelect.value = 'never';
          }
        }

        // Delete button visibility
        const hasAny = !!(cur.above || cur.below || cur.movePct || cur.high52 || cur.low52);
        if (btnAlertDelete) btnAlertDelete.style.display = hasAny ? 'block' : 'none';

        // Advanced details auto-expand if any advanced option active
        const hasAdv = !!(cur.movePct || cur.high52 || cur.low52 || cur.repeat || (cur.expiresAt && cur.expiresAt > Date.now()) || cur.note);
        if (alertAdvancedDetails) alertAdvancedDetails.open = hasAdv;
        updateAdvancedBadge();

        alertModal.style.display = 'flex';
      });
    } catch (e) {
      alertModal.style.display = 'flex';
    }
  };

  if (btnAlertCancel) btnAlertCancel.onclick = () => { alertModal.style.display = 'none'; };
  if (btnAlertCloseX) btnAlertCloseX.onclick = () => { alertModal.style.display = 'none'; };
  if (alertModal) {
    alertModal.onclick = (e) => {
      if (e.target === alertModal) alertModal.style.display = 'none';
    };
  }

  if (btnAlertDelete) {
    btnAlertDelete.onclick = () => {
      chrome.storage.local.get(['alerts'], (res) => {
        const alerts = res.alerts || {};
        delete alerts[currentAlertTicker];
        chrome.storage.local.set({ alerts }, () => {
          alertModal.style.display = 'none';
          renderWatchlist();
          if (typeof renderAlertsList === 'function') renderAlertsList();
          if (typeof refreshAlertsBadge === 'function') refreshAlertsBadge();
        });
      });
    };
  }

  btnAlertSave.onclick = () => {
    chrome.storage.local.get(['alerts'], (res) => {
      const alerts = res.alerts || {};
      const above = (inputAlertAbove && parseFloat(inputAlertAbove.value)) || null;
      const below = (inputAlertBelow && parseFloat(inputAlertBelow.value)) || null;
      const movePct = (inputAlertMovePct && parseFloat(inputAlertMovePct.value)) || null;
      const high52 = !!(inputAlertHigh52 && inputAlertHigh52.checked);
      const low52 = !!(inputAlertLow52 && inputAlertLow52.checked);
      const repeat = !!(alertFreqRepeat && alertFreqRepeat.checked);
      const sound = !!(inputAlertSound && inputAlertSound.checked);
      const note = (inputAlertNote && inputAlertNote.value.trim()) || '';

      const expChoice = alertExpireSelect ? alertExpireSelect.value : 'never';
      let expiresAt = null;
      if (expChoice === '1') expiresAt = Date.now() + 1 * 86400000;
      else if (expChoice === '7') expiresAt = Date.now() + 7 * 86400000;
      else if (expChoice === '30') expiresAt = Date.now() + 30 * 86400000;
      else if (expChoice === '90') expiresAt = Date.now() + 90 * 86400000;

      if (above || below || movePct || high52 || low52) {
        const prev = alerts[currentAlertTicker] || {};
        alerts[currentAlertTicker] = {
          above,
          below,
          movePct,
          high52,
          low52,
          repeat,
          sound,
          note,
          expiresAt,
          aboveFired: prev.aboveFired && prev.above === above,
          belowFired: prev.belowFired && prev.below === below,
          moveFired: prev.moveFired && prev.movePct === movePct,
          high52Fired: prev.high52Fired && prev.high52 === high52,
          low52Fired: prev.low52Fired && prev.low52 === low52,
        };
      } else {
        delete alerts[currentAlertTicker];
      }

      chrome.storage.local.set({ alerts }, () => {
        alertModal.style.display = 'none';
        renderWatchlist();
        if (typeof renderAlertsList === 'function') renderAlertsList();
        if (typeof refreshAlertsBadge === 'function') refreshAlertsBadge();
      });
    });
  };

  // Sound chime synthesizer
  function playAlertChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.12);
      gain2.gain.setValueAtTime(0.25, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.55);
    } catch (e) {}
  }

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'PLAY_ALERT_SOUND') {
        playAlertChime();
      }
    });
  } catch (e) {}

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
  // Trend timeline selector: 1M / 3M / 6M / 1Y / 3Y / 5Y / MAX.
  // The cached `sparkline` is 1Y; other ranges are fetched on demand via
  // the background FETCH_CHART handler and kept in `trendCache`.
  const TREND_OPTIONS = [
    { label: '1M', range: '1mo', interval: '1d' },
    { label: '3M', range: '3mo', interval: '1d' },
    { label: '6M', range: '6mo', interval: '1d' },
    { label: '1Y', range: '1y', interval: '1d' },
    { label: '3Y', range: '3y', interval: '1wk' },
    { label: '5Y', range: '5y', interval: '1wk' },
    { label: 'MAX', range: 'max', interval: '1mo' }
  ];
  let trendRangeLabel = '1Y';
  const trendCache = {}; // `${ticker}__${label}` -> price array
  function trendParamsFor(label) {
    const f = TREND_OPTIONS.find((o) => o.label === label);
    return f ? { range: f.range, interval: f.interval } : { range: '1y', interval: '1d' };
  }
  function trendWord() {
    try {
      const raw = String(t('colTrend') || '1Y Trend');
      const w = raw.replace(/1\s*Y|1\s*A|1\s*J|1\s*R|1\s*G|1\s*Å/gi, '').replace(/\s{2,}/g, ' ').trim();
      return w || 'Trend';
    } catch (e) { return 'Trend'; }
  }
  function trendTitle() {
    return trendRangeLabel + ' ' + trendWord();
  }
  function yahooSymbolForTrend(ticker, data) {
    try {
      const tk = String(ticker || '');
      if (!tk) return tk;
      if (tk.startsWith('^') || tk.includes('=') || /-USD/i.test(tk) || /\.(NS|BO)$/i.test(tk)) return tk;
      if (data && data.source === 'screener') return tk + '.NS';
      return tk;
    } catch (e) { return ticker; }
  }
  function resolveTrendData(ticker, data) {
    if (!data) return [];
    if (trendRangeLabel === '1Y') return data.sparkline;
    const key = ticker + '__' + trendRangeLabel;
    if (Array.isArray(trendCache[key]) && trendCache[key].length >= 2) return trendCache[key];
    return data.sparkline;
  }
  function fetchMissingTrends(list, cached) {
    if (trendRangeLabel === '1Y') return;
    const p = trendParamsFor(trendRangeLabel);
    list.forEach((ticker) => {
      const key = ticker + '__' + trendRangeLabel;
      if (trendCache[key]) return;
      const data = cached[ticker];
      if (!data || !data.ratios) return;
      const sym = yahooSymbolForTrend(ticker, data);
      try {
        chrome.runtime.sendMessage({ type: 'FETCH_CHART', symbol: sym, range: p.range, interval: p.interval }, (res) => {
          const arr = res && Array.isArray(res.data) ? res.data : [];
          if (arr.length >= 2) {
            trendCache[key] = arr;
            try {
              const cell = wlItemsContainer.querySelector('.trend-cell[data-ticker="' + CSS.escape(ticker) + '"]');
              if (cell) cell.innerHTML = createSparkline(arr);
            } catch (e) {}
          }
        });
      } catch (e) {}
    });
  }
  try {
    chrome.storage.local.get(['trendRange'], (res) => {
      const v = res && res.trendRange;
      if (typeof v === 'string' && TREND_OPTIONS.some((o) => o.label === v) && v !== trendRangeLabel) {
        trendRangeLabel = v;
        try { renderWatchlist(); } catch (e) {}
      }
    });
  } catch (e) {}
  let isDragging = false; // Prevent re-rendering while user is dragging
  let bulkMode = false; // Bulk-edit multi-select mode
  const bulkSelected = new Set(); // tickers checked in bulk mode
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

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

  // Platform quick links per watchlist row (TradingView / Screener.in /
  // Zerodha Kite). URL shapes mirror the background.js resolveCtxStock
  // builders; kept local so table rendering stays synchronous.
  function rowBaseSymbol(symbol) {
    return String(symbol || '').toUpperCase().replace(/\.(NS|BO)$/, '');
  }
  function rowIsIndian(ticker, data) {
    if (ticker && ticker.startsWith('^')) return false;
    if (data && data.source && data.source !== 'yahoo') return true;
    return /\.(NS|BO)$/i.test(ticker || '');
  }
  function rowTvExchange(ticker, data) {
    if (/\.BO$/i.test(ticker || '')) return 'BSE';
    if (rowIsIndian(ticker, data)) return 'NSE';
    return '';
  }
  // Color tags per stock (Entry Target / Watching / Exit Flag), stored in
  // chrome.storage.local under `colorTags` as { TICKER: tagKey }.
  const COLOR_TAGS = {
    entry: { color: '#34a853' },
    watching: { color: '#f29900' },
    exit: { color: '#ea4335' }
  };
  let activeTagFilter = 'all';
  function tagLabel(key) {
    if (key === 'entry') return t('tagEntry') || 'Entry Target';
    if (key === 'watching') return t('tagWatching') || 'Watching';
    if (key === 'exit') return t('tagExit') || 'Exit Flag';
    return '';
  }
  function setColorTag(ticker, tag) {
    chrome.storage.local.get(['colorTags'], (res) => {
      const tags = res.colorTags || {};
      if (tag) tags[ticker] = tag; else delete tags[ticker];
      chrome.storage.local.set({ colorTags: tags }, () => renderWatchlist());
    });
  }
  function closeTagMenu() {
    const m = document.getElementById('tag-menu');
    if (m) m.remove();
    document.removeEventListener('click', closeTagMenuOutside);
  }
  function closeTagMenuOutside(e) {
    const m = document.getElementById('tag-menu');
    if (m && !m.contains(e.target)) closeTagMenu();
  }
  function openTagMenu(anchor, ticker) {
    closeTagMenu();
    chrome.storage.local.get(['colorTags', 'cachedData', 'smartFocus'], (res) => {
      const current = (res.colorTags || {})[ticker];
      const menu = document.createElement('div');
      menu.id = 'tag-menu';
      menu.style.cssText = 'position:fixed; z-index:9999; min-width:160px; max-width:230px; padding:6px; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-color); box-shadow:0 10px 30px rgba(0,0,0,.3); font-size:12px;';
      let html = '';
      for (const key of Object.keys(COLOR_TAGS)) {
        const sel = current === key ? ' ✓' : '';
        html += `<div data-tag="${key}" style="display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:7px; cursor:pointer; color:var(--text-color);"><span style="width:10px; height:10px; border-radius:50%; background:${COLOR_TAGS[key].color}; flex-shrink:0;"></span>${tagLabel(key)}${sel}</div>`;
      }
      html += `<div data-tag="" style="display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:7px; cursor:pointer; color:var(--label-color);"><span style="width:10px; height:10px; border-radius:50%; border:1px solid var(--label-color); flex-shrink:0;"></span>${t('tagClear') || 'Clear tag'}</div>`;
      // Blue-dot explainer: the dot turns blue when Smart Focus fires —
      // show this stock's live reasons, or the generic conditions.
      let sfText = '';
      try {
        const prefs = Object.assign({ big: true, swing: true, near: true, bigMovePct: 5, swingX: 2.5, nearPct: 2 }, (res.smartFocus || {}));
        const reasons = smartFocusReasons(((res.cachedData || {})[ticker] || {}), prefs);
        sfText = reasons.length ? reasons.join(' · ') : (t('tagBlueEmpty') || 'Big move, unusual swing, or near 52-week high/low');
      } catch (e) { sfText = t('tagBlueEmpty') || 'Big move, unusual swing, or near 52-week high/low'; }
      html += `<div style="border-top:1px solid var(--border-color); margin:5px 4px 2px;"></div>`
        + `<div style="display:flex; align-items:flex-start; gap:8px; padding:7px 9px; color:var(--label-color); font-size:11px; line-height:1.45;"><span style="width:10px; height:10px; border-radius:50%; background:#1a73e8; flex-shrink:0; margin-top:2px;"></span><span><b>${escHtml(t('tagBlueHint') || 'Smart Focus')}</b> — ${escHtml(sfText)}</span></div>`;
      menu.innerHTML = html;
      document.body.appendChild(menu);
      try {
        const r = anchor.getBoundingClientRect();
        menu.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 180)) + 'px';
        menu.style.top = Math.min(r.bottom + 4, window.innerHeight - 170) + 'px';
      } catch (e) {}
      menu.querySelectorAll('[data-tag]').forEach((opt) => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          setColorTag(ticker, opt.getAttribute('data-tag') || null);
          closeTagMenu();
        });
        opt.addEventListener('mouseenter', () => { opt.style.background = 'var(--row-hover)'; });
        opt.addEventListener('mouseleave', () => { opt.style.background = ''; });
      });
      setTimeout(() => document.addEventListener('click', closeTagMenuOutside), 0);
    });
  }
  // Smart Focus: blue-dot highlight for stocks meeting active conditions —
  // big price move, unusual daily swing vs its own history, or trading near
  // the 52-week high/low. Derived fresh on every render, so the dot clears
  // itself once the condition stops. Thresholds overridable via the
  // `smartFocus` storage key { bigMovePct, swingX, nearPct }.
  function smartFocusReasons(data, prefs) {
    const out = [];
    try {
      const d = data || {};
      const p = prefs || {};
      const bigMove = Number(p.bigMovePct) || 5;
      const swingX = Number(p.swingX) || 2.5;
      const nearPct = Number(p.nearPct) || 2;
      const move = parseFloat(String(d.changePct || '').replace(/[^\d.]/g, '')) || 0;
      if (p.big !== false && move >= bigMove) out.push(t('sfBigMove') || 'Big price move');
      const sp = Array.isArray(d.sparkline) ? d.sparkline : [];
      if (sp.length >= 8) {
        const moves = [];
        for (let i = 1; i < sp.length; i++) {
          const a = Number(sp[i - 1]), b = Number(sp[i]);
          if (a && isFinite(a) && isFinite(b) && a !== 0) moves.push(Math.abs(b - a) / Math.abs(a));
        }
        if (moves.length >= 7) {
          const last = moves[moves.length - 1];
          const prev = moves.slice(0, -1);
          const mean = prev.reduce((s, v) => s + v, 0) / prev.length;
          if (mean > 0 && p.swing !== false && last >= swingX * mean) out.push(t('sfSwing') || 'Unusual swing');
        }
      }
      const ratios = d.ratios || {};
      const cur = parseFloat(String(ratios['Current Price'] || '').replace(/[^\d.]/g, ''));
      const parts = String(ratios['52W Range'] || '').split('-');
      if (cur && parts.length === 2) {
        const lo = parseFloat(parts[0].replace(/[^\d.]/g, ''));
        const hi = parseFloat(parts[1].replace(/[^\d.]/g, ''));
        if (lo && hi && hi > lo) {
          if (p.near !== false && (hi - cur) / hi * 100 <= nearPct) out.push(t('sfHigh') || 'Near 52-week high');
          else if (p.near !== false && (cur - lo) / lo * 100 <= nearPct) out.push(t('sfLow') || 'Near 52-week low');
        }
      }
    } catch (e) {}
    return out;
  }
  // Ticker click → platform menu (TradingView / Screener.in / Kite).
  // Reuses the row exchange helpers and the tag-menu floating
  // pattern. Left-click opens the menu; middle-click still follows the
  // ticker href directly.
  function platformLinks(ticker, source) {
    const data = source ? { source } : null;
    const base = rowBaseSymbol(ticker);
    const ex = rowTvExchange(ticker, data);
    const tvSym = ex ? ex + ':' + base : base;
    const isInd = rowIsIndian(ticker, data);
    const isIndex = ticker && ticker.startsWith('^');
    const links = [{ label: 'TradingView', url: 'https://www.tradingview.com/chart/?symbol=' + encodeURIComponent(tvSym) }];
    if (!isIndex) {
      links.push({ label: 'Screener', url: 'https://www.screener.in/company/' + encodeURIComponent(base) + '/' });
      links.push({ label: 'Stock Analysis', url: 'https://stockanalysis.com/stocks/' + encodeURIComponent(base.toLowerCase()) + '/' });
      links.push({ label: 'Yahoo Finance', url: 'https://finance.yahoo.com/quote/' + encodeURIComponent(ticker) });
    } else {
      links.push({ label: 'Yahoo Finance', url: 'https://finance.yahoo.com/quote/' + encodeURIComponent(ticker) });
    }
    if (isInd) {
      links.push({ label: 'Zerodha Kite', url: 'https://kite.zerodha.com/chart/ext/ciq/' + (ex === 'BSE' ? 'BSE' : 'NSE') + '/' + encodeURIComponent(base) });
    }
    return links;
  }
  function closePlatformMenu() {
    const m = document.getElementById('platform-menu');
    if (m) m.remove();
    document.removeEventListener('click', closePlatformMenuOutside);
  }
  function closePlatformMenuOutside(e) {
    const m = document.getElementById('platform-menu');
    if (m && !m.contains(e.target)) closePlatformMenu();
  }
  function openPlatformMenu(anchor, ticker, source) {
    closePlatformMenu();
    const links = platformLinks(ticker, source);
    if (!links.length) return;
    const menu = document.createElement('div');
    menu.id = 'platform-menu';
    menu.style.cssText = 'position:fixed; z-index:9999; min-width:170px; padding:6px; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-color); box-shadow:0 10px 30px rgba(0,0,0,.3); font-size:12px;';
    menu.innerHTML = links.map((l) => `<div data-url="${l.url}" style="padding:7px 9px; border-radius:7px; cursor:pointer; color:var(--text-color);">${l.label}<span style="float:right; color:var(--label-color);">↗</span></div>`).join('');
    document.body.appendChild(menu);
    try {
      const r = anchor.getBoundingClientRect();
      menu.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 190)) + 'px';
      menu.style.top = Math.min(r.bottom + 4, window.innerHeight - (links.length * 36 + 30)) + 'px';
    } catch (e) {}
    menu.querySelectorAll('[data-url]').forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        try { chrome.tabs.create({ url: opt.getAttribute('data-url') }); } catch (err) {}
        closePlatformMenu();
      });
      opt.addEventListener('mouseenter', () => { opt.style.background = 'var(--row-hover)'; });
      opt.addEventListener('mouseleave', () => { opt.style.background = ''; });
    });
    setTimeout(() => document.addEventListener('click', closePlatformMenuOutside), 0);
  }
  function renderWatchlist() {
    if (isDragging) return; // Do not interrupt drag and drop

    // Single consolidated fetch for instant rendering with zero network delay
    chrome.storage.local.get(['portfolios', 'screenerWatchlist', 'cachedData', 'alerts', 'colorTags', 'smartFocus'], (res) => {
      const ports = res.portfolios || {};
      let list = ports[activePortfolio] || res.screenerWatchlist || [];
      const cached = res.cachedData || {};
      const alertsObj = res.alerts || {};
      const colorTags = res.colorTags || {};
      const sfPrefs = Object.assign({ big: true, swing: true, near: true, bigMovePct: 5, swingX: 2.5, nearPct: 2 }, res.smartFocus || {});

      // Tag filter row is only useful once at least one tag exists.
      const tagRow = document.getElementById('tag-filter-row');
      if (tagRow) tagRow.style.display = Object.keys(colorTags).length ? 'block' : 'none';
      if (tagFilterSelect && tagFilterSelect.value !== activeTagFilter) tagFilterSelect.value = activeTagFilter;
      if (activeTagFilter !== 'all') list = list.filter((tk) => colorTags[tk] === activeTagFilter);
      if (focusOnly) list = list.filter((tk) => smartFocusReasons(cached[tk], sfPrefs).length > 0);

      if (list.length === 0) {
        const emptyMsg = focusOnly ? (t('sfEmpty') || 'No Smart Focus highlights right now.') : (activeTagFilter !== 'all' ? (t('tagEmpty') || 'No stocks with this tag.') : t('watchlistEmpty'));
        wlItemsContainer.innerHTML = '<div style="text-align:center;color:var(--label-color);padding:24px 16px;font-size:13px;">' + emptyMsg + '</div>';
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

      let bulkBar = '';
      if (bulkMode) {
        const bb = 'padding:4px 10px; border-radius:12px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-color); font-size:12px; cursor:pointer;';
        const portOpts = Object.keys(ports).map((nm) => `<option value="${escHtml(nm)}"${nm === activePortfolio ? ' selected' : ''}>${escHtml(nm)}</option>`).join('');
        const tagDots = Object.keys(COLOR_TAGS).map((key) => `<button data-bulk-tag="${key}" title="${tagLabel(key)}" style="background:none; border:none; cursor:pointer; padding:0 2px; line-height:0;"><svg width="16" height="16" viewBox="0 0 24 24" fill="${COLOR_TAGS[key].color}"><circle cx="12" cy="12" r="8"/></svg></button>`).join('');
        bulkBar = `<div id="bulk-bar" style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:10px; padding:8px 10px; border:1px solid var(--border-color); border-radius:8px; background:var(--header-bg); font-size:12px; color:var(--text-color);">
          <b id="bulk-count">${bulkSelected.size} ${t('bulkSelected') || 'selected'}</b>
          <span style="display:inline-flex; align-items:center;" title="${t('bulkTagTitle') || 'Apply color tag to selected'}">${tagDots}</span>
          <select id="bulk-portfolio" title="${t('bulkTarget') || 'Target portfolio'}" style="max-width:110px; padding:4px 6px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-color); font-size:12px;">${portOpts}</select>
          <button id="bulk-move" style="${bb}">${t('bulkMove') || 'Move'}</button>
          <button id="bulk-copy" style="${bb}">${t('bulkCopy') || 'Copy'}</button>
          <button id="bulk-delete" style="${bb} border-color:#d93025; color:#d93025;">${t('bulkDelete') || 'Delete'}</button>
          <button id="bulk-cancel" style="${bb}">${t('bulkCancel') || 'Cancel'}</button>
        </div>`;
      }
      let html = bulkBar + `<div style="width:100%; overflow-x:auto; border:1px solid var(--border-color); border-radius:8px;">
        <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:right; color:var(--text-color); white-space:nowrap;">
          <thead>
            <tr style="background:var(--header-bg); border-bottom:1px solid var(--border-color); font-weight:600; text-align:center;">
              <td style="padding:10px; text-align:center;">${t('colSymbol')}</td>
              <td style="padding:6px 10px;"><div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px;"><div id="trend-title-label" style="font-weight:600; font-size:12px; text-align:center;">${trendTitle()}</div><select id="trend-range-select" title="${t('colTrend') || 'Change timeline'}" style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; border:1px solid var(--border-color); background:var(--header-bg); color:var(--text-color); cursor:pointer; text-align:center;">${TREND_OPTIONS.map((o) => `<option value="${o.label}"${o.label === trendRangeLabel ? ' selected' : ''}>${o.label}</option>`).join('')}</select></div></td>
              <td style="padding:10px; cursor:pointer; text-align:center;" id="sort-price" title="${t('sortByPrice')}">${t('colPrice')}${getSortIndicator('price')}</td>
              <td style="padding:10px; text-align:center;">${t('colPE')}</td>
              <td style="padding:10px; cursor:pointer; text-align:center;" id="sort-mcap" title="${t('sortByMCap')}">${t('colMCap')}${getSortIndicator('mcap')}</td>
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

            const hasAlert = !!(alertsObj[ticker] && (alertsObj[ticker].above || alertsObj[ticker].below || alertsObj[ticker].movePct || alertsObj[ticker].high52 || alertsObj[ticker].low52));
            const ratios = data.ratios || {};
            const tag = colorTags[ticker];
            const tagColor = tag && COLOR_TAGS[tag] ? COLOR_TAGS[tag].color : '#c9c9c9';
            const sfReasons = smartFocusReasons(data, sfPrefs);
            const dotColor = tag && COLOR_TAGS[tag] ? COLOR_TAGS[tag].color : (sfReasons.length ? '#1a73e8' : '#c9c9c9');
            const dotTitle = [tag ? tagLabel(tag) : null].concat(sfReasons).filter(Boolean).join(' · ') || (t('tagSetTitle') || 'Set color tag');

            const spark = createSparkline(resolveTrendData(ticker, data));

            html += `
              <tr class="watchlist-row" draggable="true" data-ticker="${ticker}" style="background:${idx % 2 === 0 ? 'var(--row-even)' : 'var(--row-odd)'}; border-bottom:1px solid var(--border-color); cursor:grab;">
                <td style="text-align:left; padding:10px; font-weight:500;">
                  <span style="color:#aaa; margin-right:4px; font-size:10px;" title="${t('dragHint')}">⣿</span>
                  ${bulkMode ? `<input type="checkbox" class="screener-bulk-check" data-ticker="${ticker}"${bulkSelected.has(ticker) ? ' checked' : ''} style="margin-right:6px; vertical-align:middle; accent-color:#1a73e8;">` : ''}
                  <button class="screener-tag-btn" data-ticker="${ticker}" title="${dotTitle}" style="background:none; border:none; cursor:pointer; padding:2px; vertical-align:middle; line-height:0;"><svg width="14" height="14" viewBox="0 0 24 24" fill="${dotColor}"><circle cx="12" cy="12" r="8"/></svg></button>
                  <a href="${data.source === 'yahoo' || ticker.startsWith('^') ? 'https://finance.yahoo.com/quote/' + encodeURIComponent(ticker) : 'https://www.screener.in/company/' + ticker + '/'}" target="_blank" title="${data.companyName || ticker}" style="color:var(--link-green); text-decoration:none;" class="screener-ticker-link" data-source="${data.source || ''}">${ticker}</a>
                </td>
                <td class="trend-cell" data-ticker="${ticker}" style="padding:10px;">${spark}</td>
                <td class="${flashClass}" style="padding:10px;">${ratios['Current Price']||'-'}<br/>${pctHtml}</td>
                <td style="padding:10px;">${ratios['Stock P/E']||'-'}</td>
                <td style="padding:10px;">${formatMcapCell(ratios['Market Cap'], data)}</td>
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

        // Wire up trend timeline selector (persists choice, lazy-loads data)
        const trendSelect = document.getElementById('trend-range-select');
        if (trendSelect) trendSelect.onchange = () => {
          const v = trendSelect.value;
          if (!TREND_OPTIONS.some((o) => o.label === v)) return;
          trendRangeLabel = v;
          try { chrome.storage.local.set({ trendRange: v }); } catch (e) {}
          renderWatchlist();
        };
        try { fetchMissingTrends(list, cached); } catch (e) {}

        // Wire up row action buttons (alert + delete)
        wlItemsContainer.querySelectorAll('.screener-del-btn').forEach(b => b.onclick = () => removeTicker(b.getAttribute('data-ticker')));
        wlItemsContainer.querySelectorAll('.screener-alert-btn').forEach(b => b.onclick = () => openAlertModal(b.getAttribute('data-ticker')));
        wlItemsContainer.querySelectorAll('.screener-tag-btn').forEach(b => b.onclick = (e) => { e.stopPropagation(); openTagMenu(b, b.getAttribute('data-ticker')); });
        wlItemsContainer.querySelectorAll('.screener-bulk-check').forEach(c => c.onchange = () => {
          const tk = c.getAttribute('data-ticker');
          if (c.checked) bulkSelected.add(tk); else bulkSelected.delete(tk);
          const cnt = document.getElementById('bulk-count');
          if (cnt) cnt.textContent = bulkSelected.size + ' ' + (t('bulkSelected') || 'selected');
          const row = c.closest('tr');
          if (row) row.style.outline = c.checked ? '2px solid rgba(26,115,232,.5)' : '';
          if (row) row.style.outlineOffset = c.checked ? '-2px' : '';
        });
        const bulkCancelBtn = document.getElementById('bulk-cancel');
        if (bulkCancelBtn) bulkCancelBtn.onclick = () => exitBulkMode();
        const bulkDeleteBtn = document.getElementById('bulk-delete');
        if (bulkDeleteBtn) bulkDeleteBtn.onclick = () => bulkDelete();
        const bulkMoveBtn = document.getElementById('bulk-move');
        if (bulkMoveBtn) bulkMoveBtn.onclick = () => bulkMoveCopy('move');
        const bulkCopyBtn = document.getElementById('bulk-copy');
        if (bulkCopyBtn) bulkCopyBtn.onclick = () => bulkMoveCopy('copy');
        wlItemsContainer.querySelectorAll('[data-bulk-tag]').forEach(b => b.onclick = () => bulkTag(b.getAttribute('data-bulk-tag')));
        wlItemsContainer.querySelectorAll('.screener-ticker-link').forEach(a => a.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openPlatformMenu(a, a.getAttribute('data-ticker'), a.getAttribute('data-source')); });
        if (bulkMode) wlItemsContainer.querySelectorAll('.watchlist-row').forEach(row => {
          if (bulkSelected.has(row.getAttribute('data-ticker'))) { row.style.outline = '2px solid rgba(26,115,232,.5)'; row.style.outlineOffset = '-2px'; }
        });

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
          <div class="pinned-card" data-slot="${slot}" style="background:var(--verdict-bg); border:1px solid var(--border-color); border-radius:8px; padding:12px 10px; text-align:center; position:relative; cursor:pointer; transition:border-color 0.2s, box-shadow 0.2s; display:flex; flex-direction:column; justify-content:center; min-height:84px; box-sizing:border-box;" title="${t('clickEditCard', item.key)}">
            <div style="font-weight:600; color:var(--label-color); font-size:11px; margin-bottom:4px; padding:0 4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-transform:uppercase; letter-spacing:0.04em;" title="${item.key}">${item.key}</div>
            <div class="pinned-card-price ${flashClass}">${displayPrice}</div>
            <div style="color:${changeColor}; font-size:12px; font-weight:600; line-height:1.2;">${changeSign ? `${changeSign} ` : ''}${displayPct}</div>
          </div>
        `;
      });
      
      for (let slot = pinned.length; slot < 4; slot++) {
        html += `
          <div class="pinned-card empty-slot" data-slot="${slot}" style="background:var(--verdict-bg); border:1px dashed var(--border-color); border-radius:8px; padding:12px 10px; text-align:center; position:relative; cursor:pointer; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.6; min-height:84px; box-sizing:border-box; transition:border-color 0.2s, opacity 0.2s;" title="${t('addNewSlot')}">
            <div style="font-size:22px; color:var(--label-color); line-height:1; margin-bottom:4px;">+</div>
            <div style="font-size:11px; font-weight:600; color:var(--label-color); text-transform:uppercase; letter-spacing:0.04em;">${t('addTicker')}</div>
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
  const ECONOMY_MACRO_CONFIG = {
    'USA': { q: 'US+Economy+OR+"Federal+Reserve"+OR+Inflation+OR+"Interest+Rates"+OR+GDP', hl: 'en-US', gl: 'US', ceid: 'US:en' },
    'India': { q: 'India+Economy+OR+RBI+OR+Inflation+OR+GDP+OR+"Indian+Economy"', hl: 'en-IN', gl: 'IN', ceid: 'IN:en' },
    'UK': { q: 'UK+Economy+OR+"Bank+of+England"+OR+Inflation+OR+GDP', hl: 'en-GB', gl: 'GB', ceid: 'GB:en' },
    'Singapore': { q: 'Singapore+Economy+OR+MAS+OR+Inflation+OR+GDP', hl: 'en-SG', gl: 'SG', ceid: 'SG:en' },
    'Japan': { q: 'Japan+Economy+OR+"Bank+of+Japan"+OR+Inflation+OR+Yen', hl: 'en-US', gl: 'US', ceid: 'US:en' },
    'Germany': { q: 'Germany+Economy+OR+ECB+OR+Inflation+OR+GDP', hl: 'en-US', gl: 'US', ceid: 'US:en' },
    'France': { q: 'France+Economy+OR+ECB+OR+Inflation+OR+GDP', hl: 'en-US', gl: 'US', ceid: 'US:en' },
    'Australia': { q: 'Australia+Economy+OR+RBA+OR+Inflation+OR+GDP', hl: 'en-AU', gl: 'AU', ceid: 'AU:en' },
    'Canada': { q: 'Canada+Economy+OR+"Bank+of+Canada"+OR+Inflation+OR+GDP', hl: 'en-CA', gl: 'CA', ceid: 'CA:en' },
    'Hong Kong': { q: 'Hong+Kong+Economy+OR+HKMA+OR+Inflation+OR+GDP', hl: 'en-US', gl: 'US', ceid: 'US:en' }
  };

  function buildNewsCardHtml(item) {
    const title = item.querySelector('title')?.textContent || '';
    const link = item.querySelector('link')?.textContent || '';
    const pubDate = item.querySelector('pubDate')?.textContent || '';
    const source = item.querySelector('source')?.textContent || t('newsSourceDefault');
    const dateStr = pubDate ? new Date(pubDate).toLocaleDateString() : '';
    const thumb = newsThumbHtml(item, source);

    return `
      <div style="padding: 10px 12px; border-bottom: 1px solid var(--border-color); display:flex; gap:10px; align-items:center;">
        ${thumb}
        <div style="min-width:0; flex:1;">
          <a href="${link}" target="_blank" rel="noopener" style="color:var(--text-color); text-decoration:none; font-size:13px; font-weight:500; display:block; margin-bottom:3px; line-height:1.35;">${title}</a>
          <div style="font-size:11px; color:var(--label-color);">${source} &bull; ${dateStr}</div>
        </div>
      </div>
    `;
  }

  function displayNews(filter = currentNewsFilter) {
    currentNewsFilter = filter;
    let html = '';

    const showMacro = filter === 'all' || filter === 'macro';
    const showWatchlist = filter === 'all' || filter === 'watchlist';

    if (showMacro) {
      const items = (cachedMacroItems || []).slice(0, filter === 'macro' ? 12 : 5);
      html += `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:6px; margin-bottom:4px; padding:0 12px;">
          <div style="font-size:11px; font-weight:700; letter-spacing:0.04em; color:var(--label-color); display:flex; align-items:center; gap:6px;">
            <span>🌐</span>
            <span>${t('macroNewsTitle')}</span>
          </div>
          <span style="font-size:10px; font-weight:600; padding:1px 6px; border-radius:10px; background:var(--tag-bg, rgba(0,0,0,0.06)); color:var(--label-color);">${activeEconomy}</span>
        </div>
      `;
      if (items.length > 0) {
        items.forEach(item => {
          html += buildNewsCardHtml(item);
        });
      } else {
        html += `<div style="text-align:center; color:var(--label-color); padding:16px; font-size:12px;">${t('noMacroNews')}</div>`;
      }
    }

    if (showWatchlist) {
      html += `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:${showMacro ? '16px' : '6px'}; margin-bottom:4px; padding:0 12px;">
          <div style="font-size:11px; font-weight:700; letter-spacing:0.04em; color:var(--label-color); display:flex; align-items:center; gap:6px;">
            <span>📊</span>
            <span>${t('watchlistNewsTitle')}</span>
          </div>
          <span style="font-size:10px; font-weight:600; padding:1px 6px; border-radius:10px; background:var(--tag-bg, rgba(0,0,0,0.06)); color:var(--label-color);">${activePortfolio}</span>
        </div>
      `;
      if (cachedWatchlistHtml && cachedWatchlistHtml.trim()) {
        html += cachedWatchlistHtml;
      } else {
        html += `<div style="text-align:center; color:var(--label-color); padding:16px; font-size:12px;">${t('noPortfolioNewsPrompt')}</div>`;
      }
    }

    newsContainer.innerHTML = html;
  }

  function renderNews(force = false) {
    const isCacheFresh = (Date.now() - cachedNewsTime) < 10 * 60 * 1000;
    if (!force && isCacheFresh && cachedMacroItems !== null && cachedWatchlistHtml !== null) {
      displayNews();
      return;
    }

    newsContainer.innerHTML = '<div class="screener-loading" style="text-align:center; padding:20px;">' + t('newsLoading') + '</div>';

    chrome.storage.local.get(['portfolios'], async (res) => {
      const list = (res.portfolios || {})[activePortfolio] || [];
      const cfg = ECONOMY_MACRO_CONFIG[activeEconomy] || ECONOMY_MACRO_CONFIG['USA'];

      const fetchMacroPromise = (async () => {
        try {
          const feedRes = await fetch(`https://news.google.com/rss/search?q=${cfg.q}&hl=${cfg.hl}&gl=${cfg.gl}&ceid=${cfg.ceid}`);
          const text = await feedRes.text();
          const parser = new DOMParser();
          const xml = parser.parseFromString(text, 'text/xml');
          return Array.from(xml.querySelectorAll('item'));
        } catch (e) {
          console.error('Macro News fetch error', e);
          return [];
        }
      })();

      const fetchWatchlistPromise = (async () => {
        if (list.length === 0) return '';
        const results = await Promise.all(list.map(async (ticker) => {
          try {
            const feedRes = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(ticker)}+stock&hl=${cfg.hl}&gl=${cfg.gl}&ceid=${cfg.ceid}`);
            const text = await feedRes.text();
            const parser = new DOMParser();
            const xml = parser.parseFromString(text, 'text/xml');
            const items = Array.from(xml.querySelectorAll('item')).slice(0, 2);
            let html = '';
            if (items.length > 0) {
              html += `<div style="font-size:11px; font-weight:600; color:var(--text-color); margin-top:8px; margin-bottom:2px; padding:0 12px; opacity:0.85;">${t('tickerNewsTitle', ticker)}</div>`;
              items.forEach(item => {
                html += buildNewsCardHtml(item);
              });
            }
            return html;
          } catch (e) {
            console.error('News error for', ticker, e);
            return '';
          }
        }));
        return results.join('');
      })();

      try {
        const [macroItems, watchlistHtml] = await Promise.all([fetchMacroPromise, fetchWatchlistPromise]);
        cachedMacroItems = macroItems;
        cachedWatchlistHtml = watchlistHtml;
        cachedNewsTime = Date.now();
        displayNews();
      } catch (err) {
        console.error('renderNews error', err);
        displayNews();
      }
    });
  }

  // Setup news filter buttons
  const newsFilterBar = document.getElementById('news-filter-bar');
  if (newsFilterBar) {
    newsFilterBar.querySelectorAll('input[name="news-filter"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        displayNews(e.target.value);
      });
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






