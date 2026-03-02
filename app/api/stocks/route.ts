import { NextResponse } from 'next/server';
import { fetchQuotes } from '@/lib/yahoo';

const VALID_TICKER = /^[A-Z0-9.\-\^=]{1,20}$/;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get('symbols') ?? '';
  const tickers = symbolsParam
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .filter((s) => VALID_TICKER.test(s))
    .slice(0, 40);

  if (tickers.length === 0) return NextResponse.json([]);

  try {
    const quotes = await fetchQuotes(tickers);
    return NextResponse.json(quotes);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch quotes' }, { status: 500 });
  }
}
