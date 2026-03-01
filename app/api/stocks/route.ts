import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// All tickers tracked across buy + avoid categories
const TICKERS = [
  // Buy — Defense
  'LMT', 'RTX', 'NOC', 'BA',
  // Buy — Energy
  'XOM', 'CVX', 'COP',
  // Buy — Gold
  'GOLD', 'NEM',
  // Buy — Cyber
  'PLTR', 'CRWD', 'PANW',
  // Avoid — Airlines
  'DAL', 'UAL', 'AAL', 'LUV',
  // Avoid — Tech
  'NVDA', 'TSLA', 'META', 'AMZN',
  // Avoid — Consumer
  'NKE', 'SBUX', 'CCL', 'RCL',
  // Avoid — Shipping
  'ZIM',
];

export async function GET() {
  try {
    const results = await Promise.allSettled(
      TICKERS.map((ticker) =>
        yahooFinance.quote(ticker, {}, { validateResult: false })
      )
    );

    const quotes = results.map((r, i) => {
      if (r.status === 'rejected') {
        return { symbol: TICKERS[i], price: null, change: null, changePercent: null };
      }
      const q = r.value;
      return {
        symbol: q.symbol,
        price: q.regularMarketPrice ?? null,
        change: q.regularMarketChange ?? null,
        changePercent: q.regularMarketChangePercent ?? null,
      };
    });

    return NextResponse.json(quotes);
  } catch (err) {
    console.error('[stocks/route] Failed:', err);
    return NextResponse.json(
      TICKERS.map((s) => ({ symbol: s, price: null, change: null, changePercent: null })),
      { status: 200 } // return skeleton so frontend stays functional
    );
  }
}
