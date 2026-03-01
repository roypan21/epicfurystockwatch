import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'EpicFury Stock Watch — US–Iran Conflict Dashboard',
  description: 'Live market intelligence dashboard tracking the 2026 US–Iran conflict impact on oil, gold, and stocks.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-nordic-bg antialiased`}>{children}</body>
    </html>
  );
}
