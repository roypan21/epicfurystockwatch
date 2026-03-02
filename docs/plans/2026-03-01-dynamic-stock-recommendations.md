# Dynamic AI Stock Recommendations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the static hardcoded buy/avoid stock lists with fully AI-generated recommendations from Groq Llama 4 Maverick, driven by live Guardian news and Yahoo Finance market data.

**Architecture:** A new `/api/recommendations` route fetches live news + commodity prices, sends them to Groq, and returns structured JSON stock categories. The client fetches recommendations on load, every 15 minutes, or immediately on manual refresh (`?force=true` bypasses server cache). Live stock prices are fetched dynamically for whatever tickers the AI picks.

**Tech Stack:** Next.js 16 App Router, Groq API (Llama 4 Maverick), Guardian API, Yahoo Finance v8, TypeScript, Tailwind CSS

---

### Task 1: Create `/api/recommendations/route.ts`

**Files:**
- Create: `app/api/recommendations/route.ts`

**Step 1: Write the route with server-side cache + force bypass**

```typescript
// app/api/recommendations/route.ts
import { NextResponse } from 'next/server';

export const dynamic  = 'force-dynamic';
export const revalidate = 0;

const CACHE_MS  = 15 * 60 * 1000; // 15 minutes
const GROQ_URL  = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'meta-llama/llama-4-maverick-17b-128e-instruct';
const YF_HEADERS = { 'User-Agent': 'Mozilla/5.0' };

interface AIStock { ticker: string; name: string; reason: string; etf?: boolean }
interface AICategory { category: string; icon: string; tag: string; subtitle: string; stocks: AIStock[] }
interface AIResponse { summary: string; buy: AICategory[]; avoid: AICategory[] }
interface Cache { data: AIResponse; fetchedAt: number }

let cache: Cache | null = null;

async function fetchNews(): Promise<string> {
  const key = process.env.GUARDIAN_API_KEY;
  if (!key) return 'No news available.';
  try {
    const res  = await fetch(
      `https://content.guardianapis.com/search?q=iran+us+war+conflict&api-key=${key}&order-by=newest&page-size=8&show-fields=trailText`,
      { cache: 'no-store' }
    );
    const json = await res.json();
    return (json.response?.results ?? [])
      .map((r: { webTitle: string; webPublicationDate: string }, i: number) => {
        const ago = Math.round((Date.now() - new Date(r.webPublicationDate).getTime()) / 60000);
        const t   = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
        return `${i + 1}. "${r.webTitle}" (${t})`;
      })
      .join('\n');
  } catch { return 'News unavailable.'; }
}

async function fetchMarket(): Promise<string> {
  const symbols = ['BZ=F', 'CL=F', 'GC=F', 'ES=F'];
  const labels  = ['Brent Crude', 'WTI Crude', 'Gold', 'S&P 500 Futures'];
  const results = await Promise.allSettled(
    symbols.map((s) =>
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1d&range=1d`,
        { headers: YF_HEADERS, cache: 'no-store' }).then((r) => r.json())
    )
  );
  return results
    .map((r, i) => {
      if (r.status === 'rejected') return `${labels[i]}: N/A`;
      const meta = r.value?.chart?.result?.[0]?.meta;
      if (!meta) return `${labels[i]}: N/A`;
      const price = meta.regularMarketPrice;
      const prev  = meta.chartPreviousClose ?? meta.previousClose;
      const pct   = prev ? (((price - prev) / prev) * 100).toFixed(2) : '0.00';
      const unit  = symbols[i] === 'GC=F' ? '$/oz' : symbols[i] === 'ES=F' ? 'pts' : '$/bbl';
      return `${labels[i]}: ${price} ${unit} (${Number(pct) >= 0 ? '+' : ''}${pct}% today)`;
    })
    .join('\n');
}

function buildPrompt(news: string, market: string): string {
  return `## US-Iran Conflict Market Brief — March 2026
Operation Epic Fury launched Feb 28, 2026. US & Israel struck Iran.
Supreme Leader Khamenei reported killed. Iran retaliating. Strait of Hormuz at risk.

## Live Market Data
${market}

## Latest News (real-time)
${news}

## Task
Based ONLY on the above news and market data, generate stock recommendations for the week ahead.

Return ONLY a valid JSON object with this exact structure:
{
  "summary": "2-sentence overall market outlook for this week",
  "buy": [
    {
      "category": "Category Name (e.g. Defense & Aerospace)",
      "icon": "single relevant emoji",
      "tag": "Strong Buy | Buy | Safe Haven | Watch",
      "subtitle": "one line: why this category benefits",
      "stocks": [
        { "ticker": "NYSE/NASDAQ symbol", "name": "Full Company Name", "reason": "1 sentence citing specific news/price above", "etf": false }
      ]
    }
  ],
  "avoid": [
    {
      "category": "Category Name",
      "icon": "single relevant emoji",
      "tag": "Avoid | Reduce | Caution",
      "subtitle": "one line: why this category is at risk",
      "stocks": [
        { "ticker": "NYSE/NASDAQ symbol", "name": "Full Company Name", "reason": "1 sentence citing specific news/price above", "etf": false }
      ]
    }
  ]
}

STRICT RULES:
- Return ONLY the JSON object, no text before or after
- 3-4 buy categories, each with 3-5 stocks
- 3-4 avoid categories, each with 3-5 stocks
- All tickers must be real, actively-traded NYSE or NASDAQ symbols
- ETFs are allowed — set "etf": true for those
- Base every recommendation on the specific news/market data above
- Do not include boilerplate disclaimers`;
}

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get('force') === 'true';
  const now   = Date.now();

  // Serve cache unless forced or expired
  if (!force && cache && now - cache.fetchedAt < CACHE_MS) {
    return NextResponse.json({ ...cache.data, fromCache: true, fetchedAt: cache.fetchedAt, nextUpdate: cache.fetchedAt + CACHE_MS });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 });
  }

  const [news, market] = await Promise.all([fetchNews(), fetchMarket()]);
  const prompt = buildPrompt(news, market);

  const t0  = Date.now();
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: 'You are a financial analyst AI. Return ONLY valid JSON. No markdown, no explanation, no code blocks.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const err = await res.text();
    // Return stale cache on Groq failure rather than empty
    if (cache) return NextResponse.json({ ...cache.data, fromCache: true, stale: true, fetchedAt: cache.fetchedAt, nextUpdate: cache.fetchedAt + CACHE_MS });
    return NextResponse.json({ error: `Groq error: ${res.status} ${err}` }, { status: 502 });
  }

  const json      = await res.json();
  const raw       = json.choices?.[0]?.message?.content ?? '{}';
  const latencyMs = Date.now() - t0;

  let data: AIResponse;
  try {
    data = JSON.parse(raw);
  } catch {
    if (cache) return NextResponse.json({ ...cache.data, fromCache: true, stale: true, fetchedAt: cache.fetchedAt, nextUpdate: cache.fetchedAt + CACHE_MS });
    return NextResponse.json({ error: 'Failed to parse Groq JSON response' }, { status: 500 });
  }

  cache = { data, fetchedAt: now };

  return NextResponse.json({
    ...data,
    fromCache:   false,
    fetchedAt:   now,
    nextUpdate:  now + CACHE_MS,
    latencyMs,
    model:       GROQ_MODEL,
    tokensUsed:  json.usage?.total_tokens ?? null,
  });
}
```

**Step 2: Test the endpoint manually**

```bash
curl -s http://localhost:3000/api/recommendations | python -c "
import sys, json
d = json.load(sys.stdin)
print('Summary:', d.get('summary','')[:100])
print('Buy categories:', [c['category'] for c in d.get('buy',[])])
print('Avoid categories:', [c['category'] for c in d.get('avoid',[])])
print('Latency:', d.get('latencyMs'), 'ms')
"
```

Expected: JSON with 3-4 buy categories, 3-4 avoid, ~2-4s latency

**Step 3: Test force refresh bypasses cache**

```bash
curl -s "http://localhost:3000/api/recommendations?force=true" | python -c "import sys,json; d=json.load(sys.stdin); print('fromCache:', d.get('fromCache'))"
```

Expected: `fromCache: False`

**Step 4: Commit**

```bash
git add app/api/recommendations/route.ts
git commit -m "feat: add /api/recommendations with Groq AI + 15-min cache"
```

---

### Task 2: Update `/api/stocks/route.ts` to accept dynamic tickers

**Files:**
- Modify: `app/api/stocks/route.ts`

**Step 1: Replace hardcoded ticker list with dynamic query param**

```typescript
// app/api/stocks/route.ts
import { NextResponse } from 'next/server';
import { fetchQuotes } from '@/lib/yahoo';

export const dynamic  = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get('symbols') ?? '';
  const tickers = symbolsParam
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 40); // safety cap

  if (tickers.length === 0) {
    return NextResponse.json([]);
  }

  const quotes = await fetchQuotes(tickers);
  return NextResponse.json(quotes);
}
```

**Step 2: Test with dynamic symbols**

```bash
curl -s "http://localhost:3000/api/stocks?symbols=LMT,RTX,DAL,NVDA" | python -c "
import sys, json
for q in json.load(sys.stdin):
    print(f\"{q['symbol']}: \${q['price']} ({q['changePercent']:.2f}%)\")
"
```

Expected: 4 quotes with live prices

**Step 3: Commit**

```bash
git add app/api/stocks/route.ts
git commit -m "feat: make /api/stocks accept dynamic ?symbols= query param"
```

---

### Task 3: Update `app/page.tsx` — types, state, fetch logic

**Files:**
- Modify: `app/page.tsx`

**Step 1: Add new types near the top (after `NewsResponse` interface)**

```typescript
interface AIStock    { ticker: string; name: string; reason: string; etf?: boolean }
interface AICategory { category: string; icon: string; tag: string; subtitle: string; stocks: AIStock[] }

interface RecommendationsResponse {
  summary: string;
  buy:          AICategory[];
  avoid:        AICategory[];
  fromCache:    boolean;
  fetchedAt:    number;
  nextUpdate:   number;
  latencyMs:    number;
  model:        string;
  tokensUsed:   number | null;
  stale?:       boolean;
  error?:       string;
}
```

**Step 2: Add state variables inside `Dashboard` component (after existing state)**

```typescript
const [recommendations, setRecommendations] = useState<RecommendationsResponse | null>(null);
const [recsLoading, setRecsLoading]         = useState(true);
```

**Step 3: Add `fetchRecommendations` function (after `fetchAnalysis`)**

```typescript
const fetchRecommendations = useCallback(async (force = false) => {
  setRecsLoading(true);
  try {
    const url = force ? '/api/recommendations?force=true' : '/api/recommendations';
    const res  = await fetch(url);
    const data = await res.json();
    setRecommendations(data);

    // Fetch live prices for all AI-picked tickers
    const allTickers = [
      ...(data.buy  ?? []).flatMap((c: AICategory) => c.stocks.map((s: AIStock) => s.ticker)),
      ...(data.avoid ?? []).flatMap((c: AICategory) => c.stocks.map((s: AIStock) => s.ticker)),
    ];
    const unique = [...new Set(allTickers)];
    if (unique.length > 0) {
      const sq = await fetch(`/api/stocks?symbols=${unique.join(',')}`);
      const quotes: Quote[] = await sq.json();
      setStocks(quotes);
    }
  } finally {
    setRecsLoading(false);
  }
}, []);
```

**Step 4: Replace the existing stocks `useEffect` to also trigger `fetchRecommendations`**

Find the existing `useEffect` that calls `fetchAll` and add the recommendation fetch + 15-min poll:

```typescript
useEffect(() => {
  fetchAll();
  fetchRecommendations();                                   // initial load
  const poll      = setInterval(fetchAll, 5 * 60 * 1000);  // prices every 5 min
  const recsPoll  = setInterval(() => fetchRecommendations(false), 15 * 60 * 1000); // AI recs every 15 min
  const clock     = setInterval(() => setTick((t) => t + 1), 30_000);
  return () => { clearInterval(poll); clearInterval(recsPoll); clearInterval(clock); };
}, [fetchAll, fetchRecommendations]);
```

**Step 5: Remove the separate tab-change analysis useEffect (now redundant)**

Delete this block entirely:
```typescript
// DELETE THIS:
useEffect(() => {
  if (!loading && stocks.length > 0) {
    fetchAnalysis(tab, stocks, news);
  }
}, [tab, loading]);
```

**Step 6: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add recommendations state, fetchRecommendations, 15-min poll"
```

---

### Task 4: Update `app/page.tsx` — replace static category cards with AI-generated ones

**Files:**
- Modify: `app/page.tsx`

**Step 1: Add a `tagType` helper function (above `CategoryCard`)**

The AI returns `tag` strings like "Strong Buy", "Avoid" — map these to the colour system:

```typescript
function tagType(tag: string, isBuy: boolean): 'green' | 'blue' | 'amber' | 'red' {
  const t = tag.toLowerCase();
  if (t.includes('strong')) return 'green';
  if (t.includes('avoid'))  return 'red';
  if (t.includes('safe') || t.includes('haven') || t.includes('caution')) return 'amber';
  return isBuy ? 'blue' : 'red';
}
```

**Step 2: Update `CategoryCard` to accept `AICategory` shape**

Replace the existing `CategoryCard` props type:

```typescript
// REPLACE existing CategoryCard signature:
function CategoryCard({
  cat, stockMap, isBuy,
}: {
  cat: AICategory | StockCategory;
  stockMap: Record<string, Quote>;
  isBuy: boolean;
}) {
  // normalise both shapes to one interface
  const title    = 'title' in cat ? cat.title : cat.category;
  const subtitle = cat.subtitle;
  const icon     = cat.icon;
  const tag      = cat.tag;
  const stocks   = cat.stocks.map((s) => ({
    ticker: 'ticker' in s ? s.ticker : s.ticker,
    name:   s.name,
    reason: s.reason,
    etf:    s.etf,
  }));
  const type = tagType(tag, isBuy);
  // ... rest of render unchanged, using title/subtitle/icon/tag/stocks/type
```

**Step 3: Replace the stock grid render section**

Find the grid that renders `categories.map(...)` and replace:

```tsx
{/* Stock grid */}
<div className="grid md:grid-cols-2 gap-4">
  {recsLoading ? (
    // skeleton cards while AI thinks
    [0,1,2,3].map((i) => (
      <div key={i} className="bg-white border border-[#E2E2DC] rounded-xl p-4 shadow-sm animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-1/2 mb-3" />
        <div className="space-y-2">
          {[0,1,2].map((j) => <div key={j} className="h-3 bg-gray-100 rounded w-full" />)}
        </div>
      </div>
    ))
  ) : recommendations?.error ? (
    // Fallback to static data if AI fails
    <>
      <div className="col-span-2 bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-4 py-3 text-[12px] text-[#B91C1C] mb-2">
        ⚠ AI recommendations unavailable — showing default watchlist. {recommendations.error}
      </div>
      {(tab === 'buy' ? buyCategories : avoidCategories).map((cat, i) => (
        <CategoryCard key={i} cat={cat} stockMap={stockMap} isBuy={tab === 'buy'} />
      ))}
    </>
  ) : (
    (tab === 'buy' ? recommendations?.buy : recommendations?.avoid)?.map((cat, i) => (
      <CategoryCard key={i} cat={cat} stockMap={stockMap} isBuy={tab === 'buy'} />
    )) ?? []
  )}
</div>
```

**Step 4: Add AI status bar above the tab bar**

Just above the tab `<div className="flex gap-0 border-b...">`:

```tsx
{/* AI recommendations status bar */}
{recommendations && !recsLoading && (
  <div className="flex items-center justify-between gap-3 mb-4 px-1">
    <div className="flex items-center gap-2 text-[11px] text-[#6B6B6B]">
      <span className="text-base">🤖</span>
      <span>
        AI-generated · {recommendations.model?.split('/').pop()}
        {recommendations.latencyMs && <> · {recommendations.latencyMs}ms</>}
        {recommendations.fetchedAt && <> · Updated {timeAgo(recommendations.fetchedAt)}</>}
        {recommendations.fromCache && <span className="ml-1 text-[#2C6FAC] bg-[#EBF3FB] px-1.5 py-0.5 rounded">cached</span>}
        {recommendations.stale    && <span className="ml-1 text-[#92400E] bg-[#FDE68A] px-1.5 py-0.5 rounded">stale</span>}
      </span>
    </div>
    <button
      onClick={() => fetchRecommendations(true)}
      disabled={recsLoading}
      className="text-[11px] font-medium text-[#2C6FAC] bg-[#EBF3FB] border border-[#C8DDEF] px-2.5 py-1 rounded-lg hover:bg-[#DBEEFB] transition-colors"
    >
      ↻ Regenerate AI
    </button>
  </div>
)}
```

**Step 5: Update the AI summary banner in the header**

Below the header paragraph, show the AI summary if available:

```tsx
{recommendations?.summary && !recsLoading && (
  <div className="mt-4 bg-[#EBF3FB] border-l-[3px] border-[#2C6FAC] rounded-r-lg px-4 py-3 text-[13px] text-[#1E3A5F] leading-relaxed max-w-3xl">
    🤖 <strong className="font-semibold">AI Market Outlook:</strong> {recommendations.summary}
  </div>
)}
```

**Step 6: Remove the old `AnalysisPanel` from the render and its state/fetch**

- Delete the `<AnalysisPanel ... />` JSX block and the `<div className="mt-6">` wrapper
- Delete `analysis`, `analysisLoading`, `analysisTabRef` state
- Delete `fetchAnalysis` function entirely
- Delete the `AnalysisPanel` and `RenderMarkdown` component definitions

**Step 7: Commit**

```bash
git add app/page.tsx
git commit -m "feat: render AI-generated stock categories with live prices + status bar"
```

---

### Task 5: Final cleanup and push

**Files:**
- Modify: `lib/data.ts` — mark static data as fallback only (add comment)
- Modify: `RAILWAY_DEPLOY.md` — no env var changes needed (GROQ_API_KEY already documented)

**Step 1: Add fallback comment to `lib/data.ts`**

At the top of the file add:
```typescript
// Static fallback data — used only when /api/recommendations (Groq AI) fails.
// Normal operation: stock lists are fully AI-generated from live news + market data.
```

**Step 2: Verify everything works end-to-end**

```bash
# 1. Recommendations load with AI data
curl -s http://localhost:3000/api/recommendations | python -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('buy',[])), 'buy categories,', len(d.get('avoid',[])), 'avoid categories')"

# 2. Stocks fetch for AI-picked tickers
curl -s "http://localhost:3000/api/stocks?symbols=LMT,DAL,NVDA" | python -c "import sys,json; [print(q['symbol'], q['price']) for q in json.load(sys.stdin)]"

# 3. Force refresh works
curl -s "http://localhost:3000/api/recommendations?force=true" | python -c "import sys,json; d=json.load(sys.stdin); print('fromCache:', d['fromCache'], '| latency:', d.get('latencyMs'),'ms')"
```

**Step 3: Final commit and push**

```bash
git add lib/data.ts
git commit -m "docs: mark static stock data as AI fallback only"
git push
```
