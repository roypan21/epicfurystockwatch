// Direct Yahoo Finance v8 chart API — no package, no auth required

export interface YFQuote {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
};

async function fetchQuote(symbol: string): Promise<YFQuote> {
  const encoded = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1d`;

  const res = await fetch(url, { headers: YF_HEADERS, cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${symbol}`);

  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`No meta for ${symbol}`);

  const price = meta.regularMarketPrice ?? null;
  const prev  = meta.chartPreviousClose ?? meta.previousClose ?? null;
  const change       = price !== null && prev !== null ? price - prev : null;
  const changePercent= change !== null && prev  ? (change / prev) * 100 : null;

  return { symbol, price, change, changePercent };
}

export async function fetchQuotes(symbols: string[]): Promise<YFQuote[]> {
  const results = await Promise.allSettled(symbols.map(fetchQuote));
  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { symbol: symbols[i], price: null, change: null, changePercent: null }
  );
}
