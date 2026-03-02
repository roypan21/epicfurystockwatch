import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const REFRESH_MINUTES = parseInt(process.env.NEWS_REFRESH_MINUTES ?? '25', 10);
const REFRESH_MS      = REFRESH_MINUTES * 60 * 1000;

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
  provider: 'guardian' | 'newsapi';
}

let cache: Cache | null = null;

// ── Guardian API (primary — real-time, no delay) ──────────────────────────────
async function fetchGuardian(key: string): Promise<Article[]> {
  const url =
    `https://content.guardianapis.com/search` +
    `?q=iran+us+war+conflict` +
    `&api-key=${key}` +
    `&order-by=newest` +
    `&page-size=8` +
    `&show-fields=trailText`;

  const res  = await fetch(url, { cache: 'no-store' });
  const json = await res.json();

  if (json.response?.status !== 'ok') throw new Error('Guardian API non-ok response');

  return (json.response.results ?? []).map((r: {
    webTitle: string;
    webUrl: string;
    webPublicationDate: string;
    fields?: { trailText?: string };
    pillarName?: string;
  }) => ({
    title:       r.webTitle,
    description: r.fields?.trailText ?? null,
    url:         r.webUrl,
    source:      { name: 'The Guardian' },
    publishedAt: r.webPublicationDate,
    urlToImage:  null,
  }));
}

// ── NewsAPI (fallback — 24 h delay on free plan) ──────────────────────────────
async function fetchNewsAPI(key: string): Promise<Article[]> {
  const url =
    `https://newsapi.org/v2/everything` +
    `?q=Iran+US+war+conflict` +
    `&apiKey=${key}` +
    `&pageSize=8` +
    `&sortBy=publishedAt` +
    `&language=en`;

  const res  = await fetch(url, { cache: 'no-store' });
  const json = await res.json();

  if (json.status !== 'ok') throw new Error(json.message ?? 'NewsAPI non-ok response');
  return json.articles ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  const now            = Date.now();
  const refreshMinutes = REFRESH_MINUTES;

  // Serve from cache if still fresh
  if (cache && now - cache.fetchedAt < REFRESH_MS) {
    return NextResponse.json({
      articles:       cache.articles,
      lastUpdated:    cache.fetchedAt,
      nextUpdate:     cache.fetchedAt + REFRESH_MS,
      fromCache:      true,
      refreshMinutes,
      provider:       cache.provider,
    });
  }

  const guardianKey = process.env.GUARDIAN_API_KEY;
  const newsapiKey  = process.env.NEWSAPI_KEY;

  let articles: Article[] = [];
  let provider: Cache['provider'] = 'guardian';
  let error: string | undefined;

  // 1 — Try Guardian first (real-time)
  if (guardianKey) {
    try {
      articles = await fetchGuardian(guardianKey);
      provider = 'guardian';
    } catch (err) {
      console.warn('[news/route] Guardian failed, trying NewsAPI:', err);
      error = String(err);
    }
  }

  // 2 — Fall back to NewsAPI if Guardian failed or key missing
  if (articles.length === 0 && newsapiKey) {
    try {
      articles = await fetchNewsAPI(newsapiKey);
      provider = 'newsapi';
      error    = undefined;
    } catch (err) {
      console.error('[news/route] NewsAPI also failed:', err);
      error = String(err);
    }
  }

  // 3 — If both failed, return stale cache rather than empty
  if (articles.length === 0 && cache) {
    return NextResponse.json({
      articles:       cache.articles,
      lastUpdated:    cache.fetchedAt,
      nextUpdate:     cache.fetchedAt + REFRESH_MS,
      fromCache:      true,
      refreshMinutes,
      provider:       cache.provider,
      stale:          true,
      error,
    });
  }

  if (articles.length > 0) {
    cache = { articles, fetchedAt: now, provider };
  }

  return NextResponse.json({
    articles,
    lastUpdated:    now,
    nextUpdate:     now + REFRESH_MS,
    fromCache:      false,
    refreshMinutes,
    provider,
    ...(error ? { error } : {}),
  });
}
