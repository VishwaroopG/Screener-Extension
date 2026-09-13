// Minifies every staged _locales/*/messages.json in place (UTF-8 preserved).
// Usage: node minify-locales.cjs <stage-dir>
const fs = require('fs');
const path = require('path');
const stage = process.argv[2];
const localesDir = path.join(stage, '_locales');
for (const loc of fs.readdirSync(localesDir)) {
  const f = path.join(localesDir, loc, 'messages.json');
  if (!fs.existsSync(f)) throw new Error('Missing messages.json in staged locale: ' + loc);
  fs.writeFileSync(f, JSON.stringify(JSON.parse(fs.readFileSync(f, 'utf8'))));
}
console.log('Minified locales in ' + stage);
