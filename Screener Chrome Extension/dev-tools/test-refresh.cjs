const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const path = require('node:path');
for (const file of ['../extension-code/background.js', '../../Screener  Firefox extension/background.js']) {
 const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
 test(file + ': overlapping commits retain newer prices and independent fundamentals', async () => {
  let saved = {cachedData: {A: {ratios: {price: 100}}}};
  const context = vm.createContext({chrome:{storage:{local:{get: async () => structuredClone(saved),set:async patch => Object.assign(saved, structuredClone(patch))}}}});
  vm.runInContext(source.slice(0, source.indexOf('let fastPollInterval')), context);
  const old = structuredClone(saved);
  await context.commitRefreshState({cachedData:{A:{ratios:{price:110}}}}, structuredClone(old));
  await context.commitRefreshState({cachedData:{A:{ratios:{price:105,pe:20}}}}, structuredClone(old));
  assert.equal(saved.cachedData.A.ratios.price,110);
  assert.equal(saved.cachedData.A.ratios.pe,20);
 });
 test(file + ': currency-prefixed alert values parse', () => {
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function parsePriceNumber('), source.indexOf('function captureValuationAnchors(')),context);
  assert.equal(context.parsePriceNumber('₹1,234.50'),1234.5);
  assert.equal(context.parsePriceNumber('$409.00'),409);
 });
 test(file + ': unchanged prices still update daily movement', () => {
  const condition = source.match(/if \((currentStr !== formattedPrice[^\n]+)\) \{/)[1];
  assert.equal(vm.runInNewContext(condition,{currentStr:'₹100.00',formattedPrice:'₹100.00',cachedData:{A:{changePct:'1.00%',changeDir:'up'}},ticker:'A',pct:'0.00',diff:0}),true);
 });
}
