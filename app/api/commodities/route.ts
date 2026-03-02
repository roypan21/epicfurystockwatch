import { NextResponse } from 'next/server';
import { fetchQuotes } from '@/lib/yahoo';

export const dynamic  = 'force-dynamic';
export const revalidate = 0;

const COMMODITIES = [
  { symbol: 'BZ=F', label: 'Brent Crude',  unit: '$/bbl' },
  { symbol: 'CL=F', label: 'WTI Crude',    unit: '$/bbl' },
  { symbol: 'GC=F', label: 'Gold',          unit: '$/oz'  },
  { symbol: 'ES=F', label: 'S&P 500 Fut',  unit: 'pts'   },
];

export async function GET() {
  const quotes = await fetchQuotes(COMMODITIES.map((c) => c.symbol));

  const result = COMMODITIES.map((c, i) => ({
    ...c,
    price:         quotes[i].price,
    change:        quotes[i].change,
    changePercent: quotes[i].changePercent,
  }));

  return NextResponse.json(result);
}
