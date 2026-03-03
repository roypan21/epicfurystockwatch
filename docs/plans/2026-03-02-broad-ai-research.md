# Broad AI Research Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Feed the AI real price data for ~120 stocks across 18 sectors + 24 news articles so it produces genuinely data-driven top-30 buy and top-30 avoid ranked lists instead of the same obvious geopolitical playbook.

**Architecture:** Backend fetches ~120 Yahoo Finance quotes + 3 Guardian news queries in parallel before calling Groq. Groq returns a flat ranked array of 30 buy + 30 avoid stocks (each with rank, ticker, name, sector, reason). Frontend groups by sector, auto-derives tags from rank positions, and shows a rank badge (#1–#30) on each stock row.

**Tech Stack:** Next.js 16 App Router, TypeScript, Groq (Llama 4 Maverick), Yahoo Finance v8 chart API, Guardian API

---

## Task 1: Add FULL_UNIVERSE constant and fetchBroadStocks()

**Files:**
- Modify: `app/api/recommendations/route.ts`

**Context:** The current file has a `YF_HEADERS` const and a `fetchMarket()` function that fetches 4 symbols. We're adding a broader universe and a new fetch function that reuses the same Yahoo Finance endpoint pattern.

**Step 1: Replace the existing `YF_HEADERS` line and add FULL_UNIVERSE**

In `app/api/recommendations/route.ts`, after `const YF_HEADERS = { 'User-Agent': 'Mozilla/5.0' };`, add:

```typescript
const FULL_UNIVERSE: Record<string, string[]> = {
  'Defense & Aerospace': ['LMT', 'RTX', 'NOC', 'GD', 'BA', 'LHX', 'HII', 'LDOS', 'SAIC', 'KTOS', 'AVAV'],
  'Energy / E&P':        ['XOM', 'CVX', 'COP', 'OXY', 'DVN', 'EOG', 'PXD', 'APA', 'MRO', 'SM', 'CIVI', 'OVV'],
  'Oil Services':        ['HAL', 'SLB', 'BKR', 'RIG', 'VAL'],
  'Refiners':            ['MPC', 'VLO', 'PSX', 'PBF'],
  'Gold Miners':         ['GOLD', 'NEM', 'AEM', 'KGC', 'WPM', 'AU', 'AGI'],
  'Silver & Metals':     ['PAAS', 'HL', 'FCX', 'AA'],
  'Cybersecurity':       ['PLTR', 'CRWD', 'PANW', 'FTNT', 'ZS', 'S', 'CYBR', 'NET', 'OKTA'],
  'Semiconductors':      ['NVDA', 'AMD', 'INTC', 'QCOM', 'AVGO', 'AMAT', 'LRCX'],
  'Big Tech':            ['AAPL', 'MSFT', 'META', 'AMZN', 'GOOGL', 'TSLA', 'NFLX'],
  'Airlines':            ['DAL', 'UAL', 'AAL', 'LUV', 'JBLU', 'ALK'],
  'Shipping':            ['ZIM', 'MATX', 'STNG', 'DSX'],
  'Travel & Hotels':     ['MAR', 'HLT', 'CCL', 'RCL', 'EXPE'],
  'Consumer':            ['NKE', 'SBUX', 'MCD', 'TGT', 'WMT', 'COST'],
  'Banks & Finance':     ['JPM', 'BAC', 'GS', 'MS', 'C', 'WFC'],
  'Utilities':           ['NEE', 'DUK', 'SO', 'D'],
  'Healthcare':          ['JNJ', 'UNH', 'PFE', 'MRK', 'ABT'],
  'Materials':           ['NUE', 'CLF', 'LIN', 'APD'],
  'Sector ETFs':         ['ITA', 'XLE', 'GLD', 'SLV', 'CIBR', 'IWM', 'SPY', 'QQQ', 'XOP', 'OIH', 'GDX', 'GDXJ', 'JETS', 'EEM', 'USO'],
};
```

**Step 2: Add fetchBroadStocks() function** — place it after `fetchMarket()`:

```typescript
async function fetchBroadStocks(): Promise<string> {
  const allTickers = Object.values(FULL_UNIVERSE).flat();
  const results = await Promise.allSettled(
    allTickers.map((s) =>
      fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1d&range=1d`,
        { headers: YF_HEADERS, cache: 'no-store' }
      ).then((r) => r.json())
    )
  );

  const quoteMap: Record<string, { sym: string; price: number; pct: number }> = {};
  allTickers.forEach((sym, i) => {
    const r = results[i];
    if (r.status !== 'fulfilled') return;
    const meta = r.value?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return;
    const price = meta.regularMarketPrice as number;
    const prev  = (meta.chartPreviousClose ?? meta.previousClose) as number | undefined;
    const pct   = prev ? ((price - prev) / prev) * 100 : 0;
    quoteMap[sym] = { sym, price, pct };
  });

  // Sector-by-sector table
  const sectorLines: string[] = [];
  for (const [sector, tickers] of Object.entries(FULL_UNIVERSE)) {
    const parts = tickers.map((t) => {
      const q = quoteMap[t];
      if (!q) return `${t}:N/A`;
      const sign = q.pct >= 0 ? '+' : '';
      return `${t}:$${q.price.toFixed(2)}(${sign}${q.pct.toFixed(2)}%)`;
    });
    sectorLines.push(`${sector}: ${parts.join(' | ')}`);
  }

  // Top 20 gainers and losers across all sectors
  const sorted = Object.values(quoteMap).sort((a, b) => b.pct - a.pct);
  const gainers = sorted.slice(0, 20)
    .map((q, i) => `#${i + 1} ${q.sym} ${q.pct >= 0 ? '+' : ''}${q.pct.toFixed(2)}%`)
    .join(' | ');
  const losers = sorted.slice(-20).reverse()
    .map((q, i) => `#${i + 1} ${q.sym} ${q.pct.toFixed(2)}%`)
    .join(' | ');

  return [
    '## Sector-by-Sector Stock Performance',
    sectorLines.join('\n'),
    '',
    '## Top 20 Biggest Gainers Today (all sectors)',
    gainers || 'No data',
    '',
    '## Top 20 Biggest Losers Today (all sectors)',
    losers || 'No data',
  ].join('\n');
}
```

**Step 3: Verify TypeScript compiles**

```bash
cd "C:\src\US Iran\dashboard" && npx tsc --noEmit
```

Expected: no errors (or only pre-existing errors unrelated to our change).

**Step 4: Commit**

```bash
git add app/api/recommendations/route.ts
git commit -m "feat: add 120-stock universe and fetchBroadStocks() for broad market data"
```

---

## Task 2: Expand fetchNews() to 3 parallel Guardian queries

**Files:**
- Modify: `app/api/recommendations/route.ts`

**Context:** Current `fetchNews()` makes 1 Guardian API call for `iran+us+war+conflict` and returns only article titles, ignoring `fields.trailText` (description). We expand to 3 parallel queries and include descriptions.

**Step 1: Replace the entire fetchNews() function** with:

```typescript
async function fetchNews(): Promise<string> {
  const key = process.env.GUARDIAN_API_KEY;
  if (!key) return 'No news available.';

  const queries = [
    'iran+us+war+conflict',
    'defense+stocks+military+aerospace',
    'oil+prices+energy+crude+market',
  ];

  const results = await Promise.allSettled(
    queries.map((q) =>
      fetch(
        `https://content.guardianapis.com/search?q=${q}&api-key=${key}&order-by=newest&page-size=10&show-fields=trailText`,
        { cache: 'no-store' }
      ).then((r) => r.json())
    )
  );

  const seen = new Set<string>();
  const articles: string[] = [];

  for (const r of results) {
    if (r.status === 'rejected') continue;
    const items: Array<{
      webTitle: string;
      webPublicationDate: string;
      fields?: { trailText?: string };
    }> = r.value?.response?.results ?? [];

    for (const item of items) {
      if (seen.has(item.webTitle)) continue;
      seen.add(item.webTitle);
      const ago = Math.round((Date.now() - new Date(item.webPublicationDate).getTime()) / 60000);
      const t   = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
      const desc = item.fields?.trailText
        ? ` — ${item.fields.trailText.replace(/<[^>]+>/g, '').slice(0, 150)}`
        : '';
      articles.push(`"${item.webTitle}"${desc} (${t})`);
    }
  }

  return articles.length > 0
    ? articles.slice(0, 24).map((a, i) => `${i + 1}. ${a}`).join('\n')
    : 'News unavailable.';
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd "C:\src\US Iran\dashboard" && npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add app/api/recommendations/route.ts
git commit -m "feat: expand Guardian news to 3 parallel queries with descriptions"
```

---

## Task 3: Update types, buildPrompt(), and Groq call

**Files:**
- Modify: `app/api/recommendations/route.ts`

**Context:** The response schema changes from `AICategory[]` (grouped) to `AIStock[]` (flat ranked list with sector field). The prompt changes to request exactly 30 buy + 30 avoid. `max_tokens` increases to 4096.

**Step 1: Update the interfaces at the top of the file**

Replace:
```typescript
interface AIStock    { ticker: string; name: string; reason: string; etf?: boolean }
interface AICategory { category: string; icon: string; tag: string; subtitle: string; stocks: AIStock[] }
interface AIResponse { summary: string; buy: AICategory[]; avoid: AICategory[] }
```

With:
```typescript
interface AIStock    { rank: number; ticker: string; name: string; sector: string; reason: string; etf?: boolean }
interface AIResponse { summary: string; buy: AIStock[]; avoid: AIStock[] }
```

**Step 2: Replace buildPrompt() entirely** — change signature from `(news, market)` to `(news, market, broadStocks)`:

```typescript
function buildPrompt(news: string, market: string, broadStocks: string): string {
  return `## US-Iran Conflict Market Analysis — March 2026
Operation Epic Fury launched Feb 28, 2026. US & Israel struck Iran.
Supreme Leader Khamenei reported killed. Iran retaliating. Strait of Hormuz at risk.

## Live Macro Data
${market}

${broadStocks}

## Latest News (up to 24 real-time articles)
${news}

## Task
You are a financial analyst. Using ONLY the live stock data and news above, identify:
- The 30 best stocks to BUY for the week ahead
- The 30 stocks to AVOID for the week ahead

Return ONLY a valid JSON object with this exact structure:
{
  "summary": "2-sentence overall market outlook citing specific price moves from the data above",
  "buy": [
    { "rank": 1, "ticker": "SYMBOL", "name": "Full Company Name", "sector": "Sector Name from data", "reason": "1 sentence citing specific % move or news from above", "etf": false }
  ],
  "avoid": [
    { "rank": 1, "ticker": "SYMBOL", "name": "Full Company Name", "sector": "Sector Name from data", "reason": "1 sentence citing specific % move or news from above", "etf": false }
  ]
}

STRICT RULES:
- Return ONLY the JSON object, no text before or after
- Exactly 30 items in buy[], ranked #1 (strongest conviction) to #30
- Exactly 30 items in avoid[], ranked #1 (strongest avoid signal) to #30
- Rank by conviction strength — price move AND news context both matter
- Every reason MUST cite a specific price % or news headline from the data above
- All tickers must be real, actively-traded NYSE or NASDAQ symbols
- ETFs allowed — set "etf": true for those
- Do not invent price data not shown above
- Do not include boilerplate disclaimers`;
}
```

**Step 3: Update the Promise.all call** — find the line:
```typescript
const [news, market] = await Promise.all([fetchNews(), fetchMarket()]);
const prompt = buildPrompt(news, market);
```
Replace with:
```typescript
const [news, market, broadStocks] = await Promise.all([fetchNews(), fetchMarket(), fetchBroadStocks()]);
const prompt = buildPrompt(news, market, broadStocks);
```

**Step 4: Increase max_tokens** — find `max_tokens: 2048` and change to `max_tokens: 4096`.

**Step 5: Verify TypeScript compiles**

```bash
cd "C:\src\US Iran\dashboard" && npx tsc --noEmit
```

Expected: no errors.

**Step 6: Smoke-test the API** — start dev server if not running, then:

```bash
curl -s "http://localhost:3000/api/recommendations?force=true" | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
console.log('summary:', d.summary?.slice(0,100));
console.log('buy count:', d.buy?.length);
console.log('avoid count:', d.avoid?.length);
console.log('buy[0]:', JSON.stringify(d.buy?.[0]));
"
```

Expected: `buy count: 30`, `avoid count: 30`, `buy[0]` has `rank:1`, `sector`, `reason` with price data.

**Step 7: Commit**

```bash
git add app/api/recommendations/route.ts
git commit -m "feat: update AI schema to flat ranked 30-buy/30-avoid lists with sector field"
```

---

## Task 4: Update frontend types and add groupBySector() helper

**Files:**
- Modify: `app/page.tsx`

**Context:** The current `page.tsx` has `AIStock` (no rank/sector) and `AICategory` (grouped). These need updating to match the new API response. We also add a `groupBySector()` helper and `deriveTag()` helper.

**Step 1: Update the interfaces** — find and replace:

```typescript
interface AIStock    { ticker: string; name: string; reason: string; etf?: boolean }
interface AICategory { category: string; icon: string; tag: string; subtitle: string; stocks: AIStock[] }
```

Replace with:

```typescript
interface AIStock { rank: number; ticker: string; name: string; sector: string; reason: string; etf?: boolean }
```

**Step 2: Update RecommendationsResponse** — find:
```typescript
interface RecommendationsResponse {
  summary: string;
  buy:          AICategory[];
  avoid:        AICategory[];
```
Replace with:
```typescript
interface RecommendationsResponse {
  summary: string;
  buy:   AIStock[];
  avoid: AIStock[];
```

**Step 3: Add groupBySector() and deriveTag() helpers** — add after the `timeUntil()` function:

```typescript
function groupBySector(stocks: AIStock[]): { sector: string; stocks: AIStock[] }[] {
  const map = new Map<string, AIStock[]>();
  for (const s of stocks) {
    if (!map.has(s.sector)) map.set(s.sector, []);
    map.get(s.sector)!.push(s);
  }
  return Array.from(map.entries())
    .map(([sector, stocks]) => ({ sector, stocks }))
    .sort((a, b) =>
      Math.min(...a.stocks.map((s) => s.rank)) -
      Math.min(...b.stocks.map((s) => s.rank))
    );
}

function deriveTag(
  stocks: AIStock[],
  isBuy: boolean
): { tag: string; tagType: 'green' | 'blue' | 'amber' | 'red' } {
  const best = Math.min(...stocks.map((s) => s.rank));
  if (isBuy) {
    if (best <= 10) return { tag: 'Strong Buy', tagType: 'green' };
    if (best <= 20) return { tag: 'Buy',        tagType: 'blue'  };
    return                  { tag: 'Watch',      tagType: 'blue'  };
  } else {
    if (best <= 10) return { tag: 'Avoid',   tagType: 'red'   };
    if (best <= 20) return { tag: 'Reduce',  tagType: 'amber' };
    return                  { tag: 'Caution', tagType: 'amber' };
  }
}
```

**Step 4: Verify TypeScript compiles** (will likely have errors from CategoryCard still using AICategory — that's OK, we fix in Task 5):

```bash
cd "C:\src\US Iran\dashboard" && npx tsc --noEmit 2>&1 | head -30
```

Note which errors remain — they should all be in the rendering section of page.tsx, not in the helper functions.

---

## Task 5: Add AISectorCard component and rank badge to StockRow

**Files:**
- Modify: `app/page.tsx`

**Context:** We need a new card component for AI results (shows rank badge per stock) and update `StockRow` to optionally show a rank badge. The existing `CategoryCard` stays for the fallback (`data.ts`) path.

**Step 1: Update StockRow to accept an optional rank prop**

Find the `StockRow` component. Change its props interface from:
```typescript
function StockRow({
  ticker, name, reason, etf, quote,
}: {
  ticker: string; name: string; reason: string; etf?: boolean; quote?: Quote;
}) {
```
To:
```typescript
function StockRow({
  ticker, name, reason, etf, quote, rank,
}: {
  ticker: string; name: string; reason: string; etf?: boolean; quote?: Quote; rank?: number;
}) {
```

Then inside the JSX, in the outermost `<div>`, add a rank badge before the ticker badge:
```tsx
{rank !== undefined && (
  <span className="text-[10px] font-bold text-[#9A9A9A] w-6 text-right flex-shrink-0 tabular-nums">
    #{rank}
  </span>
)}
```

Place this span BEFORE the existing ticker `<span className={...}>{ticker}</span>`.

**Step 2: Add AISectorCard component** — add it after `CategoryCard`:

```tsx
function AISectorCard({
  sector, stocks, stockMap, isBuy,
}: {
  sector: string;
  stocks: AIStock[];
  stockMap: Record<string, Quote>;
  isBuy: boolean;
}) {
  const { tag, tagType } = deriveTag(stocks, isBuy);
  const icon = isBuy
    ? (tagType === 'green' ? '📈' : tagType === 'blue' ? '👁' : '📊')
    : (tagType === 'red'   ? '📉' : tagType === 'amber' ? '⚠' : '🔻');

  return (
    <div className="bg-white border border-[#E2E2DC] rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#E2E2DC]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${ICON_BG[tagType]}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[#1E3A5F] truncate">{sector}</div>
            <div className="text-[11px] text-[#6B6B6B]">{stocks.length} stock{stocks.length !== 1 ? 's' : ''} · ranks #{Math.min(...stocks.map((s) => s.rank))}–#{Math.max(...stocks.map((s) => s.rank))}</div>
          </div>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded flex-shrink-0 ${TAG_COLORS[tagType]}`}>
          {tag}
        </span>
      </div>
      {stocks.map((s) => (
        <StockRow
          key={s.ticker}
          ticker={s.ticker}
          name={s.name}
          reason={s.reason}
          etf={s.etf}
          quote={stockMap[s.ticker]}
          rank={s.rank}
        />
      ))}
    </div>
  );
}
```

**Step 3: Verify TypeScript compiles**

```bash
cd "C:\src\US Iran\dashboard" && npx tsc --noEmit 2>&1 | head -30
```

---

## Task 6: Update main render to use AISectorCard + fix tab labels

**Files:**
- Modify: `app/page.tsx`

**Context:** The main render section currently calls `CategoryCard` for AI results. We replace that with `AISectorCard` using `groupBySector()`. The fallback path (when Groq fails) continues using `CategoryCard` with the static `data.ts` lists. Tab labels get stock counts.

**Step 1: Update the tab label buttons** — find:
```tsx
{ id: 'buy'   as const, label: '✓  Stocks to Consider', activeColor: '#1A6B3C' },
{ id: 'avoid' as const, label: '✕  Stocks to Avoid',    activeColor: '#B91C1C' },
```
Replace with:
```tsx
{ id: 'buy'   as const, label: `✓  Stocks to Consider${recommendations?.buy?.length  ? ` (${recommendations.buy.length})`  : ''}`, activeColor: '#1A6B3C' },
{ id: 'avoid' as const, label: `✕  Stocks to Avoid${recommendations?.avoid?.length ? ` (${recommendations.avoid.length})` : ''}`,    activeColor: '#B91C1C' },
```

**Step 2: Update the AI results render block** — find:
```tsx
) : (
  (tab === 'buy' ? recommendations?.buy : recommendations?.avoid)?.map((cat, i) => (
    <CategoryCard key={i} cat={cat} stockMap={stockMap} isBuy={tab === 'buy'} />
  )) ?? []
)}
```
Replace with:
```tsx
) : (
  groupBySector(tab === 'buy' ? (recommendations?.buy ?? []) : (recommendations?.avoid ?? []))
    .map(({ sector, stocks }) => (
      <AISectorCard
        key={sector}
        sector={sector}
        stocks={stocks}
        stockMap={stockMap}
        isBuy={tab === 'buy'}
      />
    ))
)}
```

**Step 3: Verify TypeScript compiles with zero errors**

```bash
cd "C:\src\US Iran\dashboard" && npx tsc --noEmit
```

Expected: clean (0 errors).

**Step 4: Full end-to-end smoke test**

Start the dev server if not running:
```bash
cd "C:\src\US Iran\dashboard" && npm run dev
```

Open browser at `http://localhost:3000`. Verify:
- [ ] Page loads, commodities show
- [ ] AI status bar shows "Groq · Llama 4 Maverick · ... Fresh"
- [ ] Tab labels show "(30)" counts
- [ ] "Stocks to Consider" tab shows sector cards with rank badges (#1, #2, etc.)
- [ ] "Stocks to Avoid" tab shows sector cards with Avoid/Reduce/Caution tags
- [ ] Stock rows show `#1 [NOC] Northrop Grumman $... +X%` format
- [ ] Click "↻ Regenerate AI" — stocks change, picks are different (data-driven)
- [ ] Fallback: if GROQ_API_KEY is missing, static watchlist still renders

**Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: display AI top-30 stocks grouped by sector with rank badges"
```

---

## Done

All changes are in two files only:
- `app/api/recommendations/route.ts` — data pipeline + AI schema
- `app/page.tsx` — UI components + render logic

The static fallback in `lib/data.ts` is untouched. The `lib/yahoo.ts` is untouched.
