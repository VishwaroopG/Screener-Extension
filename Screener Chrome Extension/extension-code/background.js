// Serialize cache commits and merge only fields changed by this refresh.
// If another refresh changed the same field since our read, keep its newer value.
let cacheCommitQueue = Promise.resolve();
function mergeRefreshState(before, proposed, current) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (same(before, proposed)) return current;
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  if (object(proposed) && (object(current) || current === undefined)) {
    const out = { ...(current || {}) };
    for (const key of Object.keys(proposed)) {
      const value = mergeRefreshState(before?.[key], proposed[key], current?.[key]);
      if (value !== undefined) out[key] = value;
    }
    return out;
  }
  return same(before, current) ? proposed : current;
}
function commitRefreshState(proposed, baseline) {
  const pending = JSON.parse(JSON.stringify(proposed));
  const before = JSON.parse(JSON.stringify(baseline));
  const commit = cacheCommitQueue.then(async () => {
    const current = await chrome.storage.local.get(Object.keys(pending));
    const merged = {};
    for (const key of Object.keys(pending)) {
      merged[key] = key === 'cachedData' || key === 'marketIndices'
        ? mergeRefreshState(before[key], pending[key], current[key])
        : pending[key];
    }
    await chrome.storage.local.set(merged);
    Object.assign(baseline, pending);
  });
  cacheCommitQueue = commit.catch(() => {});
  return commit;
}

let fastPollInterval = null;
let isFetchingFastPrices = false;
let lastFastFallbackAt = 0;
let yahooCrumb = null;
let yahooCrumbAt = 0;
let yahooCrumbPromise = null;
let isFetchingQuotes = false;
let lastFundamentalsAt = 0;
const PRICE_DECIMALS = 2;
// Sub-dollar assets (e.g. altcoins, JPY-cross forex) need more precision
function priceDecimalsFor(v) {
  const a = Math.abs(Number(v));
  if (!isFinite(a) || a === 0 || a >= 1) return PRICE_DECIMALS;
  if (a >= 0.01) return 4;
  return 6;
}
// Classify a symbol into stock | crypto | forex | commodity | index.
// Used to skip equity-only enrichment (Finviz, Screener peers) for non-equities.
function classifyAsset(ticker, meta) {
  const t = String(ticker || '').toUpperCase();
  const qt = String((meta && (meta.quoteType || meta.instrumentType)) || '').toUpperCase();
  if (t.startsWith('^') || qt === 'INDEX') return 'index';
  if (/-USD[TC]?$/.test(t) || qt === 'CRYPTOCURRENCY' || qt === 'CRYPTO') return 'crypto';
  if (/=X$/.test(t) || qt === 'CURRENCY') return 'forex';
  if (/=F$/.test(t) || qt === 'FUTURE') return 'commodity';
  return 'stock';
}
function t(key, subs) { try { return chrome.i18n.getMessage(key, subs); } catch (e) { return ''; } }
const MACRO_CACHE_VERSION = 3; // bump to force refetch when indicator set changes
// Full World Bank indicator catalog for the editable Economy Indicator tiles
const MACRO_INDICATOR_DEFS = [
  { key: 'inflation', label: 'Inflation (CPI)', code: 'FP.CPI.TOTL.ZG', suffix: '%' },
  { key: 'unemployment', label: 'Unemployment', code: 'SL.UEM.TOTL.ZS', suffix: '%' },
  { key: 'gdp', label: 'GDP Growth', code: 'NY.GDP.MKTP.KD.ZG', suffix: '%' },
  { key: 'gdppc', label: 'GDP per Capita', code: 'NY.GDP.PCAP.CD', prefix: '$' },
  { key: 'gdptotal', label: 'GDP Total', code: 'NY.GDP.MKTP.CD', prefix: '$', compact: true },
  { key: 'trade', label: 'Trade (% of GDP)', code: 'NE.TRD.GNFS.ZS', suffix: '%' },
  { key: 'reserves', label: 'Forex Reserves', code: 'FI.RES.TOTL.CD', prefix: '$', compact: true },
  { key: 'population', label: 'Population', code: 'SP.POP.TOTL', compact: true }
];
function formatMacroValue(raw, def) {
  const num = Number(raw);
  if (!isFinite(num)) return null;
  if (def.compact) {
    const abs = Math.abs(num);
    let out;
    if (abs >= 1e12) out = `${(num / 1e12).toFixed(2)}T`;
    else if (abs >= 1e9) out = `${(num / 1e9).toFixed(2)}B`;
    else if (abs >= 1e6) out = `${(num / 1e6).toFixed(2)}M`;
    else out = num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    return `${def.prefix || ''}${out}`;
  }
  const decimals = def.prefix ? 0 : 1;
  const grouped = num.toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
  return `${def.prefix || ''}${grouped}${def.suffix || ''}`;
}
// ---- Cross-device preference sync ----
// Small preference keys are mirrored to chrome.storage.sync, which the browser
// syncs automatically via the user's browser profile (Google / Firefox account).
// No separate extension account or backend is needed: signing in to the browser
// is the sign-in. Bulky / high-churn caches (cachedData, marketIndices,
// macroStats) intentionally stay in local-only storage.
const SYNCABLE_KEYS = [
  'tapePosition', 'tapeSize', 'tapeTheme', 'tapeDirection',
  'tapePauseOnHover', 'tapeShowIndices', 'tapeShowChange', 'tapeShowAmount',
  'tapeVisible', 'tapePaused', 'tapeSpeedMultiplier',
  'theme', 'portfolios', 'screenerWatchlist', 'activePortfolioName', 'alerts', 'priceAlerts',
  'clockKeys', 'pinnedIndices', 'disabledDomains',
  'overviewEconomy', 'macroTiles'
];
const SYNC_TIME_KEY = 'lastPrefsSyncAt';
let syncPushTimer = null;

function prefsSyncArea() {
  try {
    return (chrome.storage && chrome.storage.sync) ? chrome.storage.sync : null;
  } catch (e) {
    return null;
  }
}

function syncValsEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (e) {
    return a === b;
  }
}

function isBraveBrowser() {
  try {
    return navigator.userAgent && navigator.userAgent.includes('Brave');
  } catch (e) {
    return false;
  }
}

function getSyncEmail() {
  return new Promise((resolve) => {
    try {
      if (isBraveBrowser()) {
        // Brave blocks chrome.identity.getProfileUserInfo - sync still works
        resolve('');
        return;
      }
      if (chrome.identity && chrome.identity.getProfileUserInfo) {
        chrome.identity.getProfileUserInfo((info) => {
          if (chrome.runtime.lastError) {
            console.warn('getProfileUserInfo error:', chrome.runtime.lastError.message);
            resolve('');
            return;
          }
          const email = (info && info.email) || '';
          console.log('getProfileUserInfo result:', email ? 'found email' : 'no email', email ? email.substring(0, 3) + '...' : '');
          resolve(email);
        });
      } else {
        console.warn('chrome.identity not available');
        resolve('');
      }
    } catch (e) {
      console.warn('getSyncEmail exception:', e);
      resolve('');
    }
  });
}

async function isPrefsSyncEnabled() {
  try {
    const res = await chrome.storage.local.get(['syncEnabled']);
    return res.syncEnabled !== false;
  } catch (e) {
    return true;
  }
}

// Push local preference changes up to browser-profile sync (last-writer-wins).
async function pushPrefsToSync() {
  try {
    const area = prefsSyncArea();
    if (!area) return { success: false, reason: 'unsupported' };
    if (!(await isPrefsSyncEnabled())) return { success: false, reason: 'disabled' };
    const [localVals, syncVals] = await Promise.all([
      chrome.storage.local.get(SYNCABLE_KEYS),
      new Promise((resolve) => {
        try {
          area.get(SYNCABLE_KEYS, (res) => {
            if (chrome.runtime.lastError) resolve({});
            else resolve(res || {});
          });
        } catch (e) {
          resolve({});
        }
      })
    ]);
    const diff = {};
    for (const key of SYNCABLE_KEYS) {
      if (localVals[key] !== undefined && !syncValsEqual(localVals[key], syncVals[key])) {
        diff[key] = localVals[key];
      }
    }
    if (Object.keys(diff).length === 0) return { success: true, pushed: 0 };
    const setOk = await new Promise((resolve) => {
      try {
        area.set(diff, () => resolve(!chrome.runtime.lastError));
      } catch (e) {
        resolve(false);
      }
    });
    if (!setOk) return { success: false, reason: 'quota' };
    await chrome.storage.local.set({ [SYNC_TIME_KEY]: Date.now() });
    return { success: true, pushed: Object.keys(diff).length };
  } catch (e) {
    return { success: false, reason: 'error' };
  }
}

// Pull the latest synced preferences down into local storage (sync wins).
async function pullPrefsFromSync() {
  try {
    const area = prefsSyncArea();
    if (!area) return { success: false, reason: 'unsupported' };
    if (!(await isPrefsSyncEnabled())) return { success: false, reason: 'disabled' };
    const [localVals, syncVals] = await Promise.all([
      chrome.storage.local.get(SYNCABLE_KEYS),
      new Promise((resolve) => {
        try {
          area.get(SYNCABLE_KEYS, (res) => {
            if (chrome.runtime.lastError) resolve({});
            else resolve(res || {});
          });
        } catch (e) {
          resolve({});
        }
      })
    ]);
    const apply = {};
    for (const key of SYNCABLE_KEYS) {
      if (syncVals[key] !== undefined && !syncValsEqual(syncVals[key], localVals[key])) {
        apply[key] = syncVals[key];
      }
    }
    if (Object.keys(apply).length > 0) {
      await chrome.storage.local.set(apply);
      // Stamp the time only when preferences actually moved - a no-op pull
      // must not pretend a sync happened.
      await chrome.storage.local.set({ [SYNC_TIME_KEY]: Date.now() });
    }
    return { success: true, pulled: Object.keys(apply).length };
  } catch (e) {
    return { success: false, reason: 'error' };
  }
}

function schedulePrefsPush() {
  if (syncPushTimer) clearTimeout(syncPushTimer);
  syncPushTimer = setTimeout(() => {
    syncPushTimer = null;
    pushPrefsToSync();
  }, 2000);
}

// Mirror preference changes in both directions (diff-guarded, so no echo loops:
// a push writes identical values to sync, which then compare equal and stop).
chrome.storage.onChanged.addListener((changes, namespace) => {
  try {
    if (namespace === 'local') {
      for (const key of SYNCABLE_KEYS) {
        if (changes[key] !== undefined) {
          schedulePrefsPush();
          break;
        }
      }
    } else if (namespace === 'sync') {
      (async () => {
        if (!(await isPrefsSyncEnabled())) return;
        const keys = Object.keys(changes).filter((k) => SYNCABLE_KEYS.includes(k));
        if (keys.length === 0) return;
        const localVals = await chrome.storage.local.get(keys);
        const apply = {};
        for (const key of keys) {
          const incoming = changes[key].newValue;
          if (incoming !== undefined && !syncValsEqual(incoming, localVals[key])) {
            apply[key] = incoming;
          }
        }
        if (Object.keys(apply).length > 0) {
          await chrome.storage.local.set(apply);
          await chrome.storage.local.set({ [SYNC_TIME_KEY]: Date.now() });
        }
      })();
    }
  } catch (e) {}
});

// Open side panel on action icon click (Chrome only - Firefox uses sidebar_action)
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));
}
// Open feedback page when the extension is uninstalled
try {
  chrome.runtime.setUninstallURL('https://vishwaroopg.github.io/Screener-Extension/uninstall/');
} catch (error) { console.error(error); }

// Fetch helper
function roundStringValue(str, decimals = 2) {
  return str.replace(/[\d,\.]+/g, (match) => {
    if (match === '.') return match;
    const num = parseFloat(match.replace(/,/g, ''));
    if (isNaN(num)) return match;
    return num.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  });
}

// Pure ratios (P/E, ROCE, ROE, yields, P/B) must not carry forced trailing
// zeros - Screener shows 51.5, not 51.50. Max 2 decimals, min 0.
function formatPureRatio(str) {
  return String(str).replace(/[\d,]+\.\d+|[\d,]+/g, (match) => {
    if (/^[.,]+$/.test(match)) return match;
    const num = parseFloat(match.replace(/,/g, ''));
    if (isNaN(num)) return match;
    return num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  });
}
const PURE_RATIO_KEYS = new Set(['Stock P/E', 'Dividend Yield', 'ROCE', 'ROE', 'Price to book value']);

function formatMarketCap(value) {
  if (value === null || value === undefined || value === '-') return value;
  return String(value).replace(/[\d,]+(?:\.\d+)?/g, (match) => {
    const num = Number(match.replace(/,/g, ''));
    return Number.isFinite(num)
      ? num.toLocaleString('en-IN', { maximumFractionDigits: 0 })
      : match;
  });
}

function parseMarketCapToNumber(str) {
  if (typeof str === 'number') return str;
  if (str == null || str === '' || str === '-') return NaN;
  const s = String(str).replace(/,/g, '').trim();
  const cr = s.match(/([\d.]+)\s*Cr/i);
  if (cr) {
    const n = parseFloat(cr[1]);
    return Number.isFinite(n) ? n * 1e7 : NaN;
  }
  const m = s.match(/([\d.]+)\s*([TBMK])?/i);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return NaN;
  const mul = { T: 1e12, B: 1e9, M: 1e6, K: 1e3 }[(m[2] || '').toUpperCase()] || 1;
  return n * mul;
}

function formatMarketCapFromNumber(num, currencyCode) {
  if (!Number.isFinite(num) || num <= 0) return null;
  const currency = getCurrencyDetails(currencyCode);
  const prefix = currency.prefix || '';
  if ((currencyCode || 'INR') === 'INR') {
    const cr = num / 1e7;
    const decimals = Math.abs(cr) >= 100 ? 0 : 2;
    return prefix + cr.toLocaleString('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: 0 }) + ' Cr.';
  }
  const abs = Math.abs(num);
  let out;
  if (abs >= 1e12) out = (num / 1e12).toFixed(2) + 'T';
  else if (abs >= 1e9) out = (num / 1e9).toFixed(2) + 'B';
  else if (abs >= 1e6) out = (num / 1e6).toFixed(2) + 'M';
  else out = num.toLocaleString(currency.locale || 'en-US', { maximumFractionDigits: 0 });
  return prefix + out;
}

function parsePriceNumber(str) {
  if (typeof str === 'number') return str;
  if (str == null || str === '') return NaN;
  return parseFloat(String(str).replace(/[^\d.-]/g, ''));
}

function captureValuationAnchors(entry, price) {
  if (!entry || !entry.ratios || !Number.isFinite(price) || price <= 0) return;
  const pe = parseFloat(String(entry.ratios['Stock P/E'] || '').replace(/,/g, ''));
  if (Number.isFinite(pe) && pe > 0) entry.epsTTM = price / pe;
  const mcap = parseMarketCapToNumber(entry.ratios['Market Cap']);
  if (Number.isFinite(mcap) && mcap > 0) entry.sharesOutstanding = mcap / price;
  const pb = parseFloat(String(entry.ratios['Price to book value'] || '').replace(/,/g, ''));
  if (Number.isFinite(pb) && pb > 0) entry.bookValue = price / pb;
}

function refreshLiveValuation(entry, price, currencyCode) {
  if (!entry || !Number.isFinite(price) || price <= 0) return false;
  if (!entry.ratios) entry.ratios = {};
  const code = currencyCode || entry.currency;
  let changed = false;
  if (typeof entry.epsTTM === 'number' && Number.isFinite(entry.epsTTM) && entry.epsTTM !== 0) {
    const pe = price / entry.epsTTM;
    if (Number.isFinite(pe) && pe > 0) {
      const formatted = formatPureRatio(pe.toFixed(2));
      if (entry.ratios['Stock P/E'] !== formatted) {
        entry.ratios['Stock P/E'] = formatted;
        changed = true;
      }
    }
  }
  if (typeof entry.sharesOutstanding === 'number' && entry.sharesOutstanding > 0) {
    const formatted = formatMarketCapFromNumber(price * entry.sharesOutstanding, code);
    if (formatted && entry.ratios['Market Cap'] !== formatted) {
      entry.ratios['Market Cap'] = formatted;
      changed = true;
    }
  }
  if (typeof entry.bookValue === 'number' && Number.isFinite(entry.bookValue) && entry.bookValue !== 0) {
    const pb = price / entry.bookValue;
    if (Number.isFinite(pb) && pb > 0) {
      const formatted = formatPureRatio(pb.toFixed(2));
      if (entry.ratios['Price to book value'] !== formatted) {
        entry.ratios['Price to book value'] = formatted;
        changed = true;
      }
    }
  }
  return changed;
}

function applyQuoteFundamentals(entry, quote) {
  if (!entry || !quote) return false;
  if (!entry.ratios) entry.ratios = {};
  const ratios = entry.ratios;
  const currencyCode = quote.currency || entry.currency;
  let changed = false;
  if (quote.currency && entry.currency !== quote.currency) {
    entry.currency = quote.currency;
    changed = true;
  }
  if (quote.shortName && !entry.companyName) {
    entry.companyName = quote.shortName;
    changed = true;
  }
  entry.success = true;
  if (typeof quote.epsTrailingTwelveMonths === 'number' && Number.isFinite(quote.epsTrailingTwelveMonths) && quote.epsTrailingTwelveMonths !== 0) {
    entry.epsTTM = quote.epsTrailingTwelveMonths;
  }
  if (typeof quote.sharesOutstanding === 'number' && quote.sharesOutstanding > 0) {
    entry.sharesOutstanding = quote.sharesOutstanding;
  }
  if (typeof quote.bookValue === 'number' && Number.isFinite(quote.bookValue) && quote.bookValue !== 0) {
    entry.bookValue = quote.bookValue;
  }
  const pe = quote.trailingPE ?? quote.forwardPE;
  if (typeof pe === 'number' && Number.isFinite(pe) && pe > 0) {
    const formatted = formatPureRatio(pe.toFixed(2));
    if (ratios['Stock P/E'] !== formatted) {
      ratios['Stock P/E'] = formatted;
      changed = true;
    }
  }
  if (typeof quote.marketCap === 'number' && quote.marketCap > 0) {
    const formatted = formatMarketCapFromNumber(quote.marketCap, currencyCode);
    if (formatted && ratios['Market Cap'] !== formatted) {
      ratios['Market Cap'] = formatted;
      changed = true;
    }
  }
  if (!ratios['Price to book value']) {
    const pb = quote.priceToBook;
    if (typeof pb === 'number' && Number.isFinite(pb) && pb > 0) {
      ratios['Price to book value'] = formatPureRatio(pb.toFixed(2));
      changed = true;
    }
  }
  if (!ratios['Dividend Yield']) {
    const dy = quote.trailingAnnualDividendYield ?? quote.dividendYield;
    if (typeof dy === 'number' && Number.isFinite(dy) && dy > 0) {
      ratios['Dividend Yield'] = (dy * 100).toFixed(2) + '%';
      changed = true;
    }
  }
  const price = quote.regularMarketPrice;
  if (Number.isFinite(price) && price > 0) {
    if (refreshLiveValuation(entry, price, currencyCode)) changed = true;
    captureValuationAnchors(entry, price);
  }
  return changed;
}

// Bounded fetch: an unbounded request in the service worker can hang for
// minutes, which stalls the P/E + market-cap pipeline and keeps the
// isFetchingQuotes lock held, blocking every later refresh.
async function fetchWithTimeout(url, opts, ms, bufferText = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, Object.assign({}, opts, { signal: controller.signal }));
    if (!bufferText) return response;
    // Keep the deadline active while HTML downloads, not just until headers.
    const body = await response.text();
    return { ok: response.ok, status: response.status, text: async () => body };
  } finally {
    clearTimeout(timer);
  }
}

// Warm the cookie+crumb handshake at startup so the very first P/E / market-cap
// refresh does not pay for two extra round-trips on a cold service worker.
// Fire-and-forget: fetchYahooQuotes still retries the crumb on 401/403.
ensureYahooCrumb().catch(() => {});

async function ensureYahooCrumb(force) {
  if (!force && yahooCrumb && (Date.now() - yahooCrumbAt) < 30 * 60 * 1000) return yahooCrumb;
  if (yahooCrumbPromise) return yahooCrumbPromise;
  yahooCrumbPromise = (async () => {
    try {
      await fetchWithTimeout('https://fc.yahoo.com/', { credentials: 'include', cache: 'no-store' }, 6000).catch(() => {});
      const res = await fetchWithTimeout('https://query1.finance.yahoo.com/v1/test/getcrumb', { credentials: 'include', cache: 'no-store' }, 6000);
      const crumb = String(await res.text() || '').trim();
      if (!res.ok || !crumb || crumb.length > 80 || /unauthorized|error/i.test(crumb)) {
        yahooCrumb = null;
        return null;
      }
      yahooCrumb = crumb;
      yahooCrumbAt = Date.now();
      return crumb;
    } catch (e) {
      yahooCrumb = null;
      return null;
    } finally {
      yahooCrumbPromise = null;
    }
  })();
  return yahooCrumbPromise;
}

// Renamed NSE symbols: when a company renames, the exchange retires the old
// code and BOTH data sources 404 on it (ICICI Prudential Life -> ICICI Life;
// ICICIPRULI -> ICICILIFE on 2026-10-23; ICICIPRULIFE is a common misspelling
// seen in imported watchlists). Without this map those rows sit dead as
// "Could not fetch" forever, with no P/E, Market Cap or price. Network calls
// use the live symbol; the cache key stays the user's original ticker.
// Keep in sync with the copies in sidepanel.js and ticker_tape.js.
const SYMBOL_ALIASES = {
  ICICIPRULI: 'ICICILIFE',
  ICICIPRULIFE: 'ICICILIFE'
};
function resolveSymbolAlias(ticker) {
  const bare = String(ticker || '').trim().toUpperCase().replace(/\.(NS|BO)$/, '');
  return SYMBOL_ALIASES[bare] || ticker;
}

async function fetchYahooQuotes(symbols) {
  const unique = [...new Set((symbols || []).filter(Boolean))];
  if (!unique.length) return {};
  let crumb = await ensureYahooCrumb();
  if (!crumb) return {};
  const out = {};
  const chunkSize = 40;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const urlFor = (c) => `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(chunk.join(','))}&crumb=${encodeURIComponent(c)}`;
    try {
      let res = await fetchWithTimeout(urlFor(crumb), { credentials: 'include', cache: 'no-store' }, 10000);
      if (res.status === 401 || res.status === 403) {
        yahooCrumb = null;
        crumb = await ensureYahooCrumb(true);
        if (!crumb) break;
        res = await fetchWithTimeout(urlFor(crumb), { credentials: 'include', cache: 'no-store' }, 10000);
      }
      if (!res.ok) continue;
      const data = await res.json();
      for (const q of data?.quoteResponse?.result || []) {
        if (q && q.symbol) out[q.symbol] = q;
      }
    } catch (e) {}
  }
  return out;
}

function yahooQuoteForTicker(ticker, quotes, cached) {
  if (!quotes) return null;
  // Retired NSE symbols resolve to their live code (SYMBOL_ALIASES) so a
  // stale watchlist row still picks up P/E and Market Cap.
  const live = resolveSymbolAlias(ticker);
  if (quotes[live]) return quotes[live];
  if (quotes[live + '.NS']) return quotes[live + '.NS'];
  if (quotes[ticker]) return quotes[ticker];
  if (quotes[ticker + '.NS']) return quotes[ticker + '.NS'];
  const currency = cached && cached.currency;
  if (currency && currency !== 'INR' && quotes[ticker]) return quotes[ticker];
  return null;
}

function needsValuationRefresh(entry, ticker) {
  const kind = (entry && entry.assetKind) || classifyAsset(ticker);
  if (kind !== 'stock') return false;
  const ratios = (entry && entry.ratios) || {};
  return !ratios['Stock P/E'] || ratios['Stock P/E'] === '-' || !ratios['Market Cap'] || ratios['Market Cap'] === '-' || !entry || !entry.epsTTM || !entry.sharesOutstanding;
}

async function refreshWatchlistFundamentals(symbols, allTickers) {
  if (isFetchingQuotes) return;
  isFetchingQuotes = true;
  try {
    const stockSymbols = (symbols || []).filter((s) => s && !String(s).startsWith('^'));
    const quotes = await fetchYahooQuotes(stockSymbols);
    const stored = await chrome.storage.local.get(['cachedData']);
    const cachedData = stored.cachedData || {};
    const refreshBaseline = structuredClone({ cachedData });
    let changed = false;
    for (const ticker of allTickers || []) {
      if (classifyAsset(ticker) !== 'stock') continue;
      const quote = yahooQuoteForTicker(ticker, quotes, cachedData[ticker]);
      if (!quote) continue;
      if (!cachedData[ticker]) cachedData[ticker] = { ticker, ratios: {}, source: 'yahoo', success: true };
      if (applyQuoteFundamentals(cachedData[ticker], quote)) changed = true;
    }
    // Yahoo can answer for none of the tickers (crumb rotated, rate limited)
    // or only some of them. Either way the non-Yahoo sources still get a turn
    // so P/E and market cap do not sit on "-" across the whole watchlist.
    // Bounded per cycle so one refresh cannot become dozens of serial scrapes.
    const gapTickers = (allTickers || []).filter((tk) => {
      if (classifyAsset(tk) !== 'stock') return false;
      const entry = cachedData[tk];
      if (!entry || !entry.ratios) return false;
      return !fundHasNumber(entry.ratios['Stock P/E']) || !fundHasNumber(entry.ratios['Market Cap']);
    });
    // Rotate the batch so unavailable/loss-making stocks cannot starve later rows.
    const batch = [];
    for (let i = 0; i < Math.min(6, gapTickers.length); i++) {
      batch.push(gapTickers[(fundRefreshCursor + i) % gapTickers.length]);
    }
    fundRefreshCursor = gapTickers.length ? (fundRefreshCursor + batch.length) % gapTickers.length : 0;
    for (const tk of batch) {
      const entry = cachedData[tk];
      const ind = /\.(NS|BO)$/i.test(tk) || entry.currency === 'INR' || entry.source === 'screener';
      try {
        const ok = await resolveValuationFundamentals(tk, entry, {
          currency: entry.currency || (ind ? 'INR' : 'USD'),
          isIndian: ind,
          // The bulk Yahoo quote above already had its turn.
          skip: ['yahooQuote'],
          primaryRank: FUND_SOURCE_RANK.yahooQuote
        });
        if (ok) changed = true;
      } catch (e) {}
    }
    if (changed) {
      await commitRefreshState({ cachedData }, refreshBaseline);
      chrome.runtime.sendMessage({ type: 'WATCHLIST_UPDATED' }).catch(() => {});
    }
  } catch (e) {
  } finally {
    // Stamp on completion, not on entry: a slow or failed attempt should not
    // consume the throttle window on top of the time it already burned, or the
    // retry lands far later than the caller's interval implies.
    lastFundamentalsAt = Date.now();
    isFetchingQuotes = false;
  }
}

function getCurrencyDetails(currency) {
  switch (currency || 'INR') {
    case 'INR': return { code: 'INR', prefix: '₹', locale: 'en-IN' };
    case 'USD': return { code: 'USD', prefix: '$', locale: 'en-US' };
    case 'GBP': return { code: 'GBP', prefix: '£', locale: 'en-GB' };
    case 'EUR': return { code: 'EUR', prefix: '€', locale: 'de-DE' };
    case 'JPY': return { code: 'JPY', prefix: '¥', locale: 'ja-JP' };
    case 'SGD': return { code: 'SGD', prefix: 'S$', locale: 'en-SG' };
    case 'HKD': return { code: 'HKD', prefix: 'HK$', locale: 'en-HK' };
    case 'AUD': return { code: 'AUD', prefix: 'A$', locale: 'en-AU' };
    case 'CAD': return { code: 'CAD', prefix: 'C$', locale: 'en-CA' };
    default: return { code: currency, prefix: `${currency} `, locale: 'en-US' };
  }
}

function normalizeSparkData(payload) {
  const results = payload?.spark?.result;
  if (!Array.isArray(results)) return payload || {};

  return results.reduce((bySymbol, item) => {
    const response = Array.isArray(item?.response) ? item.response[0] : (item?.response || item || {});
    const meta = response.meta || {};
    bySymbol[item.symbol] = {
      close: response.indicators?.quote?.[0]?.close || [],
      previousClose: meta.chartPreviousClose ?? meta.previousClose,
      regularMarketPrice: meta.regularMarketPrice,
      meta
    };
    return bySymbol;
  }, {});
}

async function fetchChartQuote(symbol) {
  try {
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`);
    if (!response.ok) return null;
    const result = (await response.json())?.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta || {};
    return {
      close: result.indicators?.quote?.[0]?.close || [],
      previousClose: meta.chartPreviousClose ?? meta.previousClose,
      regularMarketPrice: meta.regularMarketPrice,
      meta
    };
  } catch (e) {
    return null;
  }
}

// ============================================================================
// Multi-source P/E + market-cap fallback chain
// ============================================================================
// P/E and Market Cap are the two headline watchlist numbers, so they get an
// ordered chain of independent sources rather than a single upstream. Every
// source is time-boxed, records its own health, and may only write a field it
// outranks - so the best source wins per field while any source can backfill
// whatever is still empty.
//
// Yahoo quotes require a cookie/crumb handshake. Screener and Finviz cover
// different markets; Stock Analysis provides an independent HTML fallback.
// Endpoint availability and HTML layouts may change, so failures must fall
// through without replacing previously cached values.

const FUND_SOURCE_RANK = { screener: 10, finviz: 20, yahooQuote: 30, stockAnalysis: 40 };
const FUND_SOURCE_COOLDOWN_MS = 10 * 60 * 1000;
let fundSourceHealth = {};
let fundRefreshCursor = 0;
try {
  chrome.storage.local.get(['fundSourceHealth'], (res) => {
    if (res && res.fundSourceHealth && typeof res.fundSourceHealth === 'object') fundSourceHealth = res.fundSourceHealth;
  });
} catch (e) {}

const fundHasNumber = (v) => /\d/.test(String(v || ''));
// RELIANCE.NS / 500325.BO -> RELIANCE / 500325
const fundBaseSymbol = (t) => String(t || '').replace(/\.(NS|BO)$/i, '').toUpperCase();

function fundNoteSource(id, ticker, ok) {
  // A missing symbol or changed page affects this ticker only. Never disable
  // a provider for the whole watchlist because one company was unavailable.
  const now = Date.now();
  const key = id + ':' + ticker;
  if (ok) delete fundSourceHealth[key];
  else fundSourceHealth[key] = { ok: false, at: now };
  for (const k of Object.keys(fundSourceHealth)) {
    if (!k.includes(':') || now - fundSourceHealth[k].at >= FUND_SOURCE_COOLDOWN_MS) delete fundSourceHealth[k];
  }
  try { chrome.storage.local.set({ fundSourceHealth }).catch(() => {}); } catch (e) {}
}
function fundSourceCoolingDown(id, ticker) {
  const h = fundSourceHealth[id + ':' + ticker];
  return !!(h && !h.ok && (Date.now() - h.at) < FUND_SOURCE_COOLDOWN_MS);
}

// Source result key -> ratio key. `eps` / `shares` are live-refresh anchors
// instead of display values, so they are applied separately by the resolver.
const FUND_FIELD_MAP = [
  ['pe', 'Stock P/E'],
  ['marketCap', 'Market Cap'],
  ['roce', 'ROCE'],
  ['roe', 'ROE'],
  ['dividendYield', 'Dividend Yield'],
  ['pb', 'Price to book value']
];

// stockanalysis.com: the only crumb-free source that also covers India, which
// makes it the backstop for both a Yahoo crumb outage and a Finviz block.
async function fundFromStockAnalysis(ticker, ctx) {
  const base = fundBaseSymbol(ticker);
  if (!base) throw new Error('no symbol');
  // Numeric BSE codes are not NSE symbols. Do not guess a different listing.
  if (/\.BO$/i.test(ticker)) return {};
  if (!ctx.isIndian && (ctx.currency !== 'USD' || base.includes('.'))) return {};
  const url = ctx.isIndian
    ? `https://stockanalysis.com/quote/nse/${encodeURIComponent(base)}/`
    : `https://stockanalysis.com/stocks/${encodeURIComponent(base.toLowerCase())}/`;
  const res = await fetchWithTimeout(url, { cache: 'no-store' }, 6000, true);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  // The overview table renders server-side. The label cell is sometimes a
  // plain <td> ("PE Ratio") and sometimes link-wrapped ("Market Cap"), and the
  // value cell can trail a change <span>, so skip past the label's </td> and
  // take the whole next cell, then strip tags and HTML comments.
  const cell = (label) => {
    const i = html.indexOf('>' + label);
    if (i < 0) return null;
    const after = html.slice(i);
    const labelEnd = after.indexOf('</td>');
    if (labelEnd < 0) return null;
    const valueCell = after.slice(labelEnd + 5);
    const valueEnd = valueCell.indexOf('</td>');
    if (valueEnd < 0) return null;
    return valueCell.slice(0, valueEnd)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };
  const out = {};
  const peRaw = cell('PE Ratio');
  const pe = peRaw && peRaw !== '-' ? parseFloat(peRaw.replace(/[^\d.-]/g, '')) : NaN;
  if (Number.isFinite(pe) && pe > 0) out.pe = formatPureRatio(pe.toFixed(2));
  const mcRaw = cell('Market Cap');
  if (mcRaw && mcRaw !== '-') {
    // "15.76T" -> 15.76e12 -> re-emitted in the row's own currency, matching
    // the Screener/Yahoo shape ("₹15,76,400 Cr." / "$5.03T").
    const n = parseMarketCapToNumber(mcRaw);
    if (Number.isFinite(n) && n > 0) out.marketCap = formatMarketCapFromNumber(n, ctx.currency);
  }
  return out;
}

// Finviz: canonical for US equities. Returns the full fundamentals set, not
// just P/E and market cap, so ROCE / ROE / dividend / P-B keep flowing too.
async function fundFromFinviz(ticker, ctx) {
  const base = fundBaseSymbol(ticker);
  const res = await fetchWithTimeout(`https://finviz.com/quote.ashx?t=${encodeURIComponent(base)}`, { cache: 'no-store' }, 6000, true);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  const extract = (field) => {
    // Tolerate inner tags around the label (e.g. "Dividend TTM" is wrapped in
    // an <a> link) and values that live in <b> or <span>.
    const labelTail = `(?:<[^>]+>)*\\s*<\\/div>\\s*<\\/td>\\s*<td[^>]*>\\s*<div[^>]*>`;
    let m = html.match(new RegExp(`>${field}${labelTail}.*?<b>(.*?)<\\/b>`, 's'));
    if (m && m[1]) return m[1].replace(/<[^>]+>/g, '').trim();
    m = html.match(new RegExp(`>${field}${labelTail}.*?<span[^>]*>(.*?)<\\/span>`, 's'));
    if (m && m[1]) return m[1].replace(/<[^>]+>/g, '').trim();
    m = html.match(new RegExp(`snapshot-td-label[^>]*>(?:<[^>]+>)*\\s*${field}(?:<[^>]+>)*\\s*<\\/td>\\s*<td[^>]*>\\s*<div[^>]*>(.*?)<\\/div>`, 's'));
    if (m && m[1]) { const c = m[1].replace(/<[^>]+>/g, '').trim(); if (c) return c; }
    return null;
  };
  const out = {};
  const pe = extract('P\\/E');
  if (pe && pe !== '-') out.pe = pe;
  // Finviz redesign: capital efficiency is labeled "ROIC" (old "ROI")
  const roic = extract('ROIC') || extract('ROI');
  if (roic && roic !== '-') out.roce = roic;
  const mcap = extract('Market Cap');
  if (mcap && mcap !== '-') {
    const formatted = formatMarketCap(mcap);
    out.marketCap = (/^[^\d\-+.,\s]+/.test(formatted) || !ctx.prefix) ? formatted : ctx.prefix + formatted;
  }
  // Finviz redesign: dividend is labeled "Dividend TTM" (e.g. "3.64 (0.74%)")
  const div = extract('Dividend TTM') || extract('Dividend %') || extract('Dividend');
  if (div && div !== '-') {
    const pct = div.match(/([\d.,]+%)/);
    out.dividendYield = pct ? pct[1] : div;
  }
  const pb = extract('P\\/B');
  if (pb && pb !== '-') out.pb = pb;
  const roe = extract('ROE');
  if (roe && roe !== '-') out.roe = roe;
  return out;
}

// Yahoo bulk quote: cheapest single round-trip, but it only answers while the
// cookie+crumb handshake is healthy.
async function fundFromYahooQuote(ticker, ctx) {
  const symbol = ctx.isIndian && !/\.(NS|BO)$/i.test(ticker) ? ticker + '.NS' : ticker;
  const quotes = await fetchYahooQuotes([symbol]);
  const quote = quotes[symbol];
  if (!quote) throw new Error('no quote');
  const out = {};
  const pe = quote.trailingPE ?? quote.forwardPE;
  if (typeof pe === 'number' && Number.isFinite(pe) && pe > 0) out.pe = formatPureRatio(pe.toFixed(2));
  if (typeof quote.marketCap === 'number' && quote.marketCap > 0) {
    out.marketCap = formatMarketCapFromNumber(quote.marketCap, ctx.currency);
  }
  const pb = quote.priceToBook;
  if (typeof pb === 'number' && Number.isFinite(pb) && pb > 0) out.pb = formatPureRatio(pb.toFixed(2));
  const dy = quote.trailingAnnualDividendYield ?? quote.dividendYield;
  if (typeof dy === 'number' && Number.isFinite(dy) && dy > 0) out.dividendYield = (dy * 100).toFixed(2) + '%';
  out.eps = quote.epsTrailingTwelveMonths;
  out.shares = quote.sharesOutstanding;
  return out;
}

// Screener.in: canonical for NSE/BSE ratios, including the user's customised
// top-ratios ordering. Only used when the caller did not already scrape it.
async function fundFromScreener(ticker, ctx) {
  const base = fundBaseSymbol(ticker);
  const res = await fetchWithTimeout(`https://www.screener.in/company/${encodeURIComponent(base)}/`, { cache: 'no-store' }, 6000, true);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  const m = html.match(/<ul id="top-ratios">([\s\S]*?)<\/ul>/);
  if (!m) throw new Error('no top-ratios');
  const out = {};
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/g;
  let li;
  while ((li = liRe.exec(m[1])) !== null) {
    const nameM = li[1].match(/<span class="name">\s*([^<]+)\s*<\/span>/);
    if (!nameM) continue;
    const name = nameM[1].trim();
    if (name !== 'Stock P/E' && name !== 'Market Cap') continue;
    const val = li[1].substring(nameM.index + nameM[0].length).replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
    if (!/\d/.test(val)) continue;
    if (name === 'Market Cap') out.marketCap = /^[^\d\-+.,\s]+/.test(formatMarketCap(val)) ? formatMarketCap(val) : '₹' + formatMarketCap(val);
    else out.pe = formatPureRatio(val);
  }
  if (!out.pe && !out.marketCap) throw new Error('empty ratios');
  return out;
}

const FUND_SOURCES = [
  { id: 'screener', applies: (ctx) => ctx.isIndian, run: fundFromScreener },
  { id: 'finviz', applies: (ctx) => !ctx.isIndian && ctx.currency === 'USD', run: fundFromFinviz },
  { id: 'yahooQuote', applies: () => true, run: fundFromYahooQuote },
  { id: 'stockAnalysis', applies: () => true, run: fundFromStockAnalysis }
];

// Fill any missing P/E / market-cap fields on `entry` from the first sources
// that answer, honouring per-field ranking. `opts.skip` names sources the
// caller already satisfied (so a Screener scrape is never repeated), and
// `opts.primaryRank` says which rank the fields already present came from.
// Returns true when anything on the entry changed.
async function resolveValuationFundamentals(ticker, entry, opts) {
  if (!entry || !entry.ratios || classifyAsset(ticker) !== 'stock') return false;
  const o = opts || {};
  const skip = new Set(o.skip || []);
  ticker = resolveSymbolAlias(ticker);
  const currency = o.currency || entry.currency || (/\.(NS|BO)$/i.test(String(ticker || '')) ? 'INR' : 'USD');
  const isIndian = o.isIndian !== undefined ? !!o.isIndian : currency === 'INR' || /\.(NS|BO)$/i.test(String(ticker || ''));
  const prefix = getCurrencyDetails(currency).prefix || '';
  const ctx = { isIndian, currency, prefix };

  // rank[field] records which source currently owns each ratio, so a better
  // source can still overwrite a value a worse one left behind.
  const rank = {};
  const seededRank = o.primaryRank || FUND_SOURCE_RANK.yahooQuote;
  for (const [, ratioKey] of FUND_FIELD_MAP) {
    if (fundHasNumber(entry.ratios[ratioKey])) rank[ratioKey] = seededRank;
  }
  const complete = () => fundHasNumber(entry.ratios['Stock P/E']) && fundHasNumber(entry.ratios['Market Cap']);

  let changed = false;
  for (const src of FUND_SOURCES) {
    if (complete()) break;
    if (skip.has(src.id) || fundSourceCoolingDown(src.id, ticker)) continue;
    if (src.applies && !src.applies(ctx)) continue;
    let got = null;
    try {
      got = await src.run(ticker, ctx);
      if (!got || !FUND_FIELD_MAP.some(([key]) => fundHasNumber(got[key]))) throw new Error('empty fundamentals');
      fundNoteSource(src.id, ticker, true);
    } catch (e) {
      fundNoteSource(src.id, ticker, false);
      continue;
    }
    if (!got) continue;
    const srcRank = FUND_SOURCE_RANK[src.id] || 99;
    for (const [key, ratioKey] of FUND_FIELD_MAP) {
      const v = got[key];
      if (!fundHasNumber(v)) continue;
      if (rank[ratioKey] !== undefined && srcRank >= rank[ratioKey]) continue;
      if (entry.ratios[ratioKey] !== v) {
        entry.ratios[ratioKey] = v;
        rank[ratioKey] = srcRank;
        changed = true;
      }
    }
    // Anchors let refreshLiveValuation keep P/E and market cap live as price
    // moves, so they matter as much as the display values themselves.
    if (typeof got.eps === 'number' && Number.isFinite(got.eps) && got.eps !== 0 && !entry.epsTTM) {
      entry.epsTTM = got.eps;
      changed = true;
    }
    if (typeof got.shares === 'number' && got.shares > 0 && !entry.sharesOutstanding) {
      entry.sharesOutstanding = got.shares;
      changed = true;
    }
  }
  return changed;
}

async function fetchYahooData(symbol) {
  try {
    // Retired NSE symbols resolve to their live code (SYMBOL_ALIASES).
    let sym = resolveSymbolAlias(symbol);
    let chartRes = await fetchWithTimeout(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`, {}, 6000);
    // `.NS` retry is only for plain Indian tickers - never for indices, dotted
    // symbols, or crypto/forex/futures (BTC-USD, EURUSD=X, GC=F, BRK-B, …)
    if (!chartRes.ok && !sym.startsWith('^') && !sym.includes('.') && !sym.includes('=') && !sym.includes('-')) {
      sym = `${sym}.NS`;
      chartRes = await fetchWithTimeout(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`, {}, 6000);
    }
    if (!chartRes.ok) throw new Error('Quote not found. Try another ticker.');
    const chartData = await chartRes.json();
    const result = chartData?.chart?.result?.[0];
    if (!result) throw new Error('Invalid quote response');
    const meta = result.meta;
    
    const companyName = meta.shortName || meta.longName || symbol;
    const isIndex = meta.instrumentType === 'INDEX' || symbol.startsWith('^');
    const assetKind = classifyAsset(symbol, meta);
    const isVIX = symbol.toUpperCase().includes('VIX');
    const currency = getCurrencyDetails(meta.currency);
    const curr = isVIX ? '' : currency.prefix;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose || meta.previousClose;
    let diff = 0;
    let pct = '0.00';
    if (price !== undefined && prevClose !== undefined && prevClose !== 0) {
      diff = price - prevClose;
      pct = ((diff / prevClose) * 100).toFixed(2);
    }
    const changeDir = diff >= 0 ? 'up' : 'down';
    const changePct = Math.abs(parseFloat(pct)).toFixed(2) + '%';
    
    const ratios = {};
    if (price !== undefined) {
      const pd = priceDecimalsFor(price);
      ratios['Current Price'] = `${curr}${price.toLocaleString(currency.locale, { minimumFractionDigits: pd, maximumFractionDigits: pd })}`;
    }
    if (meta.regularMarketDayLow !== undefined && meta.regularMarketDayHigh !== undefined) {
      const dd = priceDecimalsFor(meta.regularMarketPrice);
      ratios['Day Range'] = `${curr}${meta.regularMarketDayLow.toLocaleString(currency.locale, { minimumFractionDigits: dd, maximumFractionDigits: dd })} - ${curr}${meta.regularMarketDayHigh.toLocaleString(currency.locale, { minimumFractionDigits: dd, maximumFractionDigits: dd })}`;
    }
    if (meta.fiftyTwoWeekLow !== undefined && meta.fiftyTwoWeekHigh !== undefined) {
      const wd = priceDecimalsFor(meta.regularMarketPrice);
      ratios['52W Range'] = `${curr}${meta.fiftyTwoWeekLow.toLocaleString(currency.locale, { minimumFractionDigits: wd, maximumFractionDigits: wd })} - ${curr}${meta.fiftyTwoWeekHigh.toLocaleString(currency.locale, { minimumFractionDigits: wd, maximumFractionDigits: wd })}`;
    }
    if (meta.regularMarketVolume !== undefined && meta.regularMarketVolume > 0) {
      ratios['Volume'] = meta.regularMarketVolume.toLocaleString('en-US');
    }
    if (meta.instrumentType) {
      ratios['Type'] = meta.instrumentType;
    }
    if (meta.fullExchangeName || meta.exchangeName) {
      ratios['Exchange'] = meta.fullExchangeName || meta.exchangeName;
    }

    // 1-year sparkline
    let sparkline = [];
    try {
      const sparkRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1y`);
      if (sparkRes.ok) {
        const sparkJson = await sparkRes.json();
        const quotes = sparkJson?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
        sparkline = quotes.filter(p => p !== null && p !== undefined).map(p => parseFloat(p.toFixed(2)));
      }
    } catch(e) {}

    // Fundamentals (P/E, market cap, ROCE, ROE, dividend, P/B) come from the
    // multi-source chain below: Finviz for US names, Yahoo's bulk quote next,
    // then stockanalysis.com as the crumb-free backstop. crypto/forex/futures
    // and indices have no P/E or balance sheet, so skip the whole chain.
    const yahooHolder = { ratios, currency: meta.currency };
    if (!isIndex && assetKind === 'stock') {
      try {
        const quotes = await fetchYahooQuotes([sym]);
        const quote = quotes[sym];
        if (quote) applyQuoteFundamentals(yahooHolder, quote);
      } catch (e) {}
      // yahooQuote already ran above, so the chain only covers what it missed.
      // primaryRank records that the fields already present came from Yahoo,
      // which is what still lets the better-ranked Finviz source take them over.
      await resolveValuationFundamentals(sym, yahooHolder, {
        currency: meta.currency,
        isIndian: /\.(NS|BO)$/i.test(sym) || meta.currency === 'INR',
        skip: ['yahooQuote'],
        primaryRank: FUND_SOURCE_RANK.yahooQuote
      }).catch(() => {});
    }

    if (price !== undefined) captureValuationAnchors(yahooHolder, price);
    return {
      success: true,
      ticker: symbol,
      companyName,
      ratios,
      aboutText: isIndex ? `Market index (${meta.exchangeName || 'Market'})` : `${companyName} (${meta.fullExchangeName || meta.exchangeName || 'Global'})`,
      changeDir,
      changePct,
      sparkline,
      isIndex,
      assetKind,
      source: 'yahoo',
      currency: meta.currency,
      epsTTM: yahooHolder.epsTTM,
      sharesOutstanding: yahooHolder.sharesOutstanding,
      bookValue: yahooHolder.bookValue
    };
  } catch(err) {
    return { success: false, ticker: symbol, error: err.message };
  }
}

async function fetchScreenerData(ticker) {
  // Indices, crypto, forex and futures live on Yahoo Finance, not Screener -
  // route them directly instead of wasting two Screener fetches first
  if (ticker.startsWith('^') || classifyAsset(ticker) !== 'stock') {
    return fetchYahooData(ticker);
  }

  // Retired NSE symbols (ICICIPRULI -> ICICILIFE after the 2026 ICICI Life
  // rename) 404 on BOTH Screener.in and Yahoo. Fetch the live symbol but
  // keep `ticker` as the cache key so the user's watchlist row is untouched.
  const live = resolveSymbolAlias(ticker);

  try {
    let response = await fetchWithTimeout(`https://www.screener.in/company/${live}/consolidated/`, {}, 6000);
    if (!response.ok) {
      response = await fetchWithTimeout(`https://www.screener.in/company/${live}/`, {}, 6000);
      if (!response.ok) throw new Error('Not found on Screener');
    }
    let htmlText = await response.text();

    const parseTopRatios = (html) => {
      const out = {};
      const m = html.match(/<ul id="top-ratios">([\s\S]*?)<\/ul>/);
      if (!m) return out;
      const listHtml = m[1];
      const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/g;
      let match;
      while ((match = liRegex.exec(listHtml)) !== null) {
        const liHtml = match[1];
        const nameMatch = liHtml.match(/<span class="name">\s*([^<]+)\s*<\/span>/);
        if (nameMatch) {
          let name = nameMatch[1].trim();
          let afterName = liHtml.substring(nameMatch.index + nameMatch[0].length);
          let valueStr = afterName.replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
          // Banks / insurers (e.g. KARURVYSYA, ICICIGI) have no consolidated
          // statements - that page returns 200 OK with empty numbers
          // ("₹ Cr."). Skip digitless values so they can be backfilled.
          if (!/\d/.test(valueStr)) continue;
          if (name === 'Market Cap') {
            const formattedMcap = formatMarketCap(valueStr);
            // Screener.in values are in INR - ensure the ₹ prefix is stored
            out[name] = /^[^\d\-+.,\s]+/.test(formattedMcap) ? formattedMcap : '₹' + formattedMcap;
          } else if (PURE_RATIO_KEYS.has(name)) {
            out[name] = formatPureRatio(valueStr);
          } else {
            out[name] = roundStringValue(valueStr);
          }
        }
      }
      return out;
    };
    const hasNumbers = (ratios) => Object.values(ratios).some((v) => /\d/.test(String(v || '')));

    let ratios = parseTopRatios(htmlText);
    // Standalone-only companies return an empty consolidated shell with HTTP
    // 200 - fall back to the base page and backfill any missing ratios.
    if (!hasNumbers(ratios)) {
      try {
        const stdRes = await fetchWithTimeout(`https://www.screener.in/company/${live}/`, {}, 6000);
        if (stdRes.ok) {
          const stdHtml = await stdRes.text();
          const stdRatios = parseTopRatios(stdHtml);
          if (hasNumbers(stdRatios)) {
            htmlText = stdHtml;
            ratios = stdRatios;
          } else {
            // Merge whatever digits either page managed to render.
            for (const [k, v] of Object.entries(stdRatios)) {
              if (!ratios[k] || !/\d/.test(String(ratios[k]))) ratios[k] = v;
            }
          }
        }
      } catch (e) {}
    }

    const extractName = htmlText.match(/<h1[^>]*>([^<]+)<\/h1>/);
    const companyName = extractName ? extractName[1].trim() : ticker;

    const pctMatch = htmlText.match(/class="[^"]*\b(up|down)\b[^"]*">\s*<i[^>]+><\/i>\s*([-+\d\.]+%)\s*<\/span>/);
    let changeDir = '';
    let changePct = '';
    if (pctMatch) {
      changeDir = pctMatch[1];
      changePct = roundStringValue(pctMatch[2]);
    }

    const aboutMatch = htmlText.match(/class="sub show-more-box about"[^>]*>([\s\S]*?)<\/div>/);
    let aboutText = '';
    if (aboutMatch) {
      aboutText = aboutMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    let sparkline = [];
    try {
      const yahooRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${live}.NS?interval=1d&range=1y`);
      if (yahooRes.ok) {
        const yahooData = await yahooRes.json();
        const quotes = yahooData.chart.result[0].indicators.quote[0];
        sparkline = quotes.close.filter(p => p !== null && p !== undefined).map(p => parseFloat(p.toFixed(2)));
      }
    } catch (e) {}

    // Screener.in top-ratios gives "Book Value" (e.g. ₹668), not a P/B
    // ratio - derive P/B as Current Price / Book Value so the P/B
    // column never shows "-" for Indian stocks.
    if (!ratios['Price to book value'] && ratios['Current Price'] && ratios['Book Value']) {
      try {
        const p = parseFloat(String(ratios['Current Price']).replace(/[^\d.-]/g, ''));
        const b = parseFloat(String(ratios['Book Value']).replace(/[^\d.-]/g, ''));
        if (isFinite(p) && isFinite(b) && b !== 0) {
          ratios['Price to book value'] = formatPureRatio((p / b).toFixed(2));
        }
      } catch (e) {}
    }

    const screenerEntry = { success: true, ticker, companyName, ratios, aboutText, changeDir, changePct, sparkline, source: 'screener', currency: 'INR' };
    // Screener is the top-ranked Indian source and already supplied everything
    // it has, so the chain skips it and only backfills the gaps (Screener
    // omits Stock P/E / Market Cap for some banks and standalone-only firms).
    // Pass `live` (alias-resolved) so each fund source fetches the live NSE
    // symbol; `screenerEntry.ticker` keeps the user's original key.
    await resolveValuationFundamentals(live, screenerEntry, {
      currency: 'INR',
      isIndian: true,
      skip: ['screener'],
      primaryRank: FUND_SOURCE_RANK.screener
    }).catch(() => {});
    captureValuationAnchors(screenerEntry, parsePriceNumber(ratios['Current Price']));
    return screenerEntry;
  } catch (err) {
    // Seamless fallback to Yahoo Finance for international stocks, non-Screener tickers, or indices
    const fallback = await fetchYahooData(ticker);
    if (fallback.success) return fallback;
    return { success: false, ticker, error: err.message };
  }
}

async function fetchIndices() {
  try {
    const indices = {};

    const defaultPinned = [
      { key: 'S&P 500 (USA)', symbol: '^GSPC', curr: 'USD' },
      { key: 'NIKKEI (Japan)', symbol: '^N225', curr: 'JPY' },
      { key: 'STI (Singapore)', symbol: '^STI', curr: 'SGD' },
      { key: 'FTSE 100 (UK)', symbol: '^FTSE', curr: 'GBP' }
    ];
    const storagePinned = (await chrome.storage.local.get(['pinnedIndices'])).pinnedIndices;
    const indexConfigs = Array.isArray(storagePinned) ? storagePinned : defaultPinned;

    await Promise.all(indexConfigs.map(async (cfg) => {
      try {
        const quote = await fetchYahooData(cfg.symbol);
        if (quote?.success) {
          const priceText = quote.ratios?.['Current Price'] || '';
          const rawPrice = parseFloat(priceText.replace(/[^\d.-]/g, '')) || 0;
          indices[cfg.key] = {
            symbol: cfg.symbol,
            price: priceText,
            rawPrice,
            changePct: quote.changePct || '0.00%',
            changeDir: quote.changeDir || 'up',
            curr: quote.currency || cfg.curr || 'USD',
            sparkline: quote.sparkline || []
          };
        }
      } catch (e) {
        console.warn(`Could not load index ${cfg.symbol}:`, e);
      }
    }));

    return indices;
  } catch (err) {
    console.error('Error fetching indices', err);
    return null;
  }
}

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('checkAlerts', { periodInMinutes: 5 });
  chrome.alarms.create('refreshHolidays', { periodInMinutes: 720 });
  refreshMarketHolidays();
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('checkAlerts', { periodInMinutes: 5 });
  chrome.alarms.create('refreshHolidays', { periodInMinutes: 720 });
  refreshMarketHolidays();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkAlerts') {
    checkPriceAlerts();
  }
  if (alarm.name === 'syncWatchlist') {
    syncWatchlistData();
  }
  if (alarm.name === 'refreshHolidays') {
    refreshMarketHolidays();
  }
});

// Daily market-holiday refresh: a single small JSON on our own site holds
// every exchange's full-day closures, so holiday fixes ship without a store
// re-publish. Cached in local storage; sidepanel reads the same keys.
const HOLIDAYS_URL = 'https://vishwaroopg.github.io/Screener-Extension/market-holidays.json';
const HOLIDAYS_TTL_MS = 24 * 60 * 60 * 1000;

async function refreshMarketHolidays() {
  try {
    const res = await new Promise((resolve) => {
      try {
        chrome.storage.local.get(['marketHolidaysFetchedAt'], (r) => {
          if (chrome.runtime.lastError) resolve({});
          else resolve(r || {});
        });
      } catch (e) {
        resolve({});
      }
    });
    if (res.marketHolidaysFetchedAt && (Date.now() - res.marketHolidaysFetchedAt) < HOLIDAYS_TTL_MS) return;
    const response = await fetch(HOLIDAYS_URL + '?v=' + new Date().toISOString().slice(0, 10));
    if (!response.ok) return;
    const data = await response.json();
    if (!data || !data.holidays || typeof data.holidays !== 'object') return;
    chrome.storage.local.set({ marketHolidays: data.holidays, marketHolidaysFetchedAt: Date.now() });
  } catch (e) {}
}

async function checkPriceAlerts() {
  chrome.storage.local.get(['alerts', 'cachedData'], async (res) => {
    const alerts = res.alerts || {};
    const cached = res.cachedData || {};
    const now = Date.now();

    // 1. Drop expired alerts
    let changed = false;
    for (const tk of Object.keys(alerts)) {
      if (alerts[tk] && alerts[tk].expiresAt && now > alerts[tk].expiresAt) {
        delete alerts[tk];
        changed = true;
      }
    }

    // Collect all tickers that have active alert conditions
    const activeTickers = Object.keys(alerts).filter(t => {
      const a = alerts[t];
      return a && (a.above || a.below || a.movePct || a.high52 || a.low52);
    });

    if (activeTickers.length === 0) {
      if (changed) chrome.storage.local.set({ alerts });
      return;
    }

    for (const ticker of activeTickers) {
      try {
        let sym = ticker;
        let fetchRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`);
        // Fallback to .NS only for plain Indian tickers without dots, hyphens, equals, carats
        if (!fetchRes.ok && !sym.startsWith('^') && !sym.includes('.') && !sym.includes('=') && !sym.includes('-')) {
          sym = `${ticker}.NS`;
          fetchRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`);
        }
        if (!fetchRes.ok) continue;

        const data = await fetchRes.json();
        const meta = ((data.chart || {}).result || [])[0]?.meta || {};
        const price = meta.regularMarketPrice;
        const prev = meta.chartPreviousClose || meta.previousClose || 0;
        const high52 = meta.fiftyTwoWeekHigh;
        const low52 = meta.fiftyTwoWeekLow;
        const priceOk = typeof price === 'number' && isFinite(price);
        if (!priceOk) continue;

        const threshold = alerts[ticker];
        if (!threshold) continue;
        const repeat = !!threshold.repeat;
        const noteSuffix = threshold.note ? ` · Note: ${threshold.note}` : '';

        // Dynamic currency prefix
        let curPrefix = '$';
        if (meta.currency === 'INR' || /\.NS$|\.BO$/i.test(sym)) curPrefix = '₹';
        else if (meta.currency === 'EUR') curPrefix = '€';
        else if (meta.currency === 'GBP') curPrefix = '£';

        // Check Above
        if (threshold.above && price >= threshold.above) {
          if (!repeat || !threshold.aboveFired) {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icon_128.png',
              title: t('notifAboveTitle') || 'Price Alert Triggered! 📈',
              message: `${ticker} crossed above ${curPrefix}${threshold.above} (Current: ${curPrefix}${price.toFixed(2)})${noteSuffix}`,
            });
            if (threshold.sound) {
              chrome.runtime.sendMessage({ type: 'PLAY_ALERT_SOUND' }).catch(() => {});
            }
          }
          if (repeat) threshold.aboveFired = true;
          else delete alerts[ticker].above;
        } else if (threshold.above) {
          threshold.aboveFired = false;
        }

        // Check Below
        if (threshold.below && price <= threshold.below) {
          if (!repeat || !threshold.belowFired) {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icon_128.png',
              title: t('notifBelowTitle') || 'Price Alert Triggered! 📉',
              message: `${ticker} dropped below ${curPrefix}${threshold.below} (Current: ${curPrefix}${price.toFixed(2)})${noteSuffix}`,
            });
            if (threshold.sound) {
              chrome.runtime.sendMessage({ type: 'PLAY_ALERT_SOUND' }).catch(() => {});
            }
          }
          if (repeat) threshold.belowFired = true;
          else delete alerts[ticker].below;
        } else if (threshold.below) {
          threshold.belowFired = false;
        }

        // Check Move Pct
        if (threshold.movePct && prev > 0) {
          const dayPct = ((price - prev) / prev) * 100;
          if (Math.abs(dayPct) >= threshold.movePct) {
            if (!repeat || !threshold.moveFired) {
              const signed = (dayPct >= 0 ? '+' : '') + dayPct.toFixed(2);
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icon_128.png',
                title: t('notifMoveTitle') || 'Big Move Alert! ⚡',
                message: `${ticker} moved ${signed}% today (Current: ${curPrefix}${price.toFixed(2)})${noteSuffix}`,
              });
              if (threshold.sound) {
                chrome.runtime.sendMessage({ type: 'PLAY_ALERT_SOUND' }).catch(() => {});
              }
            }
            if (repeat) threshold.moveFired = true;
            else delete alerts[ticker].movePct;
          } else {
            threshold.moveFired = false;
          }
        }

        // Check 52W High
        if (threshold.high52 && high52 && price >= high52) {
          if (!repeat || !threshold.high52Fired) {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icon_128.png',
              title: t('notifHigh52Title') || '52-Week High Breakout! 🚀',
              message: `${ticker} hit a new 52-Week High! (Current: ${curPrefix}${price.toFixed(2)})${noteSuffix}`,
            });
            if (threshold.sound) {
              chrome.runtime.sendMessage({ type: 'PLAY_ALERT_SOUND' }).catch(() => {});
            }
          }
          if (repeat) threshold.high52Fired = true;
          else delete alerts[ticker].high52;
        } else if (threshold.high52) {
          threshold.high52Fired = false;
        }

        // Check 52W Low
        if (threshold.low52 && low52 && price <= low52) {
          if (!repeat || !threshold.low52Fired) {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icon_128.png',
              title: t('notifLow52Title') || '52-Week Low Alert! 🔻',
              message: `${ticker} hit a new 52-Week Low! (Current: ${curPrefix}${price.toFixed(2)})${noteSuffix}`,
            });
            if (threshold.sound) {
              chrome.runtime.sendMessage({ type: 'PLAY_ALERT_SOUND' }).catch(() => {});
            }
          }
          if (repeat) threshold.low52Fired = true;
          else delete alerts[ticker].low52;
        } else if (threshold.low52) {
          threshold.low52Fired = false;
        }

        // If no more conditions are active for this ticker, clean it up
        if (!alerts[ticker].above && !alerts[ticker].below && !alerts[ticker].movePct && !alerts[ticker].high52 && !alerts[ticker].low52) {
          delete alerts[ticker];
        }
      } catch (e) {}
    }
    chrome.storage.local.set({ alerts });
  });
}

// Background syncing logic
async function syncWatchlistData() {
  const { portfolios = {}, screenerWatchlist = [], priceAlerts = {}, cachedData: oldCachedData = {}, marketIndices: oldIndices = {} } = await chrome.storage.local.get(['portfolios', 'screenerWatchlist', 'priceAlerts', 'cachedData', 'marketIndices']);
  
  // Combine screenerWatchlist and all portfolio lists into one master list of unique tickers to fetch
  let allTickers = [...screenerWatchlist];
  for (const list of Object.values(portfolios)) {
    allTickers.push(...list);
  }
  allTickers = [...new Set(allTickers)]; // remove duplicates
  const indicesPromise = fetchIndices();

  // Fill P/E and market cap from Yahoo in one batch so the watchlist
  // is not stuck on "-" until the slow per-ticker Screener/Finviz scrape.
  const quoteSymbols = [];
  for (const t of allTickers) {
    if (t.startsWith('^') || classifyAsset(t) !== 'stock') continue;
    if (t.includes('.') || t.includes('=') || t.includes('-')) quoteSymbols.push(t);
    else if (oldCachedData[t] && oldCachedData[t].currency && oldCachedData[t].currency !== 'INR') quoteSymbols.push(t);
    else quoteSymbols.push(t + '.NS');
  }
  let cachedData = structuredClone(oldCachedData);
  const refreshBaseline = structuredClone({ cachedData, marketIndices: oldIndices });
  try {
    const quotes = await fetchYahooQuotes(quoteSymbols);
    let seeded = false;
    for (const ticker of allTickers) {
      const quote = yahooQuoteForTicker(ticker, quotes, cachedData[ticker]);
      if (!quote) continue;
      if (!cachedData[ticker]) cachedData[ticker] = { ticker, ratios: {}, source: 'yahoo', success: true };
      if (applyQuoteFundamentals(cachedData[ticker], quote)) seeded = true;
    }
    if (seeded) {
      await commitRefreshState({ cachedData }, refreshBaseline);
      chrome.runtime.sendMessage({ type: 'WATCHLIST_UPDATED' }).catch(() => {});
    }
  } catch (e) {}

  for (const ticker of allTickers) {
    let data = await fetchScreenerData(ticker);
    
    // Compare price for flash animation
    const oldData = oldCachedData[ticker];
    if (oldData && oldData.success && data.success) {
       const oldPrice = parseFloat((oldData.ratios['Current Price'] || '0').replace(/,/g, ''));
       const newPrice = parseFloat((data.ratios['Current Price'] || '0').replace(/,/g, ''));
       if (newPrice > oldPrice) {
           data.flash = 'up';
           data.flashTime = Date.now();
       } else if (newPrice < oldPrice) {
           data.flash = 'down';
           data.flashTime = Date.now();
       }
    }
    
    const live = cachedData[ticker];
    if (live && data && data.success && data.ratios) {
      // Carry anchors and missing ratios BEFORE refreshLiveValuation: that
      // recompute reads data.epsTTM / sharesOutstanding to rebuild P/E and
      // market cap, so copying them after would be one pass too late.
      if (live.epsTTM && !data.epsTTM) data.epsTTM = live.epsTTM;
      if (live.sharesOutstanding && !data.sharesOutstanding) data.sharesOutstanding = live.sharesOutstanding;
      if (live.bookValue && !data.bookValue) data.bookValue = live.bookValue;
      if (live.ratios) {
        for (const k of ['Stock P/E', 'Market Cap', 'Price to book value', 'Dividend Yield', 'ROCE', 'ROE']) {
          if (!/\d/.test(String(data.ratios[k] || '')) && /\d/.test(String(live.ratios[k] || ''))) {
            data.ratios[k] = live.ratios[k];
          }
        }
      }
      const livePrice = parsePriceNumber((live.ratios || {})['Current Price']);
      if (Number.isFinite(livePrice) && livePrice > 0) {
        data.ratios['Current Price'] = live.ratios['Current Price'];
        captureValuationAnchors(data, livePrice);
        refreshLiveValuation(data, livePrice, data.currency || live.currency);
      }
    } else if (data && data.success) {
      captureValuationAnchors(data, parsePriceNumber((data.ratios || {})['Current Price']));
    }
    // Never let a failed fetch wipe a working entry: the row would drop to
    // "Could not fetch" and lose its P/E / market cap until the next full sync.
    if (data && data.success === false && live && live.success && live.ratios) {
      data = Object.assign({}, live, { success: true, lastError: data.error, errorTime: Date.now() });
    }
    cachedData[ticker] = data;
    await commitRefreshState({ cachedData }, refreshBaseline);
    chrome.runtime.sendMessage({ type: 'WATCHLIST_UPDATED' }).catch(() => {});

    // Check Price Alerts
    if (priceAlerts[ticker] && data.success) {
      const priceStr = data.ratios['Current Price'];
      if (priceStr) {
        const currentPrice = parsePriceNumber(priceStr);
        const alert = priceAlerts[ticker];
        
        let triggered = false;
        if (alert.condition === 'above' && currentPrice >= alert.target) triggered = true;
        if (alert.condition === 'below' && currentPrice <= alert.target) triggered = true;

        if (triggered && !alert.notified) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon_128.png',
            title: t('notifGenericTitle'),
            message: t('notifGeneric', [ticker, String(alert.target), String(currentPrice)]),
          });
          priceAlerts[ticker].notified = true;
        } else if (!triggered) {
          // reset if it goes out of threshold
          priceAlerts[ticker].notified = false;
        }
      }
    }

    // Sleep slightly to avoid spamming
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const indices = await indicesPromise;
  if (indices) {
    for (const key of ['SENSEX', 'NIFTY 50']) {
      if (indices[key] && oldIndices[key]) {
        const oldPrice = parseFloat((oldIndices[key].price || '0').replace(/,/g, ''));
        const newPrice = parseFloat((indices[key].price || '0').replace(/,/g, ''));
        if (newPrice > oldPrice) {
            indices[key].flash = 'up';
            indices[key].flashTime = Date.now();
        } else if (newPrice < oldPrice) {
            indices[key].flash = 'down';
            indices[key].flashTime = Date.now();
        }
      }
    }
  }

  await commitRefreshState({ cachedData, marketIndices: indices || oldIndices || {}, priceAlerts, lastSync: Date.now() }, refreshBaseline);
  
  // Notify tabs that data was updated so they can refresh
  chrome.runtime.sendMessage({ type: 'WATCHLIST_UPDATED' }).catch(() => {});
}

// Set up alarm to sync every 5 minutes
chrome.alarms.create('syncWatchlist', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'syncWatchlist') {
    syncWatchlistData();
  }
});

// One-time cleanup: an earlier context-menu build extracted "CONSOLIDATED"
// (the URL tail) instead of the ticker. Drop that bogus entry wherever it
// landed so it stops showing "Could not fetch CONSOLIDATED".
(async () => {
  try {
    const stored = await chrome.storage.local.get(['portfolios', 'screenerWatchlist']);
    let changed = false;
    const clean = (list) => {
      if (!Array.isArray(list)) return list;
      const next = list.filter((tk) => tk !== 'CONSOLIDATED');
      if (next.length !== list.length) changed = true;
      return next;
    };
    const portfolios = stored.portfolios || {};
    for (const name of Object.keys(portfolios)) portfolios[name] = clean(portfolios[name]);
    const screenerWatchlist = clean(stored.screenerWatchlist || []);
    if (changed) await chrome.storage.local.set({ portfolios, screenerWatchlist });
  } catch (e) {}
})();

// Run once on startup
syncWatchlistData();

// --- Whole-market breadth (Advance / Decline) ---
// India: Moneycontrol's advance/decline page server-renders __NEXT_DATA__
// JSON with per-index advance/decline (NIFTY 500, NIFTY 50, ...). No key,
// no session cookies needed - plain fetch + text parse (no DOM in SW).
// USA: WSJ markets-diary JSON gives NYSE + NASDAQ advancing / declining /
// unchanged. Both responses are cached 10 min in local-only storage
// (same pattern as macroStats - never synced across devices).
const BREADTH_TTL_MS = 10 * 60 * 1000;

function parseBreadthNum(v) {
  if (typeof v === 'number' && isFinite(v)) return Math.round(v);
  const n = parseInt(String(v == null ? '' : v).replace(/[^0-9]/g, ''), 10);
  return isFinite(n) ? n : 0;
}

async function fetchIndiaBreadth() {
  const r = await fetch('https://www.moneycontrol.com/stocksmarketsindia/heat-map-advance-decline-ratio-nse-bse', {
    headers: { 'Accept': 'text/html' }
  });
  if (!r.ok) throw new Error('Moneycontrol HTTP ' + r.status);
  const html = await r.text();
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Moneycontrol breadth markup not found');
  let j;
  try { j = JSON.parse(m[1]); } catch (e) { throw new Error('Moneycontrol breadth JSON parse failed'); }
  const list = j && j.props && j.props.pageProps && j.props.pageProps.adRatioData && j.props.pageProps.adRatioData.indexList;
  if (!Array.isArray(list) || !list.length) throw new Error('Moneycontrol breadth list empty');
  const pick = (name) => list.find((x) => x && x.indexName === name);
  // Broadest honest whole-market proxy first, headline index as fallback.
  const broad = pick('NIFTY 50') || pick('NIFTY 500');
  if (!broad) throw new Error('Moneycontrol breadth index missing');
  const adv = parseBreadthNum(broad.advance);
  const dec = parseBreadthNum(broad.decline);
  if (!adv && !dec) throw new Error('Moneycontrol breadth counts empty');
  const size = /500/.test(broad.indexName || '') ? 500 : 50;
  let asOn = null;
  try { asOn = (j.props.pageProps.adRatioData.asOnDate || '').trim() || null; } catch (e) {}
  return {
    scope: broad.indexName || 'NIFTY 50',
    advances: adv,
    declines: dec,
    unchanged: Math.max(0, size - adv - dec),
    asOn,
    source: 'Moneycontrol'
  };
}

async function fetchUsBreadth() {
  const url = 'https://www.wsj.com/market-data/stocks?id=%7B%22application%22%3A%22WSJ%22%2C%22marketsDiaryType%22%3A%22overview%22%7D&type=mdc_marketsdiary';
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error('WSJ HTTP ' + r.status);
  const j = await r.json();
  const sets = j && j.data && j.data.instrumentSets;
  if (!Array.isArray(sets) || !sets.length) throw new Error('WSJ breadth sets empty');
  const issues = sets[0].instruments || [];
  const row = (n) => issues.find((x) => x && x.name === n) || {};
  const nyse = { a: parseBreadthNum(row('Advancing').NYSE), d: parseBreadthNum(row('Declining').NYSE), u: parseBreadthNum(row('Unchanged').NYSE) };
  const nasdaq = { a: parseBreadthNum(row('Advancing').NASDAQ), d: parseBreadthNum(row('Declining').NASDAQ), u: parseBreadthNum(row('Unchanged').NASDAQ) };
  const adv = nyse.a + nasdaq.a;
  const dec = nyse.d + nasdaq.d;
  if (!adv && !dec) throw new Error('WSJ breadth counts empty');
  let asOn = null;
  try { asOn = (j.data.timestamp || '').trim() || null; } catch (e) {}
  return {
    scope: 'NYSE + NASDAQ',
    advances: adv,
    declines: dec,
    unchanged: nyse.u + nasdaq.u,
    asOn,
    source: 'WSJ Markets Diary',
    detail: { nyse, nasdaq }
  };
}

// Consolidated message listener for all extension components
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING' || message.type === 'POLL_NOW') {
    if (!fastPollInterval) {
      fastPollInterval = setInterval(fetchFastPrices, 1000);
    }
    fetchFastPrices();
    sendResponse({ pong: true });
    return true;
  }

  if (message.type === 'RESOLVE_IMPORT_TICKERS') {
    const rawList = Array.isArray(message.tickers) ? message.tickers : [];
    (async () => {
      // Resolve each pasted/scraped token to a canonical watchlist symbol via
      // the same Screener.in -> Yahoo pipeline as right-click "Add to Watchlist".
      // Bounded concurrency (5) to stay kind to the APIs on 100+ symbol imports.
      const queue = rawList.map((r) => ({
        raw: String((r && r.raw !== undefined ? r.raw : r) || '').toUpperCase().slice(0, 32),
        tvExchange: String((r && r.tvExchange) || '').toUpperCase()
      })).filter((r) => r.raw);
      const results = new Array(queue.length);
      let cursor = 0;
      async function worker() {
        while (cursor < queue.length) {
          const idx = cursor++;
          const item = queue[idx];
          try {
            const stock = await resolveCtxStock(item.raw);
            if (stock && stock.symbol) {
              results[idx] = { raw: item.raw, symbol: String(stock.symbol).toUpperCase(), ok: true };
            } else {
              // Unresolvable but plausible: keep the raw token so the user
              // doesn't lose it - the fetch engine retries with .NS etc.
              results[idx] = { raw: item.raw, symbol: item.raw, ok: false };
            }
          } catch (e) {
            results[idx] = { raw: item.raw, symbol: item.raw, ok: false };
          }
        }
      }
      await Promise.all([worker(), worker(), worker(), worker(), worker()]);
      sendResponse({ results });
    })();
    return true;
  }

  if (message.type === 'OPEN_SIDEBAR') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.sidePanel.open({ tabId: tabs[0].id }).catch(() => {});
      }
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'FETCH_CHART') {
    const { symbol, range, interval } = message;
    (async () => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
        const res = await fetch(url);
        if (!res.ok) { sendResponse({ data: [], timestamps: [] }); return; }
        const json = await res.json();
        const result = json?.chart?.result?.[0];
        const rawQuotes = result?.indicators?.quote?.[0]?.close || [];
        const rawTimestamps = result?.timestamp || [];
        const data = [];
        const timestamps = [];
        for (let i = 0; i < rawQuotes.length; i++) {
          if (rawQuotes[i] !== null && rawQuotes[i] !== undefined) {
            data.push(parseFloat(rawQuotes[i].toFixed(2)));
            timestamps.push(rawTimestamps[i] || 0);
          }
        }
        sendResponse({ data, timestamps });
      } catch (e) {
        sendResponse({ data: [], timestamps: [] });
      }
    })();
    return true;
  }

  if (message.type === 'FETCH_OVERVIEW') {
    const items = Array.isArray(message.items) ? message.items : [];
    (async () => {
      try {
        const symbols = [...new Set(items.map(i => i && i.symbol).filter(Boolean))];
        if (symbols.length === 0) { sendResponse({ quotes: [] }); return; }
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(symbols.join(','))}&interval=1d&range=5d`);
        const sparkData = res.ok ? normalizeSparkData(await res.json()) : {};
        // Retry symbols missing from the batch response via the single-quote chart endpoint
        const missing = symbols.filter(s => {
          const q = sparkData[s];
          const closes = q && Array.isArray(q.close) ? q.close : [];
          return !closes.some(v => v !== null && v !== undefined) && q?.regularMarketPrice === undefined;
        });
        if (missing.length > 0) {
          const retries = await Promise.all(missing.map(async (s) => [s, await fetchChartQuote(s)]));
          for (const [s, q] of retries) {
            if (q) sparkData[s] = q;
          }
        }
        const quotes = items.map(item => {
          const d = sparkData[item.symbol] || {};
          const closes = Array.isArray(d.close) ? d.close : [];
          let price = null;
          for (let i = closes.length - 1; i >= 0; i--) {
            if (closes[i] !== null && closes[i] !== undefined) { price = closes[i]; break; }
          }
          if (price === null && d.regularMarketPrice !== undefined) price = d.regularMarketPrice;
          if (price === null && d.previousClose !== undefined) price = d.previousClose;
          // Batch spark responses use chartPreviousClose instead of previousClose
          const prev = d.previousClose ?? d.chartPreviousClose;
          let pctNum = 0;
          if (price !== null && prev) pctNum = ((price - prev) / prev) * 100;
          const currency = getCurrencyDetails(d.meta?.currency || item.curr || 'USD');
          const formatted = price !== null
            ? (item.plain
              ? Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : `${currency.prefix}${Number(price).toLocaleString(currency.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
            : '-';
          return {
            key: item.key,
            symbol: item.symbol,
            price: formatted,
            rawPrice: price,
            changePct: `${Math.abs(pctNum).toFixed(2)}%`,
            pctNum: parseFloat(pctNum.toFixed(2)),
            changeDir: pctNum >= 0 ? 'up' : 'down'
          };
        });
        sendResponse({ quotes });
      } catch (e) {
        sendResponse({ quotes: [] });
      }
    })();
    return true;
  }

  if (message.type === 'FETCH_MACRO_STATS') {
    const country = message.country;
    (async () => {
      try {
        if (!country) { sendResponse({ stats: {} }); return; }
        const now = Date.now();
        const cached = await chrome.storage.local.get(['macroStats']);
        const store = cached.macroStats || {};
        // Serve from 24h cache to avoid hammering the World Bank API.
        // Version guard drops stale entries saved before the indicator set changed.
        if (store._v === MACRO_CACHE_VERSION && store[country] && (now - (store[country].fetchedAt || 0)) < 24 * 3600 * 1000) {
          sendResponse({ stats: store[country].data || {} });
          return;
        }
        const data = {};
        await Promise.all(MACRO_INDICATOR_DEFS.map(async (d) => {
          try {
            const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(country)}/indicator/${d.code}?format=json&date=2020:2030&per_page=50`;
            const r = await fetch(url);
            if (!r.ok) return;
            const j = await r.json();
            const rows = Array.isArray(j) ? j[1] : null;
            if (!Array.isArray(rows)) return;
            const hit = rows.find(x => x && x.value !== null && x.value !== undefined);
            if (hit) {
              const formatted = formatMacroValue(hit.value, d);
              if (formatted === null) return;
              data[d.key] = {
                label: d.label,
                value: formatted,
                year: hit.date,
                link: `https://data.worldbank.org/indicator/${d.code}?locations=${encodeURIComponent(country)}`
              };
            }
          } catch (e) {}
        }));
        // Only cache complete sets - a partial fetch (one indicator failed)
        // must not hide the missing tile for 24h; it retries next open.
        if (Object.keys(data).length >= 4) {
          store._v = MACRO_CACHE_VERSION;
          store[country] = { fetchedAt: now, data };
          await chrome.storage.local.set({ macroStats: store });
        }
        sendResponse({ stats: data });
      } catch (e) {
        sendResponse({ stats: {} });
      }
    })();
    return true;
  }

  if (message.type === 'FETCH_MARKET_BREADTH') {
    const economy = message.economy;
    (async () => {
      try {
        if (economy !== 'India' && economy !== 'USA') { sendResponse({ breadth: null }); return; }
        const now = Date.now();
        const cached = await chrome.storage.local.get(['marketBreadth']);
        const store = cached.marketBreadth || {};
        const isMismatch = economy === 'India' && store[economy] && store[economy].data && store[economy].data.scope !== 'NIFTY 50';
        if (!message.force && !isMismatch && store[economy] && (now - (store[economy].fetchedAt || 0)) < BREADTH_TTL_MS) {
          sendResponse({ breadth: store[economy].data });
          return;
        }
        let data = null;
        try {
          data = economy === 'India' ? await fetchIndiaBreadth() : await fetchUsBreadth();
        } catch (e) {
          data = null;
        }
        if (data) {
          store[economy] = { fetchedAt: now, data };
          await chrome.storage.local.set({ marketBreadth: store });
          sendResponse({ breadth: data });
        } else if (store[economy] && store[economy].data) {
          sendResponse({ breadth: store[economy].data, stale: true });
        } else {
          sendResponse({ breadth: null });
        }
      } catch (e) {
        sendResponse({ breadth: null });
      }
    })();
    return true;
  }

  // ---- Street Mood proxy (Fear / Greed 0-100) ---
// Own computation from Yahoo Finance + existing breadth sources - no
// Tickertape scraping. Breadth 35% + Trend vs 50-day 35% +
// Volatility (inverted VIX) 20% + Day move 10%. Missing components are
// dropped and the remaining weights renormalized (min 2 components).
const MOOD_TTL_MS = 10 * 60 * 1000;
const MOOD_MAIN_INDEX = {
  'USA': '^GSPC', 'India': '^NSEI', 'UK': '^FTSE', 'Singapore': '^STI',
  'Japan': '^N225', 'Hong Kong': '^HSI', 'Germany': '^GDAXI',
  'France': '^FCHI', 'Australia': '^AXJO', 'Canada': '^GSPTSE'
};
const MOOD_VIX_SYMBOL = { 'USA': '^VIX', 'India': '^INDIAVIX' };
const MOOD_DEFAULT_VIX = '^VIX';

function moodClamp(v, lo, hi) {
  const n = Number(v);
  if (!isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
}

async function moodFetchCloses(symbol, range, interval) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`);
  if (!r.ok) throw new Error('Yahoo HTTP ' + r.status);
  const j = await r.json();
  const result = ((j && j.chart && j.chart.result) || [])[0];
  if (!result) throw new Error('Yahoo empty chart');
  const meta = result.meta || {};
  const raw = (result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close) || [];
  const closes = raw.filter((v) => typeof v === 'number' && isFinite(v));
  const price = (typeof meta.regularMarketPrice === 'number' && isFinite(meta.regularMarketPrice))
    ? meta.regularMarketPrice
    : (closes.length ? closes[closes.length - 1] : null);
  const prev = meta.chartPreviousClose ?? meta.previousClose ?? null;
  return { closes, price, prev, meta };
}

function moodBandFor(score) {
  if (score < 30) return 'extremeFear';
  if (score < 50) return 'fear';
  if (score <= 70) return 'greed';
  return 'extremeGreed';
}

async function computeMood(economy, fallbackBreadth) {
  const mainSymbol = MOOD_MAIN_INDEX[economy] || '^GSPC';
  const vixSymbol = MOOD_VIX_SYMBOL[economy] || MOOD_DEFAULT_VIX;
  // 1. Breadth: native whole-market source for India/USA, else the
  // sidepanel's overview gainers/losers fallback (passed in).
  let breadthScore = null;
  let breadthScope = null;
  let breadthSource = null;
  try {
    if (economy === 'India' || economy === 'USA') {
      const b = economy === 'India' ? await fetchIndiaBreadth() : await fetchUsBreadth();
      const adv = parseBreadthNum(b.advances);
      const dec = parseBreadthNum(b.declines);
      if (adv + dec > 0) {
        breadthScore = (adv / (adv + dec)) * 100;
        breadthScope = b.scope;
        breadthSource = b.source;
      }
    } else if (fallbackBreadth && (fallbackBreadth.adv + fallbackBreadth.dec) > 0) {
      breadthScore = (fallbackBreadth.adv / (fallbackBreadth.adv + fallbackBreadth.dec)) * 100;
      breadthScope = fallbackBreadth.scope || economy;
      breadthSource = 'tracked stocks';
    }
  } catch (e) {
    breadthScore = null;
  }
  // 2+3. Trend (vs 50-day SMA) and day move from the main index 6mo chart.
  let trendScore = null;
  let dayScore = null;
  let dayPct = null;
  try {
    const h = await moodFetchCloses(mainSymbol, '6mo', '1d');
    if (h.closes.length >= 55 && h.price) {
      const last50 = h.closes.slice(-50);
      const sma = last50.reduce((a, b) => a + b, 0) / last50.length;
      if (sma > 0) {
        const dist = ((h.price - sma) / sma) * 100;
        trendScore = moodClamp(((dist + 5) / 10) * 100, 0, 100);
      }
    } else if (h.closes.length >= 10 && h.price) {
      // Young/short history: compare against the oldest available close.
      const base = h.closes[0];
      if (base > 0) {
        const dist = ((h.price - base) / base) * 100;
        trendScore = moodClamp(((dist + 10) / 20) * 100, 0, 100);
      }
    }
    if (typeof h.price === 'number' && typeof h.prev === 'number' && h.prev > 0) {
      dayPct = ((h.price - h.prev) / h.prev) * 100;
      dayScore = moodClamp(((dayPct + 2) / 4) * 100, 0, 100);
    }
  } catch (e) {}
  // 4. Volatility: VIX level, inverted (high VIX = fear = low score).
  let volScore = null;
  let vixValue = null;
  try {
    const v = await moodFetchCloses(vixSymbol, '5d', '1d');
    const last = (typeof v.price === 'number') ? v.price : (v.closes.length ? v.closes[v.closes.length - 1] : null);
    if (typeof last === 'number' && isFinite(last) && last > 0) {
      vixValue = last;
      volScore = moodClamp(((50 - last) / (50 - 12)) * 100, 0, 100);
    }
  } catch (e) {}
  const parts = [
    { w: 0.35, v: breadthScore },
    { w: 0.35, v: trendScore },
    { w: 0.20, v: volScore },
    { w: 0.10, v: dayScore }
  ].filter((p) => typeof p.v === 'number' && isFinite(p.v));
  if (parts.length < 2) return null;
  const wSum = parts.reduce((a, p) => a + p.w, 0);
  const score = Math.round(parts.reduce((a, p) => a + (p.v * p.w) / wSum, 0) * 10) / 10;
  return {
    score,
    band: moodBandFor(score),
    components: {
      breadth: breadthScore === null ? null : Math.round(breadthScore * 10) / 10,
      trend: trendScore === null ? null : Math.round(trendScore * 10) / 10,
      volatility: volScore === null ? null : Math.round(volScore * 10) / 10,
      day: dayScore === null ? null : Math.round(dayScore * 10) / 10
    },
    breadthScope,
    breadthSource,
    indexSymbol: mainSymbol,
    vixSymbol,
    vixValue: vixValue === null ? null : Math.round(vixValue * 100) / 100,
    dayPct: dayPct === null ? null : Math.round(dayPct * 100) / 100
  };
}

// ---- Native mood sources: Tickertape MMI (India) + CNN Fear & Greed (USA) ---
// Genuine vendor values, not our proxy. All other economies use computeMood().
const MOOD_NATIVE_TTL_MS = 30 * 60 * 1000;
const TICKERTAPE_MMI_URL = 'https://api.tickertape.in/mmi/now';
const TICKERTAPE_MMI_HIST_URL = 'https://analyze.api.tickertape.in/homepage/mmi?period=10';
const TICKERTAPE_MMI_PAGE = 'https://www.tickertape.in/market-mood-index';
const CNN_FG_URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';
const CNN_FG_PAGE = 'https://www.cnn.com/markets/fear-and-greed';

function moodBandForCNN(score) {
  if (score < 25) return 'extremeFear';
  if (score < 45) return 'fear';
  if (score <= 55) return 'neutral';
  if (score <= 75) return 'greed';
  return 'extremeGreed';
}

async function fetchTickertapeMMI() {
  const r = await fetch(TICKERTAPE_MMI_URL, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error('Tickertape HTTP ' + r.status);
  const j = await r.json();
  const d = j && j.data;
  if (!d || typeof d.indicator !== 'number' || !isFinite(d.indicator)) throw new Error('Tickertape shape');
  const pick = (x) => (x && typeof x.indicator === 'number' && isFinite(x.indicator) ? Math.round(x.indicator * 100) / 100 : null);
  return {
    source: 'tickertape',
    score: Math.round(d.indicator * 100) / 100,
    band: moodBandFor(d.indicator),
    asOn: d.date || null,
    link: TICKERTAPE_MMI_PAGE,
    prev: { day: pick(d.lastDay), week: pick(d.lastWeek), month: pick(d.lastMonth) }
  };
}

async function fetchTickertapeMMIHistory() {
  const r = await fetch(TICKERTAPE_MMI_HIST_URL, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error('Tickertape history HTTP ' + r.status);
  const j = await r.json();
  const d = j && j.data;
  if (!d) throw new Error('Tickertape history shape');
  const mapPts = (arr) => (Array.isArray(arr) ? arr : [])
    .filter((p) => p && typeof p.indicator === 'number' && isFinite(p.indicator) && p.date)
    .map((p) => ({ date: p.date, value: Math.round(p.indicator * 100) / 100 }));
  const days = mapPts(d.daysHistorical);
  const months = mapPts(d.monthsHistorical);
  if (!days.length && !months.length) throw new Error('Tickertape history empty');
  return { days, months };
}

async function fetchCNNFearGreed() {
  // CNN's bot filter (HTTP 418 "You're a bot") rejects bare requests -
  // browser-like headers unblock it. Accept-Language is used (not Referer/
  // Origin: those are forbidden headers that fetch() cannot set).
  const r = await fetch(CNN_FG_URL, { headers: { 'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9' } });
  if (!r.ok) throw new Error('CNN HTTP ' + r.status);
  const j = await r.json();
  const fg = j && j.fear_and_greed;
  if (!fg || typeof fg.score !== 'number' || !isFinite(fg.score)) throw new Error('CNN shape');
  let history = [];
  try {
    const raw = j && j.fear_and_greed_historical && j.fear_and_greed_historical.data;
    if (Array.isArray(raw)) {
      history = raw
        .filter((p) => p && typeof p.y === 'number' && isFinite(p.y) && typeof p.x === 'number')
        .slice(-120)
        .map((p) => ({ date: new Date(p.x).toISOString(), value: Math.round(p.y * 10) / 10 }));
    }
  } catch (e) { history = []; }
  return {
    source: 'cnn',
    score: Math.round(fg.score * 10) / 10,
    band: moodBandForCNN(fg.score),
    asOn: fg.timestamp || null,
    link: CNN_FG_PAGE,
    prev: { close: (typeof fg.previous_close === 'number' && isFinite(fg.previous_close)) ? Math.round(fg.previous_close * 10) / 10 : null },
    history
  };
}

if (message.type === 'FETCH_MOOD_METER') {
    const economy = message.economy;
    const fallbackBreadth = message.fallbackBreadth || null;
    const skipCache = message.force === true;
    (async () => {
      try {
        if (!economy || !MOOD_MAIN_INDEX[economy]) { sendResponse({ mood: null }); return; }
        const now = Date.now();
        const hasFallback = !!(fallbackBreadth && (fallbackBreadth.adv + fallbackBreadth.dec) > 0);
        const cached = await chrome.storage.local.get(['marketMood']);
        const store = cached.marketMood || {};
        // Drop cache entries saved by older builds whose source doesn't match
        // what this economy must show - e.g. a proxy snapshot for India would
        // otherwise keep rendering as "Street Mood" instead of live MMI.
        if (economy === 'India' && store[economy] && store[economy].data && store[economy].data.source !== 'tickertape') {
          delete store[economy];
        }
        // Cache key includes fallback breadth for non-native economies so a
        // fresh overview (gainers/losers) invalidates the proxy score.
        const fbKey = hasFallback ? `${fallbackBreadth.adv}/${fallbackBreadth.dec}` : '-';
        // Native vendor values refresh on a longer TTL (MMI is daily-ish).
        const ttl = (economy === 'India' || economy === 'USA') ? MOOD_NATIVE_TTL_MS : MOOD_TTL_MS;
        if (!skipCache && store[economy] && (now - (store[economy].fetchedAt || 0)) < ttl && store[economy].fbKey === fbKey) {
          sendResponse({ mood: store[economy].data });
          return;
        }
        let data = null;
        try {
          if (economy === 'India') {
            data = await fetchTickertapeMMI();
          } else if (economy === 'USA') {
            // CNN failure prefers the previously fetched CNN value (served
            // as stale below) over a fresh proxy - only with no CNN history
            // at all do we fall back to the labeled proxy.
            try { data = await fetchCNNFearGreed(); }
            catch (e) {
              if (store[economy] && store[economy].data && store[economy].data.source === 'cnn') {
                data = null;
              } else {
                data = await computeMood(economy, null);
              }
            }
          } else {
            data = await computeMood(economy, hasFallback ? fallbackBreadth : null);
          }
          if (data && !data.source) data.source = 'proxy';
        } catch (e) {
          data = null;
        }
        if (data) {
          data.fetchedAt = now;
          store[economy] = { fetchedAt: now, fbKey, data };
          await chrome.storage.local.set({ marketMood: store });
          sendResponse({ mood: data });
        } else if (store[economy] && store[economy].data) {
          sendResponse({ mood: store[economy].data, stale: true });
        } else {
          sendResponse({ mood: null });
        }
      } catch (e) {
        sendResponse({ mood: null });
      }
    })();
    return true;
  }

  if (message.type === 'FETCH_MOOD_HISTORY') {
    (async () => {
      try {
        if (message.economy === 'India') {
          const h = await fetchTickertapeMMIHistory();
          sendResponse({ history: h });
        } else if (message.economy === 'USA') {
          const fg = await fetchCNNFearGreed();
          sendResponse({ history: { days: fg.history || [] } });
        } else {
          sendResponse({ history: null });
        }
      } catch (e) {
        sendResponse({ history: null, error: String((e && e.message) || e) });
      }
    })();
    return true;
  }

  if (message.type === 'FORCE_SYNC') {
    if (message.ticker) {
      fetchScreenerData(message.ticker).then(data => {
        chrome.storage.local.get(['cachedData'], (res) => {
          const cachedData = res.cachedData || {};
          const refreshBaseline = structuredClone({ cachedData });
          cachedData[message.ticker] = data;
          commitRefreshState({ cachedData }, refreshBaseline).then(() => {
             sendResponse({ success: true });
             chrome.runtime.sendMessage({ type: 'WATCHLIST_UPDATED' }).catch(() => {});
          });
        });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    } else {
      syncWatchlistData()
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
    }
    return true;
  }

  if (message.type === 'SEARCH_COMPANY') {
    const query = message.query;
    (async () => {
      try {
        const [screenerRes, yahooRes] = await Promise.allSettled([
          fetch('https://www.screener.in/api/company/search/?q=' + encodeURIComponent(query)).then(r => r.ok ? r.json() : []),
          fetch('https://query1.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(query) + '&quotesCount=7&newsCount=0').then(r => r.ok ? r.json() : { quotes: [] })
        ]);

        const results = [];
        const seenTickers = new Set();

        const screenerList = screenerRes.status === 'fulfilled' ? screenerRes.value : [];
        if (Array.isArray(screenerList)) {
          for (const item of screenerList) {
            const parts = (item.url || '').split('/');
            const ticker = parts[2] || '';
            if (ticker && !seenTickers.has(ticker.toUpperCase())) {
              seenTickers.add(ticker.toUpperCase());
              results.push({
                name: item.name,
                ticker: ticker,
                type: 'Indian Stock',
                url: item.url || ('/company/' + ticker + '/'),
                source: 'screener'
              });
            }
          }
        }

        const yahooData = yahooRes.status === 'fulfilled' ? yahooRes.value : {};
        const yahooQuotes = yahooData.quotes || [];
        for (const q of yahooQuotes) {
          if (!q.symbol) continue;
          const sym = q.symbol.toUpperCase();
          const cleanSym = sym.replace('.NS', '').replace('.BO', '');
          if (seenTickers.has(sym) || seenTickers.has(cleanSym)) continue;

          let type = 'Stock';
          if (q.quoteType === 'INDEX' || sym.startsWith('^')) type = 'Index';
          else if (q.quoteType === 'CRYPTOCURRENCY') type = 'Crypto';
          else if (q.quoteType === 'CURRENCY') type = 'Forex';
          else if (q.quoteType === 'FUTURE') type = 'Commodity';
          else if (q.quoteType === 'ETF') type = 'ETF';
          else if (q.exchange) type = q.exchange + ' Stock';

          const displayName = q.shortname || q.longname || q.symbol;
          seenTickers.add(sym);
          results.push({
            name: displayName + ' (' + q.symbol + ')',
            ticker: q.symbol,
            type: type,
            url: '/company/' + q.symbol + '/',
            source: 'yahoo'
          });
        }

        sendResponse(results);
      } catch (err) {
        console.error('Error in SEARCH_COMPANY:', err);
        sendResponse([]);
      }
    })();
    return true;
  }



  if (message.type === 'SET_TAPE_PAUSED') {
    const isPaused = message.isPaused === true;
    chrome.storage.local.set({ tapePaused: isPaused }, () => {
      chrome.tabs.query({}, (tabs) => {
        for (const t of (tabs || [])) {
          if (t && t.id) {
            chrome.tabs.sendMessage(t.id, { type: 'TAPE_PAUSE_UPDATE', isPaused }, () => {
              if (chrome.runtime.lastError) {}
            });
          }
        }
      });
      sendResponse({ success: true, isPaused });
    });
    return true;
  }

  if (message.type === 'SYNC_NOW') {
    (async () => {
      const pulled = await pullPrefsFromSync();
      const pushed = await pushPrefsToSync();
      sendResponse({ success: true, pulled: pulled.pulled || 0, pushed: pushed.pushed || 0 });
    })();
    return true;
  }

  if (message.type === 'GET_SYNC_STATE') {
    (async () => {
      let enabled = true;
      let lastSync = 0;
      try {
        const res = await chrome.storage.local.get(['syncEnabled', SYNC_TIME_KEY]);
        enabled = res.syncEnabled !== false;
        lastSync = res[SYNC_TIME_KEY] || 0;
      } catch (e) {}
      const email = await getSyncEmail();
      let canReadIdentity = false;
      try {
        canReadIdentity = !!(chrome.identity && chrome.identity.getProfileUserInfo);
      } catch (e) {}
      const supported = !!prefsSyncArea();
      console.log('GET_SYNC_STATE:', { enabled, lastSync, email: email ? email.substring(0, 5) + '...' : '', supported, canReadIdentity });
      sendResponse({ success: true, enabled, lastSync, email, supported, canReadIdentity });
    })();
    return true;
  }

  if (message.type === 'SET_TAPE_SPEED') {
    const mult = typeof message.speedMultiplier === 'number' ? message.speedMultiplier : 1.0;
    chrome.storage.local.set({ tapeSpeedMultiplier: mult, tapeSpeed: mult * 0.8 }, () => {
      chrome.tabs.query({}, (tabs) => {
        for (const t of (tabs || [])) {
          if (t && t.id) {
            chrome.tabs.sendMessage(t.id, { type: 'TAPE_SPEED_UPDATE', speedMultiplier: mult }, () => {
              if (chrome.runtime.lastError) {}
            });
          }
        }
      });
      sendResponse({ success: true, speedMultiplier: mult });
    });
    return true;
  }
});

// --- Context Menu Logic (watchlist + external chart links) ---
// Note: native extension menus cannot show icons, so these render as text
// rows: Add to Watchlist, Open in TradingView, Open in Screener,
// Open in Zerodha Kite.
function setupContextMenu() {
  const items = [
    { id: "addToScreener", title: t('ctxAdd') || 'Add "%s" to Ticker Screener Watchlist' },
    { id: "ctxSep", type: "separator" },
    { id: "openTradingView", title: t('ctxTradingView') || 'Open in TradingView' },
    { id: "openScreener", title: t('ctxScreener') || 'Open in Screener' },
    { id: "openStockAnalysis", title: t('ctxStockAnalysis') || 'Open in Stock Analysis' }
  ];
  const create = () => {
    try {
      for (const item of items) {
        if (item.type === "separator") {
          chrome.contextMenus.create({ id: item.id, type: "separator", contexts: ["selection"] }, () => {
            if (chrome.runtime.lastError) {}
          });
        } else {
          chrome.contextMenus.create({ id: item.id, title: item.title, contexts: ["selection"] }, () => {
            // create() is async: overlapping setup calls (install + SW wake-up)
            // surface duplicate-id here, never as a sync throw - swallow it.
            if (chrome.runtime.lastError) {}
          });
        }
      }
    } catch (e) {}
  };
  try {
    chrome.contextMenus.removeAll(() => {
      if (chrome.runtime.lastError) {}
      create();
    });
  } catch (e) {
    create();
  }
}
chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu();
});
// On fresh install, open the welcome page that shows users how to pin
// the extension to the toolbar. Updates must not reopen it.
chrome.runtime.onInstalled.addListener((details) => {
  try {
    if (details && details.reason === 'install') {
      chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') }, () => {
        if (chrome.runtime.lastError) {}
      });
    }
  } catch (e) {}
});
try {
  if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(setupContextMenu);
} catch (e) {}
// Service workers restart - ensure the menu exists on every wake-up.
try { setupContextMenu(); } catch (e) {}

// Guess a clean stock name from a raw text selection for the menu label.
// Selections often include prices ("Syrma SGS Technology 1,612.00 101.40"),
// so cut before the first price-like number and cap the length. The full
// selection is still used for ticker resolution on click.
function guessStockName(sel) {
  try {
    let s = String(sel || '').split('\n')[0].trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
    if (!s) return '';
    const m = s.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+/);
    if (m && m.index > 0) s = s.slice(0, m.index).trim().replace(/[|:,;.()\-–—―…]+$/, '').trim();
    if (!s) return '';
    if (s.length > 42) s = s.slice(0, 42).trim() + '…';
    return s;
  } catch (e) {
    return '';
  }
}
// Rewrite the menu title on every open so it shows only the stock name
// instead of the whole selected text (Chrome's "%s" always uses the raw
// selection). Reuses the localized ctxAdd string with manual substitution.
try {
  if (chrome.contextMenus && chrome.contextMenus.onShown) {
    chrome.contextMenus.onShown.addListener((info) => {
      try {
        if (!info || !info.menuIds || info.menuIds.indexOf('addToScreener') === -1) return;
        const name = guessStockName(info.selectionText);
        const base = t('ctxAdd') || 'Add "%s" to Ticker Screener Watchlist';
        const title = name ? base.replace('%s', name) : base.replace('"%s" ', '').replace('%s', '').trim();
        chrome.contextMenus.update('addToScreener', { title }, () => {
          try {
            if (chrome.runtime.lastError) return;
            chrome.contextMenus.refresh();
          } catch (e) {}
        });
      } catch (e) {}
    });
  }
} catch (e) {}

// Resolve selected text to a stock: Screener.in first (Indian
// stocks), Yahoo Finance search as fallback (global stocks/ETFs/indices).
// Returns { symbol, base, source, tvExchange, isIndian } - the exchange info
// is needed to build TradingView / Kite links. `symbol` keeps the Yahoo
// suffix (RELIANCE.NS) for watchlist storage; `base` is the bare symbol
// (RELIANCE) used in Screener.in and Kite URLs.
const TV_EXCHANGE_MAP = {
  NSI: 'NSE', BSE: 'BSE', NSE: 'NSE',
  NMS: 'NASDAQ', NGM: 'NASDAQ', NCM: 'NASDAQ',
  NYQ: 'NYSE', NYS: 'NYSE', PCX: 'NYSE', ASE: 'AMEX'
};
function mapTvExchange(exchange, exchDisp, symbol) {
  const ex = String(exchange || '').toUpperCase();
  if (TV_EXCHANGE_MAP[ex]) return TV_EXCHANGE_MAP[ex];
  const disp = String(exchDisp || '').toUpperCase();
  if (disp.indexOf('NASDAQ') !== -1) return 'NASDAQ';
  if (disp.indexOf('NYSE ARCA') !== -1) return 'NYSE';
  if (disp.indexOf('NYSE') !== -1) return 'NYSE';
  if (disp.indexOf('AMEX') !== -1) return 'AMEX';
  if (disp === 'NSE' || /\.NS$/i.test(symbol || '')) return 'NSE';
  if (disp === 'BSE' || /\.BO$/i.test(symbol || '')) return 'BSE';
  if (disp.indexOf('LONDON') !== -1 || disp === 'LSE') return 'LSE';
  return '';
}
function toBaseSymbol(symbol) {
  return String(symbol || '').toUpperCase().replace(/\.(NS|BO)$/, '');
}
async function resolveCtxStock(query) {
  const q = (query || '').trim();
  if (!q) return null;
  try {
    const res = await fetch(`https://www.screener.in/api/company/search/?q=${encodeURIComponent(q)}`);
    if (res.ok) {
      const results = await res.json();
      if (results && results.length > 0 && results[0].url) {
        // Company URLs look like /company/RELIANCE/consolidated/ - the ticker
        // is the segment right after "company", NOT the last segment.
        const segs = String(results[0].url).split('/').filter(Boolean);
        const ci = segs.indexOf('company');
        const raw = (ci !== -1 && segs[ci + 1]) ? segs[ci + 1] : segs[segs.length - 1];
        if (raw) {
          const base = toBaseSymbol(raw);
          return { symbol: base, base, source: 'screener', tvExchange: 'NSE', isIndian: true };
        }
      }
    }
  } catch (e) {}
  try {
    const res = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}`);
    if (res.ok) {
      const data = await res.json();
      const quotes = (data && data.quotes) || [];
      if (quotes.length > 0 && quotes[0].symbol) {
        const symbol = String(quotes[0].symbol).toUpperCase();
        const base = toBaseSymbol(symbol);
        const tvExchange = mapTvExchange(quotes[0].exchange, quotes[0].exchDisp, symbol);
        const isIndian = tvExchange === 'NSE' || tvExchange === 'BSE';
        return { symbol, base, source: 'yahoo', tvExchange, isIndian };
      }
    }
  } catch (e) {}
  return null;
}

// External chart links for a resolved stock.
function tradingViewUrl(stock, rawQuery) {
  const sym = (stock && stock.base) ? stock.base : String(rawQuery || '').toUpperCase();
  const tvSym = (stock && stock.tvExchange) ? `${stock.tvExchange}:${sym}` : sym;
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSym)}`;
}
function screenerInUrl(stock, rawQuery) {
  if (stock && stock.source === 'screener' && stock.base) {
    return `https://www.screener.in/company/${encodeURIComponent(stock.base)}/`;
  }
  return `https://www.screener.in/search/?q=${encodeURIComponent(rawQuery)}`;
}
function stockAnalysisUrl(stock, rawQuery) {
  const sym = (stock && stock.base) ? stock.base : String(rawQuery || '').toUpperCase();
  return `https://stockanalysis.com/stocks/${encodeURIComponent(sym.toLowerCase())}/`;
}
// Kite only lists Indian (NSE/BSE) equities - null when unsupported.
function kiteUrl(stock) {
  if (!stock || !stock.isIndian || !stock.base) return null;
  const ex = stock.tvExchange === 'BSE' ? 'BSE' : 'NSE';
  return `https://kite.zerodha.com/chart/ext/ciq/${ex}/${encodeURIComponent(stock.base)}`;
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const query = (info.selectionText || '').trim();
  if (!query) return;
  const notify = (title, message) => {
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon_128.png',
        title,
        message,
        silent: true
      });
    } catch (e) {}
  };
  const openUrl = (url) => {
    try {
      if (url) chrome.tabs.create({ url });
    } catch (e) {}
  };
  const notFound = () => {
    notify(
      t('ctxAddedTitle') || 'Ticker Screener Watchlist',
      (t('ctxNotFound', query) || `Could not find "${query}". Try selecting the exact company name.`)
    );
  };
  try {
    const stock = await resolveCtxStock(query);
    if (info.menuItemId === "openTradingView" || info.menuItemId === "openScreener" || info.menuItemId === "openStockAnalysis" || info.menuItemId === "openKite") {
      if (!stock) {
        notFound();
        return;
      }
      if (info.menuItemId === "openTradingView") openUrl(tradingViewUrl(stock, query));
      else if (info.menuItemId === "openScreener") openUrl(screenerInUrl(stock, query));
      else if (info.menuItemId === "openStockAnalysis") openUrl(stockAnalysisUrl(stock, query));
      return;
    }
    if (info.menuItemId !== "addToScreener") return;
    const ticker = stock && stock.symbol ? stock.symbol : null;
    if (!ticker) {
      notFound();
      return;
    }
    const stored = await chrome.storage.local.get(['portfolios', 'screenerWatchlist', 'activePortfolioName']);
    let portfolios = stored.portfolios || {};
    let target = stored.activePortfolioName;
    if (!target || !portfolios[target]) {
      const names = Object.keys(portfolios);
      target = names.length > 0 ? names[0] : 'Sample';
      if (!portfolios[target]) portfolios[target] = [];
    }
    if ((portfolios[target] || []).includes(ticker)) {
      notify(t('ctxAddedTitle') || 'Ticker Screener Watchlist', t('alreadyButton') || 'Already in Watchlist');
      return;
    }
    portfolios[target] = [...(portfolios[target] || []), ticker];
    await chrome.storage.local.set({ portfolios, screenerWatchlist: portfolios[target] });
    syncWatchlistData(); // fetch new data immediately
    notify(
      t('ctxAddedTitle') || 'Ticker Screener Watchlist',
      t('ctxAddedMsg', ticker) || `Added ${ticker} to your watchlist!`
    );
  } catch (err) {
    console.error('Context menu add failed', err);
  }
});


// Fast price polling (only hits Yahoo Finance, avoids Screener rate limits)
async function fetchFastPrices() {
  if (isFetchingFastPrices) return;
  isFetchingFastPrices = true;
  try {
    const data = await chrome.storage.local.get(['pinnedIndices', 'screenerWatchlist', 'portfolios', 'cachedData', 'marketIndices']);
    const defaultPinned = [
      { key: 'S&P 500 (USA)', symbol: '^GSPC', curr: 'USD' },
      { key: 'NIKKEI (Japan)', symbol: '^N225', curr: 'JPY' },
      { key: 'STI (Singapore)', symbol: '^STI', curr: 'SGD' },
      { key: 'FTSE 100 (UK)', symbol: '^FTSE', curr: 'GBP' }
    ];
    const pinnedIndices = Array.isArray(data.pinnedIndices) ? data.pinnedIndices : defaultPinned;
    const screenerWatchlist = data.screenerWatchlist || [];
    const portfolios = data.portfolios || {};
    const cachedData = data.cachedData || {};
    const marketIndices = data.marketIndices || {};
    const refreshBaseline = structuredClone({ cachedData, marketIndices });

    let allTickers = [...screenerWatchlist];
    for (const list of Object.values(portfolios)) {
      if (Array.isArray(list)) allTickers.push(...list);
    }
    allTickers = [...new Set(allTickers)];

    const symbolsToFetch = pinnedIndices.map(p => p.symbol);
    for (const t of allTickers) {
      // Yahoo-native symbols (indices, dotted, crypto/forex/futures, hyphenated
      // like BRK-B/BTC-USD) go as-is; plain tickers resolve via cache or .NS
      if (t.startsWith('^') || t.includes('.') || t.includes('=') || t.includes('-')) {
        symbolsToFetch.push(t);
      } else {
        const cached = cachedData[t];
        if (cached && cached.currency && cached.currency !== 'INR') {
          symbolsToFetch.push(t);
        } else {
          symbolsToFetch.push(t + '.NS');
        }
      }
    }

    const uniqueSymbols = [...new Set(symbolsToFetch)];
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(uniqueSymbols.join(','))}&interval=1m&range=1d`);
    const sparkData = res.ok ? normalizeSparkData(await res.json()) : {};
      const missingSymbols = uniqueSymbols.filter((symbol) => {
        const quote = sparkData[symbol];
        return !quote || ((!Array.isArray(quote.close) || !quote.close.some((value) => value !== null && value !== undefined)) && quote.regularMarketPrice === undefined && quote.previousClose === undefined);
      });
      if (missingSymbols.length > 0 && Date.now() - lastFastFallbackAt >= 5000) {
        lastFastFallbackAt = Date.now();
        const fallbackQuotes = await Promise.all(missingSymbols.map(async (symbol) => [symbol, await fetchChartQuote(symbol)]));
        for (const [symbol, quote] of fallbackQuotes) {
          if (quote) sparkData[symbol] = quote;
        }
      }
      let changed = false;

      // Clean up stale index keys when cards are modified
      const validKeys = new Set(pinnedIndices.map(p => p.key));
      for (const k of Object.keys(marketIndices)) {
        if (!validKeys.has(k)) {
          delete marketIndices[k];
          changed = true;
        }
      }

      // Process pinned cards/indices
      for (const idx of pinnedIndices) {
        const d = sparkData[idx.symbol];
        if (d) {
          const prices = d.close || [];
          let price = null;
          for (let i = prices.length - 1; i >= 0; i--) {
            if (prices[i] !== null && prices[i] !== undefined) { price = prices[i]; break; }
          }
           if (price === null && d.regularMarketPrice !== undefined) price = d.regularMarketPrice;
           if (price === null && d.previousClose !== undefined) price = d.previousClose;

          if (price !== null) {
            const prev = d.previousClose;
            const diff = prev ? price - prev : 0;
            const pct = prev ? ((diff / prev) * 100).toFixed(2) : '0.00';
            
            const oldIdx = marketIndices[idx.key];
            const currency = getCurrencyDetails(d.meta?.currency || oldIdx?.curr || idx.curr || 'INR');
            const isVIX = (idx.symbol || '').toUpperCase().includes('VIX');
            const currPrefix = isVIX ? '' : currency.prefix;
            const ipd = priceDecimalsFor(price);
            const formatted = `${currPrefix}${price.toLocaleString(currency.locale, { minimumFractionDigits: ipd, maximumFractionDigits: ipd })}`;

            let flash = oldIdx?.flash;
            let flashTime = oldIdx?.flashTime;

            if (oldIdx && oldIdx.price && oldIdx.price !== formatted) {
              const oldNum = parseFloat((oldIdx.price || '0').replace(/[^\d\.]/g, ''));
              if (oldNum && oldNum !== price) {
                flash = price > oldNum ? 'up' : 'down';
                flashTime = Date.now();
              }
            }

            if (marketIndices[idx.key]?.price !== formatted || flash !== oldIdx?.flash || oldIdx?.changePct !== Math.abs(parseFloat(pct)).toFixed(2) + '%' || oldIdx?.changeDir !== (diff >= 0 ? 'up' : 'down')) {
              marketIndices[idx.key] = {
                symbol: idx.symbol,
                price: formatted,
                curr: currency.code,
                changeDir: diff >= 0 ? 'up' : 'down',
                changePct: Math.abs(parseFloat(pct)).toFixed(2) + '%',
                flash,
                flashTime,
                sparkline: oldIdx?.sparkline || []
              };
              changed = true;
            }
          }
        }
      }

      // Process Watchlist
      for (const ticker of allTickers) {
        const nsKey = ticker + '.NS';
        const d = sparkData[ticker] || sparkData[nsKey];
        if (d) {
          const prices = d.close || [];
          let price = null;
          for (let i = prices.length - 1; i >= 0; i--) {
            if (prices[i] !== null && prices[i] !== undefined) { price = prices[i]; break; }
          }
          if (price === null && d.regularMarketPrice !== undefined) price = d.regularMarketPrice;
          if (price === null && d.previousClose !== undefined) price = d.previousClose;

          if (price !== null) {
            const prev = d.previousClose;
            const diff = prev ? price - prev : 0;
            const pct = prev ? ((diff / prev) * 100).toFixed(2) : '0.00';

            if (!cachedData[ticker]) cachedData[ticker] = { ratios: {} };
            if (!cachedData[ticker].ratios) cachedData[ticker].ratios = {};
            const currency = getCurrencyDetails(d.meta?.currency || cachedData[ticker]?.currency || 'INR');
            const isVIX = ticker.toUpperCase().includes('VIX');
            const currPrefix = isVIX ? '' : currency.prefix;
            const currentStr = cachedData[ticker].ratios['Current Price'];
            const wpd = priceDecimalsFor(price);
            const formattedPrice = `${currPrefix}${price.toLocaleString(currency.locale, { minimumFractionDigits: wpd, maximumFractionDigits: wpd })}`;

            if (currentStr !== formattedPrice || cachedData[ticker].changePct !== Math.abs(parseFloat(pct)).toFixed(2) + '%' || cachedData[ticker].changeDir !== (diff >= 0 ? 'up' : 'down')) {
              const oldNum = parseFloat((currentStr || '0').replace(/[^\d\.]/g, ''));
              if (oldNum && oldNum !== price) {
                cachedData[ticker].flash = price > oldNum ? 'up' : 'down';
                cachedData[ticker].flashTime = Date.now();
                if (!cachedData[ticker].epsTTM || !cachedData[ticker].sharesOutstanding) {
                  captureValuationAnchors(cachedData[ticker], oldNum);
                }
              }
              cachedData[ticker].ratios['Current Price'] = formattedPrice;
              cachedData[ticker].currency = currency.code;
              cachedData[ticker].changePct = Math.abs(parseFloat(pct)).toFixed(2) + '%';
              cachedData[ticker].changeDir = diff >= 0 ? 'up' : 'down';
              changed = true;
            }
            if (refreshLiveValuation(cachedData[ticker], price, currency.code)) changed = true;
          }
        }
      }

    if (changed) {
      await commitRefreshState({ cachedData, marketIndices, lastFastPoll: Date.now() }, refreshBaseline);
      chrome.runtime.sendMessage({ type: 'WATCHLIST_UPDATED' }).catch(() => {});
    }

    const needsFundamentals = allTickers.some((t) => needsValuationRefresh(cachedData[t], t));
    // When P/E or market cap are still blank the user is staring at "-", so
    // retry on a short cadence. Once everything is filled the 60s steady-state
    // poll takes over.
    const fundWaitMs = needsFundamentals ? 3000 : 60000;
    if (Date.now() - lastFundamentalsAt >= fundWaitMs) {
      refreshWatchlistFundamentals(uniqueSymbols, allTickers);
    }
  } catch (e) {
  } finally {
    isFetchingFastPrices = false;
  }
}

// Pull synced preferences on startup so this device matches the latest state
pullPrefsFromSync();

// Start 1-second ultra-fast live price updates
fetchFastPrices();
if (!fastPollInterval) {
  fastPollInterval = setInterval(fetchFastPrices, 1000);
}
