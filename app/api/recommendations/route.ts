import { NextResponse } from 'next/server';
import { fetchQuotes } from '@/lib/yahoo';

export const dynamic  = 'force-dynamic';
export const revalidate = 0;

const CACHE_MS   = 15 * 60 * 1000;
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'meta-llama/llama-4-maverick-17b-128e-instruct';
const YF_HEADERS = { 'User-Agent': 'Mozilla/5.0' };

const FULL_UNIVERSE: Record<string, string[]> = {
  'Defense & Aerospace': ['LMT', 'RTX', 'NOC', 'GD', 'BA', 'LHX', 'HII', 'LDOS', 'SAIC', 'KTOS', 'AVAV'],
  'Energy / E&P':        ['XOM', 'CVX', 'COP', 'OXY', 'DVN', 'EOG', 'FANG', 'APA', 'MRO', 'SM', 'CIVI', 'OVV'],
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

interface AIStock    { rank: number; ticker: string; name: string; sector: string; reason: string; etf?: boolean }
interface AIResponse { summary: string; buy: AIStock[]; avoid: AIStock[] }
interface Cache      { data: AIResponse; fetchedAt: number; model: string; tokensUsed: number | null; latencyMs: number }

let cache: Cache | null = null;

// Fix 2: in-flight deduplication
let inflight: Promise<void> | null = null;

// Fix 6: buildCacheResponse helper
function buildCacheResponse(c: Cache, stale = false) {
  return {
    ...c.data,
    fromCache:  true,
    fetchedAt:  c.fetchedAt,
    nextUpdate: c.fetchedAt + CACHE_MS,
    latencyMs:  c.latencyMs,
    model:      c.model,
    tokensUsed: c.tokensUsed,
    ...(stale ? { stale: true } : {}),
  };
}

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
      ).then((r) => {
        if (!r.ok) throw new Error(`Guardian ${r.status} for query "${q}"`);
        return r.json();
      })
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

async function fetchBroadStocks(): Promise<string> {
  const allTickers = Object.values(FULL_UNIVERSE).flat();

  // Note: fetchQuotes uses Promise.allSettled — individual ticker failures
  // return null values rather than throwing, so this always completes.
  // A per-batch timeout can be added to lib/yahoo.ts separately if needed.
  const quotes = await fetchQuotes(allTickers);

  // Build lookup map: symbol -> { price, pct }
  const quoteMap: Record<string, { price: number; pct: number }> = {};
  for (const q of quotes) {
    if (q.price !== null && q.changePercent !== null) {
      quoteMap[q.symbol] = { price: q.price, pct: q.changePercent };
    }
  }

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

  // Top 20 gainers and losers
  const sorted = Object.entries(quoteMap)
    .map(([sym, q]) => ({ sym, ...q }))
    .sort((a, b) => b.pct - a.pct);

  const gainers = sorted.slice(0, 20)
    .map((q, i) => `#${i + 1} ${q.sym} ${q.pct >= 0 ? '+' : ''}${q.pct.toFixed(2)}%`)
    .join(' | ');
  const losers = sorted.slice(-20).reverse()
    .map((q, i) => {
      const sign = q.pct >= 0 ? '+' : '';
      return `#${i + 1} ${q.sym} ${sign}${q.pct.toFixed(2)}%`;
    })
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

function buildPrompt(news: string, market: string, broadStocks: string): string {
  const monthYear = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `## US-Iran Conflict Market Analysis — ${monthYear}
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

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get('force') === 'true';
  const now   = Date.now();

  // Fix 6: use buildCacheResponse helper for fresh cache hit
  if (!force && cache && now - cache.fetchedAt < CACHE_MS) {
    return NextResponse.json(buildCacheResponse(cache));
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 });
  }

  // Fix 2: in-flight deduplication — await any concurrent Groq call
  if (inflight) {
    await inflight;
    if (cache) return NextResponse.json(buildCacheResponse(cache));
  }

  let resolveInflight!: () => void;
  inflight = new Promise<void>((r) => { resolveInflight = r; });

  // Fix 1: wrap entire Groq block in try/catch with stale fallback
  try {
    const [news, market, broadStocks] = await Promise.all([fetchNews(), fetchMarket(), fetchBroadStocks()]);
    const prompt = buildPrompt(news, market, broadStocks);

    const t0 = Date.now();

    // AbortController timeout — raised to 45s to accommodate 4096-token 60-item response
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 45_000);

    let res: Response;
    try {
      res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: 'You are a financial analyst AI. Return ONLY valid JSON. No markdown, no explanation, no code blocks.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 4096,
          response_format: { type: 'json_object' },
        }),
        cache: 'no-store',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // Fix 3: sanitise Groq error response
    if (!res.ok) {
      const err = await res.text();
      console.error('[recommendations] Groq HTTP error:', res.status, err);
      if (cache) return NextResponse.json(buildCacheResponse(cache, true));
      return NextResponse.json({ error: 'AI service temporarily unavailable' }, { status: 502 });
    }

    const json      = await res.json();
    const raw       = json.choices?.[0]?.message?.content ?? '{}';
    const latencyMs = Date.now() - t0;

    let data: AIResponse;
    try {
      data = JSON.parse(raw);
    } catch {
      if (cache) return NextResponse.json(buildCacheResponse(cache, true));
      return NextResponse.json({ error: 'Failed to parse Groq JSON response' }, { status: 500 });
    }

    // Validate structure: arrays must be present, non-empty, each item must have rank (number) and sector (string)
    if (
      !data.summary ||
      !Array.isArray(data.buy)   || data.buy.length   < 1 ||
      !Array.isArray(data.avoid) || data.avoid.length < 1 ||
      typeof data.buy[0].rank   !== 'number' || typeof data.buy[0].sector   !== 'string' ||
      typeof data.avoid[0].rank !== 'number' || typeof data.avoid[0].sector !== 'string'
    ) {
      throw new Error('Groq returned unexpected JSON structure');
    }

    cache = { data, fetchedAt: now, model: GROQ_MODEL, tokensUsed: json.usage?.total_tokens ?? null, latencyMs };

    return NextResponse.json({
      ...data,
      fromCache:  false,
      fetchedAt:  now,
      nextUpdate: now + CACHE_MS,
      latencyMs,
      model:      GROQ_MODEL,
      tokensUsed: json.usage?.total_tokens ?? null,
    });
  } catch (err) {
    // Fix 1: return stale cache on any transport/unexpected error, otherwise 502
    console.error('[recommendations] Groq call failed:', err);
    if (cache) return NextResponse.json(buildCacheResponse(cache, true));
    return NextResponse.json({ error: 'AI service temporarily unavailable' }, { status: 502 });
  } finally {
    // Fix 2: always clear inflight and resolve waiters
    inflight = null;
    resolveInflight();
  }
}
