# P/E and market cap fallback

Both Chrome and Firefox use the same provider chain in `background.js`.
Yahoo bulk quotes seed watchlist values first. When either headline field is
missing, the resolver tries these providers in order, stopping when both exist:

| Market | Fallback order | Coverage limits |
| --- | --- | --- |
| Indian equities | Screener.in → Yahoo Finance quotes → Stock Analysis | Stock Analysis adapter supports NSE symbols; numeric BSE codes are skipped there. |
| US equities | Finviz → Yahoo Finance quotes → Stock Analysis | Stock Analysis adapter uses US stock pages. |
| Other international equities | Yahoo Finance quotes | Additional exchange-specific adapters are still needed. |

Provider endpoints:

- Screener: `https://www.screener.in/company/{symbol}/`
- Yahoo: `https://query1.finance.yahoo.com/v7/finance/quote` (cookie and crumb required)
- Finviz: `https://finviz.com/quote.ashx?t={symbol}`
- Stock Analysis: `https://stockanalysis.com/stocks/{symbol}/` or `https://stockanalysis.com/quote/nse/{symbol}/`

The resolver fills fields independently, so one provider can supply P/E and
another market cap. Existing fields retain their priority. Failed requests and
empty responses advance to the next provider. HTML provider requests have a
six-second deadline covering headers and body. A failed provider/ticker pair is
skipped for ten minutes, without disabling that provider for other companies.
Watchlist backfill rotates batches of six to avoid starving later rows.

Previously cached values survive failed full refreshes. Missing P/E can be
legitimate for loss-making companies and remains unavailable if no source
supplies a usable value. Crypto, forex, futures and indices skip equity enrichment.
The adapters use public website endpoints; page layouts, access restrictions
and coverage can change. These are best-effort sources, not guaranteed APIs.

Run regression checks from the workspace root:

```powershell
node --test "Screener Chrome Extension/dev-tools/test-fundamentals.cjs"
```

Tests mock provider responses; they do not establish current live availability.
