import { NextResponse } from 'next/server';
import { fetchQuotes } from '@/lib/yahoo';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get('symbols') ?? '';
  const tickers = symbolsParam
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 40);

  if (tickers.length === 0) return NextResponse.json([]);

  const quotes = await fetchQuotes(tickers);
  return NextResponse.json(quotes);
}
