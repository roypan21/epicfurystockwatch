# Broad AI Research — Design Doc
**Date:** 2026-03-02
**Status:** Approved

## Problem
The AI stock picks feel like a predetermined list because the AI only receives:
- 8 Guardian news headlines (title + timestamp, description stripped)
- 4 macro prices (Brent, WTI, Gold, S&P Futures)

With no individual stock price data, it defaults to the obvious geopolitical playbook (LMT, RTX, XOM, GOLD) every time.

## Goal
Feed the AI real price-move data for ~150 stocks across the full market so it produces data-driven top-30 buy and top-30 avoid lists that vary daily based on actual market moves.

## Design

### Section 1 — Data pipeline (backend)

**`fetchBroadStocks()` — new function**
- Fetches ~150 tickers via Yahoo Finance `v8/finance/chart` using `Promise.allSettled`
- Covers 14 sectors: Defense, Energy/E&P, Oil Services, Refiners, Gold Miners, Silver/Metals, Cybersecurity, Semiconductors, Big Tech, Airlines, Shipping, Travel/Consumer, Banks/Financials, Utilities/Healthcare, ETFs
- Output formatted in 3 parts:
  1. Sector-by-sector table: `Defense: LMT $450 (+3.2%) | RTX $98 (+2.8%) | ...`
  2. Top-20 gainers: `#1 NOC +8.2% | #2 KTOS +7.1% | ...`
  3. Top-20 losers: `#1 ZIM -6.1% | #2 CCL -5.8% | ...`

**`fetchNews()` — expanded**
- 3 parallel Guardian queries instead of 1:
  - `iran+us+war+conflict` (geopolitical)
  - `defense+stocks+military` (market reaction)
  - `oil+prices+energy+market` (commodity angle)
- Deduplicate by title, return up to 24 articles with descriptions (trail text)

**`buildPrompt()` — merged**
- All three data sources: macro market, broad stock performance, expanded news
- Promise.all([fetchNews(), fetchMarket(), fetchBroadStocks()])

### Section 2 — Output schema

Replace category arrays with flat ranked lists:

```json
{
  "summary": "2-sentence market outlook",
  "buy": [
    { "rank": 1, "ticker": "NOC", "name": "Northrop Grumman", "sector": "Defense", "reason": "Up 8.2% today...", "etf": false },
    ...30 items
  ],
  "avoid": [
    { "rank": 1, "ticker": "ZIM", "name": "ZIM Shipping", "sector": "Shipping", "reason": "Down 6.1%...", "etf": false },
    ...30 items
  ]
}
```

- Every reason must cite a specific price move or news headline from the provided data
- `max_tokens` raised from 2048 → 4096
- `temperature` stays 0.2

### Section 3 — UI changes (`page.tsx`)

**`groupBySector()`** — groups flat ranked array into `Map<sector, AIStock[]>`, ordered by each sector's best rank.

**`StockRow`** — adds rank badge on the left: `[#1] [NOC] Northrop Grumman $450.20 +8.2%`

**`CategoryCard`** — tag auto-derived from average rank within sector:
- Buy ranks 1–10 → `STRONG BUY`, 11–20 → `BUY`, 21–30 → `WATCH`
- Avoid ranks 1–10 → `AVOID`, 11–20 → `REDUCE`, 21–30 → `CAUTION`

**Tab labels** — updated to show count: `✓ Stocks to Consider (30)` and `✕ Stocks to Avoid (30)`

**Fallback** — static `data.ts` list unchanged.

## Files Changed
- `dashboard/app/api/recommendations/route.ts` — all backend changes
- `dashboard/app/page.tsx` — UI changes
- `dashboard/lib/data.ts` — no change (fallback only)
- `dashboard/lib/yahoo.ts` — no change (reuse existing fetchQuotes pattern)
