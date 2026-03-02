import { NextResponse } from 'next/server';
import { fetchQuotes } from '@/lib/yahoo';

export const dynamic  = 'force-dynamic';
export const revalidate = 0;

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
  const quotes = await fetchQuotes(TICKERS);
  return NextResponse.json(quotes);
}
