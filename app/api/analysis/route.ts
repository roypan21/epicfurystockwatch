import { NextResponse } from 'next/server';

export const dynamic  = 'force-dynamic';
export const revalidate = 0;

const GROQ_MODEL = 'meta-llama/llama-4-maverick-17b-128e-instruct';
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';

interface StockInput {
  symbol: string;
  price: number | null;
  changePercent: number | null;
}

interface CategoryInput {
  title: string;
  tag: string;
  stocks: { ticker: string; name: string; etf?: boolean }[];
}

interface NewsInput {
  title: string;
  source: string;
  publishedAt: string;
}

interface RequestBody {
  tab: 'buy' | 'avoid';
  categories: CategoryInput[];
  stocks: StockInput[];
  news: NewsInput[];
}

function buildPrompt(body: RequestBody): string {
  const { tab, categories, stocks, news } = body;
  const stockMap = Object.fromEntries(stocks.map((s) => [s.symbol, s]));
  const action   = tab === 'buy' ? 'BUY / CONSIDER' : 'AVOID';

  // Stock section
  const stockSection = categories.map((cat) => {
    const lines = cat.stocks.map((s) => {
      const q = stockMap[s.ticker];
      const price = q?.price != null ? `$${q.price.toFixed(2)}` : 'N/A';
      const chg   = q?.changePercent != null ? `${q.changePercent > 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '';
      return `  • ${s.ticker} (${s.name})${s.etf ? ' [ETF]' : ''}: ${price} ${chg}`;
    }).join('\n');
    return `**${cat.title}** [${cat.tag}]\n${lines}`;
  }).join('\n\n');

  // News section — top 8, titles only to save tokens
  const newsSection = news
    .slice(0, 8)
    .map((a, i) => {
      const ago = Math.round((Date.now() - new Date(a.publishedAt).getTime()) / 60000);
      const time = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
      return `${i + 1}. "${a.title}" — ${a.source} (${time})`;
    })
    .join('\n');

  return `## Current Situation — March 2026
The US and Israel launched Operation Epic Fury against Iran on Feb 28, 2026.
Supreme Leader Khamenei reported killed. Iran retaliating with missile strikes across the Middle East.
Strait of Hormuz (20% of global oil) at risk of closure.

## Live Stock Data — ${action} Stocks
${stockSection}

## Real-Time News Headlines
${newsSection}

## Your Task
Analyse each stock category above for the week ahead.
For EACH category write exactly 3 bullet points:
- How the Iran conflict directly impacts this group (cite specific news above)
- What the current price movement signals
- The single biggest risk or opportunity to watch

Format strictly as:
### [Category Name]
• [point 1]
• [point 2]
• [point 3]

Be specific, sharp, and under 600 words total. No intro, no conclusion — just the category analyses.`;
}

export async function POST(req: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const prompt = buildPrompt(body);

  const t0  = Date.now();
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a senior financial analyst specialising in geopolitical risk and equity markets. ' +
            'Today is March 1-2, 2026. Be concise, data-driven, and always cite specific news events. ' +
            'Never hedge with "consult a financial advisor" — give direct, confident analysis.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens:  1024,
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[analysis/route] Groq error:', err);
    return NextResponse.json({ error: `Groq API error: ${res.status}` }, { status: 502 });
  }

  const json        = await res.json();
  const analysis    = json.choices?.[0]?.message?.content ?? '';
  const latencyMs   = Date.now() - t0;
  const tokensUsed  = json.usage?.total_tokens ?? null;

  return NextResponse.json({
    analysis,
    model:       GROQ_MODEL,
    latencyMs,
    tokensUsed,
    generatedAt: Date.now(),
  });
}
