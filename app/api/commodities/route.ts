import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const COMMODITIES = [
  { symbol: 'BZ=F', label: 'Brent Crude', unit: '$/bbl' },
  { symbol: 'CL=F', label: 'WTI Crude',   unit: '$/bbl' },
  { symbol: 'GC=F', label: 'Gold',         unit: '$/oz'  },
  { symbol: 'ES=F', label: 'S&P 500 Fut', unit: 'pts'   },
];

export async function GET() {
  try {
    const results = await Promise.allSettled(
      COMMODITIES.map((c) =>
        yahooFinance.quote(c.symbol, {}, { validateResult: false })
      )
    );

    const quotes = results.map((r, i) => {
      const { symbol, label, unit } = COMMODITIES[i];
      if (r.status === 'rejected') {
        return { symbol, label, unit, price: null, change: null, changePercent: null };
      }
      const q = r.value;
      return {
        symbol,
        label,
        unit,
        price: q.regularMarketPrice ?? null,
        change: q.regularMarketChange ?? null,
        changePercent: q.regularMarketChangePercent ?? null,
      };
    });

    return NextResponse.json(quotes);
  } catch (err) {
    console.error('[commodities/route] Failed:', err);
    return NextResponse.json(
      COMMODITIES.map((c) => ({ ...c, price: null, change: null, changePercent: null })),
      { status: 200 }
    );
  }
}
