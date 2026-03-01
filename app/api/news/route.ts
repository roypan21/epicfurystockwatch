import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const REFRESH_MINUTES = parseInt(process.env.NEWS_REFRESH_MINUTES ?? '25', 10);
const REFRESH_MS = REFRESH_MINUTES * 60 * 1000;

interface Article {
  title: string;
  description: string | null;
  url: string;
  source: { name: string };
  publishedAt: string;
  urlToImage: string | null;
}

interface Cache {
  articles: Article[];
  fetchedAt: number;
}

// Module-level cache — persists across requests in the same Node.js process
let cache: Cache | null = null;

export async function GET() {
  const now = Date.now();
  const refreshMinutes = REFRESH_MINUTES;

  // Serve from cache if still fresh
  if (cache && now - cache.fetchedAt < REFRESH_MS) {
    return NextResponse.json({
      articles: cache.articles,
      lastUpdated: cache.fetchedAt,
      nextUpdate: cache.fetchedAt + REFRESH_MS,
      fromCache: true,
      refreshMinutes,
    });
  }

  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    return NextResponse.json({
      articles: [],
      lastUpdated: now,
      nextUpdate: now + REFRESH_MS,
      fromCache: false,
      refreshMinutes,
      error: 'NEWSAPI_KEY environment variable not set',
    });
  }

  try {
    const url =
      `https://newsapi.org/v2/everything` +
      `?q=Iran+US+war+conflict&apiKey=${apiKey}` +
      `&pageSize=8&sortBy=publishedAt&language=en`;

    const res = await fetch(url, { cache: 'no-store' });
    const json = await res.json();

    if (json.status !== 'ok') {
      throw new Error(json.message ?? 'NewsAPI returned non-ok status');
    }

    cache = { articles: json.articles ?? [], fetchedAt: now };

    return NextResponse.json({
      articles: cache.articles,
      lastUpdated: now,
      nextUpdate: now + REFRESH_MS,
      fromCache: false,
      refreshMinutes,
    });
  } catch (err) {
    console.error('[news/route] NewsAPI fetch failed:', err);

    // Return stale cache rather than empty on failure
    if (cache) {
      return NextResponse.json({
        articles: cache.articles,
        lastUpdated: cache.fetchedAt,
        nextUpdate: cache.fetchedAt + REFRESH_MS,
        fromCache: true,
        refreshMinutes,
        stale: true,
      });
    }

    return NextResponse.json({
      articles: [],
      lastUpdated: now,
      nextUpdate: now + REFRESH_MS,
      fromCache: false,
      refreshMinutes,
      error: String(err),
    });
  }
}
