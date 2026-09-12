let fastPollInterval = null;
let isFetchingFastPrices = false;
let lastFastFallbackAt = 0;
const PRICE_DECIMALS = 2;
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
// Open side panel on action icon click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

// Fetch helper
function roundStringValue(str, decimals = 2) {
  return str.replace(/[\d,\.]+/g, (match) => {
    if (match === '.') return match;
    const num = parseFloat(match.replace(/,/g, ''));
    if (isNaN(num)) return match;
    return num.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  });
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

async function fetchYahooData(symbol) {
  try {
    let sym = symbol;
    let chartRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`);
    if (!chartRes.ok && !sym.startsWith('^') && !sym.includes('.')) {
      sym = `${symbol}.NS`;
      chartRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`);
    }
    if (!chartRes.ok) throw new Error('Quote not found on Yahoo Finance');
    const chartData = await chartRes.json();
    const result = chartData?.chart?.result?.[0];
    if (!result) throw new Error('Invalid quote response');
    const meta = result.meta;
    
    const companyName = meta.shortName || meta.longName || symbol;
    const isIndex = meta.instrumentType === 'INDEX' || symbol.startsWith('^');
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
      ratios['Current Price'] = `${curr}${price.toLocaleString(currency.locale, { minimumFractionDigits: PRICE_DECIMALS, maximumFractionDigits: PRICE_DECIMALS })}`;
    }
    if (meta.regularMarketDayLow !== undefined && meta.regularMarketDayHigh !== undefined) {
      ratios['Day Range'] = `${curr}${meta.regularMarketDayLow.toLocaleString(currency.locale, { minimumFractionDigits: 2 })} - ${curr}${meta.regularMarketDayHigh.toLocaleString(currency.locale, { minimumFractionDigits: 2 })}`;
    }
    if (meta.fiftyTwoWeekLow !== undefined && meta.fiftyTwoWeekHigh !== undefined) {
      ratios['52W Range'] = `${curr}${meta.fiftyTwoWeekLow.toLocaleString(currency.locale, { minimumFractionDigits: 2 })} - ${curr}${meta.fiftyTwoWeekHigh.toLocaleString(currency.locale, { minimumFractionDigits: 2 })}`;
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

    // Fetch fundamental data from Finviz for US stocks
    if (!isIndex) {
      try {
        const finvizRes = await fetch(`https://finviz.com/quote.ashx?t=${encodeURIComponent(sym.replace('.NS', ''))}`);
        if (finvizRes.ok) {
          const finvizHtml = await finvizRes.text();
          
          const extractFinviz = (field) => {
            // Tolerate inner tags around the label (e.g. "Dividend TTM" is wrapped in an <a> link)
            const labelTail = `(?:<[^>]+>)*\\s*<\\/div>\\s*<\\/td>\\s*<td[^>]*>\\s*<div[^>]*>`;
            let regex = new RegExp(`>${field}${labelTail}.*?<b>(.*?)<\\/b>`, 's');
            let match = finvizHtml.match(regex);
            if (match && match[1]) {
              return match[1].replace(/<[^>]+>/g, '').trim();
            }
            // fallback if it's not inside <b> tags
            regex = new RegExp(`>${field}${labelTail}.*?<span[^>]*>(.*?)<\\/span>`, 's');
            match = finvizHtml.match(regex);
            if (match && match[1]) {
              return match[1].replace(/<[^>]+>/g, '').trim();
            }
            // last resort: grab the whole value cell via the snapshot structure
            regex = new RegExp(`snapshot-td-label[^>]*>(?:<[^>]+>)*\\s*${field}(?:<[^>]+>)*\\s*<\\/div>\\s*<\\/td>\\s*<td[^>]*>\\s*<div[^>]*>(.*?)<\\/div>`, 's');
            match = finvizHtml.match(regex);
            if (match && match[1]) {
              const cleaned = match[1].replace(/<[^>]+>/g, '').trim();
              if (cleaned) return cleaned;
            }
            return null;
          };

          const pe = extractFinviz('P\\/E');
          if (pe && pe !== '-') ratios['Stock P/E'] = pe;

          // Finviz redesign: capital efficiency is labeled "ROIC" (old "ROI")
          const roic = extractFinviz('ROIC') || extractFinviz('ROI');
          if (roic && roic !== '-') ratios['ROCE'] = roic; // mapping ROIC to ROCE for UI consistency

          const mcap = extractFinviz('Market Cap');
          if (mcap && mcap !== '-') ratios['Market Cap'] = formatMarketCap(mcap);

          // Finviz redesign: dividend is labeled "Dividend TTM" (e.g. "3.64 (0.74%)")
          const div = extractFinviz('Dividend TTM') || extractFinviz('Dividend %') || extractFinviz('Dividend');
          if (div && div !== '-') {
            const pctMatch = div.match(/([\d.,]+%)/);
            ratios['Dividend Yield'] = pctMatch ? pctMatch[1] : div;
          }

          const pb = extractFinviz('P\\/B');
          if (pb && pb !== '-') ratios['Price to book value'] = pb;
          
          const roe = extractFinviz('ROE');
          if (roe && roe !== '-') ratios['ROE'] = roe;
        }
      } catch(e) {}
      // Yahoo meta fallbacks (used when Finviz is blocked or a field is missing)
      try {
        if (!ratios['Dividend Yield']) {
          const dy = meta.trailingAnnualDividendYield ?? meta.dividendYield;
          if (typeof dy === 'number' && isFinite(dy) && dy > 0) {
            ratios['Dividend Yield'] = (dy * 100).toFixed(2) + '%';
          }
        }
        if (!ratios['Stock P/E']) {
          const tpe = meta.trailingPE ?? meta.forwardPE;
          if (typeof tpe === 'number' && isFinite(tpe) && tpe > 0) {
            ratios['Stock P/E'] = tpe.toFixed(2);
          }
        }
      } catch(e) {}
    }

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
      source: 'yahoo',
      currency: meta.currency
    };
  } catch(err) {
    return { success: false, ticker: symbol, error: err.message };
  }
}

async function fetchScreenerData(ticker) {
  // If ticker is an index, fetch directly from Yahoo Finance
  if (ticker.startsWith('^')) {
    return fetchYahooData(ticker);
  }

  try {
    let response = await fetch(`https://www.screener.in/company/${ticker}/consolidated/`);
    if (!response.ok) {
      response = await fetch(`https://www.screener.in/company/${ticker}/`);
      if (!response.ok) throw new Error('Not found on Screener');
    }
    const htmlText = await response.text();
    
    const extractName = htmlText.match(/<h1[^>]*>([^<]+)<\/h1>/);
    const companyName = extractName ? extractName[1].trim() : ticker;

    const ratios = {};
    const ratiosMatch = htmlText.match(/<ul id="top-ratios">([\s\S]*?)<\/ul>/);
    if (ratiosMatch) {
      const listHtml = ratiosMatch[1];
      const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/g;
      
      let match;
      while ((match = liRegex.exec(listHtml)) !== null) {
        const liHtml = match[1];
        const nameMatch = liHtml.match(/<span class="name">\s*([^<]+)\s*<\/span>/);
        if (nameMatch) {
          let name = nameMatch[1].trim();
          let afterName = liHtml.substring(nameMatch.index + nameMatch[0].length);
          let valueStr = afterName.replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
          ratios[name] = name === 'Market Cap'
            ? formatMarketCap(valueStr)
            : roundStringValue(valueStr);
        }
      }
    }

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
      const yahooRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.NS?interval=1d&range=1y`);
      if (yahooRes.ok) {
        const yahooData = await yahooRes.json();
        const quotes = yahooData.chart.result[0].indicators.quote[0];
        sparkline = quotes.close.filter(p => p !== null && p !== undefined).map(p => parseFloat(p.toFixed(2)));
      }
    } catch (e) {}

    return { success: true, ticker, companyName, ratios, aboutText, changeDir, changePct, sparkline, source: 'screener', currency: 'INR' };
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
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('checkAlerts', { periodInMinutes: 5 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkAlerts') {
    checkPriceAlerts();
  }
  if (alarm.name === 'syncWatchlist') {
    syncWatchlistData();
  }
});

async function checkPriceAlerts() {
  chrome.storage.local.get(['alerts', 'portfolios'], async (res) => {
    const alerts = res.alerts || {};
    // Collect all tickers that have active alerts
    const activeTickers = Object.keys(alerts).filter(t => alerts[t].above || alerts[t].below);
    if (activeTickers.length === 0) return;

    for (const ticker of activeTickers) {
      try {
        const fetchRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.NS?range=1d&interval=1d`);
        const data = await fetchRes.json();
        const price = data.chart.result[0].meta.regularMarketPrice;
        
        const threshold = alerts[ticker];
        if (threshold.above && price > threshold.above) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon_128.png',
            title: 'Price Alert Triggered! 📈',
            message: `${ticker} has crossed above ₹${threshold.above} (Current: ₹${price})`
          });
          // Remove the alert once triggered
          delete alerts[ticker].above;
        }
        if (threshold.below && price < threshold.below) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon_128.png',
            title: 'Price Alert Triggered! 📉',
            message: `${ticker} has dropped below ₹${threshold.below} (Current: ₹${price})`
          });
          delete alerts[ticker].below;
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
  
  const cachedData = {};
  for (const ticker of allTickers) {
    const data = await fetchScreenerData(ticker);
    
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
    
    cachedData[ticker] = data;

    // Check Price Alerts
    if (priceAlerts[ticker] && data.success) {
      const priceStr = data.ratios['Current Price'];
      if (priceStr) {
        const currentPrice = parseFloat(priceStr.replace(/,/g, ''));
        const alert = priceAlerts[ticker];
        
        let triggered = false;
        if (alert.condition === 'above' && currentPrice >= alert.target) triggered = true;
        if (alert.condition === 'below' && currentPrice <= alert.target) triggered = true;

        if (triggered && !alert.notified) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'chrome://favicon/https://www.screener.in',
            title: 'Screener Price Alert',
            message: `${ticker} has crossed your target of ${alert.target} (Current: ${currentPrice})`
          });
          priceAlerts[ticker].notified = true;
        } else if (!triggered) {
          // reset if it goes out of threshold
          priceAlerts[ticker].notified = false;
        }
      }
    }

    // Sleep slightly to avoid spamming
    await new Promise(resolve => setTimeout(resolve, 500));
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

  await chrome.storage.local.set({ cachedData, marketIndices: indices || oldIndices || {}, priceAlerts, lastSync: Date.now() });
  
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

// Run once on startup
syncWatchlistData();

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
        // Only cache complete sets — a partial fetch (one indicator failed)
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

  if (message.type === 'FORCE_SYNC') {
    if (message.ticker) {
      fetchScreenerData(message.ticker).then(data => {
        chrome.storage.local.get(['cachedData'], (res) => {
          const cachedData = res.cachedData || {};
          cachedData[message.ticker] = data;
          chrome.storage.local.set({ cachedData }, () => {
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

// --- Context Menu Logic ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "addToScreener",
    title: 'Add "%s" to Screener Watchlist',
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "addToScreener") {
    const query = info.selectionText.trim();
    if (!query) return;
    try {
      const res = await fetch(`https://www.screener.in/api/company/search/?q=${encodeURIComponent(query)}`);
      const results = await res.json();
      if (results && results.length > 0) {
        const parts = results[0].url.split('/');
        const ticker = parts[2];
        const { screenerWatchlist = [] } = await chrome.storage.local.get(['screenerWatchlist']);
        if (!screenerWatchlist.includes(ticker)) {
          screenerWatchlist.push(ticker);
          await chrome.storage.local.set({ screenerWatchlist });
          syncWatchlistData(); // fetch new data immediately
          // Notify user via a silent push notification
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'chrome://favicon/https://www.screener.in',
            title: 'Screener Watchlist',
            message: `Added ${ticker} to your watchlist!`,
            silent: true
          });
        }
      }
    } catch(err) {
      console.error('Context menu search failed', err);
    }
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

    let allTickers = [...screenerWatchlist];
    for (const list of Object.values(portfolios)) {
      if (Array.isArray(list)) allTickers.push(...list);
    }
    allTickers = [...new Set(allTickers)];

    const symbolsToFetch = pinnedIndices.map(p => p.symbol);
    for (const t of allTickers) {
      if (t.startsWith('^') || t.includes('.')) {
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
            const formatted = `${currPrefix}${price.toLocaleString(currency.locale, { minimumFractionDigits: PRICE_DECIMALS, maximumFractionDigits: PRICE_DECIMALS })}`;

            let flash = oldIdx?.flash;
            let flashTime = oldIdx?.flashTime;

            if (oldIdx && oldIdx.price && oldIdx.price !== formatted) {
              const oldNum = parseFloat((oldIdx.price || '0').replace(/[^\d\.]/g, ''));
              if (oldNum && oldNum !== price) {
                flash = price > oldNum ? 'up' : 'down';
                flashTime = Date.now();
              }
            }

            if (marketIndices[idx.key]?.price !== formatted || flash !== oldIdx?.flash) {
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
            const formattedPrice = `${currPrefix}${price.toLocaleString(currency.locale, { minimumFractionDigits: PRICE_DECIMALS, maximumFractionDigits: PRICE_DECIMALS })}`;

            if (currentStr !== formattedPrice) {
              const oldNum = parseFloat((currentStr || '0').replace(/[^\d\.]/g, ''));
              if (oldNum && oldNum !== price) {
                cachedData[ticker].flash = price > oldNum ? 'up' : 'down';
                cachedData[ticker].flashTime = Date.now();
              }
              cachedData[ticker].ratios['Current Price'] = formattedPrice;
              cachedData[ticker].currency = currency.code;
              cachedData[ticker].changePct = Math.abs(parseFloat(pct)).toFixed(2) + '%';
              cachedData[ticker].changeDir = diff >= 0 ? 'up' : 'down';
              changed = true;
            }
          }
        }
      }

    if (changed) {
      await chrome.storage.local.set({ cachedData, marketIndices, lastFastPoll: Date.now() });
      chrome.runtime.sendMessage({ type: 'WATCHLIST_UPDATED' }).catch(() => {});
    }
  } catch (e) {
  } finally {
    isFetchingFastPrices = false;
  }
}

// Start 1-second ultra-fast live price updates
fetchFastPrices();
if (!fastPollInterval) {
  fastPollInterval = setInterval(fetchFastPrices, 1000);
}
