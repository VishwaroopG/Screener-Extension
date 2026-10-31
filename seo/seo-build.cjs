// Programmatic SEO builder: collections + glossary + learn.
// Usage: node seo/seo-build.cjs
// Reads seo/data/*.json, writes static crawlable HTML pages + rebuilds sitemap.xml.
// Adding a page = adding a JSON entry + rerunning. No hand-written HTML per page.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(__dirname, 'data');
const SITE = 'https://vishwaroopg.github.io/Screener-Extension';
const TODAY = '2026-10-11';
const CSS_V = '37';
const EXT_URL = 'https://chromewebstore.google.com/detail/screener-pro-%E2%80%93-live-watch/pfaifjhdbnpfdjieppkhciemgccbpifi?authuser=0&hl=en';

const collections = JSON.parse(fs.readFileSync(path.join(DATA, 'collections.json'), 'utf8'));
const glossary = JSON.parse(fs.readFileSync(path.join(DATA, 'glossary.json'), 'utf8'));
const learn = JSON.parse(fs.readFileSync(path.join(DATA, 'learn.json'), 'utf8'));
const posts = JSON.parse(fs.readFileSync(path.join(ROOT, 'blog', 'posts.json'), 'utf8'));
const postBySlug = Object.fromEntries(posts.map(p => [p.slug, p]));

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function paras(arr) { return (arr || []).map(p => '<p>' + p + '</p>').join('\n'); }
function bullets(arr) { return '<ul>\n' + (arr || []).map(li => '<li>' + li + '</li>').join('\n') + '\n</ul>'; }

function nav(active) {
  const link = (href, label, key) => '<a href="' + href + '"' + (key === active ? ' aria-current="page"' : '') + '>' + label + '</a>';
  return '<header class="container nav">'
    + '<a class="brand" href="../"><img class="brand-mark" src="../store-assets/icon_128.png?v=logo-transparent" alt="Ticker Screener icon"><span class="brand-text">Ticker <em>Screener</em></span></a>'
    + '<nav class="nav-links" aria-label="Primary navigation">'
    + link('../#features', 'Features')
    + link('../collections/', 'Collections', 'collections')
    + link('../glossary/', 'Glossary', 'glossary')
    + link('../learn/', 'Learn', 'learn')
    + link('../blog/', 'Blog', 'blog')
    + '</nav>'
    + '<span class="nav-meta">v2.6.10</span>'
    + '<a class="button button-secondary" href="' + EXT_URL + '">Get the extension</a>'
    + '<button class="menu-btn" id="menu-btn" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-drawer"><span></span><span></span><span></span></button>'
    + '</header>'
    + '<div class="drawer-scrim" id="drawer-scrim" hidden></div>'
    + '<nav class="mobile-drawer" id="mobile-drawer" aria-label="Mobile navigation">'
    + '<a href="../#features">Features</a><a href="../collections/">Collections</a><a href="../glossary/">Glossary</a><a href="../learn/">Learn</a><a href="../blog/">Blog</a>'
    + '<a class="button button-primary" href="' + EXT_URL + '">Get the extension</a></nav>';
}

const DRAWER_JS = '<script>(function(){var b=document.getElementById("menu-btn"),n=document.getElementById("mobile-drawer"),s=document.getElementById("drawer-scrim");if(!b||!n)return;function c(){n.classList.remove("open");if(s)s.hidden=true;b.classList.remove("open");b.setAttribute("aria-expanded","false");document.body.style.overflow="";}b.addEventListener("click",function(){var o=!n.classList.contains("open");n.classList.toggle("open",o);if(s)s.hidden=!o;b.classList.toggle("open",o);b.setAttribute("aria-expanded",String(o));document.body.style.overflow=o?"hidden":"";});n.addEventListener("click",function(e){if(e.target.closest("a"))c();});if(s)s.addEventListener("click",c);})();</script>';

function shell(o) {
  // o: {title, description, canonical, jsonld[], body, active}
  const jsonld = (o.jsonld || []).map(j => '<script type="application/ld+json">' + JSON.stringify(j) + '</script>').join('\n  ');
  return '<!doctype html>\n<html lang="en">\n<head>\n'
    + '  <meta charset="utf-8">\n'
    + '  <meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '  <meta name="description" content="' + esc(o.description) + '">\n'
    + '  <meta name="robots" content="index, follow">\n'
    + '  <link rel="canonical" href="' + o.canonical + '">\n'
    + '  <meta property="og:type" content="article">\n'
    + '  <meta property="og:site_name" content="Ticker Screener">\n'
    + '  <meta property="og:title" content="' + esc(o.title) + '">\n'
    + '  <meta property="og:description" content="' + esc(o.description) + '">\n'
    + '  <meta property="og:url" content="' + o.canonical + '">\n'
    + '  <title>' + esc(o.title) + '</title>\n'
    + '  <link rel="preconnect" href="https://fonts.googleapis.com">\n'
    + '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    + '  <link href="https://fonts.googleapis.com/css2?family=Alumni+Sans:wght@100;300;400&family=Albert+Sans:wght@400;500;600;700&family=Roboto+Mono:wght@400;500&display=swap" rel="stylesheet">\n'
    + '  <link rel="stylesheet" href="../site.css?v=' + CSS_V + '">\n'
    + '  <link rel="icon" type="image/png" sizes="16x16" href="../store-assets/icon_16.png?v=logo-transparent">\n'
    + '  <link rel="icon" type="image/png" sizes="48x48" href="../store-assets/icon_48.png?v=logo-transparent">\n'
    + '  <link rel="apple-touch-icon" href="../store-assets/icon_128.png?v=logo-transparent">\n'
    + '  ' + jsonld + '\n'
    + '</head>\n<body>\n  <div class="aurora"></div>\n  <div class="site-shell">\n'
    + nav(o.active)
    + '\n    <main>\n      <section class="container section section-tight">\n'
    + o.body
    + '\n      </section>\n    </main>\n'
    + '\n    <footer class="container footer"><span class="footer-gold" aria-hidden="true"></span><div class="footer-row"><span>\u00a9 2026 Ticker Screener. Built for focused market watching.</span><span><a href="../collections/">Collections</a> \u00b7 <a href="../glossary/">Glossary</a> \u00b7 <a href="../learn/">Learn</a> \u00b7 <a href="../blog/">Blog</a> \u00b7 <a href="../uninstall/">Feedback</a> \u00b7 <a href="https://buymeacoffee.com/vgexperiments">Support the developer</a> \u00b7 <a href="https://www.vishwaroopgalgali.com/" target="_blank" rel="noopener">About the developer</a></span></div></footer>\n'
    + '  </div>\n  ' + DRAWER_JS + '\n</body>\n</html>\n';
}

function crumbs(items) {
  // items: [{name, url?}] - rendered + BreadcrumbList
  const html = '<nav class="breadcrumb" aria-label="Breadcrumb">' + items.map((c, i) =>
    i < items.length - 1 ? '<a href="' + c.url + '">' + esc(c.name) + '</a><span aria-hidden="true"> / </span>' : '<span aria-current="page">' + esc(c.name) + '</span>'
  ).join('') + '</nav>';
  const ld = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, ...(c.url ? { item: c.url } : {}) }))
  };
  return { html, ld };
}

function extCta(title, copy) {
  return '<div class="extension-cta"><div><strong>' + title + '</strong><p>' + copy + '</p></div>'
    + '<a class="button button-primary" href="' + EXT_URL + '">Get the extension</a></div>';
}

function relLinks(heading, links) {
  if (!links || !links.length) return '';
  return '<h2>' + heading + '</h2><div class="hub-grid">' + links.map(l =>
    '<a class="hub-card" href="' + l.href + '"><h3>' + esc(l.title) + '</h3><p>' + l.desc + '</p></a>'
  ).join('') + '</div>';
}

function faqBlock(faqs) {
  if (!faqs || !faqs.length) return '';
  return '<h2>Frequently asked questions</h2>' + faqs.map(f =>
    '<h3>' + f.q + '</h3>\n<p>' + f.a + '</p>').join('\n');
}
function faqLd(url, faqs) {
  if (!faqs || !faqs.length) return null;
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(f => ({ '@type': 'Question', name: stripTags(f.q), acceptedAnswer: { '@type': 'Answer', text: stripTags(f.a) } })) };
}
function stripTags(s) { return String(s).replace(/<[^>]*>/g, ''); }

const TRACK_COPY = 'Add every stock below to a Ticker Screener watchlist and the ticker tape follows them across every site you browse, with price alerts when your levels hit.';

// ── Collections ──────────────────────────────────────────────
function collectionPage(c) {
  const url = SITE + '/collections/' + c.slug + '.html';
  const cr = crumbs([{ name: 'Home', url: SITE + '/' }, { name: 'Collections', url: SITE + '/collections/' }, { name: c.h1 }]);
  const stockRows = (c.stocks || []).map(s => '<tr><td><strong>' + esc(s.ticker) + '</strong></td><td>' + esc(s.exchange) + '</td><td>' + esc(s.company) + '</td><td>' + s.note + '</td></tr>').join('\n');
  const stockSection = (c.stocks && c.stocks.length)
    ? '\n<h2>Stocks in this collection</h2>'
      + '\n<p>Prices move every second, so instead of a stale price table, here is the membership list with <em>why each stock belongs</em>. Add them to a watchlist to see live prices, sparklines and P/E ratios.</p>'
      + '\n<div class="table-wrap"><table class="fact-table"><thead><tr><th>Ticker</th><th>Exchange</th><th>Company</th><th>Why it belongs</th></tr></thead><tbody>\n' + stockRows + '\n</tbody></table></div>'
    : '\n<h2>Stocks in this collection</h2>\n<p>' + (c.stocksNote || '') + '</p>';
  const rel = [];
  (c.relatedCollections || []).forEach(slug => {
    const t = collections.find(x => x.slug === slug);
    if (t) rel.push({ href: slug + '.html', title: t.h1, desc: esc(t.meta) });
  });
  (c.relatedGlossary || []).forEach(slug => {
    const t = glossary.find(x => x.slug === slug);
    if (t) rel.push({ href: '../glossary/' + slug + '.html', title: t.term, desc: esc(t.short) });
  });
  (c.relatedPosts || []).forEach(slug => {
    const p = postBySlug[slug];
    if (p) rel.push({ href: '../blog/post.html?slug=' + slug, title: p.title, desc: esc(p.excerpt) });
  });
  const body = cr.html
    + '\n<span class="eyebrow">Stock collection \u00b7 updated ' + c.updated + '</span>'
    + '\n<h1 class="article-title">' + c.h1 + '</h1>'
    + '\n<p class="section-copy">' + c.meta + '</p>'
    + '\n<div class="tag-row">' + (c.tags || []).map(t => '<span class="tag">' + esc(t) + '</span>').join('') + '</div>'
    + '\n<div class="article-body">'
    + '\n' + paras(c.intro)
    + stockSection
    + '\n<h2>How to screen ' + esc(c.shortName || 'these stocks') + ' yourself</h2>'
    + '\n' + bullets(c.screenWith)
    + '\n<h2>Risks to watch</h2>'
    + '\n' + bullets(c.avoid)
    + '\n' + faqBlock(c.faqs)
    + '\n<h2>Track it live</h2>'
    + '\n<p>' + TRACK_COPY + '</p>'
    + '\n' + extCta('Watch this collection live.', 'One-click import, switchable P/E / ROCE / ROE columns, Smart Focus on big moves, and background price alerts.')
    + '\n' + relLinks('Keep exploring', rel)
    + '\n<p class="disclaimer">For education only, not financial advice. Membership lists change with corporate actions and index reviews \u2014 verify tickers before investing.</p>'
    + '\n</div>';
  const ld = [cr.ld,
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: c.h1, description: stripTags(c.meta), url, dateModified: c.updated,
      mainEntity: { '@type': 'ItemList', name: c.h1, itemListElement: c.stocks.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.company + ' (' + s.ticker + ')' })) } },
    faqLd(url, c.faqs)].filter(Boolean);
  return shell({ title: c.title, description: stripTags(c.meta), canonical: url, jsonld: ld, body, active: 'collections' });
}

function collectionsHub() {
  const url = SITE + '/collections/';
  const cr = crumbs([{ name: 'Home', url: SITE + '/' }, { name: 'Collections' }]);
  const cards = collections.map(c => '<a class="hub-card" href="' + c.slug + '.html"><h3>' + esc(c.h1) + '</h3><p>' + esc(c.meta) + '</p><div class="tag-row">' + (c.tags || []).slice(0, 3).map(t => '<span class="tag">' + esc(t) + '</span>').join('') + '</div></a>').join('\n');
  const body = cr.html
    + '\n<span class="eyebrow">Stock collections</span>'
    + '\n<h1 class="article-title">Stock collections: themes, sectors and screens.</h1>'
    + '\n<p class="section-copy">Curated stock lists with screening criteria, risks and FAQs \u2014 railway, defence, penny stocks, ETFs, banks, IT, pharma, EVs and US benchmarks. Each list shows <em>why a stock belongs</em>; live prices live in your watchlist, where they update every few seconds.</p>'
    + '\n<div class="article-body">\n<div class="hub-grid">\n' + cards + '\n</div>'
    + '\n' + extCta('Watch any collection live.', 'Add the tickers to Ticker Screener and get the tape, charts, P/E verdicts and price alerts in every browser tab.')
    + '\n</div>';
  const ld = [cr.ld, { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Stock collections', description: 'Curated Indian and US stock collections with screening criteria.', url,
    mainEntity: { '@type': 'ItemList', itemListElement: collections.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.h1, url: SITE + '/collections/' + c.slug + '.html' })) } }];
  return shell({ title: 'Stock Collections: Railway, Defence, Penny Stocks, ETFs & More | Ticker Screener', description: 'Curated stock collections - railway, defence, penny stocks under Rs 10, gold ETFs, banks, IT, pharma, EVs, Magnificent 7 - with screening criteria and risks.', canonical: url, jsonld: ld, body, active: 'collections' });
}

// ── Glossary ─────────────────────────────────────────────────
function glossaryPage(g) {
  const url = SITE + '/glossary/' + g.slug + '.html';
  const cr = crumbs([{ name: 'Home', url: SITE + '/' }, { name: 'Glossary', url: SITE + '/glossary/' }, { name: g.term }]);
  const rel = (g.related || []).map(slug => {
    const t = glossary.find(x => x.slug === slug);
    return t ? { href: slug + '.html', title: t.term, desc: esc(t.short) } : null;
  }).filter(Boolean);
  (g.relatedPosts || []).forEach(slug => {
    const p = postBySlug[slug];
    if (p) rel.push({ href: '../blog/post.html?slug=' + slug, title: p.title, desc: esc(p.excerpt) });
  });
  const body = cr.html
    + '\n<span class="eyebrow">Glossary \u00b7 ' + esc(g.group) + '</span>'
    + '\n<h1 class="article-title">' + esc(g.term) + '</h1>'
    + '\n<p class="section-copy">' + g.short + '</p>'
    + '\n<div class="article-body">'
    + '\n' + paras(g.definition)
    + (g.example ? '\n<h2>Example</h2>\n<p>' + g.example + '</p>' : '')
    + (g.inExtension ? '\n<h2>In Ticker Screener</h2>\n<p>' + g.inExtension + '</p>' : '')
    + '\n' + faqBlock(g.faqs)
    + '\n' + relLinks('Related terms', rel)
    + '\n' + extCta('See it on your own stocks.', 'P/E, ROCE, ROE, P/B, dividend yield and market cap \u2014 live beside every price in your watchlist.')
    + '\n</div>';
  const ld = [cr.ld,
    { '@context': 'https://schema.org', '@type': 'DefinedTerm', name: g.term, description: stripTags(g.short), url, inDefinedTermSet: SITE + '/glossary/' },
    faqLd(url, g.faqs)].filter(Boolean);
  return shell({ title: g.term + ' Explained | Ticker Screener Glossary', description: stripTags(g.short), canonical: url, jsonld: ld, body, active: 'glossary' });
}

function glossaryHub() {
  const url = SITE + '/glossary/';
  const cr = crumbs([{ name: 'Home', url: SITE + '/' }, { name: 'Glossary' }]);
  const groups = {};
  glossary.forEach(g => { (groups[g.group] = groups[g.group] || []).push(g); });
  const sections = Object.keys(groups).sort().map(gr =>
    '<h2>' + esc(gr) + '</h2>\n<div class="hub-grid">\n' + groups[gr].map(g =>
      '<a class="hub-card" href="' + g.slug + '.html"><h3>' + esc(g.term) + '</h3><p>' + esc(g.short) + '</p></a>').join('\n') + '\n</div>').join('\n');
  const body = cr.html
    + '\n<span class="eyebrow">Investing glossary</span>'
    + '\n<h1 class="article-title">Investing terms, in plain language.</h1>'
    + '\n<p class="section-copy">Every ratio, indicator and market term the extension shows \u2014 explained in under a minute each, with an example and where to see it live.</p>'
    + '\n<div class="article-body">\n' + sections + '\n</div>';
  const ld = [cr.ld, { '@context': 'https://schema.org', '@type': 'DefinedTermSet', name: 'Ticker Screener investing glossary', url }];
  return shell({ title: 'Investing Glossary: P/E, ROCE, Market Cap & More | Ticker Screener', description: 'Plain-language definitions of investing ratios and market terms - P/E, ROCE, ROE, market cap, FII, circuit breakers, Fear & Greed and more.', canonical: url, jsonld: ld, body, active: 'glossary' });
}

// ── Learn ────────────────────────────────────────────────────
function lessonPage(l) {
  const url = SITE + '/learn/' + l.slug + '.html';
  const track = learn.tracks.find(t => t.id === l.track);
  const cr = crumbs([{ name: 'Home', url: SITE + '/' }, { name: 'Learn', url: SITE + '/learn/' }, { name: l.title }]);
  const rel = [];
  (l.relatedGlossary || []).forEach(slug => {
    const t = glossary.find(x => x.slug === slug);
    if (t) rel.push({ href: '../glossary/' + slug + '.html', title: t.term, desc: esc(t.short) });
  });
  (l.relatedCollections || []).forEach(slug => {
    const t = collections.find(x => x.slug === slug);
    if (t) rel.push({ href: '../collections/' + slug + '.html', title: t.h1, desc: esc(t.meta) });
  });
  (l.relatedPosts || []).forEach(slug => {
    const p = postBySlug[slug];
    if (p) rel.push({ href: '../blog/post.html?slug=' + slug, title: p.title, desc: esc(p.excerpt) });
  });
  const sibs = learn.lessons.filter(x => x.track === l.track && x.slug !== l.slug)
    .map(x => ({ href: x.slug + '.html', title: x.title, desc: esc(x.meta) }));
  const body = cr.html
    + '\n<span class="eyebrow">' + esc(track.title) + ' \u00b7 ' + l.minutes + ' min lesson \u00b7 ' + esc(l.level) + '</span>'
    + '\n<h1 class="article-title">' + esc(l.title) + '</h1>'
    + '\n<p class="section-copy">' + l.meta + '</p>'
    + '\n<div class="article-body">'
    + '\n' + paras(l.body)
    + '\n' + faqBlock(l.faqs)
    + '\n' + extCta('Practice on live markets.', 'Apply this lesson inside Ticker Screener \u2014 real prices, real ratios, zero brokerage login needed.')
    + '\n' + relLinks('Next in this track', sibs)
    + '\n' + relLinks('Go deeper', rel)
    + '\n</div>';
  const ld = [cr.ld,
    { '@context': 'https://schema.org', '@type': 'LearningResource', name: l.title, description: stripTags(l.meta), url, teaches: track.title, timeRequired: 'PT' + l.minutes + 'M', author: { '@type': 'Organization', name: 'Ticker Screener' } },
    faqLd(url, l.faqs)].filter(Boolean);
  return shell({ title: l.title + ' | Ticker Screener Learn', description: stripTags(l.meta), canonical: url, jsonld: ld, body, active: 'learn' });
}

function learnHub() {
  const url = SITE + '/learn/';
  const cr = crumbs([{ name: 'Home', url: SITE + '/' }, { name: 'Learn' }]);
  const sections = learn.tracks.map(t => {
    const ls = learn.lessons.filter(l => l.track === t.id);
    return '<h2>' + esc(t.title) + '</h2>\n<p>' + t.desc + '</p>\n<div class="hub-grid">\n'
      + ls.map(l => '<a class="hub-card" href="' + l.slug + '.html"><h3>' + esc(l.title) + '</h3><p>' + esc(l.meta) + '</p><div class="tag-row"><span class="tag">' + l.minutes + ' min</span><span class="tag">' + esc(l.level) + '</span></div></a>').join('\n')
      + '\n</div>';
  }).join('\n');
  const body = cr.html
    + '\n<span class="eyebrow">Learn investing</span>'
    + '\n<h1 class="article-title">Learn investing, one short lesson at a time.</h1>'
    + '\n<p class="section-copy">' + learn.tracks.length + ' tracks, ' + learn.lessons.length + ' lessons, zero jargon. Each lesson takes under ten minutes and ends with something you can do immediately in your watchlist.</p>'
    + '\n<div class="article-body">\n' + sections
    + '\n' + extCta('Learn with live data.', 'Every lesson pairs with the free extension \u2014 see each concept on your own stocks as you read.')
    + '\n</div>';
  const ld = [cr.ld, { '@context': 'https://schema.org', '@type': 'LearningResource', name: 'Ticker Screener Learn', description: 'Short investing lessons: reading quotes, screening stocks, ratios, ETFs.', url,
    mainEntity: { '@type': 'ItemList', itemListElement: learn.lessons.map((l, i) => ({ '@type': 'ListItem', position: i + 1, name: l.title, url: SITE + '/learn/' + l.slug + '.html' })) } }];
  return shell({ title: 'Learn Investing: Short Lessons for Beginners | Ticker Screener', description: 'Free bite-size investing lessons - read stock quotes, compare stocks, screen like a pro, ETFs vs stocks - each under 10 minutes.', canonical: url, jsonld: ld, body, active: 'learn' });
}

// ── Write + sitemap ──────────────────────────────────────────
function write(rel, content) {
  const full = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  return rel;
}
const made = [];
made.push(write('collections/index.html', collectionsHub()));
collections.forEach(c => made.push(write('collections/' + c.slug + '.html', collectionPage(c))));
made.push(write('glossary/index.html', glossaryHub()));
glossary.forEach(g => made.push(write('glossary/' + g.slug + '.html', glossaryPage(g))));
made.push(write('learn/index.html', learnHub()));
learn.lessons.forEach(l => made.push(write('learn/' + l.slug + '.html', lessonPage(l))));

function urlEntry(loc, lastmod, freq, pri) {
  return '  <url>\n    <loc>' + loc + '</loc>\n    <lastmod>' + lastmod + '</lastmod>\n    <changefreq>' + freq + '</changefreq>\n    <priority>' + pri + '</priority>\n  </url>';
}
const sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
sm.push(urlEntry(SITE + '/', '2026-10-11', 'weekly', '1.0'));
sm.push(urlEntry(SITE + '/privacy.html', '2026-10-06', 'monthly', '0.5'));
sm.push(urlEntry(SITE + '/blog/', '2026-10-11', 'weekly', '0.9'));
posts.forEach(p => sm.push(urlEntry(SITE + '/blog/post.html?slug=' + p.slug, p.date, 'monthly', '0.8')));
sm.push(urlEntry(SITE + '/collections/', TODAY, 'weekly', '0.9'));
collections.forEach(c => sm.push(urlEntry(SITE + '/collections/' + c.slug + '.html', c.updated, 'monthly', '0.8')));
sm.push(urlEntry(SITE + '/glossary/', TODAY, 'weekly', '0.9'));
glossary.forEach(g => sm.push(urlEntry(SITE + '/glossary/' + g.slug + '.html', TODAY, 'monthly', '0.7')));
sm.push(urlEntry(SITE + '/learn/', TODAY, 'weekly', '0.9'));
learn.lessons.forEach(l => sm.push(urlEntry(SITE + '/learn/' + l.slug + '.html', TODAY, 'monthly', '0.8')));
sm.push('</urlset>');
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sm.join('\n') + '\n', 'utf8');

console.log('Wrote ' + made.length + ' pages (' + collections.length + ' collections, ' + glossary.length + ' glossary, ' + learn.lessons.length + ' lessons + 3 hubs) + sitemap.xml');
