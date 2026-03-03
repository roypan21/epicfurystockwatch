'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  buyCategories,
  avoidCategories,
  OIL_SCENARIOS,
  SOURCES,
  StockCategory,
} from '@/lib/data';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Quote {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

interface Commodity extends Quote {
  label: string;
  unit: string;
}

interface NewsArticle {
  title: string;
  description: string | null;
  url: string;
  source: { name: string };
  publishedAt: string;
}

interface NewsResponse {
  articles: NewsArticle[];
  lastUpdated: number;
  nextUpdate: number;
  fromCache: boolean;
  refreshMinutes: number;
  provider?: 'guardian' | 'newsapi';
  stale?: boolean;
  error?: string;
}

interface AIStock { rank: number; ticker: string; name: string; sector: string; reason: string; etf?: boolean }

interface RecommendationsResponse {
  summary: string;
  buy:   AIStock[];
  avoid: AIStock[];
  fromCache:    boolean;
  fetchedAt:    number;
  nextUpdate:   number;
  latencyMs:    number;
  model:        string;
  tokensUsed:   number | null;
  stale?:       boolean;
  error?:       string;
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function timeUntil(ts: number): string {
  const diff = Math.floor((ts - Date.now()) / 1000);
  if (diff <= 0)    return 'now';
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  }
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

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

function fmtPrice(price: number | null, unit?: string): string {
  if (price === null) return '—';
  if (unit === 'pts') return price.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (unit === '$/oz') return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${price.toFixed(2)}`;
}

// ─── Small components ─────────────────────────────────────────────────────────

function ChangeChip({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-300 text-xs">—</span>;
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded
        ${up ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}
    >
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

function CommodityCard({ c, loading }: { c?: Commodity; loading: boolean }) {
  if (loading || !c) {
    return (
      <div className="bg-white border border-[#E2E2DC] rounded-xl p-4 shadow-sm h-[88px] animate-pulse">
        <div className="h-3 bg-gray-100 rounded w-20 mb-3" />
        <div className="h-7 bg-gray-100 rounded w-24 mb-2" />
        <div className="h-4 bg-gray-100 rounded w-14" />
      </div>
    );
  }
  return (
    <div className="bg-white border border-[#E2E2DC] rounded-xl p-4 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[#9A9A9A] mb-2">
        {c.label}
      </div>
      {c.price !== null ? (
        <>
          <div className="text-xl font-bold text-[#1E3A5F] leading-tight mb-1.5">
            {fmtPrice(c.price, c.unit)}
            <span className="text-xs font-normal text-[#9A9A9A] ml-1">{c.unit}</span>
          </div>
          <ChangeChip pct={c.changePercent} />
        </>
      ) : (
        <div className="text-base font-medium text-gray-300 mt-1">Unavailable</div>
      )}
    </div>
  );
}

function StockRow({
  ticker, name, reason, etf, quote, rank,
}: {
  ticker: string; name: string; reason: string; etf?: boolean; quote?: Quote; rank?: number;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#E2E2DC] last:border-0 hover:bg-[#FAFAF8] transition-colors">
      {rank !== undefined && (
        <span className="text-[10px] font-bold text-[#9A9A9A] w-6 text-right flex-shrink-0 tabular-nums">
          #{rank}
        </span>
      )}
      <span
        className={`text-[11px] font-bold font-mono px-2 py-1 rounded text-center min-w-[54px]
          ${etf ? 'bg-[#F0EDE8] text-[#5C5040]' : 'bg-[#EBF3FB] text-[#2C6FAC]'}`}
      >
        {ticker}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[#1A1A1A] truncate">
          {name}
          {etf && <span className="text-[9px] text-[#9A9A9A] font-normal ml-1.5">ETF</span>}
        </div>
        <div className="text-[11px] text-[#6B6B6B] truncate">{reason}</div>
      </div>
      <div className="text-right flex-shrink-0 min-w-[64px]">
        <div className="text-[13px] font-semibold text-[#1A1A1A]">
          {fmtPrice(quote?.price ?? null)}
        </div>
        <ChangeChip pct={quote?.changePercent ?? null} />
      </div>
    </div>
  );
}

const TAG_COLORS: Record<string, string> = {
  green: 'bg-[#D1EFE0] text-[#1A6B3C]',
  blue:  'bg-[#EBF3FB]  text-[#2C6FAC]',
  amber: 'bg-[#FDE68A]  text-[#92400E]',
  red:   'bg-[#FECACA]  text-[#B91C1C]',
};
const ICON_BG: Record<string, string> = {
  green: 'bg-[#EBF7F0]',
  blue:  'bg-[#EBF3FB]',
  amber: 'bg-[#FFFBEB]',
  red:   'bg-[#FEF2F2]',
};



function CategoryCard({
  cat, stockMap, isBuy,
}: {
  cat: StockCategory;
  stockMap: Record<string, Quote>;
  isBuy: boolean;
}) {
  const title    = cat.title;
  const subtitle = cat.subtitle;
  const icon     = cat.icon;
  const tag      = cat.tag;
  const stocks   = cat.stocks;
  const type     = cat.tagType;
  return (
    <div className="bg-white border border-[#E2E2DC] rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#E2E2DC]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${ICON_BG[type]}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[#1E3A5F] truncate">{title}</div>
            <div className="text-[11px] text-[#6B6B6B] truncate">{subtitle}</div>
          </div>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded flex-shrink-0 ${TAG_COLORS[type]}`}>
          {tag}
        </span>
      </div>
      {stocks.map((s) => (
        <StockRow key={s.ticker} {...s} quote={stockMap[s.ticker]} />
      ))}
    </div>
  );
}

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
    ? (tagType === 'green' ? '📈' : '👁')
    : (tagType === 'red'   ? '📉' : '⚠');

  return (
    <div className="bg-white border border-[#E2E2DC] rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#E2E2DC]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${ICON_BG[tagType]}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[#1E3A5F] truncate">{sector}</div>
            <div className="text-[11px] text-[#6B6B6B]">
              {stocks.length} stock{stocks.length !== 1 ? 's' : ''} · ranks #{Math.min(...stocks.map((s) => s.rank))}–#{Math.max(...stocks.map((s) => s.rank))}
            </div>
          </div>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded flex-shrink-0 ${TAG_COLORS[tagType]}`}>
          {tag}
        </span>
      </div>
      {stocks.map((s) => (
        <StockRow
          key={s.rank}
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

function NewsCard({ news, tick }: { news: NewsResponse | null; tick: number }) {
  if (!news) {
    return (
      <div className="bg-white border border-[#E2E2DC] rounded-xl shadow-sm p-8 text-center text-sm text-[#9A9A9A]">
        Loading news...
      </div>
    );
  }
  return (
    <div className="bg-white border border-[#E2E2DC] rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-[#E2E2DC]">
        <div>
          <h2 className="text-[13px] font-semibold text-[#1E3A5F] flex items-center gap-2 flex-wrap">
            📰 Live News Feed
            {news.provider === 'guardian' && (
              <span className="text-[9px] bg-[#D1EFE0] text-[#1A6B3C] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide">
                The Guardian · Real-time
              </span>
            )}
            {news.provider === 'newsapi' && (
              <span className="text-[9px] bg-[#FDE68A] text-[#92400E] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide">
                NewsAPI · 24h delay
              </span>
            )}
            {news.fromCache && (
              <span className="text-[9px] bg-[#EBF3FB] text-[#2C6FAC] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide">
                Cached
              </span>
            )}
            {news.stale && (
              <span className="text-[9px] bg-[#FECACA] text-[#B91C1C] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide">
                Stale
              </span>
            )}
          </h2>
          <p className="text-[11px] text-[#9A9A9A] mt-0.5">
            Refreshes every {news.refreshMinutes} min
            {news.lastUpdated > 0 && ` · Last fetched ${timeAgo(news.lastUpdated)}`}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[10px] text-[#9A9A9A]">Next update</div>
          <div className="text-[11px] font-semibold text-[#2C6FAC]">
            {news.nextUpdate > Date.now() ? `in ${timeUntil(news.nextUpdate)}` : 'soon'}
          </div>
        </div>
      </div>

      {news.error && (
        <div className="px-5 py-3 bg-[#FEF2F2] border-b border-[#FECACA] text-[12px] text-[#B91C1C]">
          ⚠ {news.error}
        </div>
      )}

      <div className="divide-y divide-[#E2E2DC]">
        {(() => {
          const KEYWORDS = ['iran', 'israel', 'us ', 'usa', 'war', 'conflict', 'military', 'attack', 'strike', 'missile', 'nuclear', 'sanction', 'hormuz', 'oil', 'tehran', 'khamenei', 'epic fury'];
          const visible = news.articles.filter((a) => {
            const hay = (a.title + ' ' + (a.description ?? '')).toLowerCase();
            return KEYWORDS.some((k) => hay.includes(k));
          });
          const items = visible.length > 0 ? visible : news.articles;
          return items.length > 0 ? (
          items.map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 px-5 py-3 hover:bg-[#FAFAF8] transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[#1A1A1A] leading-snug group-hover:text-[#2C6FAC] transition-colors line-clamp-2">
                  {a.title}
                </div>
                {a.description && (
                  <div className="text-[11px] text-[#6B6B6B] mt-1 line-clamp-1">{a.description}</div>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] font-semibold text-[#2C6FAC] bg-[#EBF3FB] px-1.5 py-0.5 rounded">
                    {a.source.name}
                  </span>
                  <span className="text-[10px] text-[#9A9A9A]">
                    {timeAgo(new Date(a.publishedAt).getTime())}
                  </span>
                </div>
              </div>
              <span className="text-[#C8DDEF] group-hover:text-[#2C6FAC] flex-shrink-0 mt-1 transition-colors">→</span>
            </a>
          ))
        ) : (
          <div className="px-5 py-10 text-center text-sm text-[#9A9A9A]">No articles available</div>
        );
        })()}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [commodities, setCommodities]   = useState<Commodity[]>([]);
  const [stocks, setStocks]             = useState<Quote[]>([]);
  const [news, setNews]                 = useState<NewsResponse | null>(null);
  const [tab, setTab]                   = useState<'buy' | 'avoid'>('buy');
  const [lastRefresh, setLastRefresh]   = useState<number>(Date.now());
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [tick, setTick]                 = useState(0);
  const [recommendations, setRecommendations] = useState<RecommendationsResponse | null>(null);
  const [recsLoading, setRecsLoading]         = useState(true);
  const tickerRef = useRef<HTMLSpanElement>(null);

  const stockMap = useMemo(
    () => Object.fromEntries(stocks.map((s) => [s.symbol, s])),
    [stocks]
  );

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [c, n] = await Promise.allSettled([
        fetch('/api/commodities').then((r) => r.json()),
        fetch('/api/news').then((r) => r.json()),
      ]);
      if (c.status === 'fulfilled') setCommodities(c.value);
      if (n.status === 'fulfilled') setNews(n.value);
      setLastRefresh(Date.now());
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  const fetchRecommendations = useCallback(async (force = false) => {
    setRecsLoading(true);
    try {
      const url = force ? '/api/recommendations?force=true' : '/api/recommendations';
      const res = await fetch(url);
      const data: RecommendationsResponse = await res.json();
      setRecommendations(data);

      // Only fetch live prices if we got valid category data (not an error response)
      if (!data.error && (data.buy?.length ?? 0) + (data.avoid?.length ?? 0) > 0) {
        const allTickers = [
          ...(data.buy   ?? []).map((s: AIStock) => s.ticker),
          ...(data.avoid ?? []).map((s: AIStock) => s.ticker),
        ];
        const unique = [...new Set(allTickers)] as string[];
        if (unique.length > 0) {
          const sq = await fetch(`/api/stocks?symbols=${unique.join(',')}`);
          if (sq.ok) {
            const quotes: Quote[] = await sq.json();
            setStocks(quotes);
          }
        }
      }
    } catch (err) {
      setRecommendations((prev) => prev ?? ({
        summary: '', buy: [], avoid: [],
        fromCache: false, fetchedAt: 0, nextUpdate: 0,
        latencyMs: 0, model: '', tokensUsed: null,
        error: String(err),
      } as RecommendationsResponse));
    } finally {
      setRecsLoading(false);
    }
  }, []);

  useEffect(() => {
    // ── Direct HTTP fetch first (immediate fallback if SSE is slow/broken) ─
    fetchAll();

    // ── SSE stream: real-time commodity + news updates ────────────────────
    const es = new EventSource('/api/stream');

    es.addEventListener('commodities', (e: MessageEvent) => {
      try {
        setCommodities(JSON.parse(e.data));
        setLastRefresh(Date.now());
      } catch { /* ignore parse errors */ }
    });

    es.addEventListener('news', (e: MessageEvent) => {
      try { setNews(JSON.parse(e.data)); } catch { /* ignore */ }
    });

    // ── AI recommendations: 15-min poll + manual ─────────────────────────
    fetchRecommendations();
    const recsPoll = setInterval(() => fetchRecommendations(false), 15 * 60 * 1000);

    // ── UI clock tick every 10 s ─────────────────────────────────────────
    const clock = setInterval(() => setTick((t) => t + 1), 10_000);

    return () => {
      es.close();
      clearInterval(recsPoll);
      clearInterval(clock);
    };
  }, [fetchAll, fetchRecommendations]);

  // ── Ticker JS animation (works on iOS Safari where CSS keyframes fail) ──
  const newsTs = news?.lastUpdated ?? 0;
  useEffect(() => {
    const el = tickerRef.current;
    if (!el) return;
    let pos = 0;
    let rafId: number;
    // Two rAF calls to let layout settle before measuring scrollWidth
    rafId = requestAnimationFrame(() => {
      rafId = requestAnimationFrame(() => {
        const halfWidth = el.scrollWidth / 2;
        if (halfWidth <= 0) return;
        const charLen = el.textContent?.length ?? 240;
        const duration = Math.max(80, Math.round(charLen / 6)); // seconds
        const speed = halfWidth / (duration * 60);              // px per frame @60fps
        const tick = () => {
          pos -= speed;
          if (-pos >= halfWidth) pos = 0;
          el.style.transform = `translateX(${pos}px)`;
          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      });
    });
    return () => cancelAnimationFrame(rafId);
  }, [newsTs]);

  // derive time labels — tick dependency ensures they update every 10s
  const lastRefreshLabel = useMemo(() => timeAgo(lastRefresh), [lastRefresh, tick]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F4F1] flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-2 border-[#2C6FAC] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#6B6B6B]">Loading live market data…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F4F1]">

      {/* ── Breaking Banner ─────────────────────────────────────────────────── */}
      <div className="bg-[#1E3A5F] text-white sticky top-0 z-50">
        <div className="flex items-center gap-2.5 py-2.5 overflow-hidden">
        <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 pulse-dot ml-4" />
        <div className="flex-1 min-w-0">
          {(() => {
            const sep = '\u00A0\u00A0\u00A0\u25C6\u00A0\u00A0\u00A0';
            const KEYWORDS = ['iran', 'israel', 'us ', 'usa', 'war', 'conflict', 'military', 'attack', 'strike', 'missile', 'nuclear', 'sanction', 'hormuz', 'oil', 'tehran', 'khamenei', 'epic fury'];
            const filtered = (news?.articles ?? []).filter((a) => {
              const hay = (a.title + ' ' + (a.description ?? '')).toLowerCase();
              return KEYWORDS.some((k) => hay.includes(k));
            });
            const fmtCT = (iso: string) =>
              new Date(iso).toLocaleString('en-US', {
                timeZone: 'America/Chicago', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit', hour12: true,
              }) + ' CT';
            const items = filtered.length > 0
              ? filtered.map((a) => `${a.title}  [${fmtCT(a.publishedAt)}]`)
              : ['Breaking · US & Israel launch Operation Epic Fury on Iran · Supreme Leader Khamenei reported killed · Iran retaliating'];
            const text    = items.join(sep);
            const doubled = text + sep + text + sep;
            return (
              <span
                ref={tickerRef}
                className="inline-block whitespace-nowrap text-[11px] font-medium tracking-wide"
              >
                {doubled}
              </span>
            );
          })()}
        </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <header className="py-10 border-b border-[#E2E2DC] mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#2C6FAC] mb-2">
                Live Market Dashboard
              </p>
              <h1 className="text-3xl font-bold text-[#1E3A5F] leading-tight mb-1">
                US–Iran Conflict
              </h1>
              <p className="text-sm text-[#6B6B6B]">
                Market Intelligence · February 28, 2026 · Operation Epic Fury Active
              </p>
              {recommendations?.summary && !recsLoading && (
                <div className="mt-4 bg-[#EBF3FB] border-l-[3px] border-[#2C6FAC] rounded-r-lg px-4 py-3 text-[13px] text-[#1E3A5F] leading-relaxed max-w-3xl">
                  🤖 <strong className="font-semibold">AI Market Outlook:</strong> {recommendations.summary}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                onClick={fetchAll}
                disabled={refreshing}
                className="flex items-center gap-1.5 text-sm font-medium text-[#2C6FAC] bg-[#EBF3FB] border border-[#C8DDEF] px-3.5 py-2 rounded-lg hover:bg-[#DBEEFB] transition-colors disabled:opacity-50"
              >
                <span className={refreshing ? 'spin-refresh' : ''}>↻</span>
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
              <span className="text-[11px] text-[#9A9A9A]">
                Stocks &amp; oil updated {lastRefreshLabel}
              </span>
            </div>
          </div>
        </header>

        {/* ── Commodities ─────────────────────────────────────────────────────── */}
        <section className="mb-8">
          <SectionLabel>Live Commodities</SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {loading
              ? [0, 1, 2, 3].map((i) => <CommodityCard key={i} loading />)
              : commodities.map((c) => <CommodityCard key={c.symbol} c={c} loading={false} />)
            }
          </div>
        </section>

        {/* ── News + Oil Scenarios ─────────────────────────────────────────────── */}
        <section className="mb-8 grid lg:grid-cols-5 gap-4">

          {/* News */}
          <div className="lg:col-span-3">
            <NewsCard news={news} tick={tick} />
          </div>

          {/* Oil Scenarios */}
          <div className="lg:col-span-2 flex flex-col gap-3">
            <SectionLabel>Oil Price Scenarios</SectionLabel>
            {OIL_SCENARIOS.map((s, i) => (
              <div key={i} className={`rounded-xl border p-4 ${s.colorBg} ${s.colorBorder}`}>
                <div className={`text-[10px] font-bold uppercase tracking-wide mb-1 ${s.colorText}`}>
                  {s.label}
                </div>
                <div className={`text-2xl font-bold leading-none mb-2 ${s.colorText}`}>
                  {s.price}
                </div>
                <div className="text-[13px] font-semibold text-[#1A1A1A] mb-1">{s.name}</div>
                <div className="text-[11px] text-[#6B6B6B] leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Stock Tabs ───────────────────────────────────────────────────────── */}
        <section className="mb-8">
          {/* AI status bar */}
          {recommendations && (
            <div className="flex items-center justify-between gap-3 mb-4 px-1">
              <div className="flex items-center gap-2 text-[11px] text-[#6B6B6B]">
                <span>
                  🤖 Groq · Llama 4 Maverick
                  {recommendations.latencyMs ? <> · {recommendations.latencyMs}ms</> : null}
                  {recommendations.fetchedAt ? <> · {new Date(recommendations.fetchedAt).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} CT</> : null}
                  {!recommendations.fromCache && !recsLoading && <span className="ml-1 text-[#1A6B3C] bg-[#D1EFE0] px-1.5 py-0.5 rounded font-semibold">✓ Fresh</span>}
                  {recommendations.fromCache && <span className="ml-1 text-[#2C6FAC] bg-[#EBF3FB] px-1.5 py-0.5 rounded">cached</span>}
                  {recommendations.stale    && <span className="ml-1 text-[#92400E] bg-[#FDE68A] px-1.5 py-0.5 rounded">stale</span>}
                </span>
              </div>
              <button
                onClick={() => fetchRecommendations(true)}
                disabled={recsLoading}
                className="text-[11px] font-medium text-[#2C6FAC] bg-[#EBF3FB] border border-[#C8DDEF] px-2.5 py-1 rounded-lg hover:bg-[#DBEEFB] transition-colors disabled:opacity-50"
              >
                {recsLoading ? '↻ Regenerating…' : '↻ Regenerate AI'}
              </button>
            </div>
          )}

          <div className="flex gap-0 border-b border-[#E2E2DC] mb-6">
            {[
              { id: 'buy'   as const, label: `✓  Stocks to Consider${recommendations?.buy?.length  ? ` (${recommendations.buy.length})`  : ''}`, activeColor: '#1A6B3C' },
              { id: 'avoid' as const, label: `✕  Stocks to Avoid${recommendations?.avoid?.length ? ` (${recommendations.avoid.length})` : ''}`,    activeColor: '#B91C1C' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={tab === t.id ? { color: t.activeColor, borderBottomColor: t.activeColor } : {}}
                className={`px-5 py-2.5 text-sm border-b-2 -mb-px transition-all
                  ${tab === t.id ? 'font-semibold border-current' : 'font-normal text-[#6B6B6B] border-transparent hover:text-[#1A1A1A]'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {recsLoading ? (
              [0,1,2,3].map((i) => (
                <div key={i} className="bg-white border border-[#E2E2DC] rounded-xl p-4 shadow-sm animate-pulse">
                  <div className="h-4 bg-gray-100 rounded w-1/2 mb-3" />
                  <div className="space-y-2">
                    {[0,1,2].map((j) => <div key={j} className="h-3 bg-gray-100 rounded w-full" />)}
                  </div>
                </div>
              ))
            ) : recommendations?.error ? (
              <>
                <div className="col-span-2 bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-4 py-3 text-[12px] text-[#B91C1C] mb-2">
                  ⚠ AI recommendations unavailable — showing default watchlist. {recommendations.error}
                </div>
                {(tab === 'buy' ? buyCategories : avoidCategories).map((cat, i) => (
                  <CategoryCard key={i} cat={cat} stockMap={stockMap} isBuy={tab === 'buy'} />
                ))}
              </>
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
          </div>
        </section>

        {/* ── Risk Warning ─────────────────────────────────────────────────────── */}
        <div className="bg-[#FFFBEB] border border-[#FCD34D] rounded-xl px-5 py-4 text-[13px] text-[#92400E] leading-relaxed mb-8">
          <strong className="font-semibold">Risk Disclaimer:</strong> This dashboard is for informational purposes only and does not constitute financial advice.
          Geopolitical conflicts are highly unpredictable — if the conflict de-escalates, market dynamics will reverse rapidly.
          Never invest money you cannot afford to lose. Consult a licensed financial advisor before making investment decisions.
        </div>

        {/* ── Sources ──────────────────────────────────────────────────────────── */}
        <div className="border-t border-[#E2E2DC] pt-6 mb-6">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#9A9A9A] mb-3">Sources</div>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-[#2C6FAC] bg-[#EBF3FB] border border-[#C8DDEF] px-2.5 py-1.5 rounded hover:underline"
              >
                {s.label}
              </a>
            ))}
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────────── */}
        <div className="text-center text-[11px] text-[#9A9A9A] border-t border-[#E2E2DC] pt-4">
          EpicFury Stock Watch · February 28, 2026 · Live data via Yahoo Finance &amp; NewsAPI · Not financial advice
        </div>

      </div>
    </div>
  );
}

// ─── Tiny shared helper ───────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-[#9A9A9A] mb-4">
      {children}
      <span className="flex-1 h-px bg-[#E2E2DC]" />
    </div>
  );
}
