const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const builds = [
  '../extension-code/background.js',
  '../../Screener  Firefox extension/background.js'
];

function harness(file) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const context = vm.createContext({
    console, setTimeout, clearTimeout, AbortController,
    chrome: { storage: { local: { get() {}, set: async () => {} } } }
  });
  // Execute the actual provider/resolver code without starting extension polling.
  const sections = [
    source.slice(source.indexOf('function classifyAsset('), source.indexOf('function t(')),
    source.slice(source.indexOf('function formatMarketCap('), source.indexOf('function captureValuationAnchors(')),
    source.slice(source.indexOf('function getCurrencyDetails('), source.indexOf('async function ', source.indexOf('function getCurrencyDetails('))),
  ];
  sections.push(source.slice(source.indexOf('const FUND_SOURCE_RANK'), source.indexOf('async function fetchYahooData(')));
  vm.runInContext('const formatPureRatio = String; const resolveSymbolAlias = t => t;\n' + sections.join('\n'), context);
  return { context, run: code => vm.runInContext(code, context) };
}

for (const build of builds) {
  test(build + ': partial results fall through and preserve primary fields', async () => {
    const h = harness(build);
    h.run(`calls = []; FUND_SOURCES.forEach(s => s.run = async () => {
      calls.push(s.id);
      if (s.id === 'screener') return { pe: '12' };
      if (s.id === 'yahooQuote') throw new Error('401');
      return { pe: '99', marketCap: '₹100 Cr.' };
    }); entry = { ratios: {}, currency: 'INR' };`);
    assert.equal(await h.run("resolveValuationFundamentals('RELIANCE', entry)"), true);
    assert.deepEqual(Array.from(h.run('calls')), ['screener', 'yahooQuote', 'stockAnalysis']);
    assert.equal(h.run("entry.ratios['Stock P/E']"), '12');
    assert.equal(h.run("entry.ratios['Market Cap']"), '₹100 Cr.');
  });

  test(build + ': cooldown is per symbol and expires', () => {
    const h = harness(build);
    h.run("fundNoteSource('screener', 'BAD', false)");
    assert.equal(h.run("fundSourceCoolingDown('screener', 'BAD')"), true);
    assert.equal(h.run("fundSourceCoolingDown('screener', 'GOOD')"), false);
    h.run("fundSourceHealth['screener:BAD'].at -= FUND_SOURCE_COOLDOWN_MS");
    assert.equal(h.run("fundSourceCoolingDown('screener', 'BAD')"), false);
  });

  test(build + ': empty HTTP-success results fall through; cached data survives failures', async () => {
    const h = harness(build);
    h.run("FUND_SOURCES.forEach(s => s.run = async () => ({})); entry = { ratios: { 'Stock P/E': '20' }, currency: 'USD' }");
    assert.equal(await h.run("resolveValuationFundamentals('AAPL', entry)"), false);
    assert.equal(h.run("entry.ratios['Stock P/E']"), '20');
    assert.equal(h.run("fundSourceCoolingDown('finviz', 'AAPL')"), true);
  });

  test(build + ': Indian Yahoo symbols never request the US ticker', async () => {
    const h = harness(build);
    h.run("fetchYahooQuotes = async symbols => { requested = symbols; return {}; }");
    await assert.rejects(h.run("fundFromYahooQuote('RELIANCE', {isIndian:true})"));
    assert.deepEqual(Array.from(h.run('requested')), ['RELIANCE.NS']);
    await assert.rejects(h.run("fundFromYahooQuote('500325.BO', {isIndian:true})"));
    assert.deepEqual(Array.from(h.run('requested')), ['500325.BO']);
  });

  test(build + ': Stock Analysis parses table cells, preserves units and rejects negative P/E', async () => {
    const h = harness(build);
    h.context.fetchWithTimeout = async () => ({ ok: true, text: async () =>
      '<table><tr><td><a>Market Cap</a></td><td>15.76T <span>+1%</span></td></tr><tr><td>PE Ratio</td><td>-12.34</td></tr></table>' });
    const result = await h.run("fundFromStockAnalysis('RELIANCE.NS', {isIndian:true,currency:'INR'})");
    assert.equal(result.pe, undefined);
    assert.equal(h.run('parseMarketCapToNumber(' + JSON.stringify(result.marketCap) + ')'), 15.76e12);
    assert.equal(Object.keys(await h.run("fundFromStockAnalysis('500325.BO', {isIndian:true,currency:'INR'})")).length, 0);
  });

  test(build + ': complete entries and non-equities make no provider requests', async () => {
    const h = harness(build);
    h.run("FUND_SOURCES.forEach(s => s.run = async () => { throw new Error('must not run'); }); entry = {ratios:{'Stock P/E':'20','Market Cap':'$1B'}}");
    assert.equal(await h.run("resolveValuationFundamentals('AAPL', entry)"), false);
    assert.equal(await h.run("resolveValuationFundamentals('BTC-USD', {ratios:{}})"), false);
    assert.equal(h.run('Object.keys(fundSourceHealth).length'), 0);
  });

  test(build + ': timeout aborts a stalled HTML body', async () => {
    const h = harness(build);
    const source = fs.readFileSync(path.join(__dirname, build), 'utf8');
    h.run(source.slice(source.indexOf('async function fetchWithTimeout('), source.indexOf('// Warm the cookie')));
    h.context.fetch = async (_url, { signal }) => ({
      ok: true, status: 200,
      text: () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
    });
    await assert.rejects(h.run("fetchWithTimeout('https://example.test', {}, 10, true)"), /aborted/);
  });
}
