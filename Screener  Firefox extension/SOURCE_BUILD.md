# Building the submitted package from source

The package on addons.mozilla.org is these files, minified. No bundler, transpiler or
generated code is involved: minification only strips whitespace/comments and shortens
local names.

Requirements: Node.js 18+ (tested with 24), PowerShell 7 (`pwsh`), terser 5.51.2.

```bash
npm install --prefix /tmp/tools terser@5.51.2
NODE_PATH=/tmp/tools/node_modules pwsh -File "dev-tools/build-firefox.ps1"
```

Output: `Screener-Extension-Firefox-v<version>.zip` in this folder.

The minifier is `dev-tools/minify-package.cjs` (a copy of
`Screener Chrome Extension/dev-tools/minify-package.cjs`, included in the source archive).
It runs terser on the `.js` files and simple whitespace/comment removal on `.css`, `.html`
and `_locales/*/messages.json`.
