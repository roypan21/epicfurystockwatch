import { NextResponse } from 'next/server';

export const dynamic  = 'force-dynamic';
export const revalidate = 0;

const CACHE_MS   = 15 * 60 * 1000;
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'meta-llama/llama-4-maverick-17b-128e-instruct';
const YF_HEADERS = { 'User-Agent': 'Mozilla/5.0' };

interface AIStock    { ticker: string; name: string; reason: string; etf?: boolean }
interface AICategory { category: string; icon: string; tag: string; subtitle: string; stocks: AIStock[] }
interface AIResponse { summary: string; buy: AICategory[]; avoid: AICategory[] }
interface Cache      { data: AIResponse; fetchedAt: number }

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
      "category": "Category Name",
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
    fromCache:  false,
    fetchedAt:  now,
    nextUpdate: now + CACHE_MS,
    latencyMs,
    model:      GROQ_MODEL,
    tokensUsed: json.usage?.total_tokens ?? null,
  });
}
