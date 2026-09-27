// Minifies every staged file in place before building extension packages:
// 1. All _locales/*/messages.json
// 2. All JavaScript files via Terser (toplevel preserved for safety)
// 3. All CSS files
// 4. All HTML files
// Usage: node minify-package.cjs <stage-dir>

const fs = require('fs');
const path = require('path');

const stage = process.argv[2];
if (!stage || !fs.existsSync(stage)) {
  console.error('Invalid stage dir:', stage);
  process.exit(1);
}

// Resolve terser
let terser;
try {
  terser = require('terser');
} catch (e) {
  try {
    terser = require(path.resolve(__dirname, 'node_modules/terser'));
  } catch (e2) {
    try {
      terser = require(path.resolve(__dirname, '../../Screener Chrome Extension/dev-tools/node_modules/terser'));
    } catch (e3) {
      console.warn('Terser not found, skipping JS minification');
    }
  }
}

function minifyCSS(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([\{\}\:\;\,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

function minifyHTML(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/^\s+|\s+$/gm, '')
    .trim();
}

async function run() {
  let beforeTotal = 0;
  let afterTotal = 0;

  // 1. Locales
  const localesDir = path.join(stage, '_locales');
  if (fs.existsSync(localesDir)) {
    for (const loc of fs.readdirSync(localesDir)) {
      const f = path.join(localesDir, loc, 'messages.json');
      if (fs.existsSync(f)) {
        const raw = fs.readFileSync(f, 'utf8');
        beforeTotal += raw.length;
        const min = JSON.stringify(JSON.parse(raw));
        afterTotal += min.length;
        fs.writeFileSync(f, min, 'utf8');
      }
    }
  }

  // 2. Staged root files
  const files = fs.readdirSync(stage);
  for (const file of files) {
    const full = path.join(stage, file);
    if (!fs.statSync(full).isFile()) continue;

    if (file.endsWith('.js') && terser) {
      const src = fs.readFileSync(full, 'utf8');
      beforeTotal += src.length;
      try {
        const res = await terser.minify(src, {
          compress: { drop_console: false, passes: 2 },
          mangle: { toplevel: false },
          format: { comments: false }
        });
        if (res.code) {
          afterTotal += res.code.length;
          fs.writeFileSync(full, res.code, 'utf8');
        } else {
          afterTotal += src.length;
        }
      } catch (err) {
        console.error('Failed to minify JS:', file, err);
        afterTotal += src.length;
      }
    } else if (file.endsWith('.css')) {
      const src = fs.readFileSync(full, 'utf8');
      beforeTotal += src.length;
      const min = minifyCSS(src);
      afterTotal += min.length;
      fs.writeFileSync(full, min, 'utf8');
    } else if (file.endsWith('.html')) {
      const src = fs.readFileSync(full, 'utf8');
      beforeTotal += src.length;
      const min = minifyHTML(src);
      afterTotal += min.length;
      fs.writeFileSync(full, min, 'utf8');
    }
  }

  console.log(`Minified package in ${stage}: ${(beforeTotal/1024).toFixed(1)} KB -> ${(afterTotal/1024).toFixed(1)} KB (saved ${((1 - afterTotal/beforeTotal)*100).toFixed(1)}%)`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
